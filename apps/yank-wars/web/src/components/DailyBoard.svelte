<!-- The daily's board on the result card: sends a locked-in run, then shows the top ten and your rank. -->
<script lang="ts">
import { duration, Field, resource, Status } from "@sammysul/lsel";
import type { DayBoard } from "@sammysul/lsel/daily";
import { LIMITS } from "@yank-wars/engine";
import { untrack } from "svelte";
import { account } from "../lib/account.svelte.ts";
import { type Daily, fetchBoard, sendRun, streakOf } from "../lib/daily.ts";
import type { RoundController } from "../lib/round.svelte.ts";

let { daily, ctl }: { daily: Daily; ctl: RoundController } = $props();

// the card is made once the round is over, so none of this changes while it shows
const { prefs } = untrack(() => ctl);
const day = untrack(() => daily.day);
const locked = untrack(() => ctl.phase === "locked");
const claim = untrack(() => ({ day, log: [...ctl.round.log], ms: Math.round(ctl.elapsed) }));
let name = $state(untrack(() => prefs.name));
// a locked-in run goes on the board once; every later load only reads it
let sent = $state(!locked);

if (locked) prefs.solvedDaily(day);

async function load(signal: AbortSignal): Promise<DayBoard> {
  try {
    if (sent) return await fetchBoard(signal);
    // the first run on the board makes this browser a guest account, unless it's signed in already
    if (!(await account.ensure())) throw new Error("the board could not be reached");
    const board = await sendRun(claim);
    sent = true;
    return board;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new Error(`${locked ? "Not on the board" : "No board"}: ${why}`);
  }
}

// untracked: the account it reads before its first await must not send the run again
const board = resource((signal) => untrack(() => load(signal)));

// the account takes the name, and the board shows it on every run of the player's
async function rename(): Promise<void> {
  const n = name.trim();
  if (n === prefs.name) return;
  prefs.name = n;
  await account.settled();
  await board.reload();
}

const streak = $derived(streakOf(prefs.daily, day));
const rows = $derived(
  board.value === undefined
    ? []
    : [...board.value.top, ...(board.value.you ? [board.value.you] : [])],
);
</script>

<section class="board" aria-label="Today's board">
  <p class="title">
    <strong>Daily #{day}</strong>
    {#if streak > 0}<span class="streak">{streak}-day streak</span>{/if}
  </p>
  {#if board.value !== undefined}
    {#if rows.length === 0}
      <p class="note">No runs yet today.</p>
    {:else}
      <ol>
        {#each rows as e (e.rank)}
          <li class:you={e.you}>
            <span class="rank">{e.rank}</span>
            <span class="name">{e.name}{e.you ? " (you)" : ""}</span>
            <span class="num">{e.score} keys</span>
            <span class="num">{duration(e.ms, "m:ss.t")}</span>
          </li>
        {/each}
      </ol>
      <p class="note">
        {board.value.players}
        {board.value.players === 1 ? "player" : "players"} today · a new puzzle at midnight UTC
      </p>
    {/if}
  {/if}
  <Status of={board} waiting={sent ? "Asking for today's board…" : "Checking your run…"} retry={false} />
  {#if locked}
    <div class="rename">
      <Field label="Name on the board">
        {#snippet children(control)}
          <input
            {...control}
            bind:value={name}
            maxlength={LIMITS.nameLength}
            placeholder="anonymous"
            spellcheck="false"
            autocomplete="off"
            onchange={() => void rename()}
          />
        {/snippet}
      </Field>
    </div>
  {/if}
</section>

<style>
  .board {
    margin: var(--space-3) 0;
    padding: var(--space-3);
    border: var(--border);
  }
  .title {
    display: flex;
    justify-content: space-between;
    margin: 0 0 var(--space-2);
  }
  .streak {
    color: var(--success);
    font-size: var(--text-xs);
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: 2em 1fr 6em 5em;
    gap: var(--space-2);
    font-variant-numeric: tabular-nums;
  }
  .you {
    font-weight: 700;
  }
  .rank,
  .num {
    text-align: right;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    margin: var(--space-2) 0 0;
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .rename {
    margin-top: var(--space-2);
  }
</style>
