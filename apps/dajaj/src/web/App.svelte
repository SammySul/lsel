<script lang="ts">
import { onMount } from "svelte";
import { version } from "../../package.json";
import { type Report, STATS, type Stat } from "../shared/stats.ts";
import Chart from "./components/Chart.svelte";
import Table from "./components/Table.svelte";
import { fetchPlayers, fetchReport } from "./lib/api.ts";
import { formatWhen, STAT_UNITS } from "./lib/format.ts";
import { readPrefs, VIEWS, type View, writePrefs } from "./lib/prefs.ts";

const VIEW_LABEL: Record<View, string> = { table: "Table", bar: "Bar", line: "Line", pie: "Pie" };

const storage = (() => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
})();

let available: string[] = $state([]);
let selected: string[] = $state([]);
let view: View = $state("table");
let stat: Stat = $state("kills");
let report: Report | null = $state(null);
let loading = $state(false);
let error: string | null = $state(null);
let request = 0;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

onMount(async () => {
  try {
    available = await fetchPlayers();
  } catch (e) {
    error = message(e);
    return;
  }
  const prefs = readPrefs(storage, available);
  selected = prefs.players;
  view = prefs.view;
  stat = prefs.stat;
  await load();
});

$effect(() => {
  if (available.length > 0) writePrefs(storage, { players: selected, view, stat });
});

// The latest request wins: a slow answer for an older selection is dropped.
async function load() {
  const id = ++request;
  error = null;
  if (selected.length === 0) {
    report = null;
    loading = false;
    return;
  }
  loading = true;
  try {
    const r = await fetchReport(selected);
    if (id === request) report = r;
  } catch (e) {
    if (id === request) error = message(e);
  } finally {
    if (id === request) loading = false;
  }
}

function toggle(player: string) {
  selected = available.filter((p) => (p === player ? !selected.includes(p) : selected.includes(p)));
  void load();
}

function onkeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  const n = Number(e.key);
  const chosen = VIEWS[n - 1];
  if (chosen !== undefined) view = chosen;
  else if (e.key === "r") void load();
  else return;
  e.preventDefault();
}

const status = $derived.by(() => {
  if (loading) return "Asking PUBG…";
  if (available.length > 0 && selected.length === 0) return "Choose at least one player.";
  if (report === null) return "";
  if (report.matchCount === 0) return "No recent matches with all of them.";
  const n = report.matchCount;
  return `${n} ${n === 1 ? "match" : "matches"} together since ${formatWhen(report.earliest ?? "")}.`;
});
</script>

<svelte:window {onkeydown} />

<main>
  <header>
    <h1>dajaj</h1>
    <p class="sub">PUBG stats for the matches you all played</p>
  </header>

  <section class="controls" aria-label="Choices">
    <div class="group" role="group" aria-label="Players">
      {#each available as player (player)}
        <button aria-pressed={selected.includes(player)} onclick={() => toggle(player)}>{player}</button>
      {/each}
    </div>
    <div class="group" role="group" aria-label="View">
      {#each VIEWS as v, i (v)}
        <button aria-pressed={view === v} onclick={() => (view = v)}>{VIEW_LABEL[v]} <kbd>{i + 1}</kbd></button>
      {/each}
    </div>
    <label class="stat">
      Stat
      <select bind:value={stat} disabled={view === "table"}>
        {#each STATS as s (s)}
          <option value={s}>{STAT_UNITS[s].label}</option>
        {/each}
      </select>
    </label>
    <button class="refresh" onclick={() => void load()} disabled={loading || selected.length === 0}>
      Refresh <kbd>r</kbd>
    </button>
  </section>

  <p class="status" role="status">{status}</p>
  {#if error !== null}
    <p class="error lsel-appear" role="alert">{error}</p>
  {/if}

  {#if report !== null && report.matchCount > 0}
    {#key view}
      <div class="lsel-appear">
        {#if view === "table"}
          <Table {report} />
        {:else}
          <Chart {report} {view} {stat} />
        {/if}
      </div>
    {/key}
  {/if}

  <footer>
    dajaj <span class="version">v{version}</span> ·
    <a href="https://git.sammysul.com/SammySul/dajaj">source</a> · MIT
  </footer>
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
  }
  .sub {
    margin: var(--space-1) 0 var(--space-5);
    color: var(--subtle);
  }
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
  .status {
    min-height: 1.5em;
    margin: var(--space-4) 0 var(--space-2);
    color: var(--subtle);
  }
  .error {
    margin: 0 0 var(--space-4);
    color: var(--error);
  }
  footer {
    margin-top: var(--space-6);
    color: var(--subtle);
    font-size: var(--text-xs);
  }
</style>
