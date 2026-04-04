import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  CssBaseline,
  ThemeProvider,
  Box,
  Alert,
  Snackbar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import GitHubIcon from "@mui/icons-material/GitHub";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SettingsIcon from "@mui/icons-material/Settings";
import { VpnState, PreloginType } from "../../types";
import DisconnectedView from "../DisconnectedView";
import ConnectingView from "../ConnectingView";
import ConnectedView from "../ConnectedView";
import DisconnectingView from "../DisconnectingView";
import { useAppTheme } from "../../useAppTheme";

function getStateTag(vpnState: VpnState | null): string {
  if (!vpnState) return "disconnected";
  if (vpnState === "disconnected") return "disconnected";
  if (vpnState === "disconnecting") return "disconnecting";
  if ("connecting" in vpnState) return "connecting";
  if ("connected" in vpnState) return "connected";
  return "disconnected";
}

const PORTAL_KEY = "gpgui_last_portal";

export default function App() {
  const theme = useAppTheme();
  const [vpnState, setVpnState] = useState<VpnState | null>(null);
  const [connectedAt, setConnectedAt] = useState<number>(0);
  const [portal, setPortal] = useState(() => localStorage.getItem(PORTAL_KEY) ?? "");
  const [preloginInfo, setPreloginInfo] = useState<PreloginType | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  useEffect(() => {
    if (portal) localStorage.setItem(PORTAL_KEY, portal);
    else localStorage.removeItem(PORTAL_KEY);
  }, [portal]);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});

    const unlistenState = listen<VpnState>("vpn-state", (event) => {
      const next = event.payload;
      setVpnState((prev) => {
        const wasConnected = typeof prev === "object" && prev !== null && "connected" in prev;
        const isConnected = typeof next === "object" && next !== null && "connected" in next;
        if (isConnected && !wasConnected) setConnectedAt(Date.now());
        return next;
      });
      setIsAuthenticating(false);
    });

    const unlistenServiceErr = listen<string>("service-error", (event) => {
      setServiceError(
        `Could not connect to gpservice: ${event.payload}. Is gpservice running?`
      );
    });

    const unlistenDisconnected = listen("service-disconnected", () => {
      setServiceError("Lost connection to gpservice.");
      setVpnState("disconnected");
      setIsAuthenticating(false);
    });

    return () => {
      unlistenState.then((u) => u());
      unlistenServiceErr.then((u) => u());
      unlistenDisconnected.then((u) => u());
    };
  }, []);

  const handleGetPrelogin = useCallback(async (portal: string): Promise<void> => {
    setConnectError(null);
    try {
      const info = await invoke<PreloginType>("get_prelogin", { portal });
      setPreloginInfo(info);
    } catch (e) {
      setConnectError(String(e));
    }
  }, []);

  const readSettings = () => JSON.parse(localStorage.getItem("gpopenui_settings") ?? "{}");

  const handleConnectSaml = useCallback(async (portal: string, browser: string | null) => {
    setIsAuthenticating(true);
    setConnectError(null);
    try {
      const s = readSettings();
      await invoke("connect_saml", {
        portal,
        browser,
        reuseAuthCookies: s.reuseAuthCookies ?? true,
        useExternalBrowser: s.useExternalBrowser ?? false,
        certificate: s.useClientCertificate ? (s.clientCertificate ?? null) : null,
        sslkey: s.useClientCertificate ? (s.clientKey ?? null) : null,
        keyPassword: s.useClientCertificate ? (s.keyPassphrase ?? null) : null,
        disableIpv6: s.disableIPv6 ?? false,
        noDtls: s.noDtls ?? false,
      });
    } catch (e) {
      setConnectError(String(e));
      setIsAuthenticating(false);
    }
  }, []);

  const handleConnectPassword = useCallback(
    async (portal: string, username: string, password: string) => {
      setIsAuthenticating(true);
      setConnectError(null);
      try {
        const s = readSettings();
        await invoke("connect_password", {
          portal,
          username,
          password,
          certificate: s.useClientCertificate ? (s.clientCertificate ?? null) : null,
          sslkey: s.useClientCertificate ? (s.clientKey ?? null) : null,
          keyPassword: s.useClientCertificate ? (s.keyPassphrase ?? null) : null,
          disableIpv6: s.disableIPv6 ?? false,
          noDtls: s.noDtls ?? false,
        });
      } catch (e) {
        setConnectError(String(e));
        setIsAuthenticating(false);
      }
    },
    []
  );

  const handleDisconnect = useCallback(async () => {
    try {
      await invoke("disconnect");
    } catch (e) {
      console.error("disconnect:", e);
    }
  }, []);

  const handleCancelConnect = useCallback(() => {
    setIsAuthenticating(false);
    setPreloginInfo(null);
  }, []);

  const handleClearCredentials = useCallback(async () => {
    setMenuAnchor(null);
    try {
      await invoke("clear_credentials");
    } catch (e) {
      console.error("clear_credentials:", e);
    }
    setPortal("");
    setPreloginInfo(null);
    setConnectError(null);
  }, []);

  const handleOpenSettings = useCallback(async (section?: string) => {
    setMenuAnchor(null);
    try {
      await invoke("open_settings", { section: section ?? null });
    } catch (e) {
      console.error("open_settings:", e);
    }
  }, []);

  const stateTag = getStateTag(vpnState);
  const isConnecting = isAuthenticating || stateTag === "connecting";
  const isConnected = stateTag === "connected";

  const renderContent = () => {
    if (stateTag === "disconnecting") return <DisconnectingView />;
    if (isConnecting) {
      return (
        <ConnectingView isAuthenticating={isAuthenticating} onCancel={handleCancelConnect} />
      );
    }
    if (isConnected && vpnState && typeof vpnState === "object" && "connected" in vpnState) {
      return (
        <ConnectedView
          portal={vpnState.connected.portal}
          gatewayName={vpnState.connected.gateway.name}
          gatewayAddress={vpnState.connected.gateway.address}
          connectedAt={connectedAt}
          onDisconnect={handleDisconnect}
        />
      );
    }
    return (
      <DisconnectedView
        portal={portal}
        onPortalChange={setPortal}
        error={connectError}
        onOpenSettings={() => handleOpenSettings("ssl")}
        preloginInfo={preloginInfo}
        onGetPrelogin={handleGetPrelogin}
        onConnectSaml={handleConnectSaml}
        onConnectPassword={handleConnectPassword}
      />
    );
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 0.5,
            py: 0.25,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MenuIcon fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <IconButton
            size="small"
            onClick={() => invoke("open_url", { url: "https://github.com/MagiShira/globalprotect-openconnect-openui" })}
          >
            <GitHubIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Hamburger menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem onClick={handleClearCredentials}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Clear Credentials</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => handleOpenSettings()}>
            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Settings</ListItemText>
          </MenuItem>
        </Menu>

        {/* Main content */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {renderContent()}
        </Box>

        {/* Footer */}
        <Box sx={{ textAlign: "center", py: 0.75 }}>
          <Typography variant="caption" color="text.disabled">
            {version ? `v${version}` : ""}
          </Typography>
        </Box>
      </Box>

      <Snackbar
        open={!!serviceError}
        autoHideDuration={8000}
        onClose={() => setServiceError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setServiceError(null)}>
          {serviceError}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
