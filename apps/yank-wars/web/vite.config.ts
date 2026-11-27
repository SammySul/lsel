// Vite for the web app, with /ws and /api proxied to a local server in dev.

import { lselFonts } from "@sammysul/lsel/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import { PORT } from "../server/src/config.ts";

const server = process.env.YW_ROOMS ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  plugins: [svelte(), lselFonts()],
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
    // Rooms and the daily board live in the server (bun server/src/main.ts); YW_ROOMS points the e2e suite at its own.
    proxy: {
      "/ws": { target: server, ws: true },
      "/api": { target: server },
    },
  },
});
