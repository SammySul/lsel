import { untrack } from "svelte";
import { begin, DELAY } from "./activity.svelte.ts";

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
  /** Asks again; settles when that answer is in. */
  reload(): Promise<void>;
}

/** Reloads when what `load` reads before its first `await` changes; only the latest answer counts. */
export function resource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  { delay = DELAY } = {},
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

  async function run(): Promise<void> {
    const id = ++latest;
    controller?.abort();
    controller = new AbortController();
    clearTimeout(timer);
    timer = setTimeout(() => id === latest && set({ loading: true }), delay);
    set({ pending: true });
    // untracked: this runs in the effect, which must not depend on the count it changes
    const end = untrack(begin);
    try {
      // called before the first await, so the effect tracks what `load` reads up to its own
      const value = await load(controller.signal);
      if (id === latest) set({ value, error: null, at: Date.now() });
    } catch (e) {
      if (id === latest) set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      end();
      if (id === latest) {
        clearTimeout(timer);
        set({ loading: false, pending: false });
      }
    }
  }

  $effect(() => {
    run();
    return () => {
      // a torn-down resource keeps no answer, and its aborted request sets no error
      latest++;
      clearTimeout(timer);
      controller?.abort();
    };
  });

  return s;
}
