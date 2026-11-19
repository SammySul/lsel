<script lang="ts">
import { Empty, keys, Popup, say, Tabs } from "../src/lib/index.ts";

const TABS = [
  { id: "page", label: "Page" },
  { id: "saved", label: "Saved" },
] as const;
let tab: "page" | "saved" = $state("page");

keys(() => [{ key: "c", label: "Copy the address", run: () => say("Copied") }]);
</script>

<Popup name="kit popup" sub="an extension's frame">
  {#snippet nav()}<Tabs items={TABS} bind:value={tab} label="Views" />{/snippet}
  {#if tab === "page"}
    <p>This page has a feed. <kbd>c</kbd> copies it.</p>
  {:else}
    <Empty>Nothing saved yet.</Empty>
  {/if}
</Popup>

<style>
  :global(body) {
    width: 360px;
  }
</style>
