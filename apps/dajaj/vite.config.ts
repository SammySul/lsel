import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { PORT } from "./src/server/config.ts";

export default defineConfig({
  root: "src/web",
  plugins: [svelte()],
  build: { outDir: "../../dist", emptyOutDir: true },
  // `bun run dev` beside a running server (`bun src/server/main.ts`)
  server: { proxy: { "/api": `http://127.0.0.1:${PORT}` } },
});
