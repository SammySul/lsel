<script lang="ts">
import { Action, clock, Field, when } from "@sammysul/lsel";
import { exportString, importString, playedMs, type SaveDocument } from "../../save/document.ts";
import type { createSync } from "../sync.svelte.ts";
import { span } from "./format.ts";

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
let pasted = $state("");
// a paste is checked once the field is left, not while it is edited
let pasteLeft = $state(false);
let joining = $state("");
let joinError = $state<string | null>(null);

const candidate = $derived(pasted.trim() === "" ? null : importString(pasted));
const pasteError = $derived(
  pasteLeft && candidate !== null && !candidate.ok
    ? `That cannot be loaded: ${candidate.reason}.`
    : null,
);

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

  <Field label="This save as text">
    {#snippet children(control)}
      <textarea {...control} readonly rows="3" spellcheck="false">{exported}</textarea>
    {/snippet}
  </Field>
  <div class="line">
    <span></span>
    <Action
      label="Copy"
      done="Copied"
      failed="Copy failed"
      run={() => navigator.clipboard.writeText(exported)}
    />
  </div>

  <Field label="Load a save from text" error={pasteError}>
    {#snippet children(control)}
      <textarea
        {...control}
        rows="3"
        spellcheck="false"
        placeholder="Paste a save here"
        bind:value={pasted}
        onfocus={() => (pasteLeft = false)}
        onblur={() => (pasteLeft = true)}
      ></textarea>
    {/snippet}
  </Field>
  {#if candidate?.ok}
    {@const doc = candidate.doc}
    <div class="line">
      <span>Played {span(playedMs(doc))}, saved {when(doc.savedAt)}.</span>
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
      <Action label="Turn on sync" busy="Turning on…" run={sync.enable} />
    </div>
    <Field label="Or link this device with the key from another" error={joinError}>
      {#snippet children(control)}
        <input {...control} autocomplete="off" spellcheck="false" bind:value={joining} />
      {/snippet}
    </Field>
    <div class="line">
      <span></span>
      <Action
        label="Link this device"
        busy="Linking…"
        disabled={joining.trim() === ""}
        run={join}
      />
    </div>
  {:else}
    {@const failed = sync.status.kind === "failed"}
    <Field label="Save key">
      {#snippet children(control)}
        <input {...control} readonly spellcheck="false" value={sync.key} />
      {/snippet}
    </Field>
    {#if sync.status.kind === "failed"}
      <p class="error" role="alert">
        Sync failed: {sync.status.reason}. <kbd>r</kbd> tries again.
      </p>
    {:else}
      <p class="dim" role="status">
        {#if sync.status.kind === "synced"}
          Synced at {clock(sync.status.at)}.
        {:else if sync.status.kind === "syncing"}
          Syncing.
        {:else if sync.status.kind === "conflict"}
          Waiting for you to choose a save.
        {/if}
      </p>
    {/if}
    <div class="line">
      <Action label="Stop syncing on this device" run={sync.forget} />
      <Action
        label={failed ? "Try again" : "Sync now"}
        {...failed ? { key: "r" } : {}}
        busy="Syncing…"
        run={sync.syncNow}
      />
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
  .error {
    color: var(--error);
  }
</style>
