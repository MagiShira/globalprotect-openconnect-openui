import { Box, Typography, Button } from "@mui/material";
import HourglassEmpty from "@mui/icons-material/HourglassEmpty";

interface Props {
  isAuthenticating: boolean;
  onCancel: () => void;
}

export default function ConnectingView({ isAuthenticating, onCancel }: Props) {
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
            bgcolor: "action.hover",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <HourglassEmpty sx={{ fontSize: 48, color: "text.disabled" }} />
        </Box>
        <Box
          component="span"
          sx={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: "3px solid transparent",
            borderTopColor: "primary.main",
            animation: "spin 1s linear infinite",
            "@keyframes spin": { to: { transform: "rotate(360deg)" } },
          }}
        />
      </Box>

      <Box sx={{ textAlign: "center" }}>
        <Typography variant="h6" color="text.secondary">
          {isAuthenticating ? "Authenticating…" : "Connecting…"}
        </Typography>
        {isAuthenticating && (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            Complete sign-in in the window that opened.
          </Typography>
        )}
      </Box>

      {isAuthenticating && (
        <Button variant="outlined" color="inherit" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </Box>
  );
}
