<!-- Every kit component in every state, for a look and for the kit's e2e. -->
<script lang="ts">
import { version } from "../package.json";
import {
  Action,
  Empty,
  Field,
  Grid,
  keys,
  List,
  Page,
  resource,
  Status,
  Swap,
  Tabs,
} from "../src/lib/index.ts";

// from main.ts, through start(): the props reach the app
let { sub }: { sub: string } = $props();

// what the last action did, so the e2e test can see it
let said = $state("");
const say = (text: string) => {
  said = text;
};

type View = "list" | "states" | "form" | "pages" | "fit" | "grid";
const VIEWS = [
  { id: "list", label: "List" },
  { id: "states", label: "States" },
  { id: "form", label: "Form" },
  { id: "pages", label: "Pages" },
  { id: "fit", label: "Fit" },
  { id: "grid", label: "Grid" },
] as const;

// more rows than a page, the last page short
const ITEMS = Array.from({ length: 23 }, (_, i) => `Item ${i + 1}`);
// the paged list's rows, which m adds to
let paged = $state(ITEMS);
// more than any window holds
const MANY = Array.from({ length: 200 }, (_, i) => `Item ${i + 1}`);
let view: View = $state("list");

interface Feed {
  id: string;
  title: string;
}
let feeds: Feed[] = $state([
  { id: "a", title: "Alpha weekly" },
  { id: "b", title: "Beta notes" },
  { id: "c", title: "Gamma log" },
]);
let query = $state("");
let selected: string | undefined = $state();
const shown = $derived(
  feeds.filter((f) => f.title.toLowerCase().includes(query.trim().toLowerCase())),
);

type Mode = "fast" | "slow" | "fail";
let mode: Mode = $state("fast");
let calls = 0;
const rows = resource(async () => {
  const m = mode;
  calls++;
  await new Promise((r) => setTimeout(r, m === "slow" ? 1500 : 10));
  if (m === "fail") throw new Error(`The playground's upstream is down (try ${calls})`);
  return `answer ${calls}`;
});

let search: HTMLInputElement | undefined = $state();
keys(() =>
  view === "list"
    ? [
        { key: "/", label: "Search", hint: true, run: () => search?.focus() },
        { key: "o", label: "Open", run: () => say("Opened with o") },
      ]
    : [],
);

keys(() =>
  view === "pages"
    ? [
        {
          key: "m",
          label: "More items",
          run: () => {
            paged = Array.from({ length: paged.length + 100 }, (_, i) => `Item ${i + 1}`);
          },
        },
        { key: "e", label: "Empty the list", run: () => (paged = []) },
      ]
    : [],
);

let saved = $state(false);
let full = $state(false);

let form: HTMLElement | undefined = $state();
keys(() =>
  view === "form"
    ? [{ key: "Escape", label: "Leave the form", inField: form, run: () => say("Left the form") }]
    : [],
);

let name = $state("");
let nameError: string | null = $state(null);
</script>

<Page name="lsel kit" {sub} {version}>
  {#snippet actions()}
    <Tabs items={VIEWS} bind:value={view} label="Views" />
  {/snippet}

  {#if view === "list"}
    <section aria-label="List">
      <input bind:this={search} type="search" placeholder="/ search" aria-label="Search feeds" bind:value={query} />
      <List
        items={shown}
        id={(f) => f.id}
        bind:selected
        label="Feeds"
        hint
        onopen={(f) => say(`Opened ${f.title}`)}
        actions={(f) =>
          f.id === "a"
            ? []
            : [
                {
                  key: "d",
                  label: "Delete",
                  run: () => {
                    feeds = feeds.filter((x) => x.id !== f.id);
                    say(`Deleted ${f.title}`);
                  },
                },
              ]}
      >
        {#snippet row(feed, current)}
          <span class:current>{feed.title}</span>
          <button type="button" onclick={() => say(`Pinned ${feed.title}`)}>Pin</button>
        {/snippet}
        {#snippet head()}Feed{/snippet}
        {#snippet empty()}No feeds match. <kbd>Esc</kbd> clears the search.{/snippet}
      </List>
    </section>
  {:else if view === "pages"}
    <section aria-label="Pages">
      <!-- a row with a control is taller than a line of text: the fillers must match it -->
      <List items={paged} id={(item) => item} label="Items" pageSize={10} hint>
        {#snippet row(item)}<span class="item">{item}</span> <button type="button" onclick={() => say(`Pinned ${item}`)}>Pin</button>{/snippet}
        {#snippet empty()}No items. <kbd>m</kbd> adds a hundred, and the list keeps its height while it is empty.{/snippet}
      </List>
    </section>
  {:else if view === "fit"}
    <section aria-label="Fit">
      <List items={MANY} id={(item) => item} label="Items" pageSize="fit" hint>
        {#snippet row(item)}{item}{/snippet}
        {#snippet empty()}No items.{/snippet}
      </List>
    </section>
  {:else if view === "grid"}
    <section aria-label="Grid" class="grid-box">
      <Grid items={ITEMS} id={(item) => item} label="Tiles" min={120} hint>
        {#snippet tile(item)}<span class="tile">{item}</span>{/snippet}
        {#snippet empty()}No tiles.{/snippet}
      </Grid>
    </section>
  {:else if view === "states"}
    <section aria-label="States">
      <div class="modes" role="group" aria-label="Mode">
        {#each ["fast", "slow", "fail"] as const as m (m)}
          <button aria-pressed={mode === m} onclick={() => (mode = m)}>{m}</button>
        {/each}
      </div>
      <Status of={rows} waiting="Asking the playground…" />
      {#if rows.value !== undefined}
        <p class="answer lsel-appear">{rows.value}</p>
      {:else if !rows.pending}
        <Empty>Nothing yet.</Empty>
      {/if}
    </section>
  {:else}
    <section aria-label="Form" bind:this={form}>
      <Field label="Name" error={nameError}>
        {#snippet children(control)}
          <input
            {...control}
            bind:value={name}
            onblur={() => (nameError = name.trim() === "" ? "A name is needed." : null)}
          />
        {/snippet}
      </Field>
      <div class="buttons">
        <Action label="Copy" key="c" busy="Copying…" done="Copied" run={() => new Promise((r) => setTimeout(r, 50))} />
        <Action label="Send" key="s" busy="Sending…" failed="Send failed" run={() => Promise.reject(new Error("offline"))} />
        <button type="button" aria-pressed={saved} onclick={() => (saved = !saved)}>Save</button>
        <span class="saved"><Swap text={saved ? "Saved at 12:00 PM" : "Not saved"} options={["Not saved", "Saved at 12:00 PM"]} align="start" /></span>
      </div>
      <div class="buttons">
        <button type="button" aria-pressed={full} onclick={() => (full = !full)}>Fill</button>
        <span class="hold">Hold <Swap text={full ? "full" : ""} options={["full"]} /></span>
      </div>
    </section>
  {/if}
  <p class="said" role="status">{said}</p>
</Page>

<style>
  /* a Grid fills the height it is given */
  .grid-box {
    height: min(420px, 40vh);
  }
  .tile {
    display: block;
    padding: var(--space-2);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .modes,
  .buttons {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .current {
    color: var(--text);
  }
  .said {
    min-height: 1.5em;
    color: var(--subtle);
  }
</style>
