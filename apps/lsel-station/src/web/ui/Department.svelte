<script lang="ts">
import { ACTION_IDS, ACTIONS } from "../../content/actions.ts";
import { CREW, type CrewId } from "../../content/crew.ts";
import { DEPARTMENTS, type DepartmentId } from "../../content/departments.ts";
import { numeral } from "../../content/modules.ts";
import { xpToReachNext } from "../../sim/levels.ts";
import {
  actionLock,
  actionShown,
  bonusChance,
  crewSlots,
  departmentLevel,
  masteryLevel,
  missingInputs,
  poolCost,
  poolShare,
  speedOf,
} from "../../sim/rules.ts";
import type { Game } from "../game.svelte.ts";
import { count, duration, percent, stacks } from "./format.ts";
import { isGameKey } from "./keys.ts";

let { game, department }: { game: Game; department: DepartmentId } = $props();

let cursor = $state(0);

const snapshot = $derived(game.snapshot);
const style = $derived(DEPARTMENTS[department].mastery);
const xp = $derived(snapshot.xp[department] ?? 0);
const level = $derived(departmentLevel(snapshot, department));
const next = $derived(xpToReachNext(level));
const idle = $derived(snapshot.crew.filter((crew) => snapshot.jobs[crew] === undefined));
const slotFree = $derived(snapshot.crew.length - idle.length < crewSlots(snapshot));

const rows = $derived(
  ACTION_IDS.filter((id) => ACTIONS[id].department === department && actionShown(snapshot, id)).map(
    (id) => {
      const action = ACTIONS[id];
      const once = action.result.kind === "module";
      const lock = actionLock(snapshot, id);
      const workers = snapshot.crew.flatMap((crew) => {
        const job = snapshot.jobs[crew];
        return job?.action === id ? [{ crew, job }] : [];
      });
      const paused = snapshot.projects[id];
      // whoever is free and fastest at this; a module takes one person
      let candidate: CrewId | undefined;
      if (lock === null && slotFree && !(once && workers.length > 0)) {
        for (const crew of idle) {
          if (
            candidate === undefined ||
            speedOf(snapshot, crew, id) > speedOf(snapshot, candidate, id)
          ) {
            candidate = crew;
          }
        }
      }
      const cost = style !== null && !once ? poolCost(snapshot, id) : null;
      return {
        id,
        action,
        once,
        lock,
        workers,
        paused,
        candidate,
        short: missingInputs(snapshot, action),
        mastery: style !== null && !once ? masteryLevel(snapshot, id) : null,
        chance: bonusChance(snapshot, id),
        raise: cost !== null && (snapshot.pool[department] ?? 0) >= cost ? cost : null,
      };
    },
  ),
);
const selected = $derived(Math.min(cursor, rows.length - 1));

function assign(index: number): void {
  const row = rows[index];
  if (row?.candidate !== undefined) {
    game.send({ kind: "assign", crew: row.candidate, action: row.id });
  }
}

function stop(index: number): void {
  const worker = rows[index]?.workers.at(-1);
  if (worker !== undefined) game.send({ kind: "unassign", crew: worker.crew });
}

function raise(index: number): void {
  const row = rows[index];
  if (row !== undefined && row.raise !== null) game.send({ kind: "spend-pool", action: row.id });
}

function onkeydown(event: KeyboardEvent): void {
  if (!isGameKey(event)) return;
  if (event.key === "j") cursor = Math.min(selected + 1, rows.length - 1);
  else if (event.key === "k") cursor = Math.max(selected - 1, 0);
  // on a focused button Enter already presses it
  else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) assign(selected);
  else if (event.key === "x") stop(selected);
  else if (event.key === "p") raise(selected);
}
</script>

<svelte:window {onkeydown} />

<section class="lsel-appear">
  <header>
    <h2>{DEPARTMENTS[department].name}</h2>
    <span>Lv {level}</span>
  </header>
  <p class="facts">
    <span>xp {count(xp)}{next === null ? "" : ` / ${count(next)}`}</span>
    {#if style !== null}
      <span>
        pool {count(Math.floor(snapshot.pool[department] ?? 0))}, {percent(
          poolShare(snapshot, department),
        )}
      </span>
    {/if}
  </p>
  <ul>
    {#each rows as row, index (row.id)}
      {@const here = index === selected}
      <li class:selected={here} aria-current={here}>
        <div class="line">
          <span>{row.action.name}</span>
          <span class="dim">{duration(row.action.durationMs)}</span>
        </div>
        <div class="line dim">
          {#if row.action.result.kind === "items"}
            <span>
              {row.action.inputs.length > 0 ? `${stacks(row.action.inputs)} → ` : ""}{stacks(
                row.action.result.outputs,
              )}
            </span>
          {:else}
            <span>{stacks(row.action.inputs)}</span>
          {/if}
          {#if row.mastery !== null}
            <span>
              mastery {row.mastery}{row.chance > 0
                ? `, ${percent(row.chance)} ${style === "keep-input" ? "kept" : "double"}`
                : ""}
            </span>
          {/if}
        </div>

        {#each row.workers as { crew, job }, w (crew)}
          <div class="bar" role="progressbar" aria-label="{row.action.name}, {CREW[crew].name}"
            aria-valuemin="0" aria-valuemax="100"
            aria-valuenow={Math.round((job.progressMs / row.action.durationMs) * 100)}>
            <div style:width="{Math.min(job.progressMs / row.action.durationMs, 1) * 100}%"></div>
          </div>
          <div class="line">
            <span class="dim">
              {CREW[crew].name}{job.phase === "waiting" ? `, waiting for ${stacks(row.short)}` : ""}
            </span>
            <button type="button" onclick={() => game.send({ kind: "unassign", crew })}>
              Stop {#if here && w === row.workers.length - 1}<kbd>x</kbd>{/if}
            </button>
          </div>
        {/each}

        {#if row.paused !== undefined}
          <div class="bar" role="progressbar" aria-label="{row.action.name}, paused"
            aria-valuemin="0" aria-valuemax="100"
            aria-valuenow={Math.round((row.paused / row.action.durationMs) * 100)}>
            <div style:width="{(row.paused / row.action.durationMs) * 100}%"></div>
          </div>
        {/if}

        <div class="line">
          <span class="note">
            {#if row.lock?.kind === "level"}
              {DEPARTMENTS[department].name} level {row.lock.level}
            {:else if row.lock?.kind === "core"}
              Needs Core {numeral(row.lock.level)}
            {:else if row.paused !== undefined}
              Paused
            {:else if row.once && row.workers.length === 0 && row.short.length > 0}
              Short of {stacks(row.short)}
            {/if}
          </span>
          <span class="actions">
            {#if row.raise !== null}
              <button type="button" onclick={() => raise(index)}>
                Raise mastery for {count(row.raise)} {#if here}<kbd>p</kbd>{/if}
              </button>
            {/if}
            {#if row.candidate !== undefined}
              <button type="button" onclick={() => assign(index)}>
                Assign {CREW[row.candidate].name} {#if here}<kbd>Enter</kbd>{/if}
              </button>
            {:else if row.lock === null && row.workers.length === 0}
              <button type="button" disabled>No free crew</button>
            {/if}
          </span>
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
  .line,
  .facts {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
  }
  .facts {
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
  .note {
    color: var(--warning);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
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
