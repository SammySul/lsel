// `[test] preload = ["@sammysul/lsel/testing/preload"]` in bunfig.toml: `*.svelte.ts` compiles in `bun test`.
import { registerSvelteModules } from "./svelte.ts";

registerSvelteModules();
