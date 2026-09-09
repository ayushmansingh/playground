import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The app server serves this directory.
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    // Local development only. In production the app server puts the API and
    // the built page on one origin, which is why every call in the app is a
    // relative /api path and never an absolute URL.
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
