// Mounts the playground once its fonts are in.

import "../src/lib/assets/tokens.css";
import { start } from "../src/lib/index.ts";
import App from "./App.svelte";

// what start() will wait for, read as it is called: the e2e test checks tokens.css's faces are there
Object.assign(window, {
  lselFaces: [...document.fonts].map((f) => `${f.weight} ${f.family.replaceAll('"', "")}`),
});

await start(App, {
  target: document.body,
  props: { sub: "Every shared component, in every state." },
});
