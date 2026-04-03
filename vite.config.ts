import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  return {
    plugins: [react()],
    clearScreen: false,
    server: {
      port: 1422,
      strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
        },
      },
    },
  };
});
