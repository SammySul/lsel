<!-- A button with a key that runs an async action and shows busy, done or failed. -->
<script lang="ts">
import { onDestroy } from "svelte";
import { begin } from "./activity.svelte.ts";
import { keyName, keys } from "./keys.svelte.ts";
import Swap from "./Swap.svelte";

interface Props {
  label: string;
  key?: string;
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
onDestroy(() => clearTimeout(timer));

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

const text = $derived(
  state.kind === "busy"
    ? (busy ?? label)
    : state.kind === "done"
      ? (done ?? label)
      : state.kind === "failed"
        ? state.message
        : label,
);

// a failure's own message can't be known ahead, so only the labels given are reserved
const options = $derived([label, busy, done, failed].filter((o) => o !== undefined));

keys(() => (key === undefined || disabled ? [] : [{ key, label, hint, run: () => void start() }]));
</script>

<!-- busy is aria-disabled, not disabled: disabling the focused button would drop focus -->
<button
  type="button"
  class="lsel-action"
  class:failed={state.kind === "failed"}
  {disabled}
  aria-disabled={state.kind === "busy"}
  aria-busy={state.kind === "busy"}
  onclick={start}
>
  <Swap {text} {options} />{#if key !== undefined}{" "}<kbd>{keyName(key)}</kbd>{/if}
</button>

<style>
  .failed {
    color: var(--error);
  }
</style>
