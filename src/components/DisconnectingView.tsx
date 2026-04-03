import { Box, Typography } from "@mui/material";
import ShieldIcon from "@mui/icons-material/Shield";

export default function DisconnectingView() {
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
      <Box sx={{ position: "relative", width: 96, height: 96 }}>
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
          <ShieldIcon sx={{ fontSize: 48, color: "success.main" }} />
        </Box>
        <Box
          component="span"
          sx={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: "3px solid transparent",
            borderTopColor: "warning.main",
            animation: "spin 1s linear infinite",
            "@keyframes spin": { to: { transform: "rotate(360deg)" } },
          }}
        />
      </Box>

      <Typography variant="h6" color="text.secondary">
        Disconnecting…
      </Typography>
    </Box>
  );
}
