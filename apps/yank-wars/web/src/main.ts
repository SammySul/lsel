// Mounts the app once its fonts are in, and asks who's signed in.

import "@sammysul/lsel/tokens.css";
import "./app.css";
import { start } from "@sammysul/lsel";
import App from "./App.svelte";
import { account } from "./lib/account.svelte.ts";

await start(App);
void account.load();
