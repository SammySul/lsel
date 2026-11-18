<script lang="ts">
import { onDestroy } from "svelte";
import { ACTIONS } from "../content/actions.ts";
import { CREW, CREW_IDS } from "../content/crew.ts";
import { DEPARTMENT_IDS, DEPARTMENTS, type DepartmentId } from "../content/departments.ts";
import { ITEM_IDS, ITEMS } from "../content/items.ts";
import { levelOf } from "../sim/levels.ts";
import { startGame } from "./game.svelte.ts";
import { createSound } from "./sound/sound.svelte.ts";
import Department from "./ui/Department.svelte";
import { count } from "./ui/format.ts";
import { isGameKey } from "./ui/keys.ts";
import Scene from "./ui/Scene.svelte";

const [seed = 0] = crypto.getRandomValues(new Uint32Array(1));
const sound = createSound();
const game = startGame(seed, sound.hear);
onDestroy(() => {
  game.stop();
  sound.stop();
});

let department: DepartmentId = $state("mining");
let keysOpen = $state(false);

function onkeydown(event: KeyboardEvent): void {
  if (!isGameKey(event)) return;
  const picked = DEPARTMENT_IDS.find((id) => DEPARTMENTS[id].key === event.key);
  if (picked !== undefined) department = picked;
  else if (event.key === "s") sound.toggle();
  else if (event.key === "?") keysOpen = !keysOpen;
  else if (event.key === "Escape") keysOpen = false;
}
</script>

<svelte:window {onkeydown} />

<main>
  <header>
    <h1>Lsel</h1>
    <ul class="stock">
      {#each ITEM_IDS as id (id)}
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
      {#each DEPARTMENT_IDS as id (id)}
        <button type="button" aria-pressed={id === department} onclick={() => (department = id)}>
          <span><kbd>{DEPARTMENTS[id].key}</kbd> {DEPARTMENTS[id].name}</span>
          <span>{levelOf(game.snapshot.xp[id] ?? 0)}</span>
        </button>
      {/each}
    </nav>

    <div class="middle">
      {#if keysOpen}
        <section class="keys lsel-appear" aria-label="Keys and volume">
          <dl>
            {#each DEPARTMENT_IDS as id (id)}
              <dt><kbd>{DEPARTMENTS[id].key}</kbd></dt>
              <dd>{DEPARTMENTS[id].name}</dd>
            {/each}
            <dt><kbd>j</kbd> <kbd>k</kbd></dt>
            <dd>Move through the list</dd>
            <dt><kbd>Enter</kbd></dt>
            <dd>Assign or stop</dd>
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
    {#each CREW_IDS as id (id)}
      {@const job = game.snapshot.jobs[id]}
      <span>
        {CREW[id].name}
        <span class="dim">›</span>
        {#if job === undefined}
          <span class="dim">idle</span>
        {:else}
          {DEPARTMENTS[ACTIONS[job.action].department].name}
        {/if}
      </span>
    {/each}
  </footer>
</main>

<style>
  main {
    max-width: 1600px;
    height: calc(100dvh - 2 * var(--space-5));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    gap: var(--space-5);
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
    gap: var(--space-5);
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--subtle);
  }
  .body {
    display: grid;
    grid-template-columns: 200px minmax(280px, 380px) minmax(0, 1fr);
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
