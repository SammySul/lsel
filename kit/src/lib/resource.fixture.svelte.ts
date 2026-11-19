// resource() needs an effect owner; tests get one here, since only `*.svelte.ts` may use runes.
import { flushSync } from "svelte";
import { type Resource, resource } from "./resource.svelte.ts";

export function owned<T>(make: (input: { query: string }) => Resource<T>) {
  const input = $state({ query: "a" });
  let r: Resource<T> | undefined;
  const stop = $effect.root(() => {
    r = make(input);
  });
  flushSync();
  if (r === undefined) throw new Error("resource was not created");
  return {
    r,
    input,
    stop,
    set(query: string) {
      input.query = query;
      flushSync();
    },
  };
}

export { activity } from "./activity.svelte.ts";
export { resource };
