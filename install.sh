#!/usr/bin/env bash
# install.sh — Build and install GP OpenUI, replacing the upstream gpgui binary.
#
# This script:
#   1. Installs build dependencies (Rust, Node.js, pnpm, WebKitGTK, etc.)
#   2. Installs GlobalProtect-openconnect (gpservice + gpclient) from upstream
#   3. Builds this Tauri app
#   4. Replaces the system gpgui binary with the one from this repo
#
# Supported distros: Debian/Ubuntu, Fedora/RHEL, Arch Linux

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_NAME="gpgui"
INSTALL_DIR="/usr/bin"
GP_UPSTREAM_INSTALL_URL="https://github.com/yuezk/GlobalProtect-openconnect/releases/latest/download/install.sh"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()    { printf '\033[0;32m[INFO]\033[0m  %s\n' "$*"; }
warn()    { printf '\033[0;33m[WARN]\033[0m  %s\n' "$*"; }
error()   { printf '\033[0;31m[ERROR]\033[0m %s\n' "$*" >&2; }
die()     { error "$*"; exit 1; }

need_root() {
  if [[ $EUID -ne 0 ]]; then
    die "This step requires root. Re-run with sudo or as root."
  fi
}

have() { command -v "$1" &>/dev/null; }

detect_pm() {
  if have apt-get;  then echo apt
  elif have dnf;    then echo dnf
  elif have pacman; then echo pacman
  else die "Unsupported package manager. Install dependencies manually and re-run."
  fi
}

# ---------------------------------------------------------------------------
# 1. Build dependencies
# ---------------------------------------------------------------------------
install_build_deps() {
  local pm
  pm="$(detect_pm)"
  info "Detected package manager: $pm"
  info "Installing build dependencies..."

  case "$pm" in
    apt)
      sudo apt-get update -q
      sudo apt-get install -y --no-install-recommends \
        curl build-essential pkg-config \
        libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
        libjavascriptcoregtk-4.1-dev librsvg2-dev \
        libsoup-3.0-dev file patchelf
      ;;
    dnf)
      sudo dnf install -y \
        curl gcc gcc-c++ make pkg-config \
        openssl-devel gtk3-devel webkit2gtk4.1-devel \
        javascriptcoregtk4.1-devel librsvg2-devel \
        libsoup3-devel file patchelf
      ;;
    pacman)
      sudo pacman -Sy --needed --noconfirm \
        curl base-devel openssl gtk3 webkit2gtk-4.1 \
        librsvg file patchelf
      ;;
  esac

  info "Build dependencies installed."
}

# ---------------------------------------------------------------------------
# 2. Rust
# ---------------------------------------------------------------------------
install_rust() {
  if have rustup; then
    info "rustup already installed; updating toolchain..."
    rustup update stable
  elif have cargo; then
    info "Rust (cargo) already present; skipping install."
  else
    info "Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    # Make cargo available in the current shell
    # shellcheck source=/dev/null
    source "${HOME}/.cargo/env"
  fi

  local rust_ver
  rust_ver="$(rustc --version 2>/dev/null | awk '{print $2}')"
  info "Rust version: $rust_ver"

  # Minimum version required by Cargo.toml: 1.85
  local min_ver="1.85"
  if [[ "$(printf '%s\n' "$min_ver" "$rust_ver" | sort -V | head -1)" != "$min_ver" ]]; then
    die "Rust $min_ver or newer is required (found $rust_ver). Run: rustup update stable"
  fi
}

# ---------------------------------------------------------------------------
# 3. Node.js + pnpm
# ---------------------------------------------------------------------------
install_node() {
  if ! have node; then
    info "Node.js not found. Installing via NodeSource (LTS)..."
    local pm
    pm="$(detect_pm)"
    case "$pm" in
      apt)
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
        ;;
      dnf)
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo -E bash -
        sudo dnf install -y nodejs
        ;;
      pacman)
        sudo pacman -Sy --needed --noconfirm nodejs npm
        ;;
    esac
  fi
  info "Node.js version: $(node --version)"
}

install_pnpm() {
  if have pnpm; then
    info "pnpm already installed ($(pnpm --version))."
    return
  fi
  info "Installing pnpm..."
  # Use corepack if available (ships with Node 16+)
  if have corepack; then
    sudo corepack enable
    corepack prepare pnpm@latest --activate
  else
    npm install -g pnpm
  fi
  info "pnpm version: $(pnpm --version)"
}

# ---------------------------------------------------------------------------
# 4. GlobalProtect-openconnect (upstream: gpservice + gpclient)
# ---------------------------------------------------------------------------
install_gp_upstream() {
  if have gpservice && have gpclient; then
    info "GlobalProtect-openconnect already installed; skipping upstream install."
    return
  fi

  local pm
  pm="$(detect_pm)"

  info "Installing GlobalProtect-openconnect from upstream..."

  case "$pm" in
    apt)
      # Add the upstream GPG key + apt repository, then install
      sudo mkdir -p /etc/apt/keyrings
      curl -fsSL https://yuezk.github.io/GlobalProtect-openconnect/globalprotect-openconnect.gpg \
        | sudo tee /etc/apt/keyrings/globalprotect-openconnect.gpg >/dev/null
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/globalprotect-openconnect.gpg] \
https://yuezk.github.io/GlobalProtect-openconnect/apt stable main" \
        | sudo tee /etc/apt/sources.list.d/globalprotect-openconnect.list >/dev/null
      sudo apt-get update -q
      sudo apt-get install -y globalprotect-openconnect
      ;;
    dnf)
      sudo dnf config-manager --add-repo \
        https://yuezk.github.io/GlobalProtect-openconnect/rpm/globalprotect-openconnect.repo
      sudo dnf install -y globalprotect-openconnect
      ;;
    pacman)
      if have yay; then
        yay -Sy --needed --noconfirm globalprotect-openconnect-git
      elif have paru; then
        paru -Sy --needed --noconfirm globalprotect-openconnect-git
      else
        warn "No AUR helper found. Install globalprotect-openconnect-git from the AUR manually, then re-run."
        warn "  yay -S globalprotect-openconnect-git"
        exit 1
      fi
      ;;
  esac

  info "GlobalProtect-openconnect installed."
}

# ---------------------------------------------------------------------------
# 5. Build this Tauri app
# ---------------------------------------------------------------------------
build_app() {
  info "Building GP OpenUI..."
  cd "$REPO_DIR"

  info "  Installing frontend dependencies..."
  pnpm install --frozen-lockfile

  info "  Running cargo tauri build..."
  pnpm tauri build --no-bundle

  local binary
  binary="$REPO_DIR/src-tauri/target/release/$BINARY_NAME"
  if [[ ! -f "$binary" ]]; then
    die "Build succeeded but binary not found at: $binary"
  fi
  info "Build complete: $binary"
}

# ---------------------------------------------------------------------------
# 6. Install / replace the gpgui binary
# ---------------------------------------------------------------------------
install_binary() {
  local src="$REPO_DIR/src-tauri/target/release/$BINARY_NAME"
  local dest="$INSTALL_DIR/$BINARY_NAME"

  info "Installing $BINARY_NAME to $dest..."

  if [[ -f "$dest" ]]; then
    info "  Backing up existing binary to ${dest}.upstream..."
    sudo cp --preserve=all "$dest" "${dest}.upstream"
  fi

  sudo install -m 755 "$src" "$dest"
  info "Installed: $dest"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  info "=== GP OpenUI installer ==="
  info "Repo: $REPO_DIR"
  echo

  install_build_deps
  echo
  install_rust
  echo
  install_node
  install_pnpm
  echo
  install_gp_upstream
  echo
  build_app
  echo
  install_binary
  echo

  info "=== Done! ==="
  info "You can now launch GP OpenUI via your application launcher or by running: gpclient launch-gui"
}

main "$@"
