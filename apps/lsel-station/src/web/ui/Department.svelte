<!-- One department: its actions, jobs, crew and levels. -->
<!-- lsel-allow: not split yet; split it the next time lsel-station is worked on -->
<script lang="ts">
import { count, keys, List, percent } from "@sammysul/lsel";
import { ACTION_IDS, ACTIONS, isOnce } from "../../content/actions.ts";
import { CREW, type CrewId } from "../../content/crew.ts";
import { CROP_IDS, CROPS } from "../../content/crops.ts";
import { DEPARTMENTS, type DepartmentId } from "../../content/departments.ts";
import { ITEMS } from "../../content/items.ts";
import { MODULES, numeral } from "../../content/modules.ts";
import { UNLOCKS } from "../../content/unlocks.ts";
import { LEVELS } from "../../sim/levels.ts";
import {
  actionLock,
  actionShown,
  bonusChance,
  canAssign,
  departmentLevel,
  fullOutputs,
  growthSpeed,
  masterable,
  masteryLevel,
  missing,
  missingInputs,
  owns,
  poolCost,
  poolShare,
  speedOf,
} from "../../sim/rules.ts";
import { GLUT_MAX, GLUT_STEP } from "../../sim/tick.ts";
import type { Game } from "../game.svelte.ts";
import { names, span, stacks } from "./format.ts";

let { game, department }: { game: Game; department: DepartmentId } = $props();

let selected: string | undefined = $state();

const snapshot = $derived(game.snapshot);
const style = $derived(DEPARTMENTS[department].mastery);
const xp = $derived(snapshot.xp[department] ?? 0);
const level = $derived(departmentLevel(snapshot, department));
const next = $derived(LEVELS.toReachNext(level));
const idle = $derived(snapshot.crew.filter((crew) => snapshot.jobs[crew] === undefined));
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
      // whoever is free and fastest at this
      let candidate: CrewId | undefined;
      for (const crew of idle) {
        if (!canAssign(snapshot, crew, id)) continue;
        if (
          candidate === undefined ||
          speedOf(snapshot, crew, id) > speedOf(snapshot, candidate, id)
        ) {
          candidate = crew;
        }
      }
      const cost = masterable(id) ? poolCost(snapshot, id) : null;
      return {
        id,
        action,
        once,
        lock,
        workers,
        paused: snapshot.projects[id],
        candidate,
        short: missingInputs(snapshot, action),
        full: fullOutputs(snapshot, action),
        mastery: masterable(id) ? masteryLevel(snapshot, id) : null,
        chance: bonusChance(snapshot, id),
        raise: cost !== null && (snapshot.pool[department] ?? 0) >= cost ? cost : null,
      };
    }),
);
type Row = (typeof rows)[number];

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

/** How a job runs, in one line, for the selected row. */
function how(action: (typeof ACTIONS)[keyof typeof ACTIONS]): string {
  const { result } = action;
  switch (result.kind) {
    case "items":
      return action.inputs.length === 0
        ? "Repeats until you stop it, and waits while the Hold is full of what it makes."
        : "Repeats until you stop it, and waits when short of inputs or while the Hold is full of what it makes.";
    case "loot":
      return "Repeats until you stop it. Each haul is one of these, at random, and it waits while the Hold is full of any.";
    case "sale":
      return `A run to the market and back. Each sale of a good pays ${percent(GLUT_STEP)} less, down to ${percent(GLUT_MAX)} less, and each step comes back in 5 minutes.`;
    case "reveal":
      return "Each run puts the nearest uncharted sector on the map.";
    case "module":
      return `Built once. ${MODULES[result.module].does}. Stopping keeps the progress.`;
    case "unlock":
      return "Made once and kept for good. Stopping keeps the progress.";
    default: {
      const _exhaustive: never = result;
      return "";
    }
  }
}

function assign(row: Row): void {
  if (row.candidate !== undefined) {
    game.send({ kind: "assign", crew: row.candidate, action: row.id });
  }
}

function stop(row: Row): void {
  const worker = row.workers.at(-1);
  if (worker !== undefined) game.send({ kind: "unassign", crew: worker.crew });
}

function raise(row: Row): void {
  if (row.raise !== null) game.send({ kind: "spend-pool", action: row.id });
}

// Enter is a row action, not the list's open: a click on the selected row then only selects
const actions = $derived([
  { key: "Enter", label: "Assign whoever is free", run: assign },
  { key: "x", label: "Stop", run: stop },
  ...(style === null ? [] : [{ key: "p", label: "Raise mastery from the pool", run: raise }]),
]);

function plant(bed: number): void {
  if (crop !== undefined && bed >= 0) game.send({ kind: "plant", bed, crop });
}

keys(() =>
  department === "hydroponics"
    ? [{ key: "b", label: "Plant an empty bed", run: () => plant(emptyBed) }]
    : [],
);
</script>

<section class="lsel-appear">
  <header>
    <h2>{DEPARTMENTS[department].name}</h2>
    <span>Lv {level}</span>
  </header>
  <p class="about">{DEPARTMENTS[department].about}</p>
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
              <span class="dim">{span(Math.ceil(left / 1000) * 1000)}</span>
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

  <List items={rows} id={(row) => row.id} bind:selected label="Jobs" {actions}>
    {#snippet row(row, here)}
      {@const made = gives(row.action.result)}
      <div class="row">
        <div class="line">
          <span>{row.action.name}</span>
          <span class="dim">{span(row.action.durationMs)}</span>
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
        {#if here}
          <p class="how">{how(row.action)}</p>
        {/if}

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
              {CREW[crew].name}{job.phase !== "waiting"
                ? ""
                : row.short.length > 0
                  ? `, waiting for ${stacks(row.short)}`
                  : row.full.length > 0
                    ? `, waiting: the Hold is full of ${names(row.full)}`
                    : ""}
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
              <button type="button" onclick={() => raise(row)}>
                Raise mastery for {count(row.raise)} {#if here}<kbd>p</kbd>{/if}
              </button>
            {/if}
            {#if row.candidate !== undefined}
              <button type="button" onclick={() => assign(row)}>
                Assign {CREW[row.candidate].name} {#if here}<kbd>Enter</kbd>{/if}
              </button>
            {:else if row.lock === null && row.workers.length === 0}
              <button type="button" disabled>No free crew</button>
            {/if}
          </span>
        </div>
      </div>
    {/snippet}
    {#snippet empty()}
      Nothing to do here yet: other departments' levels and builds open its jobs.
    {/snippet}
  </List>

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
  li,
  .row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .beds li {
    padding: var(--space-3);
    border: var(--border);
  }
  .owned li {
    flex-direction: row;
    justify-content: space-between;
  }
  .dim {
    color: var(--subtle);
  }
  .about,
  .how {
    margin: 0;
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
