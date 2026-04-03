// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use gpgui::cli;

#[tokio::main]
async fn main() {
  cli::run()
}
