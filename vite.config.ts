import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@edition-root": fileURLToPath(new URL(mode === "admin" ? "./src/features/admin/AdminApp.tsx" : "./src/App.tsx", import.meta.url)),
    },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    rollupOptions: {
      output: {
        manualChunks: mode === "admin"
          ? { react: ["react", "react-dom"] }
          : {
              react: ["react", "react-dom"],
              "docx-preview": ["docx-preview"],
              morphology: ["shevchenko"],
            },
      },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] }
}));
