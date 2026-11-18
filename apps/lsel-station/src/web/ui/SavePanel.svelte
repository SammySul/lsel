<script lang="ts">
import { exportString, importString, playedMs, type SaveDocument } from "../../save/document.ts";
import type { createSync } from "../sync.svelte.ts";
import { clock, duration, when } from "./format.ts";

let {
  latest,
  sync,
  load,
}: {
  latest: () => SaveDocument;
  sync: ReturnType<typeof createSync>;
  load: (doc: SaveDocument) => void;
} = $props();

// taken when the panel opens: the save as it was then
const exported = $derived(exportString(latest()));
let copied = $state(false);
let pasted = $state("");
let joining = $state("");
let joinError = $state<string | null>(null);

const candidate = $derived(pasted.trim() === "" ? null : importString(pasted));

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(exported);
    copied = true;
  } catch {
    copied = false;
  }
}

async function join(): Promise<void> {
  joinError = await sync.join(joining);
  if (joinError === null) joining = "";
}
</script>

<section class="saves lsel-appear" aria-label="Saves">
  <h2>Saves</h2>
  <p class="dim">
    The game saves itself in this browser every 30 seconds, whenever something is built, and when
    the page is put away.
  </p>

  <label for="export">This save as text</label>
  <textarea id="export" readonly rows="3" spellcheck="false">{exported}</textarea>
  <div class="line">
    <span class="dim">{copied ? "Copied." : ""}</span>
    <button type="button" onclick={copy}>Copy</button>
  </div>

  <label for="import">Load a save from text</label>
  <textarea
    id="import"
    rows="3"
    spellcheck="false"
    placeholder="Paste a save here"
    bind:value={pasted}
  ></textarea>
  {#if candidate !== null && !candidate.ok}
    <p class="note">That cannot be loaded: {candidate.reason}.</p>
  {:else if candidate?.ok}
    {@const doc = candidate.doc}
    <div class="line">
      <span>Played {duration(playedMs(doc))}, saved {when(doc.savedAt)}.</span>
      <button type="button" onclick={() => load(doc)}>Replace this game</button>
    </div>
  {/if}

  <h2>Sync</h2>
  {#if sync.key === null}
    <p class="dim">
      Sync keeps one save across your devices. Its key is the only way in: anyone who has it can
      open the save.
    </p>
    <div class="line">
      <span></span>
      <button type="button" onclick={sync.enable}>Turn on sync</button>
    </div>
    <label for="join">Or link this device with the key from another</label>
    <input id="join" autocomplete="off" spellcheck="false" bind:value={joining} />
    <div class="line">
      <span class="note">{joinError ?? ""}</span>
      <button type="button" disabled={joining.trim() === ""} onclick={join}>Link this device</button>
    </div>
  {:else}
    <label for="key">Save key</label>
    <input id="key" readonly spellcheck="false" value={sync.key} />
    <p class="dim">
      {#if sync.status.kind === "synced"}
        Synced at {clock(sync.status.at)}.
      {:else if sync.status.kind === "syncing"}
        Syncing.
      {:else if sync.status.kind === "failed"}
        Sync failed: {sync.status.reason}.
      {:else if sync.status.kind === "conflict"}
        Waiting for you to choose a save.
      {/if}
    </p>
    <div class="line">
      <button type="button" onclick={sync.forget}>Stop syncing on this device</button>
      <button type="button" onclick={sync.syncNow}>Sync now</button>
    </div>
  {/if}
</section>

<style>
  section {
    padding: var(--space-4);
    border-bottom: var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  h2:not(:first-child) {
    margin-top: var(--space-4);
  }
  p {
    margin: 0;
  }
  textarea,
  input {
    width: 100%;
  }
  textarea {
    resize: vertical;
    word-break: break-all;
  }
  .line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
  }
  .dim {
    color: var(--subtle);
  }
  .note {
    color: var(--warning);
  }
</style>
