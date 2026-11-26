<!-- Pick players, then compare their stats as a table or a chart. -->
<script lang="ts">
import { Action, Empty, Page, plural, resource, Status, Tabs, when } from "@sammysul/lsel";
import { version } from "../../package.json";
import { STATS } from "../shared/stats.ts";
import Chart from "./components/Chart.svelte";
import Table from "./components/Table.svelte";
import { fetchPlayers, fetchReport } from "./lib/api.ts";
import { STAT_UNITS } from "./lib/format.ts";
import { choosePlayers, prefs, VIEWS } from "./lib/prefs.ts";

const roster = resource(async (signal) => {
  const players = await fetchPlayers(signal);
  // only once the players are known, so the empty choice before that never overwrites the saved one
  prefs.value.players = choosePlayers(prefs.value.players, players);
  return players;
});
const available = $derived(roster.value ?? []);
const selected = $derived(roster.value === undefined ? [] : prefs.value.players);

const report = resource(async (signal) => {
  const players = selected;
  return players.length === 0 ? null : fetchReport(players, signal);
});

const shown = $derived.by(() => {
  const r = report.value;
  return selected.length > 0 && r && r.earliest !== null ? { report: r, since: r.earliest } : null;
});
const missing = $derived(selected.length > 0 ? (report.value?.missing ?? 0) : 0);

function toggle(player: string) {
  prefs.value.players = available.filter((p) =>
    p === player ? !selected.includes(p) : selected.includes(p),
  );
}
</script>

<Page
  name="dajaj"
  sub="PUBG stats for the matches you all played"
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/dajaj"
  width={1200}
>
  <section class="controls" aria-label="Choices">
    <div class="group" role="group" aria-label="Players">
      {#each available as player (player)}
        <button aria-pressed={selected.includes(player)} onclick={() => toggle(player)}>{player}</button>
      {/each}
    </div>
    <Tabs items={VIEWS} bind:value={prefs.value.view} label="View" />
    <label class="stat">
      Stat
      <select bind:value={prefs.value.stat} disabled={prefs.value.view === "table"}>
        {#each STATS as s (s)}
          <option value={s}>{STAT_UNITS[s].label}</option>
        {/each}
      </select>
    </label>
    <Action
      label="Refresh"
      key="r"
      busy="Refreshing…"
      disabled={selected.length === 0}
      run={() => report.reload()}
    />
  </section>

  {#if roster.value === undefined}
    <Status of={roster} waiting="Asking dajaj for the players…" />
  {:else}
    <div class="lines">
      <!-- the Refresh button's r retries -->
      <Status of={report} waiting="Asking PUBG…" retry={false} />
      {#if selected.length === 0}
        <Empty>No players chosen. Choose one or more above.</Empty>
      {:else if shown}
        <p class="summary">{plural(shown.report.matchCount, "match", "matches")} together since {when(new Date(shown.since))}.</p>
      {:else if report.value}
        <Empty>No recent matches with all of them. Drop a player to see more.</Empty>
      {/if}
      {#if missing > 0}
        <p class="missing">{plural(missing, "match", "matches")} couldn't be loaded from PUBG.</p>
      {/if}
    </div>
    {#if shown}
      {#key prefs.value.view}
        <div class="lsel-appear">
          {#if prefs.value.view === "table"}
            <Table report={shown.report} />
          {:else}
            <Chart report={shown.report} view={prefs.value.view} stat={prefs.value.stat} />
          {/if}
        </div>
      {/key}
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
  .missing {
    margin: 0;
    color: var(--warning);
  }
  .summary {
    margin: 0;
    color: var(--subtle);
  }
</style>
