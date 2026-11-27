<!-- Every stat per player as a table. -->
<script lang="ts">
import { type Report, STATS } from "../../shared/stats.ts";
import { STAT_UNITS } from "../lib/format.ts";

interface Props {
  report: Report;
}

let { report }: Props = $props();
</script>

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

<style>
  /* 18 columns: the narrower padding fits them all in the frame at 1280 */
  th,
  td {
    padding-inline: var(--space-2);
    text-align: right;
    white-space: nowrap;
  }
  thead th {
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
