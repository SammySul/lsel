<!-- One profile: who it is, its files as a fitted grid beside the current one, and the zip of the ticked ones. -->
<script lang="ts">
import { Action, count, Grid, keys, plural, resource, Status } from "@sammysul/lsel";
import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { download, fetchProfile, mediaUrl, zipUrl } from "../lib/api.ts";
import { badge, describe, type Entry, entries } from "../lib/entries.ts";
import Preview from "./Preview.svelte";

let { username, onfound }: { username: string; onfound: (username: string) => void } = $props();

// made once per username: App keys this component on it, so no answer outlives its profile
let retry = false;
const profile = resource((signal) => {
  // r's request alone: a poll that retried would drop the profile r just loaded
  const again = retry;
  retry = false;
  return fetchProfile(username, signal, again);
});
export const reload = () => profile.reload();
const loadRest = () => {
  retry = true;
  void profile.reload();
};

const shown = $derived(profile.value);
const found = $derived(shown?.username);
$effect(() => {
  const name = found;
  // untracked: what onfound reads (the remembered list) must not re-run this
  if (name !== undefined) untrack(() => onfound(name));
});
const items = $derived(shown === undefined ? [] : entries(shown));
const listed = $derived(
  shown === undefined ? 0 : shown.posts.length + shown.missing + shown.pending,
);

// the server answers with the posts in so far; ask again until none are pending
const POLL = 2000;
$effect(() => {
  if (shown === undefined || shown.pending === 0 || profile.error !== null) return;
  const timer = setTimeout(() => void profile.reload(), POLL);
  return () => clearTimeout(timer);
});

let current = $state<string | undefined>();
// a phone shows the preview in the grid's place; side by side on a wider window, this changes nothing
let viewing = $state(false);
const selected = new SvelteSet<string>();
const entry = $derived(items.find((e) => e.media.id === current) ?? items[0]);

const selectAll = () => {
  for (const e of items) selected.add(e.media.id);
};
const toggle = (id: string) => {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
};

keys(() => [
  ...(items.length === 0
    ? []
    : [
        { key: "a", label: "Tick all", run: selectAll },
        { key: "n", label: "Tick none", run: () => selected.clear() },
      ]),
  ...(viewing ? [{ key: "Escape", label: "Back to the files", run: () => (viewing = false) }] : []),
  // after an error the status line's own r retries
  ...(shown?.limited && profile.error === null
    ? [{ key: "r", label: "Load the rest", hint: true, run: loadRest }]
    : []),
]);
</script>

<Status of={profile} waiting="Asking Instagram for {username}…" />

{#if shown !== undefined && entry !== undefined}
  <div class="lsel-appear profile">
    <div class="top">
      <header class="who">
        <img src={mediaUrl(shown.picture.thumb)} alt="" width="40" height="40" />
        <div class="names">
          <h2>{shown.fullName || shown.username}</h2>
          <p class="line">
            {shown.username}{#if shown.verified}{" "}· verified{/if} · {plural(shown.followers, "follower", "followers")} · {plural(shown.postCount, "post", "posts")}
          </p>
        </div>
      </header>

      <div class="bar">
        <button type="button" onclick={selectAll}>Tick all <kbd>a</kbd></button>
        <button type="button" disabled={selected.size === 0} onclick={() => selected.clear()}>Tick none <kbd>n</kbd></button>
        <Action
          label="Download ticked as zip"
          key="z"
          hint
          done="Downloading"
          disabled={selected.size === 0}
          run={() => download(zipUrl(shown.username, items.filter((e) => selected.has(e.media.id)).map((e) => e.media.id)))}
        />
        <Action
          label="Download all"
          key="Z"
          done="Downloading"
          run={() => download(zipUrl(shown.username, items.map((e) => e.media.id)))}
        />
        <span class="count">{count(selected.size)} of {plural(items.length, "file", "files")} ticked</span>
      </div>
    </div>

    <div class="split" class:viewing>
      <div class="files">
        <Grid
          {items}
          id={(e: Entry) => e.media.id}
          bind:selected={current}
          label="Files"
          hint
          openOnClick
          onopen={() => (viewing = true)}
          actions={[{ key: "x", label: "Tick for the zip", run: (e: Entry) => toggle(e.media.id) }]}
        >
          {#snippet tile(e: Entry)}
            <img class="thumb" src={mediaUrl(e.media.thumb)} alt="" loading="lazy" />
            <input
              type="checkbox"
              class="pick"
              aria-label="Tick {describe(e)} for the zip"
              checked={selected.has(e.media.id)}
              onchange={() => toggle(e.media.id)}
            />
            {@const corner = badge(e)}
            {#if corner !== null}
              <span class="badge">{corner}</span>
            {/if}
          {/snippet}
          {#snippet empty()}No files.{/snippet}
          {#snippet foot()}
            {#if shown.limited}
              <span class="warning">Instagram is limiting this server: {plural(shown.missing, "post", "posts")} didn't load. <kbd>r</kbd> loads the rest.</span>
            {:else if shown.pending > 0}
              <!-- a post a second keeps under Instagram's rate limit, so a first look takes a while -->
              <span role="status">Loaded {count(shown.posts.length)} of the newest {plural(listed, "post", "posts")}, about one a second</span>
            {:else if shown.missing > 0}
              <span class="warning">{plural(shown.missing, "post", "posts")} couldn't be loaded from Instagram</span>
            {:else if listed === 0}
              No public posts: the account may be private or have none yet
            {:else}
              The newest {count(listed)}: all Instagram shows without a login
            {/if}
          {/snippet}
        </Grid>
      </div>
      <Preview {entry} username={shown.username} onback={() => (viewing = false)} />
    </div>
  </div>
{/if}

<style>
  .profile {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
  }
  /* who it is and what to do with it share a row, so the grid gets the height */
  .top {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: center;
    justify-content: space-between;
  }
  .who {
    flex: 1 1 260px;
    display: flex;
    gap: var(--space-3);
    align-items: center;
    min-width: 0;
  }
  .who img {
    flex: none;
    border: var(--border);
  }
  .names {
    min-width: 0;
  }
  .line,
  h2 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line {
    margin: 0;
    color: var(--subtle);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    align-items: center;
  }
  .count {
    color: var(--subtle);
    font-variant-numeric: tabular-nums;
  }
  .warning {
    color: var(--warning);
  }
  .split {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: var(--space-5);
    min-height: 0;
  }
  .files {
    min-height: 0;
  }
  .thumb {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pick {
    position: absolute;
    top: var(--space-1);
    left: var(--space-1);
    width: 18px;
    height: 18px;
    margin: 0;
  }
  .badge {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 0 var(--space-1);
    background: var(--base);
    color: var(--text);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
  /* on a phone the preview takes the grid's place: a tap opens it, Back or Esc returns */
  @media (max-width: 800px) {
    .split {
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
    }
    .split:not(.viewing) :global(.preview),
    .split.viewing .files {
      display: none;
    }
  }
</style>
