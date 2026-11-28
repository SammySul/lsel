// `[test] preload = ["@sammysul/lsel/testing/preload"]` in bunfig.toml: `*.svelte.ts` compiles in `bun test`, and every test gets 20 s.
import { setDefaultTimeout } from "bun:test";
import { registerSvelteModules } from "./svelte.ts";

registerSvelteModules();
// bun ignores bunfig's timeout; a browser test on a busy CI runner outlasts its 5 s, and a timeout kills the browser for every later test
setDefaultTimeout(20_000);
