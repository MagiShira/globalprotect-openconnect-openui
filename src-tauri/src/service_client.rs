use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use gpapi::{
  service::{event::WsEvent, request::WsRequest},
  utils::{crypto::Crypto, endpoint::ws_endpoint},
};
use log::{info, warn};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub struct ServiceClient {
  req_tx: mpsc::Sender<WsRequest>,
}

impl ServiceClient {
  pub async fn send(&self, req: WsRequest) -> anyhow::Result<()> {
    self.req_tx.send(req).await?;
    Ok(())
  }
}

pub async fn connect_to_service(
  api_key: Vec<u8>,
  app_handle: AppHandle,
) -> anyhow::Result<ServiceClient> {
  let endpoint = ws_endpoint().await?;
  let crypto = Arc::new(Crypto::new(api_key));

  info!("Connecting to gpservice at {}", endpoint);
  let (ws_stream, _) = connect_async(&endpoint).await?;
  info!("WebSocket connection established");

  let (mut write, mut read) = ws_stream.split();

  // Handle the initial ping/pong handshake
  if let Some(Ok(Message::Ping(data))) = read.next().await {
    write.send(Message::Pong(data)).await?;
    info!("Ping/pong handshake complete");
  } else {
    anyhow::bail!("Expected Ping from gpservice during handshake");
  }

  let (req_tx, mut req_rx) = mpsc::channel::<WsRequest>(32);

  // Outgoing: encrypt WsRequests and send as binary frames
  let crypto_send = Arc::clone(&crypto);
  tokio::spawn(async move {
    while let Some(req) = req_rx.recv().await {
      match crypto_send.encrypt(req) {
        Ok(data) => {
          if let Err(e) = write.send(Message::Binary(data.into())).await {
            warn!("Failed to send WS message: {}", e);
            break;
          }
        }
        Err(e) => warn!("Failed to encrypt request: {}", e),
      }
    }
  });

  // Incoming: decrypt binary frames and emit Tauri events
  tokio::spawn(async move {
    while let Some(msg) = read.next().await {
      match msg {
        Ok(Message::Binary(data)) => match crypto.decrypt::<WsEvent>(data.to_vec()) {
          Ok(event) => handle_event(event, &app_handle),
          Err(e) => warn!("Failed to decrypt event: {}", e),
        },
        Ok(Message::Ping(_)) => {
          // tungstenite handles pong automatically at the protocol level
        }
        Ok(Message::Close(_)) => {
          info!("gpservice closed the connection");
          let _ = app_handle.emit("service-disconnected", ());
          break;
        }
        Err(e) => {
          warn!("WebSocket error: {}", e);
          let _ = app_handle.emit("service-disconnected", ());
          break;
        }
        _ => {}
      }
    }
  });

  Ok(ServiceClient { req_tx })
}

fn handle_event(event: WsEvent, app_handle: &AppHandle) {
  match event {
    WsEvent::VpnState(state) => {
      info!("VPN state changed: {:?}", state);
      let _ = app_handle.emit("vpn-state", &state);
    }
    WsEvent::VpnEnv(env) => {
      info!("Received VPN environment from service");
      // Emit both the env (for initial state + auth path) and the embedded state
      let _ = app_handle.emit("vpn-state", &env.vpn_state);
      let _ = app_handle.emit("vpn-env", &env);
    }
    WsEvent::ActiveGui => {
      info!("Another GUI instance became active");
      let _ = app_handle.emit("active-gui", ());
    }
    WsEvent::ResumeConnection => {
      info!("Resume connection requested");
      let _ = app_handle.emit("resume-connection", ());
    }
  }
}
