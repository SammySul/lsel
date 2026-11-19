<script lang="ts">
import { begin } from "./activity.svelte.ts";
import { keys } from "./keys.svelte.ts";

interface Props {
  label: string;
  /** The first key is the one shown. */
  key?: string | readonly string[];
  busy?: string;
  /** For 2 s after it worked: "Copied". */
  done?: string;
  /** For 2 s after it failed; the error's own message when unset. */
  failed?: string;
  disabled?: boolean;
  hint?: boolean;
  run(): unknown;
}

let { label, key, busy, done, failed, disabled = false, hint = false, run }: Props = $props();

type State = { kind: "idle" | "busy" | "done" } | { kind: "failed"; message: string };

let state = $state<State>({ kind: "idle" });
let timer: ReturnType<typeof setTimeout> | undefined;

function settle(next: State): void {
  state = next;
  clearTimeout(timer);
  timer = setTimeout(() => (state = { kind: "idle" }), 2000);
}

async function start(): Promise<void> {
  if (disabled || state.kind === "busy") return;
  state = { kind: "busy" };
  const end = begin();
  try {
    await run();
    if (done === undefined) state = { kind: "idle" };
    else settle({ kind: "done" });
  } catch (e) {
    settle({ kind: "failed", message: failed ?? (e instanceof Error ? e.message : String(e)) });
  } finally {
    end();
  }
}

const shown = $derived(typeof key === "string" ? key : key?.[0]);

const text = $derived(
  state.kind === "busy"
    ? (busy ?? label)
    : state.kind === "done"
      ? (done ?? label)
      : state.kind === "failed"
        ? state.message
        : label,
);

keys(() => (key === undefined || disabled ? [] : [{ key, label, hint, run: () => void start() }]));
</script>

<button
  type="button"
  class="lsel-action"
  class:failed={state.kind === "failed"}
  disabled={disabled || state.kind === "busy"}
  aria-busy={state.kind === "busy"}
  onclick={start}
>
  {text}{#if shown !== undefined}{" "}<kbd>{shown}</kbd>{/if}
</button>

<style>
  .failed {
    color: var(--error);
  }
</style>
