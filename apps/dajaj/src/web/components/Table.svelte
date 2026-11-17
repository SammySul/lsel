<script lang="ts">
import { type Report, STATS } from "../../shared/stats.ts";
import { STAT_UNITS } from "../lib/format.ts";

interface Props {
  report: Report;
}

let { report }: Props = $props();
</script>

<div class="scroll">
  <table>
    <thead>
      <tr>
        <th class="name" scope="col">Player</th>
        {#each STATS as s (s)}
          <th scope="col">{STAT_UNITS[s].label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each report.players as player (player)}
        {@const totals = report.totals[player]}
        <tr>
          <th class="name" scope="row">{player}</th>
          {#each STATS as s (s)}
            <td>{totals ? STAT_UNITS[s].text(totals[s]) : "–"}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .scroll {
    overflow-x: auto;
    border: var(--border);
  }
  table {
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border);
    text-align: right;
    white-space: nowrap;
  }
  thead th {
    color: var(--subtle);
    font-size: var(--text-xs);
    font-weight: 400;
    white-space: normal;
    vertical-align: bottom;
    min-width: 7ch;
  }
  .name {
    position: sticky;
    left: 0;
    text-align: left;
    background: var(--base);
    border-right: var(--border);
  }
  tbody .name {
    font-weight: 700;
  }
  tbody tr:last-child > * {
    border-bottom: 0;
  }
</style>
