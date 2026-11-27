<!-- The daily's board on the result card: sends a locked-in run, then shows the top ten and your rank. -->
<script lang="ts">
import { duration } from "@sammysul/lsel";
import { LIMITS } from "@yank-wars/engine";
import { untrack } from "svelte";
import { account } from "../lib/account.svelte.ts";
import { type BoardAnswer, type Daily, fetchBoard, sendRun, streakOf } from "../lib/daily.ts";
import type { RoundController } from "../lib/round.svelte.ts";

let { daily, ctl }: { daily: Daily; ctl: RoundController } = $props();

// the card is made once the round is over, so none of this changes while it shows
const { prefs } = untrack(() => ctl);
const day = untrack(() => daily.day);
const locked = untrack(() => ctl.phase === "locked");
let answer = $state<BoardAnswer | undefined>();
let name = $state(untrack(() => prefs.name));

// the first run on the board makes this browser a guest account, unless it's signed in already
async function send(): Promise<void> {
  if (!(await account.ensure())) {
    answer = { ok: false, error: "the board is unreachable" };
    return;
  }
  answer = await sendRun({ day, log: [...ctl.round.log], ms: Math.round(ctl.elapsed) });
}

if (locked) {
  prefs.solvedDaily(day);
  void send();
} else {
  void fetchBoard().then((a) => {
    answer = a;
  });
}

// the account takes the name, and the board shows it on every run of the player's
async function rename(): Promise<void> {
  const n = name.trim();
  if (n === prefs.name) return;
  prefs.name = n;
  if (!locked) return;
  answer = undefined;
  await account.settled();
  answer = await fetchBoard();
}

const streak = $derived(streakOf(prefs.daily, day));
const rows = $derived(
  answer?.ok === true ? [...answer.board.top, ...(answer.board.you ? [answer.board.you] : [])] : [],
);
</script>

<section class="board" aria-label="Today's board">
  <p class="title">
    <strong>Daily #{day}</strong>
    {#if streak > 0}<span class="streak">{streak}-day streak</span>{/if}
  </p>
  {#if answer === undefined}
    <p class="note">{locked ? "Checking your run…" : "Loading today's board…"}</p>
  {:else if !answer.ok}
    <p class="note error">{locked ? "Not on the board" : "No board"}: {answer.error}.</p>
  {:else if rows.length === 0}
    <p class="note">No runs yet today.</p>
  {:else}
    <ol>
      {#each rows as e (e.rank)}
        <li class:you={e.you}>
          <span class="rank">{e.rank}</span>
          <span class="name">{e.name}{e.you ? " (you)" : ""}</span>
          <span class="num">{e.keys} keys</span>
          <span class="num">{duration(e.ms, "m:ss.t")}</span>
        </li>
      {/each}
    </ol>
    <p class="note">
      {answer.board.players}
      {answer.board.players === 1 ? "player" : "players"} today · a new puzzle at midnight UTC
    </p>
  {/if}
  {#if locked}
    <label class="rename">
      Name on the board
      <input
        bind:value={name}
        maxlength={LIMITS.nameLength}
        placeholder="anonymous"
        spellcheck="false"
        autocomplete="off"
        onchange={() => void rename()}
      />
    </label>
  {/if}
</section>

<style>
  .board {
    margin: 12px 0;
    padding: 12px;
    border: var(--border);
  }
  .title {
    display: flex;
    justify-content: space-between;
    margin: 0 0 8px;
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
    gap: 8px;
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
    margin: 8px 0 0;
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .error {
    color: var(--warning);
  }
  .rename {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
    color: var(--subtle);
    font-size: var(--text-xs);
  }
  .rename input {
    flex: 1;
  }
</style>
