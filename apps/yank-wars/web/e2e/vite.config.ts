import { mergeConfig } from "vite";
import base from "../vite.config.ts";

// Edits elsewhere in the tree must not reload the page or restart the server mid-run.
// YW_VITE_CACHE: startVite gives each server its own optimizer cache.
export default mergeConfig(base, {
  cacheDir: process.env.YW_VITE_CACHE,
  server: { hmr: false, watch: null },
});
