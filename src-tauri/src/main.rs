// src-tauri/src/main.rs
// Tauri v1 — Embedded, role-aware WebSocket relay.
// Text: broadcast to other clients.
// Handshake: update role only when {"type":"hello","role":"index|canvas"}.
// Binary: forward only to clients with role == "canvas" (not back to sender).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// macOS-only Syphon output module
#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

#[cfg(target_os = "macos")]
mod syphon;

mod recording;

use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use futures_util::{SinkExt, StreamExt};
use midir::{MidiInput, MidiInputConnection};
use once_cell::sync::{Lazy, OnceCell};
use rosc::{OscPacket, OscType};
use serde::{Deserialize, Serialize};
use tokio::{net::{TcpListener, UdpSocket}, sync::Mutex};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tauri::{command, Manager, Window};

// ── MIDI event ────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct MidiEvent {
    /// "note_on" | "note_off" | "cc" | "pitch_bend" | "aftertouch" | "program_change" | "pressure" | "unknown"
    pub kind: String,
    /// MIDI channel 1–16
    pub channel: u8,
    /// note / CC number
    pub data1: u8,
    /// velocity / CC value
    pub data2: u8,
    /// data2 / 127.0 — normalised 0.0–1.0
    pub value: f32,
    pub raw: Vec<u8>,
}

type MidiConn = Option<MidiInputConnection<()>>;

static MIDI_CONN: Lazy<std::sync::Mutex<Option<MidiConn>>> =
    Lazy::new(|| std::sync::Mutex::new(None));

fn parse_midi(bytes: &[u8]) -> MidiEvent {
    let status   = bytes.get(0).copied().unwrap_or(0);
    let data1    = bytes.get(1).copied().unwrap_or(0);
    let data2    = bytes.get(2).copied().unwrap_or(0);
    let msg_type = status & 0xF0;
    let channel  = (status & 0x0F) + 1;

    let (kind, d1, d2): (String, u8, u8) = match msg_type {
        0x90 if data2 > 0 => ("note_on".into(),        data1, data2),
        0x80 | 0x90       => ("note_off".into(),        data1, data2),
        0xB0              => ("cc".into(),               data1, data2),
        0xE0 => {
            let raw14 = (data2 as u16) << 7 | data1 as u16;
            let norm  = (raw14 as f32 / 16383.0 * 127.0) as u8;
            ("pitch_bend".into(), 0, norm)
        }
        0xA0 => ("aftertouch".into(),      data1, data2),
        0xC0 => ("program_change".into(),  data1, 0),
        0xD0 => ("pressure".into(),        data1, 0),
        _    => ("unknown".into(),         data1, data2),
    };

    MidiEvent { kind, channel, data1: d1, data2: d2, value: d2 as f32 / 127.0, raw: bytes.to_vec() }
}

// ── Tauri MIDI commands ───────────────────────────────────────────────────────

/// Returns all MIDI input port names visible to the OS right now.
/// Creates a fresh MidiInput each call so virtual ports (IAC Bus, loopMIDI,
/// Max/MSP, Pure Data) that appear after launch are always included.
#[command]
fn list_midi_ports() -> Vec<String> {
    match MidiInput::new("huff-list") {
        Ok(m) => {
            let names: Vec<String> = m.ports().iter()
                .filter_map(|p| m.port_name(p).ok())
                .collect();
            println!("[midi] {} port(s): {:?}", names.len(), names);
            names
        }
        Err(e) => { eprintln!("[midi] list error: {e}"); vec![] }
    }
}

/// Logs all ports to stdout and returns a debug string — call from JS when
/// the port list looks wrong.  invoke('debug_midi_ports')
#[command]
fn debug_midi_ports() -> String {
    match MidiInput::new("huff-debug") {
        Ok(m) => {
            let ports = m.ports();
            if ports.is_empty() {
                let msg = "[midi] No ports. Check Audio MIDI Setup / loopMIDI / device driver.";
                eprintln!("{msg}"); return msg.to_string();
            }
            let lines: Vec<String> = ports.iter().enumerate()
                .map(|(i, p)| format!("  [{i}] {}", m.port_name(p).unwrap_or_else(|_| "<?>".into())))
                .collect();
            let out = format!("[midi] {} port(s):\n{}", ports.len(), lines.join("\n"));
            println!("{out}"); out
        }
        Err(e) => format!("[midi] MidiInput::new failed: {e}")
    }
}

/// Connect by name (exact match first, then case-insensitive substring).
/// invoke('connect_midi_port_by_name', { portName: "nanoKONTROL2" })
#[command]
fn connect_midi_port_by_name(port_name: String, window: Window) -> Result<(), String> {
    { let mut g = MIDI_CONN.lock().unwrap(); *g = None; } // drop existing connection

    let midi_in = MidiInput::new("huff-input").map_err(|e| e.to_string())?;
    let ports   = midi_in.ports();

    let port = ports.iter()
        .find(|p| midi_in.port_name(p).ok().as_deref() == Some(&port_name))
        .or_else(|| {
            let lower = port_name.to_lowercase();
            ports.iter().find(|p| {
                midi_in.port_name(p).ok()
                    .map(|n| n.to_lowercase().contains(&lower))
                    .unwrap_or(false)
            })
        })
        .ok_or_else(|| {
            let avail: Vec<String> = ports.iter()
                .filter_map(|p| midi_in.port_name(p).ok()).collect();
            format!("Port '{port_name}' not found. Available: {avail:?}")
        })?;

    let resolved = midi_in.port_name(port).unwrap_or_else(|_| port_name.clone());
    println!("[midi] connecting → {resolved}");

    let win = Arc::new(window);
    let conn = midi_in.connect(port, "huff-conn", move |_ts, bytes, _| {
        let ev = parse_midi(bytes);
        if let Err(e) = win.emit("midi-event", &ev) {
            eprintln!("[midi] emit error: {e}");
        }
    }, ()).map_err(|e| e.to_string())?;

    *MIDI_CONN.lock().unwrap() = Some(Some(conn));
    println!("[midi] connected to {resolved}");
    Ok(())
}

/// Legacy index-based connect — kept for compatibility.
#[command]
fn connect_midi_port(port_index: usize, window: Window) -> Result<(), String> {
    let midi_in = MidiInput::new("huff-list").map_err(|e| e.to_string())?;
    let name = midi_in.ports().get(port_index)
        .and_then(|p| midi_in.port_name(p).ok())
        .ok_or_else(|| format!("port {port_index} out of range"))?;
    connect_midi_port_by_name(name, window)
}

#[command]
fn disconnect_midi() {
    *MIDI_CONN.lock().unwrap() = None;
    println!("[midi] disconnected");
}

// ── OSC ───────────────────────────────────────────────────────────────────────

const OSC_PORT: u16 = 9000;

/// Sent to JS as the "osc-message" event payload.
#[derive(Serialize, Clone, Debug)]
pub struct OscEvent {
    /// OSC address string e.g. "/huff/feedback", "/1/fader1"
    pub addr: String,
    /// First numeric arg normalised — float as-is, int divided by 127
    pub value: f32,
    /// All args serialised as strings for the monitor display
    pub args: Vec<String>,
}

static OSC_SHUTDOWN: OnceCell<tokio::sync::oneshot::Sender<()>> = OnceCell::new();

/// Converts an OscPacket recursively (handles bundles) and emits each message.
fn dispatch_osc(packet: OscPacket, app: &tauri::AppHandle) {
    match packet {
        OscPacket::Message(msg) => {
            let value = msg.args.iter().find_map(|a| match a {
                OscType::Float(f)  => Some(*f),
                OscType::Int(i)    => Some(*i as f32 / 127.0),
                OscType::Double(d) => Some(*d as f32),
                _                  => None,
            }).unwrap_or(0.0);

            let args: Vec<String> = msg.args.iter().map(|a| match a {
                OscType::Float(f)  => format!("f:{f:.3}"),
                OscType::Int(i)    => format!("i:{i}"),
                OscType::Double(d) => format!("d:{d:.3}"),
                OscType::String(s) => format!("s:{s}"),
                OscType::Bool(b)   => format!("b:{b}"),
                _                  => "?".into(),
            }).collect();

            let event = OscEvent { addr: msg.addr, value, args };
            app.emit_all("osc-message", &event).ok();
        }
        OscPacket::Bundle(bundle) => {
            for p in bundle.content { dispatch_osc(p, app); }
        }
    }
}

/// Async UDP listener — runs for the lifetime of the app.
async fn run_osc_listener(
    app: tauri::AppHandle,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) {
    let addr = format!("0.0.0.0:{OSC_PORT}");
    let socket = match UdpSocket::bind(&addr).await {
        Ok(s)  => s,
        Err(e) => { eprintln!("[osc] bind failed on {addr}: {e}"); return; }
    };
    println!("[osc] listening on {addr}");
    app.emit_all("osc-port", OSC_PORT).ok();

    let mut buf = [0u8; 4096];
    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                println!("[osc] listener stopped");
                break;
            }
            result = socket.recv_from(&mut buf) => {
                match result {
                    Ok((size, _from)) => {
                        match rosc::decoder::decode_udp(&buf[..size]) {
                            Ok((_, packet)) => dispatch_osc(packet, &app),
                            Err(e)          => eprintln!("[osc] decode error: {e}"),
                        }
                    }
                    Err(e) => eprintln!("[osc] recv error: {e}"),
                }
            }
        }
    }
}

#[command]
fn get_osc_port() -> u16 { OSC_PORT }

#[derive(Clone, Debug)]
struct Client {
  role: String, // "index" | "canvas" | "unknown"
  tx: tokio::sync::mpsc::UnboundedSender<Message>,
}

type ClientMap = Arc<Mutex<HashMap<SocketAddr, Client>>>;

static CLIENTS: Lazy<ClientMap> =
  Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

#[derive(Deserialize, Debug)]
struct HelloMsg {
  #[serde(default)]
  r#type: String,
  #[serde(default)]
  role: String,
}

const PORT: u16 = 8787;

async fn run_listener(bind_addr: String, clients: ClientMap) -> Result<(), String> {
  let listener = TcpListener::bind(&bind_addr).await.map_err(|e| e.to_string())?;
  println!("[huff] listening on ws://{bind_addr}");
  loop {
    let (stream, peer_addr) = listener.accept().await.map_err(|e| e.to_string())?;
    let clients = Arc::clone(&clients);
    tokio::spawn(async move {
      if let Err(e) = handle_ws(stream, peer_addr, clients).await {
        eprintln!("[huff] client {peer_addr} error: {e}");
      }
    });
  }
}

async fn broadcast_text(clients: &ClientMap, sender: SocketAddr, txt: String) {
  let map = clients.lock().await;
  for (addr, c) in map.iter() {
    if *addr != sender {
      let _ = c.tx.send(Message::Text(txt.clone()));
    }
  }
}

async fn broadcast_binary(clients: &ClientMap, sender: SocketAddr, bin: Vec<u8>) -> usize {
  let map = clients.lock().await;
  let mut sent = 0usize;
  for (addr, c) in map.iter() {
    if *addr != sender && c.role == "canvas" {
      let _ = c.tx.send(Message::Binary(bin.clone()));
      sent += 1;
    }
  }
  sent
}

async fn handle_ws(
  stream: tokio::net::TcpStream,
  peer_addr: SocketAddr,
  clients: ClientMap,
) -> Result<(), String> {
  let ws_stream = accept_async(stream).await.map_err(|e| e.to_string())?;
  let (mut ws_tx, mut ws_rx) = ws_stream.split();
  let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

  {
    let mut map = clients.lock().await;
    map.insert(peer_addr, Client { role: "unknown".to_string(), tx: tx.clone() });
  }

  // writer task: drains the channel and sends to the socket
  let writer = tokio::spawn(async move {
    while let Some(msg) = rx.recv().await {
      if ws_tx.send(msg).await.is_err() {
        break;
      }
    }
  });

  // reader task: receives from socket and routes messages
  let clients_r = Arc::clone(&clients);
  let reader = tokio::spawn(async move {
    while let Some(msg) = ws_rx.next().await {
      match msg {
        Ok(Message::Text(txt)) => {
          // Update role only on an explicit hello
          if let Ok(parsed) = serde_json::from_str::<HelloMsg>(&txt) {
            if parsed.r#type == "hello" && !parsed.role.is_empty() {
              let mut map = clients_r.lock().await;
              if let Some(c) = map.get_mut(&peer_addr) {
                c.role = parsed.role.clone();
                println!("[huff] {peer_addr} set role = {}", c.role);
              }
            }
          }
          broadcast_text(&clients_r, peer_addr, txt).await;
        }

        Ok(Message::Binary(bin)) => {
          // macOS: intercept Syphon frames before relaying
          #[cfg(target_os = "macos")]
          if bin.starts_with(b"HUFFSYPH") {
            syphon::push_frame(&bin);
            // do NOT relay syphon frames to the canvas window — they're large
            // and the canvas already draws from its own p5 loop
          } else {
            let sent = broadcast_binary(&clients_r, peer_addr, bin).await;
            if sent == 0 {
              println!("[huff] binary from {peer_addr}, but no canvas clients yet");
            }
          }

          #[cfg(not(target_os = "macos"))]
          {
            let sent = broadcast_binary(&clients_r, peer_addr, bin).await;
            if sent == 0 {
              println!("[huff] binary from {peer_addr}, but no canvas clients yet");
            }
          }
        }

        Ok(Message::Ping(p)) => {
          // Reply via channel so the writer handles it without an extra lock
          let _ = tx.send(Message::Pong(p));
        }
        Ok(Message::Close(_)) => break,
        Ok(_) => {}
        Err(e) => {
          eprintln!("[huff] recv error from {peer_addr}: {e}");
          break;
        }
      }
    }

    clients_r.lock().await.remove(&peer_addr);
    println!("[huff] {peer_addr} disconnected");
    Ok::<(), ()>(())
  });

  let _ = tokio::join!(writer, reader);
  Ok(())
}

// ── Syphon commands (macOS only) ──────────────────────────────────────────────

#[command]
fn start_syphon(width: u32, height: u32) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        syphon::start(width, height)?;
        Ok(format!("Syphon server started — {}×{}", width, height))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (width, height);
        Err("Syphon is macOS only".into())
    }
}

#[command]
fn stop_syphon() -> String {
    #[cfg(target_os = "macos")]
    { syphon::stop(); "Syphon server stopped".into() }
    #[cfg(not(target_os = "macos"))]
    { "Syphon is macOS only".into() }
}

#[command]
fn syphon_status() -> String {
    #[cfg(target_os = "macos")]
    { syphon::status() }
    #[cfg(not(target_os = "macos"))]
    { "unavailable (macOS only)".into() }
}

fn main() {
tauri::Builder::default()
  .invoke_handler(tauri::generate_handler![
      list_midi_ports,
      debug_midi_ports,
      connect_midi_port,
      connect_midi_port_by_name,
      disconnect_midi,
      get_osc_port,
      start_syphon,
      stop_syphon,
      syphon_status,
      recording::save_single_frame,
      recording::save_recording,
      recording::save_recording_sequence,
      recording::save_recording_video,
  ])
  .setup(|app| {
      const PORT: u16 = 8787;

      println!("[huff] setup: starting listeners on 127.0.0.1:{PORT} and [::1]:{PORT}");

      let clients_v4 = Arc::clone(&CLIENTS);
      let clients_v6 = Arc::clone(&CLIENTS);

      tauri::async_runtime::spawn(async move {
          let addr = format!("127.0.0.1:{PORT}");
          println!("[huff] trying IPv4 bind on {}", addr);
          if let Err(e) = run_listener(addr, clients_v4).await {
              eprintln!("[huff] IPv4 listener error: {e}");
          }
      });

      tauri::async_runtime::spawn(async move {
          let addr = format!("[::1]:{PORT}");
          println!("[huff] trying IPv6 bind on {}", addr);
          if let Err(e) = run_listener(addr, clients_v6).await {
              eprintln!("[huff] IPv6 listener error: {e}");
          }
      });

      // ── OSC UDP listener ────────────────────────────────────────────────
      let (tx, rx) = tokio::sync::oneshot::channel::<()>();
      OSC_SHUTDOWN.set(tx).ok();
      let app_handle = app.handle();
      tauri::async_runtime::spawn(run_osc_listener(app_handle, rx));

      Ok(())
  })
  .run(tauri::generate_context!())
  .expect("error while running tauri app");
}
