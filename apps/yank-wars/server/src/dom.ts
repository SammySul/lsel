// happy-dom globals for the engine outside a browser: the replay worker and every test.
import { Window } from "happy-dom";

const w = new Window();
const g = globalThis as unknown as Record<string, unknown>;
const src = w as unknown as Record<string, unknown>;
for (const k of [
  "Window",
  "Element",
  "Range",
  "Text",
  "DocumentFragment",
  "ResizeObserver",
  "IntersectionObserver",
  "document",
  "navigator",
  "MutationObserver",
  "requestAnimationFrame",
  "getComputedStyle",
  "Node",
  "HTMLElement",
  "KeyboardEvent",
])
  g[k] ??= src[k];
g.window = w;
