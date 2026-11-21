import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  plugins: [svelte()],
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd())] } },
});
