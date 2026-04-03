import { useState, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Divider,
  Stack,
  CircularProgress,
  InputAdornment,
  Link,
} from "@mui/material";
import PublicIcon from "@mui/icons-material/Public";
import VpnKeyOff from "@mui/icons-material/VpnKeyOff";
import { PreloginType } from "../types";

interface Props {
  portal: string;
  onPortalChange: (portal: string) => void;
  error: string | null;
  onOpenSettings: () => void;
  preloginInfo: PreloginType | null;
  onGetPrelogin: (portal: string) => Promise<void>;
  onConnectSaml: (portal: string, browser: string | null) => void;
  onConnectPassword: (portal: string, username: string, password: string) => void;
}

export default function DisconnectedView({
  portal,
  onPortalChange,
  error,
  onOpenSettings,
  preloginInfo,
  onGetPrelogin,
  onConnectSaml,
  onConnectPassword,
}: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isCheckingPortal, setIsCheckingPortal] = useState(false);

  useEffect(() => {
    setIsCheckingPortal(false);
  }, [preloginInfo, error]);

  const isStandard = preloginInfo?.type === "standard";
  const standardPrelogin = isStandard ? preloginInfo : null;

  const handlePortalBlur = async () => {
    const trimmed = portal.trim();
    if (!trimmed || preloginInfo) return;
    setIsCheckingPortal(true);
    await onGetPrelogin(trimmed);
    setIsCheckingPortal(false);
  };

  const handlePortalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handlePortalBlur();
  };

  const handleConnect = () => {
    const trimmed = portal.trim();
    if (!trimmed) return;
    if (isStandard) {
      onConnectPassword(trimmed, username, password);
    } else {
      onConnectSaml(trimmed, null);
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2.5,
        px: 3,
      }}
    >
      <Box
        sx={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          bgcolor: "action.hover",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <VpnKeyOff sx={{ fontSize: 48, color: "text.disabled" }} />
      </Box>

      <Typography variant="h6" color="text.secondary">
        Not Connected
      </Typography>

      <Stack spacing={1.5} sx={{ width: "100%" }}>
        {error && (
          <Alert severity="error" sx={{ fontSize: "0.8rem", py: 0.5 }}>
            {error}
            {error.includes("error sending request for url") && (
              <>
                {" "}
                <Link
                  component="button"
                  variant="caption"
                  onClick={onOpenSettings}
                  sx={{ verticalAlign: "baseline" }}
                >
                  Learn more
                </Link>
              </>
            )}
          </Alert>
        )}

        <TextField
          label="Portal address"
          placeholder="vpn.example.com"
          value={portal}
          onChange={(e) => onPortalChange(e.target.value)}
          onKeyDown={handlePortalKeyDown}
          onBlur={handlePortalBlur}
          size="small"
          fullWidth
          autoFocus
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <PublicIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
              endAdornment: isCheckingPortal ? (
                <InputAdornment position="end">
                  <CircularProgress size={16} />
                </InputAdornment>
              ) : undefined,
            },
          }}
        />

        {isStandard && standardPrelogin && (
          <>
            <Divider />
            <Typography variant="body2" color="text.secondary">
              {standardPrelogin.authMessage}
            </Typography>
            <TextField
              label={standardPrelogin.labelUsername}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              size="small"
              fullWidth
            />
            <TextField
              label={standardPrelogin.labelPassword}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              size="small"
              fullWidth
            />
          </>
        )}

        <Button
          variant="contained"
          size="large"
          disabled={!portal.trim()}
          onClick={handleConnect}
          fullWidth
        >
          Connect
        </Button>
      </Stack>
    </Box>
  );
}
