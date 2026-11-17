import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  // Extension pages load from a chrome-extension:// origin, where a root-absolute
  // "/assets/…" resolves outside the bundle.
  base: "./",
  build: { assetsDir: "assets" },
  plugins: [
    svelte(),
    webExtension({
      manifest: "manifest.json",
      // package.json holds the only version; the built manifest takes it from there.
      transformManifest: (manifest) => ({ ...manifest, version }),
      additionalInputs: ["src/popup/index.html"],
    }),
  ],
});
