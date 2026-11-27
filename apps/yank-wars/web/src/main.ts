// Mounts the app once its fonts are in, and asks who's signed in meanwhile.

import "@sammysul/lsel/tokens.css";
import { start } from "@sammysul/lsel";
import App from "./App.svelte";
import { account } from "./lib/account.svelte.ts";

void account.load();
await start(App);
