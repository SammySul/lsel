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
  fill
>
  <section class="controls" aria-label="Choices">
    <div class="players" role="group" aria-label="Players">
      {#each available as player (player)}
        <button aria-pressed={selected.includes(player)} onclick={() => toggle(player)}>{player}</button>
      {/each}
    </div>
    <div class="row">
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
    </div>
  </section>

  <section class="report" aria-label="Report">
    <div>
      {#if roster.value === undefined}
        <Status of={roster} waiting="Asking dajaj for the players…" />
      {:else}
        <!-- the Refresh button's r retries -->
        <Status of={report} waiting="Asking PUBG…" retry={false} />
      {/if}
      <p class="line summary">
        {#if shown}{plural(shown.report.matchCount, "match", "matches")} together since {when(new Date(shown.since))}.{/if}
      </p>
      <p class="line missing">
        {#if missing > 0}{plural(missing, "match", "matches")} couldn't be loaded from PUBG.{/if}
      </p>
    </div>

    <div class="frame">
      {#if roster.value !== undefined && selected.length === 0}
        <div class="empty"><Empty>No players chosen. Choose one or more above.</Empty></div>
      {:else if shown}
        {#key prefs.value.view}
          <div class="view lsel-appear">
            {#if prefs.value.view === "table"}
              <Table report={shown.report} />
            {:else}
              <Chart report={shown.report} view={prefs.value.view} stat={prefs.value.stat} />
            {/if}
          </div>
        {/key}
      {:else if report.value}
        <div class="empty"><Empty>No recent matches with all of them. Drop a player to see more.</Empty></div>
      {/if}
    </div>
  </section>
</Page>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-5);
    align-items: center;
  }
  /* one line kept from the start: players arrive later and are cut at the edge, never wrap; the padding keeps focus outlines unclipped */
  .players {
    box-sizing: content-box;
    display: flex;
    gap: var(--space-2);
    min-height: var(--control-height);
    margin: calc(-1 * var(--space-1));
    padding: var(--space-1);
    overflow: hidden;
    white-space: nowrap;
  }
  .players button {
    flex: none;
  }
  .stat {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    color: var(--subtle);
  }
  .report {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
  }
  .line {
    height: 1lh;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .missing {
    color: var(--warning);
  }
  .summary {
    color: var(--subtle);
  }
  .frame {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    border: var(--border);
  }
  .empty {
    padding: var(--space-4);
  }
  .view {
    flex: 1;
    min-height: 0;
  }
</style>
