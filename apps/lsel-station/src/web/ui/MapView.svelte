<script lang="ts">
import { OWNER_NAMES, REGIONS } from "../../content/factions.ts";
import {
  OUTPOST_MODULE_IDS,
  OUTPOST_MODULES,
  OUTPOST_SLOTS,
  RESPEC_COST,
  SPEC_IDS,
  SPECS,
} from "../../content/outposts.ts";
import { HOME, mapOf, type SectorId } from "../../sim/map.ts";
import { claimable, outpostAt, ownerOf } from "../../sim/rules.ts";
import type { Game } from "../game.svelte.ts";
import { stacks } from "./format.ts";
import { isGameKey } from "./keys.ts";

let { game, selected = $bindable() }: { game: Game; selected: SectorId } = $props();

const snapshot = $derived(game.snapshot);
const map = $derived(mapOf(snapshot.seed));
const shown = $derived(map.sectors.filter((sector) => snapshot.revealed.includes(sector.id)));
const beacons = $derived(snapshot.items["claim-beacon"] ?? 0);

function move(by: number): void {
  const at = shown.findIndex((sector) => sector.id === selected);
  const next = shown[Math.min(Math.max(at + by, 0), shown.length - 1)];
  if (next !== undefined) selected = next.id;
}

function onkeydown(event: KeyboardEvent): void {
  if (!isGameKey(event)) return;
  if (event.key === "j") move(1);
  else if (event.key === "k") move(-1);
  // on a focused button Enter already presses it
  else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
    game.send({ kind: "claim", sector: selected });
  }
}
</script>

<svelte:window {onkeydown} />

<section class="lsel-appear">
  <header>
    <h2>Map</h2>
    <span>{shown.length} of {map.sectors.length} charted</span>
  </header>
  <ul>
    {#each shown as sector (sector.id)}
      {@const here = sector.id === selected}
      {@const owner = ownerOf(snapshot, sector.id)}
      {@const outpost = outpostAt(snapshot, sector.id)}
      <li class:selected={here} aria-current={here}>
        <div class="line">
          <button type="button" aria-pressed={here} onclick={() => (selected = sector.id)}>
            {sector.name}
          </button>
          <span class="dim">{REGIONS[sector.tier - 1]?.name}, {OWNER_NAMES[owner].toLowerCase()}</span>
        </div>

        {#if here && sector.id === HOME}
          <p class="dim">Your station.</p>
        {:else if here && claimable(snapshot, sector.id)}
          <div class="line">
            <span class="note">{beacons === 0 ? "Needs a claim beacon from Construction" : ""}</span>
            <button
              type="button"
              disabled={beacons === 0}
              onclick={() => game.send({ kind: "claim", sector: sector.id })}
            >
              Claim with a beacon <kbd>Enter</kbd>
            </button>
          </div>
        {:else if here && outpost !== undefined}
          <div class="choices" role="group" aria-label="Outpost">
            {#each SPEC_IDS as spec (spec)}
              <button
                type="button"
                aria-pressed={outpost.spec === spec}
                onclick={() => game.send({ kind: "specialize", sector: sector.id, spec })}
              >
                {SPECS[spec].name}
              </button>
            {/each}
          </div>
          <p class="dim">
            {outpost.spec === null
              ? "Pick what this outpost does. The first choice is free."
              : `${SPECS[outpost.spec].gives}. A change costs ${stacks(RESPEC_COST)}.`}
          </p>
          <div class="choices" role="group" aria-label="Add-ons">
            {#each OUTPOST_MODULE_IDS as module (module)}
              {@const kits = snapshot.items[OUTPOST_MODULES[module].kit] ?? 0}
              <button
                type="button"
                disabled={kits === 0 || outpost.modules.length >= OUTPOST_SLOTS}
                onclick={() => game.send({ kind: "install", sector: sector.id, module })}
              >
                Install a {OUTPOST_MODULES[module].name.toLowerCase()} ({kits})
              </button>
            {/each}
          </div>
          <p class="dim">
            {outpost.modules.length} of {OUTPOST_SLOTS} add-ons{outpost.modules.length > 0
              ? `: ${outpost.modules.map((m) => OUTPOST_MODULES[m].name.toLowerCase()).join(", ")}`
              : ""}
          </p>
        {:else if here && (owner === "pirates" || owner === "strays")}
          <p class="note">Held by {OWNER_NAMES[owner].toLowerCase()}. Taking it needs a fleet.</p>
        {:else if here && owner !== "you" && owner !== "none"}
          <p class="dim">Held by {OWNER_NAMES[owner]}. Its market is open to Trade.</p>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  section {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  header,
  .line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
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
  p {
    margin: 0;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .dim {
    color: var(--subtle);
  }
  .note {
    color: var(--warning);
  }
</style>
