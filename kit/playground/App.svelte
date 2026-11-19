<script lang="ts">
import { version } from "../package.json";
import {
  Action,
  Empty,
  Field,
  keys,
  List,
  Page,
  resource,
  Status,
  say,
  Tabs,
} from "../src/lib/index.ts";

type View = "list" | "states" | "form";
const VIEWS = [
  { id: "list", label: "List" },
  { id: "states", label: "States" },
  { id: "form", label: "Form" },
] as const;
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
  await new Promise((r) => setTimeout(r, m === "slow" ? 800 : 10));
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

let form: HTMLElement | undefined = $state();
keys(() =>
  view === "form"
    ? [{ key: "Escape", label: "Leave the form", inField: form, run: () => say("Left the form") }]
    : [],
);

let name = $state("");
let nameError: string | null = $state(null);
</script>

<Page name="lsel kit" sub="Every shared component, in every state." {version}>
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
      </div>
    </section>
  {/if}
</Page>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .modes,
  .buttons {
    display: flex;
    gap: var(--space-2);
  }
  .current {
    color: var(--text);
  }
</style>
