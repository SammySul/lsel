<script lang="ts">
import { ACTION_IDS, ACTIONS } from "../../content/actions.ts";
import { CREW, CREW_IDS } from "../../content/crew.ts";
import { DEPARTMENTS, type DepartmentId } from "../../content/departments.ts";
import { levelOf, xpToReachNext } from "../../sim/levels.ts";
import type { Game } from "../game.svelte.ts";
import { count, seconds } from "./format.ts";
import { isGameKey } from "./keys.ts";

let { game, department }: { game: Game; department: DepartmentId } = $props();

let cursor = $state(0);

const xp = $derived(game.snapshot.xp[department] ?? 0);
const level = $derived(levelOf(xp));
const next = $derived(xpToReachNext(level));
const rows = $derived(
  ACTION_IDS.filter((id) => ACTIONS[id].department === department).map((id) => {
    const action = ACTIONS[id];
    const crew = CREW_IDS.find((c) => game.snapshot.jobs[c]?.action === id);
    const job = crew === undefined ? undefined : game.snapshot.jobs[crew];
    return { id, action, crew, progress: (job?.progressMs ?? 0) / action.durationMs };
  }),
);

/** Assigns the first crew member, or stops whoever is on the row. */
function toggle(index: number): void {
  const row = rows[index];
  const first = CREW_IDS[0];
  if (row === undefined || first === undefined) return;
  if (row.crew !== undefined) game.send({ kind: "unassign", crew: row.crew });
  else game.send({ kind: "assign", crew: first, action: row.id });
}

function onkeydown(event: KeyboardEvent): void {
  if (!isGameKey(event)) return;
  if (event.key === "j") cursor = Math.min(cursor + 1, rows.length - 1);
  else if (event.key === "k") cursor = Math.max(cursor - 1, 0);
  // on a focused button Enter already presses it
  else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) toggle(cursor);
}
</script>

<svelte:window {onkeydown} />

<section class="lsel-appear">
  <header>
    <h2>{DEPARTMENTS[department].name}</h2>
    <span>Lv {level}</span>
  </header>
  <p class="xp">xp {count(xp)}{next === null ? "" : ` / ${count(next)}`}</p>
  <ul>
    {#each rows as row, index (row.id)}
      <li class:selected={index === cursor} aria-current={index === cursor}>
        <div class="line">
          <span>{row.action.name}</span>
          <span class="dim">{seconds(row.action.durationMs)}</span>
        </div>
        <div
          class="bar"
          role="progressbar"
          aria-label={row.action.name}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(row.progress * 100)}
        >
          <div style:width="{row.progress * 100}%"></div>
        </div>
        <div class="line">
          <span class="dim">{row.crew === undefined ? "Nobody assigned" : CREW[row.crew].name}</span>
          <button type="button" onclick={() => toggle(index)}>
            {row.crew === undefined ? "Assign" : "Stop"}
            {#if index === cursor}<kbd>Enter</kbd>{/if}
          </button>
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  section {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  header,
  .line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
  }
  .xp {
    margin: 0;
    color: var(--subtle);
    font-variant-numeric: tabular-nums;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: var(--border);
    border-left: 2px solid var(--overlay);
  }
  li.selected {
    border-left-color: var(--accent);
  }
  .dim {
    color: var(--subtle);
  }
  .bar {
    height: var(--space-2);
    background: var(--surface);
  }
  .bar div {
    height: 100%;
    background: var(--accent);
  }
</style>
