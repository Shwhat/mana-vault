import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

// In development the sign-in page is a static file; the server answers /login in production.
const loginPage: Plugin = {
  name: "mana-vault-login-page",
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url === "/login") request.url = "/login.html";
      next();
    });
  },
};

// The text recognition engine, its worker and the English model are served by Mana Vault itself under /ocr,
// so scanning works without the internet.
const require = createRequire(import.meta.url);
const ocrFiles: Record<string, string> = {
  "worker.min.js": join(dirname(require.resolve("tesseract.js/package.json")), "dist", "worker.min.js"),
  "tesseract-core-simd-lstm.wasm.js": join(dirname(require.resolve("tesseract.js-core/package.json")), "tesseract-core-simd-lstm.wasm.js"),
  "tesseract-core-lstm.wasm.js": join(dirname(require.resolve("tesseract.js-core/package.json")), "tesseract-core-lstm.wasm.js"),
  "eng.traineddata.gz": join(dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int", "eng.traineddata.gz"),
};
const ocrAssets: Plugin = {
  name: "mana-vault-ocr-files",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const name = request.url?.match(/^\/ocr\/([^?]+)/)?.[1];
      const path = name ? ocrFiles[name] : undefined;
      if (!path) return next();
      response.setHeader("content-type", name!.endsWith(".js") ? "text/javascript" : "application/octet-stream");
      response.end(readFileSync(path));
    });
  },
  generateBundle() {
    for (const [name, path] of Object.entries(ocrFiles)) this.emitFile({ type: "asset", fileName: `ocr/${name}`, source: readFileSync(path) });
  },
};

export default defineConfig({
  plugins: [react(), loginPage, ocrAssets],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
