// Vite for the game.

import { lselFonts } from "@sammysul/lsel/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  plugins: [svelte(), lselFonts()],
  build: { outDir: "../../dist", emptyOutDir: true },
});
