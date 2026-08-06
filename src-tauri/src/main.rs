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

mod spout;

use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use midir::{MidiInput, MidiInputConnection};
use once_cell::sync::Lazy;
use rosc::{OscPacket, OscType};
use serde::{Deserialize, Serialize};
use tokio::{net::{TcpListener, UdpSocket}, sync::{Mutex, Notify}};
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

static OSC_SHUTDOWN: Lazy<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>> =
    Lazy::new(|| std::sync::Mutex::new(None));
static RUNTIME_SHUTDOWN_STARTED: AtomicBool = AtomicBool::new(false);

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

#[derive(Clone)]
struct Client {
  role: String, // "index" | "canvas" | "unknown"
  // Reliable, low-volume control traffic (hello, text, ping/pong).
  control_tx: tokio::sync::mpsc::Sender<Message>,
  // Video is real-time state. Keep exactly one replaceable pending frame per
  // receiver instead of a FIFO queue of obsolete frames.
  latest_frame: Arc<Mutex<Option<Vec<u8>>>>,
  frame_notify: Arc<Notify>,
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
  #[serde(default)]
  width: u32,
  #[serde(default)]
  height: u32,
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
  // Clone senders while holding the map lock, then release it before awaiting.
  // A slow socket must never block client registration, role changes, or cleanup.
  let targets: Vec<tokio::sync::mpsc::Sender<Message>> = {
    let map = clients.lock().await;
    map.iter()
      .filter(|(addr, _)| **addr != sender)
      .map(|(_, c)| c.control_tx.clone())
      .collect()
  };

  for tx in targets {
    let _ = tx.send(Message::Text(txt.clone())).await;
  }
}

async fn broadcast_binary(clients: &ClientMap, sender: SocketAddr, bin: Vec<u8>) -> usize {
  // Latest-frame-wins relay. A FIFO with capacity N still preserves N stale
  // frames and therefore N frames of latency. Each canvas receiver instead owns
  // one replaceable slot. New frames overwrite an undelivered older frame.
  let targets: Vec<(Arc<Mutex<Option<Vec<u8>>>>, Arc<Notify>)> = {
    let map = clients.lock().await;
    map.iter()
      .filter(|(addr, c)| **addr != sender && c.role == "canvas")
      .map(|(_, c)| (Arc::clone(&c.latest_frame), Arc::clone(&c.frame_notify)))
      .collect()
  };

  for (slot, notify) in &targets {
    *slot.lock().await = Some(bin.clone());
    notify.notify_one();
  }
  targets.len()
}


async fn notify_mirror_state(clients: &ClientMap) {
  // The index WebView keeps its relay socket open for the lifetime of the app.
  // Tell it whether a canvas receiver is actually attached so JPEG capture and
  // encoding can stop completely while the output window is absent.
  let (receivers, index_targets): (usize, Vec<tokio::sync::mpsc::Sender<Message>>) = {
    let map = clients.lock().await;
    let receivers = map.values().filter(|client| client.role == "canvas").count();
    let index_targets = map.values()
      .filter(|client| client.role == "index")
      .map(|client| client.control_tx.clone())
      .collect();
    (receivers, index_targets)
  };

  let state = serde_json::json!({
    "type": "mirror-state",
    "receivers": receivers,
  }).to_string();

  for tx in index_targets {
    let _ = tx.send(Message::Text(state.clone())).await;
  }
}

async fn forward_mirror_frame(
  clients: &ClientMap,
  sender: SocketAddr,
  sender_role: &str,
  control_tx: &tokio::sync::mpsc::Sender<Message>,
  bin: Vec<u8>,
) {
  let receivers = broadcast_binary(clients, sender, bin).await;
  if sender_role == "index" {
    // One acknowledgement per accepted JPEG keeps the browser sender to one
    // relay frame in flight. The relay still remains latest-frame-wins for each
    // canvas receiver, so a slow viewer cannot create a latency queue.
    let ack = serde_json::json!({
      "type": "mirror-ack",
      "receivers": receivers,
    }).to_string();
    let _ = control_tx.send(Message::Text(ack)).await;
  }
}

async fn handle_ws(
  stream: tokio::net::TcpStream,
  peer_addr: SocketAddr,
  clients: ClientMap,
) -> Result<(), String> {
  let ws_stream = accept_async(stream).await.map_err(|e| e.to_string())?;
  let (mut ws_tx, mut ws_rx) = ws_stream.split();
  let (control_tx, mut control_rx) = tokio::sync::mpsc::channel::<Message>(16);
  let latest_frame = Arc::new(Mutex::new(None::<Vec<u8>>));
  let frame_notify = Arc::new(Notify::new());

  {
    let mut map = clients.lock().await;
    map.insert(peer_addr, Client {
      role: "unknown".to_string(),
      control_tx: control_tx.clone(),
      latest_frame: Arc::clone(&latest_frame),
      frame_notify: Arc::clone(&frame_notify),
    });
  }

  // Writer task: reliable control messages and one replaceable latest video
  // frame. Control traffic cannot be trapped behind JPEG frames, and video
  // latency cannot grow into a queue tail.
  let writer = tokio::spawn(async move {
    loop {
      tokio::select! {
        biased;
        control = control_rx.recv() => {
          match control {
            Some(msg) => {
              if ws_tx.send(msg).await.is_err() { break; }
            }
            None => break,
          }
        }
        _ = frame_notify.notified() => {
          let frame = latest_frame.lock().await.take();
          if let Some(bin) = frame {
            if ws_tx.send(Message::Binary(bin)).await.is_err() { break; }
          }
        }
      }
    }
  });

  // reader task: receives from socket and routes messages
  let clients_r = Arc::clone(&clients);
  let reader = tokio::spawn(async move {
    // Native-output senders use a dedicated socket. Their dimensions are sent
    // once in the hello message, so every following binary message can contain
    // raw RGBA pixels only — no per-frame magic header or full-frame repack.
    let mut sender_role = String::from("unknown");
    let mut sender_width = 0u32;
    let mut sender_height = 0u32;
    #[cfg(target_os = "macos")]
    let mut syphon_clients_cached = false;
    #[cfg(target_os = "macos")]
    let mut syphon_clients_checked_at: Option<Instant> = None;

    while let Some(msg) = ws_rx.next().await {
      match msg {
        Ok(Message::Text(txt)) => {
          // Update role only on an explicit hello. Native-output senders also
          // declare a fixed frame size here, outside the per-frame hot path.
          if let Ok(parsed) = serde_json::from_str::<HelloMsg>(&txt) {
            if parsed.r#type == "hello" && !parsed.role.is_empty() {
              sender_role = parsed.role.clone();
              sender_width = parsed.width;
              sender_height = parsed.height;

              let mut map = clients_r.lock().await;
              if let Some(c) = map.get_mut(&peer_addr) {
                c.role = parsed.role.clone();
                println!(
                  "[huff] {peer_addr} set role = {}{}",
                  c.role,
                  if parsed.width > 0 && parsed.height > 0 {
                    format!(" ({}x{})", parsed.width, parsed.height)
                  } else {
                    String::new()
                  }
                );
              }
              drop(map);
              notify_mirror_state(&clients_r).await;

              #[cfg(target_os = "macos")]
              if sender_role == "syphon-sender" {
                syphon_clients_cached = syphon::has_clients();
                syphon_clients_checked_at = Some(Instant::now());
                let state = serde_json::json!({
                  "type": "syphon-state",
                  "active": syphon::is_active(),
                  "hasClients": syphon_clients_cached,
                  "frames": syphon::FRAME_COUNT.load(std::sync::atomic::Ordering::Relaxed),
                });
                let _ = control_tx.send(Message::Text(state.to_string())).await;
              }
            }
          }
          broadcast_text(&clients_r, peer_addr, txt).await;
        }

        Ok(Message::Binary(bin)) => {
          // Dedicated native-output sockets carry raw RGBA only. The role and
          // fixed dimensions came from the hello message, avoiding an extra
          // width*height*4 copy in JavaScript for every frame.
          #[cfg(target_os = "macos")]
          {
            if sender_role == "syphon-sender" && sender_width > 0 && sender_height > 0 {
              // Native upload/publish timing is sampled at roughly 1–2 Hz rather
              // than measured on every frame. Receiver presence is sampled at
              // full bootstrap cadence while disconnected, then at 4 Hz while
              // connected. This preserves fast attachment/disconnect behavior
              // without issuing Objective-C hasClients calls at 30/60 fps.
              let frame_before = syphon::FRAME_COUNT.load(std::sync::atomic::Ordering::Relaxed);
              let measure_native = frame_before % 30 == 0;
              let result = syphon::push_pixels_profiled(
                sender_width,
                sender_height,
                &bin,
                measure_native,
              );

              let now = Instant::now();
              let should_check_clients = !syphon_clients_cached
                || syphon_clients_checked_at
                  .map(|last| now.duration_since(last) >= Duration::from_millis(250))
                  .unwrap_or(true);
              if should_check_clients {
                syphon_clients_cached = syphon::has_clients();
                syphon_clients_checked_at = Some(now);
              }

              let frames = syphon::FRAME_COUNT.load(std::sync::atomic::Ordering::Relaxed);
              let ack = if result.native_sample {
                serde_json::json!({
                  "type": "syphon-ack",
                  "published": result.published,
                  "hasClients": syphon_clients_cached,
                  "frames": frames,
                  "nativeSample": true,
                  "nativeUploadUs": result.upload_micros,
                  "nativePublishUs": result.publish_micros,
                })
              } else {
                // Keep ordinary per-frame acknowledgements as compact as the
                // established Pass 16S protocol. Timing fields are attached
                // only to the low-rate native samples.
                serde_json::json!({
                  "type": "syphon-ack",
                  "published": result.published,
                  "hasClients": syphon_clients_cached,
                  "frames": frames,
                })
              };
              let _ = control_tx.send(Message::Text(ack.to_string())).await;
            } else if bin.starts_with(b"HUFFSYPH") {
              // Legacy packet support for older HUFF Classic frontends.
              let _ = syphon::push_frame(&bin);
            } else {
              forward_mirror_frame(&clients_r, peer_addr, &sender_role, &control_tx, bin).await;
            }
          }

          #[cfg(target_os = "windows")]
          {
            if (sender_role == "spout-sender" || sender_role == "spout")
              && sender_width > 0 && sender_height > 0
            {
              spout::push_pixels(sender_width, sender_height, &bin);
            } else if bin.starts_with(b"HUFFSPOUT") {
              // Legacy packet support for older HUFF Classic frontends.
              spout::push_frame(&bin);
            } else {
              forward_mirror_frame(&clients_r, peer_addr, &sender_role, &control_tx, bin).await;
            }
          }

          #[cfg(not(any(target_os = "macos", target_os = "windows")))]
          {
            forward_mirror_frame(&clients_r, peer_addr, &sender_role, &control_tx, bin).await;
          }
        }

        Ok(Message::Ping(p)) => {
          // Reply via channel so the writer handles it without an extra lock
          let _ = control_tx.send(Message::Pong(p)).await;
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
    notify_mirror_state(&clients_r).await;
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyphonRuntimeState {
    active: bool,
    has_clients: bool,
    frames: u64,
}

#[command]
fn syphon_runtime_state() -> SyphonRuntimeState {
    #[cfg(target_os = "macos")]
    {
        SyphonRuntimeState {
            active: syphon::is_active(),
            has_clients: syphon::has_clients(),
            frames: syphon::FRAME_COUNT.load(std::sync::atomic::Ordering::Relaxed),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        SyphonRuntimeState { active: false, has_clients: false, frames: 0 }
    }
}

// ── Spout commands (Windows only) ─────────────────────────────────────────────

#[command]
fn start_spout(width: u32, height: u32) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        spout::start(width, height)?;
        Ok(format!("Spout sender started — {}×{}", width, height))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (width, height);
        Err("Spout is Windows-only".into())
    }
}

#[command]
fn stop_spout() -> String {
    #[cfg(target_os = "windows")]
    { spout::stop(); "Spout sender stopped".into() }
    #[cfg(not(target_os = "windows"))]
    { "Spout is Windows-only".into() }
}

#[command]
fn spout_status() -> String {
    #[cfg(target_os = "windows")]
    { spout::status() }
    #[cfg(not(target_os = "windows"))]
    { "unavailable (Windows only)".into() }
}

fn shutdown_native_runtime() {
    if RUNTIME_SHUTDOWN_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    // Drop the MIDI connection before process exit so device callbacks cannot
    // outlive the visible instrument windows.
    if let Ok(mut midi) = MIDI_CONN.lock() {
        *midi = None;
    }

    // Wake the OSC task so its UDP socket is released deterministically instead
    // of relying only on operating-system process teardown.
    if let Ok(mut shutdown) = OSC_SHUTDOWN.lock() {
        if let Some(tx) = shutdown.take() {
            let _ = tx.send(());
        }
    }

    #[cfg(target_os = "macos")]
    syphon::stop();
    #[cfg(target_os = "windows")]
    spout::stop();
}

fn main() {
tauri::Builder::default()
  .on_window_event(|event| {
      if matches!(event.event(), tauri::WindowEvent::CloseRequested { .. }) {
          // HUFF is a two-window instrument. Closing either surface ends the
          // complete process after one idempotent native cleanup pass.
          shutdown_native_runtime();
          event.window().app_handle().exit(0);
      }
  })
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
      syphon_runtime_state,
      start_spout,
      stop_spout,
      spout_status,
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
      if let Ok(mut shutdown) = OSC_SHUTDOWN.lock() {
          *shutdown = Some(tx);
      }
      let app_handle = app.handle();
      tauri::async_runtime::spawn(run_osc_listener(app_handle, rx));

      Ok(())
  })
  .run(tauri::generate_context!())
  .expect("error while running tauri app");
}
