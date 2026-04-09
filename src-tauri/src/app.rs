use std::sync::Arc;
use std::time::Instant;

use gpapi::service::{
  request::{DisconnectRequest, WsRequest},
  vpn_state::VpnState,
};
use log::{info, warn};
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Listener, Manager, RunEvent,
};
use tokio::sync::Mutex;

// Wildcard import needed so generate_handler! can find __cmd__ companion macros
#[allow(unused_imports)]
use crate::commands::*;
use crate::{commands::AppState, service_client::connect_to_service};

fn format_duration(secs: u64) -> String {
  let h = secs / 3600;
  let m = (secs % 3600) / 60;
  let s = secs % 60;
  if h > 0 {
    format!("{:02}:{:02}:{:02}", h, m, s)
  } else {
    format!("{:02}:{:02}", m, s)
  }
}

#[derive(Clone, Copy, PartialEq)]
enum TrayStatus {
  Disconnected,
  Connecting,
  Connected,
  Disconnecting,
}

impl TrayStatus {
  fn tooltip(self, connected_at: Option<Instant>) -> String {
    match self {
      Self::Disconnected => "GP OpenUI — Disconnected".to_string(),
      Self::Connecting => "GP OpenUI — Connecting…".to_string(),
      Self::Disconnecting => "GP OpenUI — Disconnecting…".to_string(),
      Self::Connected => match connected_at {
        Some(start) => format!(
          "GP OpenUI — Connected {}",
          format_duration(start.elapsed().as_secs())
        ),
        None => "GP OpenUI — Connected".to_string(),
      },
    }
  }
}

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
        quit_app,
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
          let vpn_status: Arc<Mutex<TrayStatus>> = Arc::new(Mutex::new(TrayStatus::Disconnected));
          let connected_at: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));

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
          let tray_connect_item = MenuItem::with_id(
            &app_handle,
            "tray-connect-disconnect",
            "Connect",
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
              &tray_connect_item,
              &tray_quit_item,
            ],
          )?;

          let vpn_status_menu = Arc::clone(&vpn_status);
          let client_store_menu = Arc::clone(&client_store);

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
              "tray-connect-disconnect" => {
                let vs = Arc::clone(&vpn_status_menu);
                let client = Arc::clone(&client_store_menu);
                let app_clone = app.clone();
                tauri::async_runtime::spawn(async move {
                  let is_connected = *vs.lock().await == TrayStatus::Connected;
                  if is_connected {
                    let guard = client.lock().await;
                    if let Some(c) = guard.as_ref() {
                      if let Err(e) = c.send(WsRequest::Disconnect(DisconnectRequest)).await {
                        warn!("Failed to disconnect from tray: {}", e);
                      }
                    } else {
                      warn!("Disconnect requested from tray, but no client is connected");
                    }
                  } else {
                    if let Err(e) = app_clone.emit_to("main", "tray-connect-requested", ()) {
                      warn!("Failed to emit tray-connect-requested: {}", e);
                      let _ = toggle_main_window(&app_clone);
                    }
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

          let vpn_status_listener = Arc::clone(&vpn_status);
          let connected_at_listener = Arc::clone(&connected_at);
          let tray_connect_item_listener = tray_connect_item.clone();
          let app_handle_listener = app_handle.clone();
          app.listen_any("vpn-state", move |event| {
            let item = tray_connect_item_listener.clone();
            let vs = Arc::clone(&vpn_status_listener);
            let cat = Arc::clone(&connected_at_listener);
            let app_handle = app_handle_listener.clone();
            if let Ok(state) = serde_json::from_str::<VpnState>(event.payload()) {
              let new_status = match state {
                VpnState::Connected(_) => TrayStatus::Connected,
                VpnState::Connecting(_) => TrayStatus::Connecting,
                VpnState::Disconnecting => TrayStatus::Disconnecting,
                VpnState::Disconnected => TrayStatus::Disconnected,
              };
              tauri::async_runtime::spawn(async move {
                let prev = *vs.lock().await;
                *vs.lock().await = new_status;

                if new_status == TrayStatus::Connected && prev != TrayStatus::Connected {
                  *cat.lock().await = Some(Instant::now());
                } else if new_status != TrayStatus::Connected {
                  *cat.lock().await = None;
                }

                let label = if new_status == TrayStatus::Connected { "Disconnect" } else { "Connect" };
                if let Err(e) = item.set_text(label) {
                  warn!("Failed to update tray item text: {}", e);
                }

                // Update tooltip immediately so status text doesn't lag behind
                let at = *cat.lock().await;
                if let Some(tray) = app_handle.tray_by_id("main-tray") {
                  let _ = tray.set_tooltip(Some(new_status.tooltip(at).as_str()));
                }
              });
            }
          });

          let app_handle_timer = app_handle.clone();
          let vpn_status_timer = Arc::clone(&vpn_status);
          let connected_at_timer = Arc::clone(&connected_at);
          tauri::async_runtime::spawn(async move {
            loop {
              tokio::time::sleep(std::time::Duration::from_secs(1)).await;
              let status = *vpn_status_timer.lock().await;
              // Only re-render every second while connected; other states are
              // already updated immediately by the vpn-state listener.
              if status == TrayStatus::Connected {
                let at = *connected_at_timer.lock().await;
                let tooltip = status.tooltip(at);
                if let Some(tray) = app_handle_timer.tray_by_id("main-tray") {
                  let _ = tray.set_tooltip(Some(tooltip.as_str()));
                }
              }
            }
          });
        }

        if let Some(window) = app.get_webview_window("main") {
          let _ = window.set_skip_taskbar(true);

          let window_clone = window.clone();
          let _ = window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
              api.prevent_close();
              let _ = window_clone.emit("window-close-requested", ());
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
