import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 5186,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8016",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
