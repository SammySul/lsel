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

/** Never search text or secrets (DESIGN.md); assigning `.value` saves it, a change inside it doesn't. */
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
  let value = $state(read.success ? read.output : fallback);
  return {
    get value() {
      return value;
    },
    set value(next) {
      value = next;
      try {
        storage?.setItem(key, JSON.stringify(next));
      } catch {}
    },
  };
}
