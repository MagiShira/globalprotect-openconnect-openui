import { useState, useEffect } from "react";
import { Box, Button, Typography, Stack, Divider } from "@mui/material";
import VpnLock from "@mui/icons-material/VpnLock";

function useElapsed(connectedAt: number): string {
  const [elapsed, setElapsed] = useState(Date.now() - connectedAt);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - connectedAt), 1000);
    return () => clearInterval(id);
  }, [connectedAt]);

  const totalSeconds = Math.floor(elapsed / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  portal: string;
  gatewayName: string;
  gatewayAddress: string;
  connectedAt: number;
  onDisconnect: () => void;
}

export default function ConnectedView({ portal, gatewayName, gatewayAddress, connectedAt, onDisconnect }: Props) {
  const elapsed = useElapsed(connectedAt);

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
          bgcolor: "rgba(76,175,80,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <VpnLock sx={{ fontSize: 48, color: "success.main" }} />
      </Box>

      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="success.light" noWrap sx={{ maxWidth: 280 }}>
          {gatewayName}
        </Typography>
        <Typography variant="h6" color="success.main">
          Connected
        </Typography>
        <Box
          sx={{
            display: "inline-block",
            mt: 0.5,
            px: 1.5,
            py: 0.25,
            borderRadius: 99,
            bgcolor: "rgba(76,175,80,0.12)",
          }}
        >
          <Typography variant="caption" color="success.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {elapsed}
          </Typography>
        </Box>
      </Box>

      <Stack
        spacing={1}
        sx={{ width: "100%", bgcolor: "action.hover", borderRadius: 2, p: 2 }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">Portal</Typography>
          <Typography variant="body2">{portal}</Typography>
        </Box>
        <Divider />
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">Gateway</Typography>
          <Typography variant="body2">{gatewayName}</Typography>
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">Address</Typography>
          <Typography variant="body2" color="text.secondary">{gatewayAddress}</Typography>
        </Box>
      </Stack>

      <Button variant="outlined" color="error" size="large" onClick={onDisconnect} fullWidth>
        Disconnect
      </Button>
    </Box>
  );
}
