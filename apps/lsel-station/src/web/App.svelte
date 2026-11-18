<script lang="ts">
import { onDestroy } from "svelte";
import { ACTIONS } from "../content/actions.ts";
import { CREW } from "../content/crew.ts";
import { DEPARTMENT_IDS, DEPARTMENTS, type DepartmentId } from "../content/departments.ts";
import { ITEM_IDS, ITEMS } from "../content/items.ts";
import { departmentLevel, departmentOpen } from "../sim/rules.ts";
import { startGame } from "./game.svelte.ts";
import { createSound } from "./sound/sound.svelte.ts";
import Department from "./ui/Department.svelte";
import { count, percent } from "./ui/format.ts";
import { isGameKey } from "./ui/keys.ts";
import { createNotices } from "./ui/notices.svelte.ts";
import Scene from "./ui/Scene.svelte";

const [seed = 0] = crypto.getRandomValues(new Uint32Array(1));
const sound = createSound();
const notices = createNotices();
const game = startGame(seed, (event) => {
  sound.hear(event);
  notices.hear(event);
});
onDestroy(() => {
  game.stop();
  sound.stop();
  notices.stop();
});

/** The department a `#/…` address names, so reload and the back button keep the view. */
const fromHash = () => DEPARTMENT_IDS.find((id) => `#/${id}` === location.hash);

let department: DepartmentId = $state(fromHash() ?? "mining");
let keysOpen = $state(false);

const open = $derived(DEPARTMENT_IDS.filter((id) => departmentOpen(game.snapshot, id)));
const stock = $derived(ITEM_IDS.filter((id) => game.snapshot.items[id] !== undefined).slice(0, 4));
const busy = (id: DepartmentId) =>
  game.snapshot.crew.some((crew) => {
    const job = game.snapshot.jobs[crew];
    return job !== undefined && ACTIONS[job.action].department === id;
  });

/** Shows a department now; the address follows, so the next key press already acts on the new view. */
function select(id: DepartmentId): void {
  department = id;
  location.hash = `/${id}`;
}

function onkeydown(event: KeyboardEvent): void {
  if (!isGameKey(event)) return;
  const picked = open.find((id) => DEPARTMENTS[id].key === event.key);
  if (picked !== undefined) select(picked);
  else if (event.key === "s") sound.toggle();
  else if (event.key === "?") keysOpen = !keysOpen;
  else if (event.key === "Escape") keysOpen = false;
}
</script>

<svelte:window {onkeydown} onhashchange={() => (department = fromHash() ?? department)} />

<main>
  <header>
    <h1>Lsel</h1>
    <ul class="stock">
      {#each stock as id (id)}
        <li><span class="dim">{ITEMS[id].name}</span> {count(game.snapshot.items[id] ?? 0)}</li>
      {/each}
    </ul>
    <button type="button" aria-pressed={!sound.settings.muted} onclick={sound.toggle}>
      Sound <kbd>s</kbd>
    </button>
    <button type="button" aria-pressed={keysOpen} onclick={() => (keysOpen = !keysOpen)}>
      Keys and volume <kbd>?</kbd>
    </button>
  </header>

  <div class="body">
    <nav aria-label="Departments">
      {#each open as id (id)}
        <button
          type="button"
          aria-pressed={id === department}
          onclick={() => select(id)}
        >
          <span><kbd>{DEPARTMENTS[id].key}</kbd> {DEPARTMENTS[id].name}</span>
          <span>
            {#if busy(id)}<span class="busy" aria-label="running">•</span>{/if}
            {departmentLevel(game.snapshot, id)}
          </span>
        </button>
      {/each}
    </nav>

    <div class="middle">
      {#if keysOpen}
        <section class="keys lsel-appear" aria-label="Keys and volume">
          <dl>
            {#each open as id (id)}
              <dt><kbd>{DEPARTMENTS[id].key}</kbd></dt>
              <dd>{DEPARTMENTS[id].name}</dd>
            {/each}
            <dt><kbd>j</kbd> <kbd>k</kbd></dt>
            <dd>Move through the list</dd>
            <dt><kbd>Enter</kbd></dt>
            <dd>Assign whoever is free</dd>
            <dt><kbd>x</kbd></dt>
            <dd>Stop</dd>
            <dt><kbd>p</kbd></dt>
            <dd>Raise mastery from the pool</dd>
            <dt><kbd>s</kbd></dt>
            <dd>Sound on or off</dd>
            <dt><kbd>?</kbd></dt>
            <dd>List the keys</dd>
            <dt><kbd>Esc</kbd></dt>
            <dd>Back out</dd>
          </dl>
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
      {#key department}
        <Department {game} {department} />
      {/key}
    </div>

    <Scene {game} />
  </div>

  <footer>
    {#each game.snapshot.crew as id (id)}
      {@const job = game.snapshot.jobs[id]}
      {@const { name, specialty } = CREW[id]}
      <span class="crew lsel-appear">
        {name}
        <span class="dim">
          {specialty.department === "all"
            ? "everything"
            : DEPARTMENTS[specialty.department].name.toLowerCase()}
          +{percent(specialty.bonus)} ›
        </span>
        {#if job === undefined}
          <span class="dim">idle</span>
        {:else}
          {DEPARTMENTS[ACTIONS[job.action].department].name}
        {/if}
      </span>
    {/each}
  </footer>

  <div class="notices" aria-live="polite">
    {#each notices.list as notice (notice.id)}
      <p class="lsel-appear">{notice.text}</p>
    {/each}
  </div>
</main>

<style>
  main {
    position: relative;
    max-width: 1600px;
    height: calc(100dvh - 2 * var(--space-5));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-5);
    padding: var(--space-3) var(--space-4);
  }
  header {
    border-bottom: var(--border);
  }
  footer {
    border-top: var(--border);
  }
  .stock {
    list-style: none;
    margin: 0 auto 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-5);
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--subtle);
  }
  .busy {
    color: var(--accent);
  }
  .body {
    display: grid;
    grid-template-columns: 240px minmax(300px, 400px) minmax(0, 1fr);
    min-height: 0;
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
  .keys {
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
  .notices {
    position: absolute;
    right: var(--space-4);
    bottom: var(--space-7);
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
  @media (max-width: 600px) {
    main {
      height: calc(100dvh - 2 * var(--space-2));
    }
  }
  @media (max-width: 800px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 180px auto minmax(0, 1fr);
    }
    .body > :global(.scene) {
      order: -1;
    }
    nav,
    .middle {
      border-right: 0;
      border-top: var(--border);
    }
  }
</style>
