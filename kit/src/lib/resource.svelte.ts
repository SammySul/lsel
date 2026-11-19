import { untrack } from "svelte";

export interface Resource<T> {
  /** Kept through a refresh and through an error. */
  readonly value: T | undefined;
  readonly error: string | null;
  /** Running for longer than `delay`: time to show the waiting line. */
  readonly loading: boolean;
  /** Running at all: disable whatever would start another. */
  readonly pending: boolean;
  /** When `value` arrived. */
  readonly at: number | null;
  reload(): void;
}

/** Reloads when what `load` reads before its first `await` changes; only the latest answer counts. */
export function resource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  { delay = 300 } = {},
): Resource<T> {
  let latest = 0;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const s: Resource<T> = $state({
    value: undefined,
    error: null,
    loading: false,
    pending: false,
    at: null,
    reload: () => untrack(run),
  });
  const set = (patch: Partial<Resource<T>>) => Object.assign(s, patch);

  function run(): void {
    const id = ++latest;
    controller?.abort();
    controller = new AbortController();
    clearTimeout(timer);
    timer = setTimeout(() => id === latest && set({ loading: true }), delay);
    set({ pending: true });
    const { signal } = controller;
    new Promise<T>((resolve) => resolve(load(signal)))
      .then(
        (value) => id === latest && set({ value, error: null, at: Date.now() }),
        (e: unknown) => id === latest && set({ error: e instanceof Error ? e.message : String(e) }),
      )
      .finally(() => {
        if (id !== latest) return;
        clearTimeout(timer);
        set({ loading: false, pending: false });
      });
  }

  $effect(() => {
    run();
    return () => {
      clearTimeout(timer);
      controller?.abort();
    };
  });

  return s;
}
