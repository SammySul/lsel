// Mounts the app once its fonts are in.
import "@sammysul/lsel/tokens.css";
import { start } from "@sammysul/lsel";
import App from "./App.svelte";

await start(App);
