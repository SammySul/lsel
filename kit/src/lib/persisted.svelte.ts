import { onDestroy } from "svelte";
import * as v from "valibot";

export type Store = Pick<Storage, "getItem" | "setItem">;

function localStore(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // a sandboxed frame or blocked site data throws on access
    return undefined;
  }
}

/** Never search text or secrets (DESIGN.md); any change to `.value`, deep or whole, is saved. */
export function persisted<T>(
  key: string,
  schema: v.GenericSchema<unknown, T>,
  fallback: T,
  storage = localStore(),
): { value: T } {
  let stored: unknown = null;
  try {
    stored = JSON.parse(storage?.getItem(key) ?? "null");
  } catch {}
  const read = v.safeParse(schema, stored);
  const state = $state({ value: read.success ? read.output : fallback });
  const stop = $effect.root(() => {
    $effect(() => {
      const json = JSON.stringify(state.value);
      try {
        storage?.setItem(key, json);
      } catch {}
    });
  });
  // made in a component: stop saving with it; made in a module: save for the page's life
  try {
    onDestroy(stop);
  } catch {}
  return state;
}
