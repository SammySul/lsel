<script lang="ts">
import { List } from "@sammysul/lsel";
import { OWNER_NAMES, REGIONS } from "../../content/factions.ts";
import {
  OUTPOST_MODULE_IDS,
  OUTPOST_MODULES,
  OUTPOST_SLOTS,
  RESPEC_COST,
  SPEC_IDS,
  SPECS,
} from "../../content/outposts.ts";
import { HOME, mapOf, type Sector, type SectorId } from "../../sim/map.ts";
import { claimable, outpostAt, ownerOf } from "../../sim/rules.ts";
import type { Game } from "../game.svelte.ts";
import { stacks } from "./format.ts";

let { game, selected = $bindable() }: { game: Game; selected: SectorId } = $props();

const snapshot = $derived(game.snapshot);
const map = $derived(mapOf(snapshot.seed));
const shown = $derived(map.sectors.filter((sector) => snapshot.revealed.includes(sector.id)));
const beacons = $derived(snapshot.items["claim-beacon"] ?? 0);

// List names rows by string, the game by SectorId
const select = (id: string | undefined) => {
  const found = shown.find((sector) => String(sector.id) === id);
  if (found !== undefined) selected = found.id;
};

const actions = [
  {
    key: "Enter",
    label: "Claim with a beacon",
    run: (sector: Sector) => game.send({ kind: "claim", sector: sector.id }),
  },
];
</script>

<section class="lsel-appear">
  <header>
    <h2>Map</h2>
    <span>{shown.length} of {map.sectors.length} charted</span>
  </header>
  <p class="dim">
    The sectors Survey has charted. Select one to claim it with a beacon or set up its outpost.
  </p>
  <List
    items={shown}
    id={(sector) => String(sector.id)}
    bind:selected={() => String(selected), select}
    label="Sectors"
    {actions}
  >
    {#snippet row(sector, here)}
      {@const owner = ownerOf(snapshot, sector.id)}
      {@const outpost = outpostAt(snapshot, sector.id)}
      <div class="row">
        <div class="line">
          <span>{sector.name}</span>
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
            {OUTPOST_MODULE_IDS.map((m) => `${OUTPOST_MODULES[m].name}: ${OUTPOST_MODULES[m].gives.toLowerCase()}`).join(". ")}.
            Kits come from Construction.
          </p>
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
      </div>
    {/snippet}
    {#snippet empty()}
      Nothing charted yet: Survey charts sectors.
    {/snippet}
  </List>
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
  .row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
