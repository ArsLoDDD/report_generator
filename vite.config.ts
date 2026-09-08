import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          "docx-preview": ["docx-preview"],
          morphology: ["shevchenko"],
        },
      },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] }
});
