<script lang="ts">
import { Action, keys, Page } from "@sammysul/lsel";
import { DIFFICULTIES, type Difficulty, LIMITS } from "@yank-wars/engine";
import { version } from "../../../package.json";
import { prefs } from "../lib/prefs.svelte.ts";
import type { RoomClient } from "../lib/room.svelte.ts";

let { room, onLeave }: { room: RoomClient; onLeave(): void } = $props();

const view = $derived(room.view);
const me = $derived(room.me);
const them = $derived(room.them);
const invite = $derived(`${location.origin}/#/r/${view?.room ?? ""}`);
let name = $state(prefs.name);

function setDifficulty(d: Difficulty | null) {
  room.lobby({ difficulty: d });
}

function rename() {
  const typed = name.trim();
  if (typed === prefs.name) return;
  prefs.name = typed;
  room.lobby({ name: typed });
}

keys(() => [
  {
    key: "Enter",
    label: me?.lobbyReady ? "Not ready" : "Ready",
    hint: true,
    run: (e) => {
      if (!e.repeat) room.lobby({ ready: !me?.lobbyReady });
    },
  },
  {
    key: ["1", "2", "3"],
    label: "Difficulty",
    hint: true,
    run: (e) => setDifficulty(DIFFICULTIES[Number(e.key) - 1] ?? null),
  },
  { key: "0", label: "Any difficulty", hint: true, run: () => setDifficulty(null) },
  { key: "Escape", label: "Leave the room", run: onLeave },
]);
</script>

<Page
  name="Yank Wars"
  sub="A room for two: the same puzzle, fewest keys wins."
  {version}
  source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/yank-wars"
  width={560}
>
  <section class="invite">
    <div class="row">
      <span class="label">Invite link</span>
      <Action
        label="Copy"
        key="c"
        hint
        done="Copied"
        failed="Copy failed"
        run={() => navigator.clipboard.writeText(invite)}
      />
    </div>
    <code class="link">{invite}</code>
  </section>

  <form
    class="name"
    onsubmit={(e) => {
      e.preventDefault();
      rename();
      (document.activeElement as HTMLElement | null)?.blur();
    }}
  >
    <label for="room-name">Your name</label>
    <input
      id="room-name"
      bind:value={name}
      onblur={rename}
      maxlength={LIMITS.nameLength}
      placeholder="anonymous"
      autocomplete="nickname"
      spellcheck="false"
    />
  </form>

  <ul class="players">
    {#each [me, them] as p, i (i)}
      <li class:empty={p === null}>
        {#if p === null}
          Waiting for someone to open the link…
        {:else}
          <span class="who">{p.name}{i === 0 ? " (you)" : ""}</span>
          {#if !p.connected}
            <span class="away">reconnecting…</span>
          {:else}
            <span class="ready" class:on={p.lobbyReady}>{p.lobbyReady ? "ready" : "not ready"}</span>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>

  <div class="chips" role="group" aria-label="Difficulty">
    <button class="chip" aria-pressed={view?.difficulty === null} onclick={() => setDifficulty(null)}
      >Any <kbd>0</kbd></button
    >
    {#each DIFFICULTIES as d, i (d)}
      <button class="chip {d}" aria-pressed={view?.difficulty === d} onclick={() => setDifficulty(d)}
        >{d} <kbd>{i + 1}</kbd></button
      >
    {/each}
  </div>

  {#if view !== null && view.tally[0] + view.tally[1] > 0 && room.seat !== null}
    <p class="tally">
      Series {view.tally[room.seat]}–{view.tally[1 - room.seat]}
    </p>
  {/if}

  <div class="actions">
    <button onclick={() => room.lobby({ ready: !me?.lobbyReady })}
      >{me?.lobbyReady ? "Not ready" : "Ready"} <kbd>Enter</kbd></button
    >
    <button onclick={onLeave}>Leave <kbd>Esc</kbd></button>
  </div>
  <p class="hint">The round starts when both players are ready.</p>
</Page>

<style>
  .invite .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .label,
  label {
    font-size: var(--text-xs);
    color: var(--subtle);
  }
  .link {
    display: block;
    user-select: all;
    overflow-wrap: anywhere;
  }
  .name {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .players {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .players li {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    border: 1px solid var(--overlay);
  }
  .who {
    font-weight: 700;
  }
  .empty,
  .ready,
  .hint {
    color: var(--subtle);
  }
  .ready.on {
    color: var(--success);
  }
  .away {
    color: var(--warning);
  }
  .chips {
    display: flex;
    gap: 6px;
  }
  .chip {
    text-transform: capitalize;
  }
  .chip.easy[aria-pressed="true"] {
    color: var(--success);
  }
  .chip.medium[aria-pressed="true"] {
    color: var(--warning);
  }
  .chip.hard[aria-pressed="true"] {
    color: var(--error);
  }
  .tally {
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .hint {
    margin: 0;
    font-size: var(--text-xs);
  }
</style>
