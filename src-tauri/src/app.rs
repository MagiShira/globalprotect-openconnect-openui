use std::sync::Arc;

use gpapi::service::request::{DisconnectRequest, WsRequest};
use log::{info, warn};
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Listener, Manager, RunEvent,
};

// Wildcard import needed so generate_handler! can find __cmd__ companion macros
#[allow(unused_imports)]
use crate::commands::*;
use crate::{commands::AppState, service_client::connect_to_service};

#[cfg(desktop)]
fn toggle_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("main") {
    if !window.is_visible().unwrap_or(true) {
      // Window was fully hidden (e.g. started with --minimized): restore it.
      window.show().map_err(|e| e.to_string())?;
      window.set_focus().map_err(|e| e.to_string())?;
    } else if window.is_focused().unwrap_or(false) {
      // Window is visible and focused: minimize to tray.
      let _ = window.minimize();
    } else {
      // Window is minimized or behind other windows: bring it to front.
      let _ = window.unminimize();
      window.show().map_err(|e| e.to_string())?;
      window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
  } else {
    Err("Main window not found".to_string())
  }
}

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

    let app = tauri::Builder::default()
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

        #[cfg(desktop)]
        {
          let tray_toggle_item = MenuItem::with_id(
            &app_handle,
            "tray-toggle-window",
            "Toggle Window",
            true,
            None::<&str>,
          )?;
          let tray_settings_item = MenuItem::with_id(
            &app_handle,
            "tray-open-settings",
            "Settings",
            true,
            None::<&str>,
          )?;
          let tray_disconnect_item = MenuItem::with_id(
            &app_handle,
            "tray-disconnect",
            "Disconnect",
            true,
            None::<&str>,
          )?;
          let tray_quit_item = MenuItem::with_id(
            &app_handle,
            "tray-quit",
            "Quit",
            true,
            None::<&str>,
          )?;

          let tray_menu = Menu::with_items(
            &app_handle,
            &[
              &tray_toggle_item,
              &tray_settings_item,
              &tray_disconnect_item,
              &tray_quit_item,
            ],
          )?;

          let mut tray_builder = TrayIconBuilder::with_id("main-tray")
            .tooltip("GP OpenUI")
            .menu(&tray_menu)
            .show_menu_on_left_click(false);

          if let Some(icon) = app_handle.default_window_icon().cloned() {
            tray_builder = tray_builder.icon(icon);
          } else {
            warn!("No default window icon available for tray icon");
          }

          let tray = tray_builder
            .on_menu_event(move |app, event| match event.id().as_ref() {
              "tray-toggle-window" => {
                if let Err(e) = toggle_main_window(app) {
                  warn!("Failed to toggle main window from tray menu: {}", e);
                }
              }
              "tray-open-settings" => {
                let _ = open_settings(app.clone(), None);
              }
              "tray-disconnect" => {
                let client_store = Arc::clone(&app.state::<AppState>().client);
                tauri::async_runtime::spawn(async move {
                  let client = client_store.lock().await;
                  if let Some(client) = client.as_ref() {
                    if let Err(e) = client.send(WsRequest::Disconnect(DisconnectRequest)).await {
                      warn!("Failed to disconnect from tray: {}", e);
                    }
                  } else {
                    warn!("Disconnect requested from tray, but no client is connected");
                  }
                });
              }
              "tray-quit" => {
                app.exit(0);
              }
              _ => {}
            })
            .on_tray_icon_event(move |tray, event| {
              if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
              } = event
              {
                if let Err(e) = toggle_main_window(tray.app_handle()) {
                  warn!("Failed to toggle main window from tray click: {}", e);
                }
              }
            })
            .build(&app_handle)?;

          let _ = tray;
        }

        if let Some(window) = app.get_webview_window("main") {
          let _ = window.set_skip_taskbar(true);

          let window_clone = window.clone();
          let _ = window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
              api.prevent_close();
              let _ = window_clone.minimize();
            }
          });
        }

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
      .build(tauri::generate_context!())?;

    app.run(move |_app_handle, event| {
      if let RunEvent::ExitRequested { api, code, .. } = event {
        if code.is_none() {
          api.prevent_exit();
        }
      }
    });

    Ok(())
  }
}
