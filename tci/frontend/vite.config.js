import { defineConfig } from "vite";

// In production the app server routes /api; locally, proxy it to uvicorn.
export default defineConfig({
    server: {
        proxy: { "/api": process.env.API_ORIGIN || "http://127.0.0.1:8000" },
    },
});
