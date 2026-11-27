<!-- One stat per player as a bar, line or pie chart. -->
<script lang="ts">
import { reducedMotion, when } from "@sammysul/lsel";
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip,
} from "chart.js";
import { untrack } from "svelte";
import type { Report, Stat } from "../../shared/stats.ts";
import { STAT_UNITS } from "../lib/format.ts";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip,
);

type View = "bar" | "line" | "pie";

interface Props {
  report: Report;
  view: View;
  stat: Stat;
}

let { report, view, stat }: Props = $props();
let canvas: HTMLCanvasElement | undefined = $state();
let chart: Chart<View> | undefined;

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Chart.js animates from JavaScript, which tokens.css's reduced-motion rule can't reach.
function animation() {
  if (reducedMotion()) return false;
  return { duration: Number.parseFloat(css("--motion-slow")), easing: "easeOutQuart" as const };
}

function config(report: Report, view: View, stat: Stat): ChartConfiguration<View> {
  const unit = STAT_UNITS[stat];
  // One color per player, in the order the terminal palette lists them.
  const colors = report.players.map((_, i) => css(`--term-${(i % 6) + 1}`));
  const axis = { y: { beginAtZero: true, title: { display: true, text: unit.label } } };
  if (view === "line") {
    return {
      type: "line",
      data: {
        labels: report.perMatch.map((m) => when(new Date(m.createdAt))),
        datasets: report.players.map((player, i) => ({
          label: player,
          data: report.perMatch.map((m) => {
            const s = m.stats[player];
            return s ? unit.value(s[stat]) : null;
          }),
          borderColor: colors[i],
          backgroundColor: colors[i],
          borderWidth: 2,
          pointRadius: 3,
          tension: 0,
        })),
      },
      options: { animation: animation(), maintainAspectRatio: false, scales: axis },
    } as ChartConfiguration<View>;
  }
  return {
    type: view,
    data: {
      labels: report.players,
      datasets: [
        {
          label: unit.label,
          data: report.players.map((p) => {
            const t = report.totals[p];
            return t ? unit.value(t[stat]) : 0;
          }),
          backgroundColor: colors,
          borderColor: css("--base"),
          borderWidth: view === "pie" ? 2 : 0,
        },
      ],
    },
    options: {
      animation: animation(),
      maintainAspectRatio: false,
      plugins: { legend: { display: view === "pie" } },
      ...(view === "bar" ? { scales: axis } : {}),
    },
  } as ChartConfiguration<View>;
}

// App remounts this for another view; new data or another stat animates the same chart.
$effect(() => {
  if (canvas === undefined) return;
  Chart.defaults.font.family = css("--font");
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css("--subtle");
  Chart.defaults.borderColor = css("--overlay");
  const created = new Chart(
    canvas,
    untrack(() => config(report, view, stat)),
  );
  chart = created;
  return () => {
    created.destroy();
    chart = undefined;
  };
});

$effect(() => {
  const next = config(report, view, stat);
  if (chart === undefined) return;
  chart.data = next.data;
  chart.options = next.options ?? {};
  chart.update();
});
</script>

<div
  class="chart"
  data-view={view}
  role="img"
  aria-label="{STAT_UNITS[stat].label}, {view === 'line' ? 'per match for each player' : 'in total by player'}"
>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart {
    position: relative;
    height: 100%;
    padding: var(--space-4);
  }
</style>
