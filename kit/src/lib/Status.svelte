<script lang="ts">
import { clock, when } from "./format.ts";
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

const since = (at: number) =>
  new Date(at).toDateString() === new Date().toDateString() ? clock(at) : when(at);

keys(() =>
  retry && of.error !== null
    ? [{ key: "r", label: "Retry", hint: true, run: () => of.reload() }]
    : [],
);
</script>

<!-- sibling live regions: a status that holds an alert is read twice or not at all -->
<div class="lsel-status">
  <p role="status">{#if of.error === null && of.loading}<span class="lsel-appear">{waiting}</span>{/if}</p>
  {#if of.error !== null}
    <p class="error lsel-appear" role="alert">
      {of.error.replace(/\.$/, "")}.{#if of.at !== null && of.value !== undefined}{" "}Showing results from {since(of.at)}.{/if}
      {#if retry}<kbd>r</kbd> retries.{/if}
    </p>
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
