<script lang="ts">
import { clock } from "./format.ts";
import { keys } from "./keys.svelte.ts";
import type { Resource } from "./resource.svelte.ts";

interface Props {
  of: Resource<unknown>;
  /** What it waits for, named: "Asking PUBG…", never "Loading…". */
  waiting: string;
  /** `r` asks again after an error; off where retrying can't help. */
  retry?: boolean;
}

let { of, waiting, retry = true }: Props = $props();

keys(() =>
  retry && of.error !== null
    ? [{ key: "r", label: "Retry", hint: true, run: () => of.reload() }]
    : [],
);
</script>

<div class="lsel-status" role="status">
  {#if of.error !== null}
    <p class="error lsel-appear" role="alert">
      {of.error.replace(/\.$/, "")}.{#if of.at !== null && of.value !== undefined}{" "}Showing results from {clock(of.at)}.{/if}
      {#if retry}<kbd>r</kbd> retries.{/if}
    </p>
  {:else if of.loading}
    <p class="lsel-appear">{waiting}</p>
  {/if}
</div>

<style>
  .lsel-status {
    color: var(--subtle);
  }
  p {
    margin: 0;
  }
  .error {
    color: var(--error);
  }
</style>
