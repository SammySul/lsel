// Mounts the playground once its fonts are in.

import "../src/lib/assets/tokens.css";
import { start } from "../src/lib/index.ts";
import App from "./App.svelte";

await start(App, document.body);
