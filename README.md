# GP OpenUI
An open-source graphical front-end for the [GlobalProtect-openconnect](https://github.com/yuezk/GlobalProtect-openconnect) CLI tools, supporting password and SSO (SAML) authentication.

> **Disclaimer:** This is an unofficial third-party client and is not affiliated with or endorsed by Palo Alto Networks. GlobalProtect is a registered trademark of Palo Alto Networks.

## About

GP OpenUI is a custom GUI for the `gpclient` / `gpservice` daemon stack from [GlobalProtect-openconnect](https://github.com/yuezk/GlobalProtect-openconnect). It replaces the upstream `gpgui` binary with a free and open-source interface built with [Tauri](https://tauri.app) (Rust + React).

## Features

- **Password authentication** — standard username/password login
- **SSO/SAML authentication** — embedded WebView or external browser
- **Client certificate authentication** — PKCS#8 (`.pem`) and PKCS#12 (`.p12`/`.pfx`)
- **Cookie reuse** — stay logged in across SAML sessions
- **OS spoofing** — present as Linux, Windows, or macOS to the portal
- **HIP report submission** — with optional custom script path
- **Tunnel options** — disable IPv6, disable DTLS, custom MTU, VPNC script, reconnect timeout
- **Theme support** — light, dark, and system-follow modes
- **Settings window** — persistent per-user settings stored locally
- **Wayland and X11** — native Wayland support, X11 fallback

## Roadmap

- [ ] **Manual gateway selection** — the app currently auto-selects the first gateway returned by the portal
- [ ] **System tray integration** — minimize to tray, tray icon menu
- [ ] **Auto-start on login** — launch with the system and connect automatically
- [ ] **Resume on wake** — reconnect automatically after the system wakes from sleep

## Installation

Run the install script as a regular user (it uses `sudo` internally where root is required):

```bash
./install.sh
```

The script will:

1. Install system build dependencies (WebKitGTK, GTK 3, OpenSSL, etc.)
2. Install Rust (≥ 1.85) via `rustup` if not already present
3. Install Node.js LTS and pnpm if not already present
4. Install GlobalProtect-openconnect (`gpservice` + `gpclient`) from the upstream package repository
5. Build this Tauri app (`pnpm install` + `cargo tauri build`)
6. Replace `/usr/bin/gpgui` with the newly built binary (the original is backed up as `gpgui.upstream`)

**Supported distributions:** Debian/Ubuntu, Fedora/RHEL, Arch Linux (requires an AUR helper — `yay` or `paru`)

## Usage

After installation, launch the GUI through your application launcher or via:

```bash
gpclient launch-gui
```

### Legacy TLS Configurations

Some GlobalProtect installations use older TLS configurations (e.g. deprecated ciphers or older protocol versions) that are rejected by the system OpenSSL by default. If the GUI fails to connect with a TLS handshake error, use the `--fix-openssl` flag:

```bash
gpclient --fix-openssl launch-gui
```


## Requirements

- Linux (X11 or Wayland)
- One of: `apt`, `dnf`, or `pacman` (with `yay`/`paru` for AUR packages on Arch)
- Internet access to download build tools and the upstream GP packages

## License

GPL-2.0

