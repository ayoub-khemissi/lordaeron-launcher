import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri serves the built files; `pnpm dev` runs the same UI in a browser with a stand-in backend (src/lib/mock.ts)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  build: { target: "es2021", outDir: "dist", chunkSizeWarningLimit: 2000 },
});
