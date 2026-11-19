import { readFileSync } from "node:fs";
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

export default defineConfig({
  plugins: [react(), loginPage],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
