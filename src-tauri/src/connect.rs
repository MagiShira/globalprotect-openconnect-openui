use common::constants::{GP_CLIENT_VERSION, GP_USER_AGENT};
use gpapi::{
  credential::{Credential, PasswordCredential},
  gateway::{GatewayLogin, gateway_login},
  gp_params::{ClientOs, GpParams},
  portal::{Prelogin, prelogin, retrieve_config},
  process::auth_launcher::SamlAuthLauncher,
  service::{request::ConnectRequest, vpn_state::ConnectInfo},
  utils::host_utils,
};
use log::info;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PreloginInfo {
  Saml,
  Standard {
    auth_message: String,
    label_username: String,
    label_password: String,
  },
}

pub struct CertConfig {
  pub certificate: Option<String>,
  pub sslkey: Option<String>,
  pub key_password: Option<String>,
}

pub struct TunnelConfig {
  pub disable_ipv6: bool,
  pub no_dtls: bool,
}

fn build_gp_params(cert: &CertConfig) -> GpParams {
  let os_version = host_utils::get_linux_os_string().to_owned();
  let user_agent = format!("{}/{} ({})", GP_USER_AGENT, GP_CLIENT_VERSION, os_version);

  GpParams::builder()
    .user_agent(&user_agent)
    .client_os(ClientOs::Linux)
    .os_version(os_version)
    .certificate(cert.certificate.clone())
    .sslkey(cert.sslkey.clone())
    .key_password(cert.key_password.clone())
    .build()
}

pub async fn get_prelogin(portal: &str) -> anyhow::Result<PreloginInfo> {
  let gp_params = build_gp_params(&CertConfig { certificate: None, sslkey: None, key_password: None });
  let result = prelogin(portal, &gp_params).await?;

  let info = match result {
    Prelogin::Saml(_) => PreloginInfo::Saml,
    Prelogin::Standard(p) => PreloginInfo::Standard {
      auth_message: p.auth_message().to_owned(),
      label_username: p.label_username().to_owned(),
      label_password: p.label_password().to_owned(),
    },
  };

  Ok(info)
}


/// Full connect flow for SAML (browser-based) authentication.
/// Returns a ConnectRequest ready to send to gpservice.
pub async fn connect_saml(
  portal: &str,
  browser: Option<&str>,
  auth_executable: Option<&str>,
  clean: bool,
  default_browser: bool,
  cert: CertConfig,
  tunnel: TunnelConfig,
) -> anyhow::Result<ConnectRequest> {
  let gp_params = build_gp_params(&cert);

  info!("Running prelogin for portal: {}", portal);
  let portal_prelogin = prelogin(portal, &gp_params).await?;
  let region = portal_prelogin.region().to_owned();

  let saml_request = match &portal_prelogin {
    Prelogin::Saml(p) => Some(p.saml_request().to_owned()),
    Prelogin::Standard(_) => None,
  };

  info!("Launching browser authentication (clean={}, default_browser={})", clean, default_browser);
  let mut launcher = SamlAuthLauncher::new(portal)
    .auth_executable(auth_executable)
    .browser(browser)
    .clean(clean)
    .default_browser(default_browser);
  if let Some(ref req) = saml_request {
    launcher = launcher.saml_request(req);
  }
  let cred = launcher.launch().await?;

  info!("Retrieving portal configuration");
  let mut portal_config = retrieve_config(portal, &cred, &gp_params).await?;
  portal_config.sort_gateways(&region);

  let gateways = portal_config.gateways();
  anyhow::ensure!(!gateways.is_empty(), "No gateways found in portal configuration");

  let selected_gateway = gateways[0].clone();
  let all_gateways: Vec<_> = gateways.into_iter().cloned().collect();
  let gateway = selected_gateway.server().to_owned();

  info!("Connecting to gateway: {}", selected_gateway.name());

  let auth_cookie_cred: Credential = portal_config.auth_cookie().into();
  let cookie = match gateway_login(&gateway, &auth_cookie_cred, &gp_params).await {
    Ok(GatewayLogin::Cookie(c)) => c,
    Ok(GatewayLogin::Mfa(_, _)) => {
      anyhow::bail!("MFA is not supported in the GUI yet. Please use the CLI: gpclient connect")
    }
    Err(e) => {
      // Portal auth cookie rejected — fall back to gateway-level auth
      info!(
        "Portal auth cookie rejected by gateway ({}), trying gateway-level authentication",
        e
      );
      let mut gw_params = gp_params.clone();
      gw_params.set_is_gateway(true);

      let gw_prelogin = prelogin(&gateway, &gw_params).await?;
      let gw_cred = match &gw_prelogin {
        Prelogin::Saml(saml) => {
          info!("Launching gateway browser authentication");
          let saml_req = saml.saml_request().to_owned();
          SamlAuthLauncher::new(&gateway)
            .auth_executable(auth_executable)
            .browser(browser)
            .clean(clean)
            .default_browser(default_browser)
            .gateway(true)
            .saml_request(&saml_req)
            .launch()
            .await?
        }
        Prelogin::Standard(_) => {
          anyhow::bail!(
            "Gateway requires username/password authentication. Please use the CLI: gpclient connect"
          )
        }
      };

      match gateway_login(&gateway, &gw_cred, &gw_params).await? {
        GatewayLogin::Cookie(c) => c,
        GatewayLogin::Mfa(_, _) => {
          anyhow::bail!("MFA is not supported in the GUI yet. Please use the CLI: gpclient connect")
        }
      }
    }
  };

  let connect_info = ConnectInfo::new(portal.to_owned(), selected_gateway, all_gateways);
  Ok(ConnectRequest::new(connect_info, cookie)
    .with_disable_ipv6(tunnel.disable_ipv6)
    .with_no_dtls(tunnel.no_dtls))
}

/// Full connect flow for standard (username/password) authentication.
/// Returns a ConnectRequest ready to send to gpservice.
pub async fn connect_password(
  portal: &str,
  username: &str,
  password: &str,
  cert: CertConfig,
  tunnel: TunnelConfig,
) -> anyhow::Result<ConnectRequest> {
  let gp_params = build_gp_params(&cert);

  info!("Running prelogin for portal: {}", portal);
  let prelogin_result = prelogin(portal, &gp_params).await?;
  let region = prelogin_result.region().to_owned();

  let cred = Credential::Password(PasswordCredential::new(username, password));

  info!("Retrieving portal configuration");
  let mut portal_config = retrieve_config(portal, &cred, &gp_params).await?;
  portal_config.sort_gateways(&region);

  let gateways = portal_config.gateways();
  anyhow::ensure!(!gateways.is_empty(), "No gateways found in portal configuration");

  let selected_gateway = gateways[0].clone();
  let all_gateways: Vec<_> = gateways.into_iter().cloned().collect();

  info!("Connecting to gateway: {}", selected_gateway.name());

  let auth_cookie_cred: Credential = portal_config.auth_cookie().into();
  let cookie = match gateway_login(selected_gateway.server(), &auth_cookie_cred, &gp_params).await? {
    GatewayLogin::Cookie(c) => c,
    GatewayLogin::Mfa(_, _) => {
      anyhow::bail!("MFA is not supported in the GUI yet. Please use the CLI: gpclient connect")
    }
  };

  let connect_info = ConnectInfo::new(portal.to_owned(), selected_gateway, all_gateways);
  Ok(ConnectRequest::new(connect_info, cookie)
    .with_disable_ipv6(tunnel.disable_ipv6)
    .with_no_dtls(tunnel.no_dtls))
}
