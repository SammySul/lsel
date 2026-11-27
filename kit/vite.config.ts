// The playground: every component in every state, for a look and for the e2e test.

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { lselFonts } from "./src/lib/vite.ts";

export default defineConfig({
  root: "playground",
  plugins: [svelte(), lselFonts()],
  build: { outDir: "../playground-dist", emptyOutDir: true },
});
