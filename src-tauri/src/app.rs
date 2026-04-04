use std::sync::Arc;

use log::{info, warn};
use tauri::{Emitter, Listener, Manager};

// Wildcard import needed so generate_handler! can find __cmd__ companion macros
#[allow(unused_imports)]
use crate::commands::*;
use crate::{commands::AppState, service_client::connect_to_service};

pub struct App {
  api_key: Vec<u8>,
  minimized: bool,
}

impl App {
  pub fn new(api_key: Vec<u8>, minimized: bool) -> Self {
    Self { api_key, minimized }
  }

  pub fn run(self) -> anyhow::Result<()> {
    let api_key = self.api_key;
    let minimized = self.minimized;
    let state = AppState::new();

    tauri::Builder::default()
      .manage(state)
      .invoke_handler(tauri::generate_handler![
        get_connection_defaults,
        get_prelogin,
        connect_saml,
        connect_password,
        disconnect,
        open_settings,
        open_url,
        clear_credentials,
      ])
      .setup(move |app| {
        let app_handle = app.handle().clone();

        // Clone the Arc fields from managed state so they can be moved
        // into 'static closures without lifetime issues.
        let client_store = Arc::clone(&app.state::<AppState>().client);
        let auth_exec_store = Arc::clone(&app.state::<AppState>().auth_executable);

        // Connect to gpservice in the background
        tauri::async_runtime::spawn(async move {
          match connect_to_service(api_key, app_handle.clone()).await {
            Ok(client) => {
              info!("Connected to gpservice");
              *client_store.lock().await = Some(client);
            }
            Err(e) => {
              warn!("Failed to connect to gpservice: {}", e);
              let _ = app_handle.emit("service-error", e.to_string());
            }
          }
        });

        // Cache the auth_executable path whenever VpnEnv is received
        let auth_exec_store2 = Arc::clone(&auth_exec_store);
        app.listen_any("vpn-env", move |event| {
          use gpapi::service::vpn_env::VpnEnv;
          if let Ok(env) = serde_json::from_str::<VpnEnv>(event.payload()) {
            let store = Arc::clone(&auth_exec_store2);
            tauri::async_runtime::spawn(async move {
              *store.lock().await = Some(env.auth_executable);
            });
          }
        });

        if minimized {
          if let Some(win) = app.get_webview_window("main") {
            let _ = win.hide();
          }
        }

        Ok(())
      })
      .run(tauri::generate_context!())?;

    Ok(())
  }
}
