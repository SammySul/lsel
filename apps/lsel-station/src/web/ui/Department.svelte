<script lang="ts">
import { ACTION_IDS, ACTIONS, isOnce } from "../../content/actions.ts";
import { CREW, type CrewId } from "../../content/crew.ts";
import { CROP_IDS, CROPS } from "../../content/crops.ts";
import { DEPARTMENTS, type DepartmentId } from "../../content/departments.ts";
import { ITEMS } from "../../content/items.ts";
import { numeral } from "../../content/modules.ts";
import { UNLOCKS } from "../../content/unlocks.ts";
import { xpToReachNext } from "../../sim/levels.ts";
import {
  actionLock,
  actionShown,
  bonusChance,
  crewSlots,
  departmentLevel,
  growthSpeed,
  masteryLevel,
  missing,
  missingInputs,
  owns,
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
const mine = $derived(ACTION_IDS.filter((id) => ACTIONS[id].department === department));

const rows = $derived(
  mine
    .filter((id) => actionShown(snapshot, id))
    .map((id) => {
      const action = ACTIONS[id];
      const once = isOnce(action);
      const lock = actionLock(snapshot, id);
      const workers = snapshot.crew.flatMap((crew) => {
        const job = snapshot.jobs[crew];
        return job?.action === id ? [{ crew, job }] : [];
      });
      // whoever is free and fastest at this; something made once takes one person
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
        paused: snapshot.projects[id],
        candidate,
        short: missingInputs(snapshot, action),
        mastery: style !== null && !once ? masteryLevel(snapshot, id) : null,
        chance: bonusChance(snapshot, id),
        raise: cost !== null && (snapshot.pool[department] ?? 0) >= cost ? cost : null,
      };
    }),
);
const selected = $derived(Math.min(cursor, rows.length - 1));

/** What was made or studied here for good. */
const owned = $derived(
  mine.flatMap((id) => {
    const { result } = ACTIONS[id];
    return result.kind === "unlock" && owns(snapshot, result.unlock)
      ? [UNLOCKS[result.unlock]]
      : [];
  }),
);

// beds are Hydroponics' own: they grow on timers with nobody assigned
const crop = CROP_IDS[0];
const beds = $derived(department === "hydroponics" ? snapshot.beds : []);
const emptyBed = $derived(beds.indexOf(null));

/** What a row makes, in words. */
function gives(result: (typeof ACTIONS)[keyof typeof ACTIONS]["result"]): string {
  switch (result.kind) {
    case "items":
      return stacks(result.outputs);
    case "loot":
      return `one of ${result.table.map((entry) => ITEMS[entry.item].name.toLowerCase()).join(", ")}`;
    case "unlock":
      return UNLOCKS[result.unlock].gives;
    case "sale":
      return `${count(result.credits)} credits`;
    case "reveal":
      return "the next sector on the map";
    case "module":
      return "";
    default: {
      const _exhaustive: never = result;
      return "";
    }
  }
}

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

function plant(bed: number): void {
  if (crop !== undefined && bed >= 0) game.send({ kind: "plant", bed, crop });
}

function onkeydown(event: KeyboardEvent): void {
  if (!isGameKey(event)) return;
  if (event.key === "j") cursor = Math.min(selected + 1, rows.length - 1);
  else if (event.key === "k") cursor = Math.max(selected - 1, 0);
  // on a focused button Enter already presses it
  else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) assign(selected);
  else if (event.key === "x") stop(selected);
  else if (event.key === "p") raise(selected);
  else if (event.key === "b") plant(emptyBed);
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

  {#if beds.length > 0 && crop !== undefined}
    {@const short = missing(snapshot, CROPS[crop].cost)}
    <ul class="beds" aria-label="Beds">
      {#each beds as bed, index (index)}
        <li>
          {#if bed === null}
            <div class="line">
              <span class="dim">Bed {index + 1}, empty</span>
              <button type="button" disabled={short.length > 0} onclick={() => plant(index)}>
                Plant {CROPS[crop].name.toLowerCase()} for {stacks(CROPS[crop].cost)}
                {#if index === emptyBed}<kbd>b</kbd>{/if}
              </button>
            </div>
          {:else}
            {@const grown = bed.progressMs / CROPS[bed.crop].growMs}
            {@const left = (CROPS[bed.crop].growMs - bed.progressMs) / growthSpeed(snapshot)}
            <div class="line">
              <span>Bed {index + 1}, {CROPS[bed.crop].name.toLowerCase()}</span>
              <span class="dim">{duration(Math.ceil(left / 1000) * 1000)}</span>
            </div>
            <div
              class="bar"
              role="progressbar"
              aria-label="Bed {index + 1}"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(grown * 100)}
            >
              <div style:width="{Math.min(grown, 1) * 100}%"></div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <ul>
    {#each rows as row, index (row.id)}
      {@const here = index === selected}
      {@const made = gives(row.action.result)}
      <li class:selected={here} aria-current={here}>
        <div class="line">
          <span>{row.action.name}</span>
          <span class="dim">{duration(row.action.durationMs)}</span>
        </div>
        <div class="line dim">
          <span>
            {stacks(row.action.inputs)}{row.action.inputs.length > 0 && made !== "" ? " → " : ""}{made}
          </span>
          {#if row.mastery !== null}
            <span>
              mastery {row.mastery}{row.chance > 0
                ? `, ${percent(row.chance)} ${style === "keep-input" ? "kept" : "double"}`
                : ""}
            </span>
          {/if}
        </div>

        {#each row.workers as { crew, job }, w (crew)}
          <div
            class="bar"
            role="progressbar"
            aria-label="{row.action.name}, {CREW[crew].name}"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round((job.progressMs / row.action.durationMs) * 100)}
          >
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
          <div
            class="bar"
            role="progressbar"
            aria-label="{row.action.name}, paused"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round((row.paused / row.action.durationMs) * 100)}
          >
            <div style:width="{(row.paused / row.action.durationMs) * 100}%"></div>
          </div>
        {/if}

        <div class="line">
          <span class="note">
            {#if row.lock?.kind === "level"}
              {DEPARTMENTS[department].name} level {row.lock.level}
            {:else if row.lock?.kind === "core"}
              Needs Core {numeral(row.lock.level)}
            {:else if row.lock?.kind === "charted"}
              Nothing in range: claim a sector to reach further
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

  {#if owned.length > 0}
    <ul class="owned" aria-label="Done">
      {#each owned as unlock (unlock.name)}
        <li><span>{unlock.name}</span> <span class="dim">{unlock.gives}</span></li>
      {/each}
    </ul>
  {/if}
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
  .owned li {
    flex-direction: row;
    justify-content: space-between;
    border: 0;
    padding: 0;
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
