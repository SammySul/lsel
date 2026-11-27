// Mounts the app once its fonts are in, the fonts stored in this browser already listed.

import "@sammysul/lsel/tokens.css";
import { start } from "@sammysul/lsel";
import App from "./App.svelte";
import { loadStored } from "./lib/fonts.ts";

const stored = await loadStored().catch(() => null);
await start(App, { props: { stored } });
