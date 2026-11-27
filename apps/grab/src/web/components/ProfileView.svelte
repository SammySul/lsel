<!-- One profile: who it is, its files as a grid beside the current one, and the zip of the ticked ones. -->
<script lang="ts">
import { Action, count, Empty, keys, plural, resource, Status } from "@sammysul/lsel";
import { SvelteSet } from "svelte/reactivity";
import { download, fetchProfile, mediaUrl, zipUrl } from "../lib/api.ts";
import { entries } from "../lib/entries.ts";
import Grid from "./Grid.svelte";
import Preview from "./Preview.svelte";

let { username }: { username: string } = $props();

// made once per username: App keys this component on it, so no answer outlives its profile
const profile = resource((signal) => fetchProfile(username, signal));
export const reload = () => profile.reload();

const shown = $derived(profile.value);
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
const selected = new SvelteSet<string>();
const entry = $derived(items.find((e) => e.media.id === current) ?? items[0]);

const selectAll = () => {
  for (const e of items) selected.add(e.media.id);
};

keys(() => [
  ...(items.length === 0
    ? []
    : [
        { key: "a", label: "Tick all", run: selectAll },
        { key: "n", label: "Tick none", run: () => selected.clear() },
      ]),
  // after an error the status line's own r retries
  ...(shown?.limited && profile.error === null
    ? [{ key: "r", label: "Load the rest", hint: true, run: () => void profile.reload() }]
    : []),
]);
</script>

<Status of={profile} waiting="Asking Instagram for {username}…" />

{#if shown !== undefined && entry !== undefined}
  <div class="lsel-appear profile">
    <header class="who">
      <img src={mediaUrl(shown.picture.thumb)} alt="" width="56" height="56" />
      <div>
        <h2>{shown.fullName || shown.username}</h2>
        <p class="sub">
          {shown.username}{#if shown.verified}{" "}· verified{/if} · {plural(shown.followers, "follower", "followers")} · {plural(shown.postCount, "post", "posts")}
        </p>
      </div>
    </header>
    {#if listed === 0}
      <Empty>No public posts. The account may be private or have none yet; its picture is below.</Empty>
    {:else if shown.pending > 0}
      <!-- a post a second keeps under Instagram's rate limit, so a first look takes a while -->
      <p class="sub" role="status">Loaded {count(shown.posts.length)} of the newest {plural(listed, "post", "posts")}; Instagram answers about one a second.</p>
    {:else if shown.postCount > listed}
      <p class="sub">The newest {count(listed)}: all Instagram shows without a login.</p>
    {/if}
    {#if shown.limited}
      <p class="missing">
        Instagram is limiting this server, so {plural(shown.missing, "post", "posts")} didn't load. <kbd>r</kbd> loads the rest; if it stops again, wait a few minutes.
      </p>
    {:else if shown.missing > 0}
      <p class="missing">{plural(shown.missing, "post", "posts")} couldn't be loaded from Instagram.</p>
    {/if}

    <div class="bar">
      <button type="button" onclick={selectAll}>Tick all <kbd>a</kbd></button>
      <button type="button" disabled={selected.size === 0} onclick={() => selected.clear()}>Tick none <kbd>n</kbd></button>
      <span class="count">{count(selected.size)} of {plural(items.length, "file", "files")} ticked</span>
      <Action
        label="Download ticked as zip"
        key="z"
        hint
        done="Downloading"
        disabled={selected.size === 0}
        run={() => download(zipUrl(shown.username, items.filter((e) => selected.has(e.media.id)).map((e) => e.media.id)))}
      />
    </div>

    <div class="split">
      <Grid {items} bind:current {selected} />
      <Preview {entry} username={shown.username} />
    </div>
  </div>
{/if}

<style>
  .profile {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .who {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }
  .who img {
    border: var(--border);
  }
  .sub {
    margin: 0;
    color: var(--subtle);
  }
  .missing {
    margin: 0;
    color: var(--warning);
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
  .split {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: var(--space-5);
    align-items: start;
  }
  .split :global(.preview) {
    position: sticky;
    top: var(--space-5);
  }
  @media (max-width: 800px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
    }
    /* first, so a tapped tile shows where the eye already is */
    .split :global(.preview) {
      position: static;
      order: -1;
    }
  }
</style>
