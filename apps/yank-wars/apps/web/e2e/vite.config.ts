import { mergeConfig } from "vite";
import base from "../vite.config.ts";

// Edits elsewhere in the tree must not reload the page or restart the server mid-run.
export default mergeConfig(base, { server: { hmr: false, watch: null } });
