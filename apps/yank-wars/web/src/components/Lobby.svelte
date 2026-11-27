<!-- A room before a round: invite link, names and ready. -->
<script lang="ts">
import { Action, Field, keys, Page, Swap } from "@sammysul/lsel";
import { LIMITS } from "@yank-wars/engine";
import { PAGE } from "../lib/page.ts";
import { prefs } from "../lib/prefs.svelte.ts";
import type { RoomClient } from "../lib/room.svelte.ts";

let { room, onLeave }: { room: RoomClient; onLeave(): void } = $props();

const view = $derived(room.view);
const me = $derived(room.me);
const them = $derived(room.them);
const invite = $derived(`${location.origin}/#/r/${view?.room ?? ""}`);
let name = $state(prefs.name);

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
  { key: "Escape", label: "Leave the room", run: onLeave },
]);
</script>

<Page {...PAGE} sub="A room for two: the same puzzle, fewest keys wins." width={560}>
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
    onsubmit={(e) => {
      e.preventDefault();
      rename();
      (document.activeElement as HTMLElement | null)?.blur();
    }}
  >
    <Field label="Your name">
      {#snippet children(control)}
        <input
          {...control}
          bind:value={name}
          onblur={rename}
          maxlength={LIMITS.nameLength}
          placeholder="anonymous"
          autocomplete="nickname"
          spellcheck="false"
        />
      {/snippet}
    </Field>
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

  {#if view !== null && view.tally[0] + view.tally[1] > 0 && room.seat !== null}
    <p class="tally">
      Series {view.tally[room.seat]}–{view.tally[1 - room.seat]}
    </p>
  {/if}

  <div class="actions">
    <button onclick={() => room.lobby({ ready: !me?.lobbyReady })}
      ><Swap text={me?.lobbyReady ? "Not ready" : "Ready"} options={["Ready", "Not ready"]} />
      <kbd>Enter</kbd></button
    >
    <button onclick={onLeave}>Leave <kbd>Esc</kbd></button>
  </div>
  <p class="hint">
    The round starts when both players are ready, on a random puzzle: mostly easy and medium.
  </p>
</Page>

<style>
  .invite .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-1);
  }
  .label {
    font-size: var(--text-xs);
    color: var(--subtle);
  }
  .link {
    display: block;
    user-select: all;
    overflow-wrap: anywhere;
  }
  .players {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .players li {
    display: flex;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border: var(--border);
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
  .tally {
    margin: 0;
  }
  .actions {
    display: flex;
    gap: var(--space-2);
  }
  .hint {
    margin: 0;
    font-size: var(--text-xs);
  }
</style>
