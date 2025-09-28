// // src-tauri/src/main.rs
// // Tauri v1 — Embedded, role-aware WebSocket relay.
// // Text: broadcast to other clients.
// // Binary: forward only to clients with role == "canvas" (not back to sender).

// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// use std::{collections::HashMap, net::SocketAddr, sync::Arc};

// use futures_util::{SinkExt, StreamExt};
// use once_cell::sync::Lazy;
// use serde::Deserialize;
// use tokio::{net::TcpListener, sync::Mutex};
// use tokio_tungstenite::{accept_async, tungstenite::Message};

// #[derive(Clone, Debug)]
// struct Client {
//   role: String, // "index" | "canvas" | "unknown"
//   tx: tokio::sync::mpsc::UnboundedSender<Message>,
// }

// static CLIENTS: Lazy<Arc<Mutex<HashMap<SocketAddr, Client>>>> =
//   Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

// #[derive(Deserialize)]
// struct HelloMsg {
//   #[serde(default)]
//   r#type: String,
//   #[serde(default)]
//   role: String,
// }

// // Keep this in sync with your HTML defaults (you said you're on 8787 everywhere)
// const PORT: u16 = 8787;

// async fn run_listener(bind_addr: &str) -> Result<(), String> {
//   let listener = TcpListener::bind(bind_addr).await.map_err(|e| e.to_string())?;
//   println!("[ws-relay] listening on ws://{bind_addr}");
//   loop {
//     let (stream, peer_addr) = listener.accept().await.map_err(|e| e.to_string())?;
//     println!("[ws-relay] connection from {peer_addr} on {bind_addr}");
//     tokio::spawn(async move {
//       if let Err(e) = handle_ws(stream, peer_addr).await {
//         eprintln!("[ws-relay] client {peer_addr} error: {e}");
//       }
//     });
//   }
// }

// async fn handle_ws(stream: tokio::net::TcpStream, peer_addr: SocketAddr) -> Result<(), String> {
//   let ws_stream = accept_async(stream).await.map_err(|e| e.to_string())?;
//   let (mut ws_tx, mut ws_rx) = ws_stream.split();
//   let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

//   {
//     let mut map = CLIENTS.lock().await;
//     map.insert(peer_addr, Client { role: "unknown".to_string(), tx: tx.clone() });
//   }

//   // writer: channel -> socket
//   let writer = tokio::spawn(async move {
//     while let Some(msg) = rx.recv().await {
//       if ws_tx.send(msg).await.is_err() {
//         break;
//       }
//     }
//   });

//   // reader: socket -> route
//   let reader = tokio::spawn(async move {
//     while let Some(msg) = ws_rx.next().await {
//       match msg {
//         Ok(Message::Text(txt)) => {
//           // Update role on hello
//           if let Ok(parsed) = serde_json::from_str::<HelloMsg>(&txt) {
//             if !parsed.role.is_empty() {
//               let mut map = CLIENTS.lock().await;
//               if let Some(c) = map.get_mut(&peer_addr) {
//                 c.role = parsed.role.clone();
//                 println!("[ws-relay] {peer_addr} set role = {}", c.role);
//               }
//             }
//           }
//           // broadcast text to others
//           let map = CLIENTS.lock().await;
//           for (other, c) in map.iter() {
//             if *other != peer_addr {
//               let _ = c.tx.send(Message::Text(txt.clone()));
//             }
//           }
//         }
//         Ok(Message::Binary(bin)) => {
//           // forward binary only to canvases (not back to sender)
//           let map = CLIENTS.lock().await;
//           let mut sent = 0usize;
//           for (other, c) in map.iter() {
//             if *other != peer_addr && c.role == "canvas" {
//               let _ = c.tx.send(Message::Binary(bin.clone()));
//               sent += 1;
//             }
//           }
//           if sent == 0 {
//             // Useful to see frames are produced before viewer connects
//             println!("[ws-relay] binary from {peer_addr}, but no canvas clients yet");
//           }
//         }
//         Ok(Message::Ping(p)) => { let _ = tx.send(Message::Pong(p)); }
//         Ok(Message::Close(_)) => break,
//         Ok(_) => {}
//         Err(e) => {
//           eprintln!("[ws-relay] recv error from {peer_addr}: {e}");
//           break;
//         }
//       }
//     }
//     let mut map = CLIENTS.lock().await;
//     map.remove(&peer_addr);
//     println!("[ws-relay] {peer_addr} disconnected");
//     Ok::<(), ()>(())
//   });

//   let _ = tokio::join!(writer, reader);
//   Ok(())
// }

// fn main() {
//   tauri::Builder::default()
//     .setup(|_app| {
//       // Start BOTH loopback listeners so 127.0.0.1 / localhost / ::1 all work
//       tauri::async_runtime::spawn(async move {
//         if let Err(e) = run_listener(&format!("127.0.0.1:{PORT}")).await {
//           eprintln!("[ws-relay] failed IPv4 bind: {e}");
//         }
//       });
//       tauri::async_runtime::spawn(async move {
//         if let Err(e) = run_listener(&format!("[::1]:{PORT}")).await {
//           eprintln!("[ws-relay] failed IPv6 bind: {e}");
//         }
//       });
//       Ok(())
//     })
//     .run(tauri::generate_context!())
//     .expect("error while running tauri application");
// }


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

static CLIENTS: Lazy<Arc<Mutex<HashMap<SocketAddr, Client>>>> =
  Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

#[derive(Deserialize, Debug)]
struct HelloMsg {
  #[serde(default)]
  r#type: String, // e.g., "hello"
  #[serde(default)]
  role: String,   // "index" | "canvas"
}

// Keep this in sync with your HTML defaults (you said everything is using 8787)
const PORT: u16 = 8787;

async fn run_listener(bind_addr: &str) -> Result<(), String> {
  let listener = TcpListener::bind(bind_addr).await.map_err(|e| e.to_string())?;
  println!("[ws-relay] listening on ws://{bind_addr}");
  loop {
    let (stream, peer_addr) = listener.accept().await.map_err(|e| e.to_string())?;
    println!("[ws-relay] connection from {peer_addr} on {bind_addr}");
    tokio::spawn(async move {
      if let Err(e) = handle_ws(stream, peer_addr).await {
        eprintln!("[ws-relay] client {peer_addr} error: {e}");
      }
    });
  }
}

async fn handle_ws(stream: tokio::net::TcpStream, peer_addr: SocketAddr) -> Result<(), String> {
  let ws_stream = accept_async(stream).await.map_err(|e| e.to_string())?;
  let (mut ws_tx, mut ws_rx) = ws_stream.split();
  let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();

  {
    let mut map = CLIENTS.lock().await;
    map.insert(peer_addr, Client { role: "unknown".to_string(), tx: tx.clone() });
  }

  // writer: channel -> socket
  let writer = tokio::spawn(async move {
    while let Some(msg) = rx.recv().await {
      if ws_tx.send(msg).await.is_err() {
        break;
      }
    }
  });

  // reader: socket -> route
  let reader = tokio::spawn(async move {
    while let Some(msg) = ws_rx.next().await {
      match msg {
        Ok(Message::Text(txt)) => {
          // Update role only when it's an explicit hello
          if let Ok(parsed) = serde_json::from_str::<HelloMsg>(&txt) {
            if parsed.r#type == "hello" && !parsed.role.is_empty() {
              let mut map = CLIENTS.lock().await;
              if let Some(c) = map.get_mut(&peer_addr) {
                c.role = parsed.role.clone();
                println!("[ws-relay] {peer_addr} set role = {}", c.role);
              }
            }
          }

          // Broadcast text to others (mirrors your Node relay)
          let map = CLIENTS.lock().await;
          for (other, c) in map.iter() {
            if *other != peer_addr {
              let _ = c.tx.send(Message::Text(txt.clone()));
            }
          }
        }

        Ok(Message::Binary(bin)) => {
          // Forward binary only to canvases (not back to sender)
          let map = CLIENTS.lock().await;
          let mut sent = 0usize;
          for (other, c) in map.iter() {
            if *other != peer_addr && c.role == "canvas" {
              let _ = c.tx.send(Message::Binary(bin.clone()));
              sent += 1;
            }
          }
          if sent == 0 {
            // Useful log: proves producer is sending before a canvas connects
            println!("[ws-relay] binary from {peer_addr}, but no canvas clients yet");
          }
        }

        Ok(Message::Ping(p)) => { let _ = tx.send(Message::Pong(p)); }
        Ok(Message::Close(_)) => break,
        Ok(_) => {}
        Err(e) => {
          eprintln!("[ws-relay] recv error from {peer_addr}: {e}");
          break;
        }
      }
    }

    // remove on disconnect
    let mut map = CLIENTS.lock().await;
    map.remove(&peer_addr);
    println!("[ws-relay] {peer_addr} disconnected");
    Ok::<(), ()>(())
  });

  let _ = tokio::join!(writer, reader);
  Ok(())
}

fn main() {
  tauri::Builder::default()
    .setup(|_app| {
      // Start BOTH loopback listeners so 127.0.0.1 / localhost / ::1 all work
      tauri::async_runtime::spawn(async move {
        if let Err(e) = run_listener(&format!("127.0.0.1:{PORT}")).await {
          eprintln!("[ws-relay] failed IPv4 bind: {e}");
        }
      });
      tauri::async_runtime::spawn(async move {
        if let Err(e) = run_listener(&format!("[::1]:{PORT}")).await {
          eprintln!("[ws-relay] failed IPv6 bind: {e}");
        }
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
