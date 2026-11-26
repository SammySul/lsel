<!-- A room's page: connects to it and shows the lobby, the round or the result. -->
<script lang="ts">
import { go, keys, Page, route } from "@sammysul/lsel";
import { onDestroy, untrack } from "svelte";
import { version } from "../../../package.json";
import { prefs } from "../lib/prefs.svelte.ts";
import { findPuzzle } from "../lib/puzzles.ts";
import { RoomClient } from "../lib/room.svelte.ts";
import Lobby from "./Lobby.svelte";
import RoomResult from "./RoomResult.svelte";
import Round from "./Round.svelte";

let { id }: { id: string | undefined } = $props();

function seats() {
  try {
    // lsel-allow: a seat token is per tab, so a reload keeps the seat and another tab gets its own
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

const room = untrack(
  () =>
    new RoomClient(id, {
      connect: () =>
        new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`),
      prefs,
      puzzle: findPuzzle,
      clock: () => performance.now(),
      seats: seats(),
      onRoom: (rid) => {
        history.replaceState(null, "", `#/r/${rid}`);
        route.path = `/r/${rid}`;
      },
      reload: () => location.reload(),
    }),
);
onDestroy(() => room.leave());

function leave() {
  room.leave();
  go("/");
}

const view = $derived(room.view);
const gone = $derived(room.connection.kind === "gone" ? room.connection.message : null);

keys(() => (gone === null ? [] : [{ key: "Escape", label: "Puzzles", hint: true, run: leave }]));
</script>

{#if gone !== null || view === null}
  <Page
    name="Yank Wars"
    sub="A room for two."
    {version}
    source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/yank-wars"
    width={560}
  >
    {#if gone !== null}
      <p class="gone" role="alert">{gone}</p>
      <p><a href="#/" onclick={leave}>Back to the puzzles</a></p>
    {:else}
      <p class="joining" role="status">{id === undefined ? "Opening a room…" : "Joining the room…"}</p>
    {/if}
  </Page>
{:else if view.phase === "lobby"}
  <Lobby {room} onLeave={leave} />
{:else if room.ctl !== null}
  {#key view.round}
    <Round ctl={room.ctl} {room} onList={leave} />
  {/key}
{:else}
  <div class="alone"><RoomResult {room} onLeave={leave} /></div>
{/if}

{#if room.connection.kind === "reconnecting"}
  <p class="reconnecting" role="status">Reconnecting…</p>
{/if}

<style>
  .gone {
    color: var(--warning);
  }
  .joining {
    color: var(--subtle);
  }
  .alone {
    position: relative;
    height: 100%;
  }
  .reconnecting {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 6px 14px;
    background: var(--raise);
    border: 1px solid var(--warning);
    color: var(--warning);
  }
</style>
