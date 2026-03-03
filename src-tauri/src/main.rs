// src-tauri/src/main.rs
// Tauri v1 — Embedded, role-aware WebSocket relay.
// Text: broadcast to other clients.
// Handshake: update role only when {"type":"hello","role":"index|canvas"}.
// Binary: forward only to clients with role == "canvas" (not back to sender).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use futures_util::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use serde::Deserialize;
use tokio::{net::TcpListener, sync::Mutex};
use tokio_tungstenite::{accept_async, tungstenite::Message};

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
  println!("[ws-relay] listening on ws://{bind_addr}");
  loop {
    let (stream, peer_addr) = listener.accept().await.map_err(|e| e.to_string())?;
    let clients = Arc::clone(&clients);
    tokio::spawn(async move {
      if let Err(e) = handle_ws(stream, peer_addr, clients).await {
        eprintln!("[ws-relay] client {peer_addr} error: {e}");
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
                println!("[ws-relay] {peer_addr} set role = {}", c.role);
              }
            }
          }
          broadcast_text(&clients_r, peer_addr, txt).await;
        }

        Ok(Message::Binary(bin)) => {
          let sent = broadcast_binary(&clients_r, peer_addr, bin).await;
          if sent == 0 {
            println!("[ws-relay] binary from {peer_addr}, but no canvas clients yet");
          }
        }

        Ok(Message::Ping(p)) => {
          // Reply via channel so the writer handles it without an extra lock
          let _ = tx.send(Message::Pong(p));
        }
        Ok(Message::Close(_)) => break,
        Ok(_) => {}
        Err(e) => {
          eprintln!("[ws-relay] recv error from {peer_addr}: {e}");
          break;
        }
      }
    }

    clients_r.lock().await.remove(&peer_addr);
    println!("[ws-relay] {peer_addr} disconnected");
    Ok::<(), ()>(())
  });

  let _ = tokio::join!(writer, reader);
  Ok(())
}

fn main() {
tauri::Builder::default()
  .setup(|_app| {
      const PORT: u16 = 8787;

      println!("[ws-relay] setup: starting listeners on 127.0.0.1:{PORT} and [::1]:{PORT}");

      let clients_v4 = Arc::clone(&CLIENTS);
      let clients_v6 = Arc::clone(&CLIENTS);

      tauri::async_runtime::spawn(async move {
          let addr = format!("127.0.0.1:{PORT}");
          println!("[ws-relay] trying IPv4 bind on {}", addr);
          if let Err(e) = run_listener(addr, clients_v4).await {
              eprintln!("[ws-relay] IPv4 listener error: {e}");
          }
      });

      tauri::async_runtime::spawn(async move {
          let addr = format!("[::1]:{PORT}");
          println!("[ws-relay] trying IPv6 bind on {}", addr);
          if let Err(e) = run_listener(addr, clients_v6).await {
              eprintln!("[ws-relay] IPv6 listener error: {e}");
          }
      });

      Ok(())
  })
  .run(tauri::generate_context!())
  .expect("error while running tauri app");
}
