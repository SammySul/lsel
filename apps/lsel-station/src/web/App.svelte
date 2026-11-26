<!-- The game screen: scene, departments, map, save and help panels. -->
<!-- lsel-allow: not split yet; split it the next time lsel-station is worked on -->
<script lang="ts">
import { clock, count, go, keys, Page, percent, route, when } from "@sammysul/lsel";
import { onDestroy, untrack } from "svelte";
import { version } from "../../package.json";
import { ACTION_IDS, ACTIONS } from "../content/actions.ts";
import { CREW } from "../content/crew.ts";
import { CROP_IDS, CROPS } from "../content/crops.ts";
import { DEPARTMENT_IDS, DEPARTMENTS, type DepartmentId } from "../content/departments.ts";
import { ITEM_IDS, ITEMS, type ItemId } from "../content/items.ts";
import { type SaveDocument, toDocument } from "../save/document.ts";
import { HOME, mapOf } from "../sim/map.ts";
import { departmentLevel, departmentOpen, ownedSectors, room, working } from "../sim/rules.ts";
import { newGame } from "../sim/state.ts";
import { startGame } from "./game.svelte.ts";
import { createSound } from "./sound/sound.svelte.ts";
import { loadSave, writeSave } from "./storage.ts";
import { createSync } from "./sync.svelte.ts";
import Department from "./ui/Department.svelte";
import { span } from "./ui/format.ts";
import { GUIDE } from "./ui/guide.ts";
import MapView from "./ui/MapView.svelte";
import { createNotices } from "./ui/notices.svelte.ts";
import SavePanel from "./ui/SavePanel.svelte";
import Scene from "./ui/Scene.svelte";
import { summaryLines } from "./ui/summary.ts";

let { readOnly }: { readOnly: boolean } = $props();

/** A new game's seed: `?seed=7` in the address picks it, otherwise it is random. */
function pickSeed(): number {
  const asked = new URLSearchParams(location.search).get("seed");
  if (asked !== null && /^\d{1,9}$/.test(asked)) return Number(asked);
  const [random = 0] = crypto.getRandomValues(new Uint32Array(1));
  return random;
}

const loaded = loadSave();
const saved = loaded.kind === "save" ? loaded.doc : null;
const initial = saved?.state ?? newGame(pickSeed());
/** The save this device last wrote, which export and sync send. */
let latest: SaveDocument = saved ?? toDocument(structuredClone(initial), Date.now());
let savedAt = $state<number | null>(saved?.savedAt ?? null);
let replacing = false;

const map = mapOf(initial.seed);
const sound = createSound();
const notices = createNotices(map);

/** Puts another save in this browser and starts over from it. */
function replace(doc: SaveDocument): void {
  // no send of the game being replaced as the page reloads
  replacing = true;
  game.stop();
  writeSave(doc);
  location.reload();
}

const sync = createSync({ latest: () => latest, replace });
const game = startGame({
  state: initial,
  savedAt: saved?.savedAt ?? null,
  readOnly: untrack(() => readOnly),
  hear(event) {
    sound.hear(event);
    notices.hear(event);
  },
  save(state, at) {
    if (replacing) return;
    latest = toDocument(structuredClone(state), at);
    if (writeSave(latest)) savedAt = at;
    sync.saved();
  },
});
if (!untrack(() => readOnly)) void sync.start();
const leave = () => {
  if (!replacing) sync.leave();
};
// added after the game's own pagehide save, so it runs after it
addEventListener("pagehide", leave);
onDestroy(() => {
  removeEventListener("pagehide", leave);
  game.stop();
  sound.stop();
  notices.stop();
});

type View = DepartmentId | "map";

const view: View = $derived(
  route.path === "/map"
    ? "map"
    : (DEPARTMENT_IDS.find((id) => route.path === `/${id}`) ?? "mining"),
);
let sector = $state(HOME);
let guideOpen = $state(false);
let savesOpen = $state(false);

const open = $derived(DEPARTMENT_IDS.filter((id) => departmentOpen(game.snapshot, id)));
/** Every item the selected department takes or makes, and rations, which everyone eats. */
const touched = $derived.by(() => {
  if (view === "map") return new Set<ItemId>(["claim-beacon", "depot-kit", "relay-kit"]);
  const items = new Set<ItemId>(["ration"]);
  for (const id of ACTION_IDS) {
    const { department: of, inputs, result } = ACTIONS[id];
    if (of !== view) continue;
    for (const { item } of inputs) items.add(item);
    if (result.kind === "items") for (const { item } of result.outputs) items.add(item);
    if (result.kind === "loot") for (const { item } of result.table) items.add(item);
  }
  if (view === "hydroponics") {
    for (const id of CROP_IDS) {
      items.add(CROPS[id].item);
      for (const { item } of CROPS[id].cost) items.add(item);
    }
  }
  return items;
});
// the top bar has credits once there are any, then follows the view: what this department works with
const stock = $derived(
  ITEM_IDS.filter(
    (id) => (id === "credits" || touched.has(id)) && game.snapshot.items[id] !== undefined,
  ),
);

// go() sets the view before the address, so the next key press already acts on the new view
const select = (to: View) => go(`/${to}`);

keys(() => [
  ...open.map((id) => ({
    key: DEPARTMENTS[id].key,
    label: DEPARTMENTS[id].name,
    run: () => select(id),
  })),
  { key: "m", label: "Map", run: () => select("map") },
  { key: "o", label: "Saves and sync", run: () => (savesOpen = !savesOpen) },
  { key: "s", label: "Sound on or off", run: sound.toggle },
  { key: "h", label: "How it works, and volume", run: () => (guideOpen = !guideOpen) },
  {
    key: "Escape",
    label: "Back out",
    run: () => {
      guideOpen = false;
      savesOpen = false;
      game.dismissSummary();
    },
  },
]);
</script>

<Page name="Lsel" {version} source="https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/lsel-station" width={1600} fill>
  {#snippet actions()}
    <ul class="stock">
      {#each stock as id (id)}
        <li>
          <span class="dim">{ITEMS[id].name}</span>
          {count(game.snapshot.items[id] ?? 0)}{#if room(game.snapshot, id) === 0}{" "}<span class="note">full</span>{/if}
        </li>
      {/each}
    </ul>
    <span class="saved dim" aria-live="polite">
      {#if readOnly}
        Read only
      {:else if savedAt === null}
        Not saved yet
      {:else}
        Saved {clock(savedAt)}{sync.status.kind === "synced"
          ? ", synced"
          : sync.status.kind === "failed"
            ? ", sync failed"
            : sync.status.kind === "conflict"
              ? ", sync waiting"
              : ""}
      {/if}
    </span>
    <button type="button" aria-pressed={savesOpen} onclick={() => (savesOpen = !savesOpen)}>
      Saves <kbd>o</kbd>
    </button>
    <button type="button" aria-pressed={!sound.settings.muted} onclick={sound.toggle}>
      Sound <kbd>s</kbd>
    </button>
    <button type="button" aria-pressed={guideOpen} onclick={() => (guideOpen = !guideOpen)}>
      Guide <kbd>h</kbd>
    </button>
  {/snippet}

  <div class="game">
    <nav aria-label="Departments">
      {#each open as id (id)}
        <button
          type="button"
          aria-pressed={id === view}
          onclick={() => select(id)}
        >
          <span><kbd>{DEPARTMENTS[id].key}</kbd> {DEPARTMENTS[id].name}</span>
          <span>
            {#if working(game.snapshot, id)}<span class="busy" aria-label="running">•</span>{/if}
            {departmentLevel(game.snapshot, id)}
          </span>
        </button>
      {/each}
      <button type="button" aria-pressed={view === "map"} onclick={() => select("map")}>
        <span><kbd>m</kbd> Map</span>
        <span>{ownedSectors(game.snapshot).length}</span>
      </button>
    </nav>

    <div class="middle">
      {#if readOnly}
        <aside class="panel" aria-label="Read only">
          <p>
            Lsel is open in another tab. This one only shows the game, and takes over when that tab
            closes.
          </p>
        </aside>
      {/if}
      {#if loaded.kind === "unreadable"}
        <aside class="panel" aria-label="Save">
          <p class="note">
            The save in this browser could not be read ({loaded.reason}). It is kept aside, and this
            is a new game.
          </p>
        </aside>
      {/if}
      {#if game.catching !== null}
        {@const { done, total, awayMs } = game.catching}
        <aside class="panel" aria-label="Catching up">
          <p>Catching up on {span(awayMs)} away</p>
          <div
            class="bar"
            role="progressbar"
            aria-label="Catching up"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round((done / total) * 100)}
          >
            <div style:width="{(done / total) * 100}%"></div>
          </div>
        </aside>
      {/if}
      {#if game.summary !== null}
        <aside class="panel lsel-appear" aria-label="While you were away">
          <h2>While you were away</h2>
          <p class="dim">{span(game.summary.awayMs)}</p>
          <ul>
            {#each summaryLines(game.summary, map) as line, i (i)}
              <li>{line}</li>
            {/each}
          </ul>
          <div class="line">
            <span></span>
            <button type="button" onclick={game.dismissSummary}>Done <kbd>Esc</kbd></button>
          </div>
        </aside>
      {/if}
      {#if sync.status.kind === "conflict"}
        {@const { mine, theirs } = sync.status}
        <aside class="panel lsel-appear" aria-label="Choose a save">
          <h2>Two saves</h2>
          <p>This device and the synced save have both moved on. Which one continues?</p>
          <dl>
            <dt>This device</dt>
            <dd>Played {span(mine.playedMs)}, saved {when(mine.savedAt)}</dd>
            <dt>Synced</dt>
            <dd>Played {span(theirs.playedMs)}, saved {when(theirs.savedAt)}</dd>
          </dl>
          <div class="line">
            <button type="button" onclick={sync.useTheirs}>Use the synced one</button>
            <button type="button" onclick={sync.keepMine}>Keep this device's</button>
          </div>
        </aside>
      {/if}
      {#if savesOpen}
        <SavePanel
          latest={() => latest}
          {sync}
          load={(doc) => {
            sync.outOfStep();
            replace(doc);
          }}
        />
      {/if}
      {#if guideOpen}
        <section class="guide lsel-appear" aria-label="Guide">
          <h2>How it works</h2>
          <dl class="terms">
            {#each GUIDE as [term, text] (term)}
              <dt>{term}</dt>
              <dd>{text}</dd>
            {/each}
          </dl>
          <p class="dim"><kbd>?</kbd> lists the keys.</p>
          <h2>Volume</h2>
          <div class="levels">
            {#each ["effects", "ambience"] as const as bus (bus)}
              <label for="level-{bus}">{bus === "effects" ? "Effects" : "Ambience"}</label>
              <input
                id="level-{bus}"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sound.settings[bus]}
                oninput={(event) => sound.setLevel(bus, event.currentTarget.valueAsNumber)}
              />
            {/each}
          </div>
        </section>
      {/if}
      {#if view === "map"}
        <MapView {game} bind:selected={sector} />
      {:else}
        {#key view}
          <Department {game} department={view} />
        {/key}
      {/if}
    </div>

    <Scene {game} view={view === "map" ? "map" : "station"} selected={sector} />

    <div class="notices" aria-live="polite">
      {#each notices.list as notice (notice.id)}
        <p class="lsel-appear">{notice.text}</p>
      {/each}
    </div>
  </div>

  <ul class="crew" aria-label="Crew">
    {#each game.snapshot.crew as id (id)}
      {@const job = game.snapshot.jobs[id]}
      {@const { name, specialty } = CREW[id]}
      <li class="lsel-appear">
        {name}
        <span class="dim">
          {specialty.department === "all"
            ? "everything"
            : DEPARTMENTS[specialty.department].name.toLowerCase()}
          +{percent(specialty.bonus)}{(game.snapshot.fed[id] ?? 0) > 0 ? ", fed" : ""} ›
        </span>
        {#if job === undefined}
          <span class="dim">idle</span>
        {:else}
          {DEPARTMENTS[ACTIONS[job.action].department].name}
        {/if}
      </li>
    {/each}
  </ul>
</Page>

<style>
  .stock,
  .crew {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-5);
  }
  .crew {
    margin-top: var(--space-4);
  }
  .stock {
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--subtle);
  }
  .busy {
    color: var(--accent);
  }
  .game {
    position: relative;
    flex: 1;
    display: grid;
    grid-template-columns: 240px minmax(300px, 400px) minmax(0, 1fr);
    min-height: 0;
    border: var(--border);
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    border-right: var(--border);
  }
  nav button {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    text-align: left;
    font-variant-numeric: tabular-nums;
  }
  .middle {
    border-right: var(--border);
    overflow-y: auto;
  }
  .guide {
    padding: var(--space-4);
    border-bottom: var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  dl,
  .levels {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-2) var(--space-4);
  }
  dd {
    margin: 0;
  }
  .guide h2,
  .guide p {
    margin: 0;
  }
  .terms {
    align-items: baseline;
  }
  .terms dd {
    color: var(--subtle);
  }
  .panel {
    padding: var(--space-4);
    border-bottom: var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .panel p,
  .panel ul {
    margin: 0;
  }
  .panel ul {
    padding-left: var(--space-4);
  }
  .panel .line {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .note {
    color: var(--warning);
  }
  .bar {
    height: var(--space-2);
    background: var(--surface);
  }
  .bar div {
    height: 100%;
    background: var(--accent);
  }
  .notices {
    position: absolute;
    right: var(--space-4);
    bottom: var(--space-4);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
    pointer-events: none;
  }
  .notices p {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--raise);
    border: var(--border);
  }
  @media (max-width: 800px) {
    .game {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 180px auto minmax(0, 1fr);
    }
    .game > :global(.scene) {
      order: -1;
    }
    nav,
    .middle {
      border-right: 0;
      border-top: var(--border);
    }
  }
</style>
