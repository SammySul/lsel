// Vite for the web app, with /ws proxied to a local room server in dev.

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  plugins: [svelte()],
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
    // The rooms live in the server (bun server/src/main.ts); YW_ROOMS points the e2e suite at its own.
    proxy: { "/ws": { target: process.env.YW_ROOMS ?? "http://127.0.0.1:7300", ws: true } },
  },
});
