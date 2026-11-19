import { MediaQuery } from "svelte/reactivity";

let query: MediaQuery | undefined;

/** For motion driven from JavaScript; tokens.css already stops the CSS. */
export function reducedMotion(): boolean {
  // created on first use: MediaQuery reads window, which tests and servers don't have
  query ??= new MediaQuery("prefers-reduced-motion: reduce");
  return query.current;
}
