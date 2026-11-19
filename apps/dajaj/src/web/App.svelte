<script lang="ts">
import { Empty, keys, Page, plural, resource, Status, Tabs, when } from "@sammysul/lsel";
import { untrack } from "svelte";
import { version } from "../../package.json";
import { STATS, type Stat } from "../shared/stats.ts";
import Chart from "./components/Chart.svelte";
import Table from "./components/Table.svelte";
import { fetchPlayers, fetchReport } from "./lib/api.ts";
import { STAT_UNITS } from "./lib/format.ts";
import { choosePlayers, prefs, VIEWS, type View } from "./lib/prefs.ts";

const roster = resource(fetchPlayers);
const available = $derived(roster.value ?? []);
// the stored choice seeds it when the players arrive; a toggle overrides it
let selected = $derived(
  choosePlayers(
    untrack(() => prefs.value.players),
    available,
  ),
);
let view: View = $state(prefs.value.view);
let stat: Stat = $state(prefs.value.stat);

const report = resource(async (signal) => {
  const players = selected;
  return players.length === 0 ? null : fetchReport(players, signal);
});

$effect(() => {
  if (roster.value !== undefined) prefs.value = { players: selected, view, stat };
});

function toggle(player: string) {
  selected = available.filter((p) => (p === player ? !selected.includes(p) : selected.includes(p)));
}

keys(() =>
  selected.length > 0 ? [{ key: "r", label: "Refresh", run: () => report.reload() }] : [],
);
</script>

<Page
  name="dajaj"
  sub="PUBG stats for the matches you all played"
  {version}
  source="https://git.sammysul.com/SammySul/dajaj"
  width={1200}
>
  <section class="controls" aria-label="Choices">
    <div class="group" role="group" aria-label="Players">
      {#each available as player (player)}
        <button aria-pressed={selected.includes(player)} onclick={() => toggle(player)}>{player}</button>
      {/each}
    </div>
    <Tabs items={VIEWS} bind:value={view} label="View" />
    <label class="stat">
      Stat
      <select bind:value={stat} disabled={view === "table"}>
        {#each STATS as s (s)}
          <option value={s}>{STAT_UNITS[s].label}</option>
        {/each}
      </select>
    </label>
    <button onclick={() => report.reload()} disabled={report.pending || selected.length === 0}>
      Refresh <kbd>r</kbd>
    </button>
  </section>

  {#if roster.value === undefined}
    <Status of={roster} waiting="Asking dajaj for the players…" />
  {:else}
    <Status of={report} waiting="Asking PUBG…" />
    {#if selected.length === 0}
      <Empty>No players chosen. Choose one or more above.</Empty>
    {:else if report.value}
      {#if report.value.matchCount === 0 || report.value.earliest === null}
        <Empty>No recent matches with all of them. Drop a player to see more.</Empty>
      {:else}
        <p class="summary">{plural(report.value.matchCount, "match", "matches")} together since {when(new Date(report.value.earliest))}.</p>
        {#key view}
          <div class="lsel-appear">
            {#if view === "table"}
              <Table report={report.value} />
            {:else}
              <Chart report={report.value} {view} {stat} />
            {/if}
          </div>
        {/key}
      {/if}
    {/if}
  {/if}
</Page>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: center;
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .stat {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    color: var(--subtle);
  }
  .summary {
    margin: 0;
    color: var(--subtle);
  }
</style>
