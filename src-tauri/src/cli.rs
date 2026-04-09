use clap::Parser;
use gpapi::{clap::InfoLevelVerbosity, utils::base64};
use log::info;

use crate::app::App;

const VERSION: &str = concat!(env!("CARGO_PKG_VERSION"), " (", compile_time::date_str!(), ")");

#[cfg(debug_assertions)]
const GP_API_KEY: &[u8; 32] = &[0; 32];

#[derive(Parser)]
#[command(name = "gpgui", version = VERSION)]
struct Cli {
  #[arg(long, help = "Read the API key from stdin")]
  api_key_on_stdin: bool,

  #[arg(long, help = "Start the window minimized")]
  minimized: bool,

  #[command(flatten)]
  verbose: InfoLevelVerbosity,
}

impl Cli {
  fn run(&self) -> anyhow::Result<()> {
    let api_key = self.read_api_key()?;
    let app = App::new(api_key, self.minimized);

    configure_display_backend();

    app.run()
  }

  fn read_api_key(&self) -> anyhow::Result<Vec<u8>> {
    if self.api_key_on_stdin {
      let mut api_key = String::new();
      std::io::stdin().read_line(&mut api_key)?;
      let api_key = base64::decode_to_vec(api_key.trim())?;
      Ok(api_key)
    } else {
      #[cfg(debug_assertions)]
      return Ok(GP_API_KEY.to_vec());

      #[cfg(not(debug_assertions))]
      anyhow::bail!("API key must be provided via --api-key-on-stdin in release mode");
    }
  }
}

fn is_kde_session() -> bool {
  std::env::var("XDG_CURRENT_DESKTOP")
    .map(|d| d.to_ascii_lowercase().contains("kde"))
    .unwrap_or(false)
    || std::env::var("KDE_FULL_SESSION").is_ok()
    || std::env::var("KDE_SESSION_VERSION").is_ok()
}

fn configure_display_backend() {
  // Respect an explicitly set GDK_BACKEND
  if std::env::var("GDK_BACKEND").is_ok() {
    return;
  }

  let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok()
    || std::env::var("XDG_SESSION_TYPE")
      .map(|t| t.eq_ignore_ascii_case("wayland"))
      .unwrap_or(false);

  unsafe {
    if is_wayland && !is_kde_session() {
      std::env::set_var("GDK_BACKEND", "wayland");
      info!("Display backend: Wayland");
    } else {
      std::env::set_var("GDK_BACKEND", "x11");
      std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
      if is_wayland {
        info!("Display backend: XWayland (KDE session)");
      } else {
        info!("Display backend: X11");
      }
    }
  }
}

fn init_logger(cli: &Cli) {
  env_logger::builder()
    .filter_level(cli.verbose.log_level_filter())
    .init();
}

pub fn run() {
  let cli = Cli::parse();

  init_logger(&cli);
  info!("gpgui started: {}", VERSION);

  if let Err(e) = cli.run() {
    eprintln!("{}", e);
    std::process::exit(1);
  }
}
