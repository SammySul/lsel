// Vite for the game.

import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  plugins: [svelte()],
  build: { outDir: "../../dist", emptyOutDir: true },
});
