import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// On-device face models (Google MediaPipe, Apache-2.0), installed from npm. The app serves them from
// /mediapipe/<package>/ in dev and copies them into the build, so nothing is fetched from a CDN
// and the user's photo never leaves the browser.
const MEDIAPIPE = ["face_mesh", "selfie_segmentation"];
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".wasm": "application/wasm",
};

function mediapipeAssets(): Plugin {
  const root = dirname(fileURLToPath(import.meta.url));
  const source = (pkg: string) => resolve(root, "node_modules", "@mediapipe", pkg);
  const shipped = (file: string) => !/(\.md|\.d\.ts|package\.json)$/.test(file);
  return {
    name: "mediapipe-assets",
    configureServer(server) {
      server.middlewares.use("/mediapipe", (req, res, next) => {
        const [pkg, ...rest] = (req.url || "")
          .split("?")[0]
          .replace(/^\/+/, "")
          .split("/");
        if (!MEDIAPIPE.includes(pkg)) return next();
        const base = source(pkg);
        const file = join(base, ...rest);
        if (
          !file.startsWith(base + sep) ||
          !shipped(file) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        )
          return next();
        res.setHeader(
          "Content-Type",
          TYPES[extname(file)] || "application/octet-stream",
        );
        res.setHeader("Cache-Control", "public, max-age=86400");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = options.dir || resolve(root, "dist");
      for (const pkg of MEDIAPIPE)
        cpSync(source(pkg), join(out, "mediapipe", pkg), {
          recursive: true,
          filter: shipped,
        });
    },
  };
}

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [mediapipeAssets()],
  build: {
    rollupOptions: {
      // The app, plus the living-portrait preview page.
      input: {
        main: resolve(here, "index.html"),
        ghost: resolve(here, "ghost/index.html"),
        living: resolve(here, "living.html"),
      },
    },
  },
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
