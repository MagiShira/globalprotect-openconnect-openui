import { useState, useEffect } from "react";
import {
  CssBaseline,
  ThemeProvider,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Button,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  FormControlLabel,
  Checkbox,
  Stack,
  TextField,
  RadioGroup,
  Radio,
  Link,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import TuneIcon from "@mui/icons-material/Tune";
import RouterIcon from "@mui/icons-material/Router";
import LockPersonIcon from "@mui/icons-material/LockPerson";
import HttpsIcon from "@mui/icons-material/Https";
import ArticleIcon from "@mui/icons-material/Article";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppTheme } from "../useAppTheme";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OsDefaults {
  osVersion: string;
  clientVersion: string;
  userAgent: string;
}

interface ConnectionDefaults {
  linux: OsDefaults;
  windows: OsDefaults;
  macos: OsDefaults;
}

type ThemeMode = "light" | "system" | "dark";
type ClientOs = "linux" | "windows" | "macos";

interface Settings {
  // General
  theme: ThemeMode;
  hidpi: boolean;
  startMinimized: boolean;
  autoConnect: boolean;
  resumeOnWake: boolean;
  symbolicTrayIcon: boolean;
  // Connection
  clientOs: ClientOs;
  osVersion: string;
  clientVersion: string;
  userAgent: string;
  vpncScript: string;
  reconnectTimeout: string;
  mtu: string;
  submitHipReport: boolean;
  hipScriptPath: string;
  disableIPv6: boolean;
  noDtls: boolean;
  // Authentication
  reuseAuthCookies: boolean;
  useExternalBrowser: boolean;
  useClientCertificate: boolean;
  clientCertificate: string;
  clientKey: string;
  keyPassphrase: string;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  hidpi: false,
  startMinimized: false,
  autoConnect: false,
  resumeOnWake: false,
  symbolicTrayIcon: false,
  clientOs: "linux",
  osVersion: "",
  clientVersion: "",
  userAgent: "",
  vpncScript: "/etc/vpnc/vpnc-script",
  reconnectTimeout: "",
  mtu: "",
  submitHipReport: true,
  hipScriptPath: "",
  disableIPv6: false,
  noDtls: false,
  reuseAuthCookies: true,
  useExternalBrowser: false,
  useClientCertificate: false,
  clientCertificate: "",
  clientKey: "",
  keyPassphrase: "",
};

const SETTINGS_KEY = "gpopenui_settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ─── Shared primitives ───────────────────────────────────────────────────────

function SettingCheckbox({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <Box>
      <FormControlLabel
        control={
          <Checkbox
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            size="small"
          />
        }
        label={<Typography variant="body2">{label}</Typography>}
        sx={{ alignItems: "flex-start", "& .MuiCheckbox-root": { pt: 0 } }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ pl: 4, display: "block" }}>
        {description}
      </Typography>
    </Box>
  );
}

function SettingField({
  label,
  value,
  placeholder,
  password,
  error,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  password?: boolean;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Box>
      <Typography variant="caption" color={error ? "error" : "text.secondary"}>
        {label}
      </Typography>
      <TextField
        variant="standard"
        fullWidth
        size="small"
        value={value}
        placeholder={placeholder}
        type={password ? "password" : "text"}
        error={!!error}
        helperText={error}
        onChange={(e) => onChange(e.target.value)}
      />
    </Box>
  );
}

// ─── Section: General ────────────────────────────────────────────────────────

const GENERAL_RESTART_KEYS: (keyof Settings)[] = [
  "hidpi",
  "startMinimized",
  "autoConnect",
  "resumeOnWake",
];

function GeneralSection({
  s,
  set,
  initial,
}: {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  initial: Settings;
}) {
  const needsRestart = GENERAL_RESTART_KEYS.some((k) => s[k] !== initial[k]);

  return (
    <Stack spacing={2.5}>
      {needsRestart && (
        <Alert severity="warning">
          You need to restart the client after changing this setting.
        </Alert>
      )}

      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Theme
        </Typography>
        <ToggleButtonGroup
          value={s.theme}
          exclusive
          size="small"
          onChange={(_, v) => v && set({ theme: v })}
        >
          <ToggleButton value="light">
            <LightModeIcon fontSize="small" sx={{ mr: 0.5 }} />
            Light
          </ToggleButton>
          <ToggleButton value="system">
            <SettingsBrightnessIcon fontSize="small" sx={{ mr: 0.5 }} />
            System
          </ToggleButton>
          <ToggleButton value="dark">
            <DarkModeIcon fontSize="small" sx={{ mr: 0.5 }} />
            Dark
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <SettingCheckbox
        checked={s.hidpi}
        label="HiDPI Screen Compatibility"
        description="Enable this option if you're experiencing display issues on your 4K screen."
        onChange={(v) => set({ hidpi: v })}
      />
      <SettingCheckbox
        checked={s.startMinimized}
        label="Start Minimized"
        description="Start the client minimized in the system tray."
        onChange={(v) => set({ startMinimized: v })}
      />
      <SettingCheckbox
        checked={s.autoConnect}
        label="Auto Connect On Launch"
        description="Automatically connect to the last connected gateway when the client is launched."
        onChange={(v) => set({ autoConnect: v })}
      />
      <SettingCheckbox
        checked={s.resumeOnWake}
        label="Resume on Wake Up"
        description="Automatically resume the connection when the system wakes up from sleep."
        onChange={(v) => set({ resumeOnWake: v })}
      />
      <SettingCheckbox
        checked={s.symbolicTrayIcon}
        label="Use Symbolic Tray Icon"
        description="Use a monochrome symbolic icon in the system tray."
        onChange={(v) => set({ symbolicTrayIcon: v })}
      />
    </Stack>
  );
}

// ─── Section: Connection ─────────────────────────────────────────────────────

function ConnectionSection({
  s,
  set,
  defaults,
}: {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  defaults: ConnectionDefaults | null;
}) {
  const osKey: keyof ConnectionDefaults =
    s.clientOs === "windows" ? "windows" : s.clientOs === "macos" ? "macos" : "linux";
  const osDefaults = defaults?.[osKey] ?? null;

  return (
    <Stack spacing={2.5}>
      <Alert severity="info" icon="ℹ">
        You could tweak these settings if you're experiencing connection issues.
      </Alert>

      <Box>
        <Typography variant="caption" color="text.secondary">
          Client OS
        </Typography>
        <RadioGroup
          row
          value={s.clientOs}
          onChange={(e) => set({ clientOs: e.target.value as ClientOs })}
        >
          <FormControlLabel value="linux" control={<Radio size="small" />} label={<Typography variant="body2">Linux</Typography>} />
          <FormControlLabel value="windows" control={<Radio size="small" />} label={<Typography variant="body2">Windows</Typography>} />
          <FormControlLabel value="macos" control={<Radio size="small" />} label={<Typography variant="body2">macOS</Typography>} />
        </RadioGroup>
      </Box>

      <SettingField
        label="OS Version"
        value={s.osVersion}
        placeholder={osDefaults?.osVersion ?? ""}
        onChange={(v) => set({ osVersion: v })}
      />
      <SettingField
        label="Client Version"
        value={s.clientVersion}
        placeholder={osDefaults?.clientVersion ?? ""}
        onChange={(v) => set({ clientVersion: v })}
      />
      <SettingField
        label="User Agent"
        value={s.userAgent}
        placeholder={osDefaults?.userAgent ?? ""}
        onChange={(v) => set({ userAgent: v })}
      />
      <SettingField
        label="VPNC Script"
        value={s.vpncScript}
        onChange={(v) => set({ vpncScript: v })}
      />
      <SettingField
        label="Reconnect Timeout"
        value={s.reconnectTimeout}
        placeholder="300 seconds"
        onChange={(v) => set({ reconnectTimeout: v })}
      />
      <SettingField
        label="MTU"
        value={s.mtu}
        placeholder="Request MTU from server (legacy servers only)"
        onChange={(v) => set({ mtu: v })}
      />

      <Divider />

      <SettingCheckbox
        checked={s.submitHipReport}
        label="Submit HIP Report"
        description="Submit a Host Information Profile report to the gateway."
        onChange={(v) => set({ submitHipReport: v })}
      />
      {s.submitHipReport && (
        <SettingField
          label="Custom HIP Script Location"
          value={s.hipScriptPath}
          placeholder="/etc/vpnc/hipreport.sh"
          onChange={(v) => set({ hipScriptPath: v })}
        />
      )}

      <SettingCheckbox
        checked={s.disableIPv6}
        label="Disable IPv6"
        description="Disable IPv6 on the VPN tunnel."
        onChange={(v) => set({ disableIPv6: v })}
      />
      <SettingCheckbox
        checked={s.noDtls}
        label="No DTLS"
        description="Disable DTLS and use TLS for all traffic."
        onChange={(v) => set({ noDtls: v })}
      />
    </Stack>
  );
}

// ─── Section: Authentication ─────────────────────────────────────────────────

function AuthenticationSection({
  s,
  set,
  certError,
  onCertErrorClear,
}: {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  certError?: boolean;
  onCertErrorClear?: () => void;
}) {
  return (
    <Stack spacing={2.5}>
      <SettingCheckbox
        checked={s.reuseAuthCookies}
        label="Reuse Authentication Cookies"
        description="Enable this option to stay logged in longer with SSO. You won't need to log in repeatedly if your session is still active."
        onChange={(v) => set({ reuseAuthCookies: v })}
      />
      <SettingCheckbox
        checked={s.useExternalBrowser}
        label="Use External Browser"
        description="Prefer to use the external browser for SSO authentication if your portal supports it."
        onChange={(v) => set({ useExternalBrowser: v })}
      />
      <SettingCheckbox
        checked={s.useClientCertificate}
        label="Use Client Certificate Authentication"
        description="Enable this option if your portal requires the client certificate authentication."
        onChange={(v) => set({ useClientCertificate: v })}
      />
      {s.useClientCertificate && (
        <>
          <SettingField
            label="Client Certificate"
            value={s.clientCertificate}
            placeholder="Path to client certificate file in PKCS#8 (.pem) or PKCS#12 (.p12, .pfx) format."
            error={certError ? "Client certificate is required." : undefined}
            onChange={(v) => { set({ clientCertificate: v }); onCertErrorClear?.(); }}
          />
          <SettingField
            label="Client Key"
            value={s.clientKey}
            placeholder="Optional, only required if the client certificate does not contain the key. Must be in PKCS#8 (.pem) format."
            onChange={(v) => set({ clientKey: v })}
          />
          <SettingField
            label="Key Passphrase"
            value={s.keyPassphrase}
            placeholder="Optional, only required if the client key is encrypted."
            password
            onChange={(v) => set({ keyPassphrase: v })}
          />
        </>
      )}
    </Stack>
  );
}

// ─── Section: SSL/TLS ────────────────────────────────────────────────────────

function SslSection() {
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        TLS settings are configured at launch time, not from the UI.
      </Alert>
      <Typography variant="body2" color="text.secondary">
        <strong>OpenSSL legacy mode</strong> (needed for portals that use unsafe legacy TLS
        renegotiation) must be enabled when launching the client:
      </Typography>
      <Box
        component="pre"
        sx={{
          bgcolor: "action.hover",
          borderRadius: 1,
          px: 2,
          py: 1.5,
          m: 0,
          fontFamily: "monospace",
          fontSize: "0.8rem",
          overflowX: "auto",
        }}
      >
        gpclient --fix-openssl launch-gui
      </Box>
    </Stack>
  );
}

// ─── Section: License ────────────────────────────────────────────────────────

function LicenseSection() {
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" fontWeight={600}>
        GNU General Public License v2.0
      </Typography>
      <Typography variant="body2" color="text.secondary">
        GP OpenUI is free software: you can redistribute it and/or modify it
        under the terms of the GNU General Public License as published by the
        Free Software Foundation, version 2.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        This program is distributed in the hope that it will be useful, but
        WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
      </Typography>
      <Link
        variant="body2"
        href="https://www.fsf.org/about/what-is-free-software"
        onClick={(e) => {
          e.preventDefault();
          window.open("https://www.fsf.org/about/what-is-free-software");
        }}
      >
        Why free software?
      </Link>
      <Divider />
      <Typography variant="body2" fontWeight={600}>
        Open-source components
      </Typography>
      {[
        ["GlobalProtect-openconnect", "GPL-2.0"],
        ["OpenConnect", "LGPL-2.1"],
        ["React", "MIT"],
        ["Material UI", "MIT"],
        ["Tauri", "MIT / Apache-2.0"],
      ].map(([name, lic]) => (
        <Typography key={name} variant="body2" color="text.secondary">
          • {name} — {lic}
        </Typography>
      ))}
    </Stack>
  );
}

// ─── Section: About ──────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          GP OpenUI
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Version 0.1.0
        </Typography>
      </Box>

      <Typography variant="body2">
        An open-source graphical front-end for the GlobalProtect-openconnect
        CLI tools, supporting password and SSO (SAML) authentication.
      </Typography>

      <Typography variant="body2" color="warning.main" fontStyle="italic">
        This is an unofficial third-party client and is not affiliated with or
        endorsed by Palo Alto Networks. GlobalProtect is a registered trademark
        of Palo Alto Networks.
      </Typography>

      <Divider />

      {[
        ["Author", "Elane Faisal-Sage <elane@linux.com>"],
        ["License", "GPL-2.0"],
      ].map(([label, value]) => (
        <Box key={label} sx={{ display: "flex", gap: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
            {label}
          </Typography>
          <Typography variant="body2">{value}</Typography>
        </Box>
      ))}

      <Box sx={{ display: "flex", gap: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
          Built on
        </Typography>
        <Link
          href="https://github.com/yuezk/GlobalProtect-openconnect"
          target="_blank"
          rel="noreferrer"
          variant="body2"
          onClick={(e) => {
            e.preventDefault();
            window.open("https://github.com/yuezk/GlobalProtect-openconnect");
          }}
        >
          GlobalProtect-openconnect by yuezk
        </Link>
      </Box>

      <Divider />

      <Typography variant="caption" color="text.disabled">
        Copyleft {new Date().getFullYear()}{" "}
        <Box component="span" sx={{ display: "inline-block", transform: "scaleX(-1)" }}>
          ©
        </Box>{" "}
        Elane Faisal-Sage
      </Typography>
    </Stack>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

type Section = "general" | "connection" | "authentication" | "ssl" | "license" | "about";

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <TuneIcon fontSize="small" /> },
  { id: "connection", label: "Connection", icon: <RouterIcon fontSize="small" /> },
  { id: "authentication", label: "Authentication", icon: <LockPersonIcon fontSize="small" /> },
  { id: "ssl", label: "SSL/TLS", icon: <HttpsIcon fontSize="small" /> },
  { id: "license", label: "License", icon: <ArticleIcon fontSize="small" /> },
  { id: "about", label: "About", icon: <InfoOutlinedIcon fontSize="small" /> },
];

// ─── Root ─────────────────────────────────────────────────────────────────────


export default function SettingsPage() {
  const initialSection = (new URLSearchParams(window.location.search).get("section") ?? "general") as Section;
  const [section, setSection] = useState<Section>(initialSection);
  const [initialSettings] = useState<Settings>(loadSettings);
  const [savedSettings, setSavedSettings] = useState<Settings>(initialSettings);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const theme = useAppTheme(savedSettings.theme);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [connectionDefaults, setConnectionDefaults] = useState<ConnectionDefaults | null>(null);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  useEffect(() => {
    invoke<ConnectionDefaults>("get_connection_defaults")
      .then(setConnectionDefaults)
      .catch(console.error);

    const unlisten = listen<string>("navigate-settings-section", (e) => {
      setSection(e.payload as Section);
    });
    return () => { unlisten.then((u) => u()); };
  }, []);

  const patch = (p: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...p }));
  const [certError, setCertError] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (settings.useClientCertificate && !settings.clientCertificate.trim()) {
      setSection("authentication");
      setCertError(true);
      return;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSavedSettings(settings);
    setSaved(true);
  };

  const handleCancel = async () => {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      await getCurrentWindow().close();
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Are you sure you want to discard them?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
          <Button color="error" onClick={async () => { setConfirmDiscard(false); await getCurrentWindow().close(); }}>Discard</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={saved}
        autoHideDuration={2000}
        onClose={() => setSaved(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          icon={<CheckCircleOutlineIcon fontSize="small" />}
          severity="success"
          variant="filled"
          sx={{ width: "100%" }}
        >
          Settings saved
        </Alert>
      </Snackbar>
      <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          <Box
            sx={{
              width: 180,
              flexShrink: 0,
              borderRight: 1,
              borderColor: "divider",
              overflowY: "auto",
            }}
          >
            <List dense disablePadding sx={{ pt: 1 }}>
              {NAV.map(({ id, label, icon }) => (
                <ListItemButton
                  key={id}
                  selected={section === id}
                  onClick={() => setSection(id)}
                  sx={{ borderRadius: 1, mx: 0.5, mb: 0.25 }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>{icon}</ListItemIcon>
                  <ListItemText
                    primary={label}
                    slotProps={{ primary: { variant: "body2" } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>

          {/* Content */}
          <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
            {section === "general" && <GeneralSection s={settings} set={patch} initial={initialSettings} />}
            {section === "connection" && <ConnectionSection s={settings} set={patch} defaults={connectionDefaults} />}
            {section === "authentication" && <AuthenticationSection s={settings} set={patch} certError={certError} onCertErrorClear={() => setCertError(false)} />}
            {section === "ssl" && <SslSection />}
            {section === "license" && <LicenseSection />}
            {section === "about" && <AboutSection />}
          </Box>
        </Box>

        {/* Footer */}
        <Divider />
        <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, gap: 1 }}>
          <Box sx={{ flex: 1 }} />
          {isDirty ? (
            <>
              <Button size="small" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="small" variant="contained" onClick={handleSave}>
                Save
              </Button>
            </>
          ) : (
            <Button size="small" variant="contained" onClick={handleCancel}>
              Close
            </Button>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
