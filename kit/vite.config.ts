// The playground: every component in every state, for a look and for the e2e test.

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: "playground",
  plugins: [svelte()],
  build: { outDir: "../playground-dist", emptyOutDir: true },
});
