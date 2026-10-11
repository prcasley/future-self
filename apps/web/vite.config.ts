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
  const source = (pkg: string) =>
    resolve(root, "node_modules", "@mediapipe", pkg);
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

// Developer-only future gallery: private/media/portraits/{home,dream,good,neutral,bad}.(jpg|png|webp),
// gitignored, served in dev only. It is never copied into a build, so a hosted demo has no one's face.
const PORTRAIT_SIDES = ["home", "dream", "good", "neutral", "bad"];
const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
function privatePortraits(): Plugin {
  const root = dirname(fileURLToPath(import.meta.url));
  const dir = resolve(root, "..", "..", "private", "media", "portraits");
  const manifest = () => {
    const out: Record<string, string> = {};
    for (const side of PORTRAIT_SIDES)
      for (const ext of Object.keys(IMAGE_TYPES))
        if (existsSync(join(dir, side + ext))) {
          out[side] = side + ext;
          break;
        }
    return out;
  };
  return {
    name: "private-portraits",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/private-portraits", (req, res, next) => {
        const name = (req.url || "").split("?")[0].replace(/^\/+/, "");
        if (name === "manifest.json") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(manifest()));
          return;
        }
        const file = join(dir, name);
        const type = IMAGE_TYPES[extname(file)];
        if (
          !type ||
          !file.startsWith(dir + sep) ||
          !PORTRAIT_SIDES.includes(name.replace(/\.[^.]+$/, "")) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        )
          return next();
        res.setHeader("Content-Type", type);
        res.setHeader("Cache-Control", "no-store");
        createReadStream(file).pipe(res);
      });
    },
  };
}

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [mediapipeAssets(), privatePortraits()],
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
        target: process.env.ECHO_API_ORIGIN || "http://127.0.0.1:8016",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
