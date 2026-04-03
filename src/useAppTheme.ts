import { useState, useEffect } from "react";
import { createTheme, Theme } from "@mui/material";

const SETTINGS_KEY = "gpopenui_settings";

function resolveMode(theme: string): "light" | "dark" {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readTheme(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw).theme ?? "system") : "system";
  } catch {
    return "dark";
  }
}

export function useAppTheme(themeOverride?: string, extraStyles?: object): Theme {
  const [mode, setMode] = useState<"light" | "dark">(() =>
    resolveMode(themeOverride ?? readTheme())
  );

  useEffect(() => {
    setMode(resolveMode(themeOverride ?? readTheme()));
  }, [themeOverride]);

  useEffect(() => {
    // Re-read when another window saves settings (storage event only fires cross-window)
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY && !themeOverride) setMode(resolveMode(readTheme()));
    };
    window.addEventListener("storage", onStorage);

    // Track OS preference changes when theme is "system"
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => {
      if ((themeOverride ?? readTheme()) === "system") setMode(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onMq);

    return () => {
      window.removeEventListener("storage", onStorage);
      mq.removeEventListener("change", onMq);
    };
  }, [themeOverride]);

  return createTheme({
    palette: { mode },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { userSelect: "none", WebkitUserSelect: "none", ...extraStyles },
        },
      },
    },
  });
}
