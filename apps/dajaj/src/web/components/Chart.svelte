<script lang="ts">
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip,
} from "chart.js";
import type { Report, Stat } from "../../shared/stats.ts";
import { formatWhen, STAT_UNITS } from "../lib/format.ts";

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

interface Props {
  report: Report;
  view: "bar" | "line" | "pie";
  stat: Stat;
}

let { report, view, stat }: Props = $props();
let canvas: HTMLCanvasElement | undefined = $state();

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

$effect(() => {
  if (canvas === undefined) return;
  const unit = STAT_UNITS[stat];
  // One color per player, in the order the terminal palette lists them.
  const colors = report.players.map((_, i) => css(`--term-${(i % 6) + 1}`));
  const text = css("--subtle");
  const grid = css("--overlay");
  Chart.defaults.font.family = css("--font");
  Chart.defaults.font.size = 12;
  Chart.defaults.color = text;
  Chart.defaults.borderColor = grid;

  const chart =
    view === "line"
      ? new Chart(canvas, {
          type: "line",
          data: {
            labels: report.perMatch.map((m) => formatWhen(m.createdAt)),
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
          options: {
            animation: false,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: unit.label } } },
          },
        })
      : new Chart(canvas, {
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
            animation: false,
            maintainAspectRatio: false,
            plugins: { legend: { display: view === "pie" } },
            ...(view === "bar"
              ? { scales: { y: { beginAtZero: true, title: { display: true, text: unit.label } } } }
              : {}),
          },
        });
  return () => chart.destroy();
});
</script>

<div class="chart" data-view={view}>
  <canvas bind:this={canvas} aria-label="{STAT_UNITS[stat].label} by player"></canvas>
</div>

<style>
  .chart {
    position: relative;
    height: min(60vh, 520px);
    border: var(--border);
    padding: var(--space-4);
  }
</style>
