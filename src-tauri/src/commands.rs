use std::sync::Arc;

use common::constants::{GP_CLIENT_VERSION, GP_USER_AGENT};
use gpapi::{service::request::WsRequest, utils::host_utils};
use log::info;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;

use crate::{
  connect::{self, CertConfig, PreloginInfo, TunnelConfig},
  service_client::ServiceClient,
};

pub struct AppState {
  /// Arc so it can be cloned into 'static closures without lifetime issues
  pub client: Arc<Mutex<Option<ServiceClient>>>,
  pub auth_executable: Arc<Mutex<Option<String>>>,
  /// When true, the next SAML auth will pass --clean to clear stored cookies
  pub clean_next_auth: Arc<Mutex<bool>>,
}

impl AppState {
  pub fn new() -> Self {
    Self {
      client: Arc::new(Mutex::new(None)),
      auth_executable: Arc::new(Mutex::new(None)),
      clean_next_auth: Arc::new(Mutex::new(false)),
    }
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsDefaults {
  pub os_version: String,
  pub client_version: String,
  pub user_agent: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDefaults {
  pub linux: OsDefaults,
  pub windows: OsDefaults,
  pub macos: OsDefaults,
}

fn make_os_defaults(os_version: &str) -> OsDefaults {
  OsDefaults {
    os_version: os_version.to_owned(),
    client_version: GP_CLIENT_VERSION.to_owned(),
    user_agent: format!("{}/{} ({})", GP_USER_AGENT, GP_CLIENT_VERSION, os_version),
  }
}

#[tauri::command]
pub fn get_connection_defaults() -> ConnectionDefaults {
  ConnectionDefaults {
    linux: make_os_defaults(host_utils::get_linux_os_string()),
    windows: make_os_defaults(host_utils::get_windows_os_string()),
    macos: make_os_defaults(host_utils::get_macos_os_string()),
  }
}

#[tauri::command]
pub async fn get_prelogin(portal: String) -> Result<PreloginInfo, String> {
  connect::get_prelogin(&portal).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_credentials(state: State<'_, AppState>) -> Result<(), String> {
  *state.clean_next_auth.lock().await = true;
  Ok(())
}

#[tauri::command]
pub async fn connect_saml(
  portal: String,
  browser: Option<String>,
  reuse_auth_cookies: Option<bool>,
  use_external_browser: Option<bool>,
  certificate: Option<String>,
  sslkey: Option<String>,
  key_password: Option<String>,
  disable_ipv6: Option<bool>,
  no_dtls: Option<bool>,
  state: State<'_, AppState>,
) -> Result<(), String> {
  let auth_executable = state.auth_executable.lock().await.clone();
  let auth_exec_ref = auth_executable.as_deref();

  // Consume the explicit clear-credentials flag
  let force_clean = {
    let mut flag = state.clean_next_auth.lock().await;
    let v = *flag;
    *flag = false;
    v
  };

  // clean = true if explicitly requested OR if the user has disabled cookie reuse
  let clean = force_clean || !reuse_auth_cookies.unwrap_or(true);

  let default_browser = use_external_browser.unwrap_or(false);
  info!("Starting SAML connect to portal: {}, clean={}, default_browser={}", portal, clean, default_browser);

  let cert = CertConfig {
    certificate: certificate.filter(|s| !s.is_empty()),
    sslkey: sslkey.filter(|s| !s.is_empty()),
    key_password: key_password.filter(|s| !s.is_empty()),
  };
  let tunnel = TunnelConfig {
    disable_ipv6: disable_ipv6.unwrap_or(false),
    no_dtls: no_dtls.unwrap_or(false),
  };

  let req = connect::connect_saml(&portal, browser.as_deref(), auth_exec_ref, clean, default_browser, cert, tunnel)
    .await
    .map_err(|e| e.to_string())?;

  let client = state.client.lock().await;
  let Some(ref client) = *client else {
    return Err("Not connected to gpservice".to_string());
  };

  client
    .send(WsRequest::Connect(Box::new(req)))
    .await
    .map_err(|e| e.to_string())?;

  info!("ConnectRequest sent to gpservice");
  Ok(())
}

#[tauri::command]
pub async fn connect_password(
  portal: String,
  username: String,
  password: String,
  certificate: Option<String>,
  sslkey: Option<String>,
  key_password: Option<String>,
  disable_ipv6: Option<bool>,
  no_dtls: Option<bool>,
  state: State<'_, AppState>,
) -> Result<(), String> {
  info!("Starting password connect to portal: {}", portal);

  let cert = CertConfig {
    certificate: certificate.filter(|s| !s.is_empty()),
    sslkey: sslkey.filter(|s| !s.is_empty()),
    key_password: key_password.filter(|s| !s.is_empty()),
  };
  let tunnel = TunnelConfig {
    disable_ipv6: disable_ipv6.unwrap_or(false),
    no_dtls: no_dtls.unwrap_or(false),
  };

  let req = connect::connect_password(&portal, &username, &password, cert, tunnel)
    .await
    .map_err(|e| e.to_string())?;

  let client = state.client.lock().await;
  let Some(ref client) = *client else {
    return Err("Not connected to gpservice".to_string());
  };

  client
    .send(WsRequest::Connect(Box::new(req)))
    .await
    .map_err(|e| e.to_string())?;

  info!("ConnectRequest sent to gpservice");
  Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle, section: Option<String>) -> Result<(), String> {
  if let Some(w) = app.get_webview_window("settings") {
    let _ = w.show();
    let _ = w.set_focus();
    if let Some(ref s) = section {
      let _ = app.emit_to("settings", "navigate-settings-section", s);
    }
    return Ok(());
  }

  let url = match section {
    Some(s) => format!("/?window=settings&section={}", s),
    None => "/?window=settings".to_string(),
  };

  WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url.into()))
    .title("GP OpenUI Settings")
    .inner_size(700.0, 560.0)
    .center()
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

  Ok(())
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>) -> Result<(), String> {
  use gpapi::service::request::DisconnectRequest;

  info!("Sending disconnect request");

  let client = state.client.lock().await;
  let Some(ref client) = *client else {
    return Err("Not connected to gpservice".to_string());
  };

  client
    .send(WsRequest::Disconnect(DisconnectRequest))
    .await
    .map_err(|e| e.to_string())?;

  Ok(())
}
