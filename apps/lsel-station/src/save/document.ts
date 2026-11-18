import * as v from "valibot";
import { ACTION_IDS } from "../content/actions.ts";
import { CREW_IDS } from "../content/crew.ts";
import { CROP_IDS } from "../content/crops.ts";
import { DEPARTMENT_IDS } from "../content/departments.ts";
import { ITEM_IDS } from "../content/items.ts";
import { MODULE_IDS } from "../content/modules.ts";
import { OUTPOST_MODULE_IDS, SPEC_IDS } from "../content/outposts.ts";
import { UNLOCK_IDS } from "../content/unlocks.ts";
import { mapOf, type SectorId } from "../sim/map.ts";
import type { GameState } from "../sim/state.ts";
import { TICK_MS } from "../sim/tick.ts";

/** The save format's version. A change to GameState bumps it and adds a step to MIGRATIONS. */
export const SAVE_VERSION = 1;

/** Saves larger than this are refused, here and by the sync service. */
export const MAX_SAVE_BYTES = 64 * 1024;

const PREFIX = "lsel-station:";

const amount = v.pipe(v.number(), v.finite(), v.minValue(0));
const whole = v.pipe(v.number(), v.integer(), v.minValue(0));
const sector = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  // every map has the same number of sectors, so any seed's will do
  v.maxValue(mapOf(0).sectors.length - 1),
  v.transform((n) => n as SectorId),
);

const State = v.pipe(
  v.object({
    seed: v.pipe(whole, v.maxValue(0xffffffff)),
    rng: v.pipe(v.number(), v.integer()),
    ticks: whole,
    items: v.record(v.picklist(ITEM_IDS), amount),
    xp: v.record(v.picklist(DEPARTMENT_IDS), amount),
    mastery: v.record(v.picklist(ACTION_IDS), amount),
    pool: v.record(v.picklist(DEPARTMENT_IDS), amount),
    modules: v.record(v.picklist(MODULE_IDS), v.pipe(whole, v.maxValue(5))),
    unlocks: v.array(v.picklist(UNLOCK_IDS)),
    crew: v.pipe(v.array(v.picklist(CREW_IDS)), v.minLength(1)),
    jobs: v.record(
      v.picklist(CREW_IDS),
      v.object({
        action: v.picklist(ACTION_IDS),
        progressMs: amount,
        phase: v.picklist(["new", "working", "waiting"]),
      }),
    ),
    projects: v.record(v.picklist(ACTION_IDS), amount),
    beds: v.array(v.nullable(v.object({ crop: v.picklist(CROP_IDS), progressMs: amount }))),
    fed: v.record(v.picklist(CREW_IDS), whole),
    revealed: v.array(sector),
    owned: v.array(sector),
    outposts: v.record(
      v.pipe(v.string(), v.regex(/^\d{1,2}$/)),
      v.object({
        spec: v.nullable(v.picklist(SPEC_IDS)),
        modules: v.array(v.picklist(OUTPOST_MODULE_IDS)),
        stored: amount,
      }),
    ),
    glut: v.record(v.picklist(ACTION_IDS), amount),
  }),
  v.check(
    (state) => Object.keys(state.jobs).every((crew) => state.crew.some((c) => c === crew)),
    "a job belongs to someone not on the roster",
  ),
  v.check(
    (state) => state.owned.every((id) => state.revealed.includes(id)),
    "a sector is owned but not on the map",
  ),
);

const Document = v.object({
  game: v.literal("lsel-station"),
  version: v.literal(SAVE_VERSION),
  /** When it was saved, in ms since 1970: the game catches up from here. */
  savedAt: whole,
  state: State,
});

export type SaveDocument = {
  game: "lsel-station";
  version: number;
  savedAt: number;
  state: GameState;
};

/** One step per version: MIGRATIONS[n] turns a version n document into version n + 1. */
const MIGRATIONS: Readonly<
  Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>
> = {};

export function toDocument(state: GameState, savedAt: number): SaveDocument {
  return { game: "lsel-station", version: SAVE_VERSION, savedAt, state };
}

/** How long a save has been played, from its ticks. */
export const playedMs = (doc: SaveDocument) => doc.state.ticks * TICK_MS;

export type Parsed = { ok: true; doc: SaveDocument } | { ok: false; reason: string };

/** Reads a document from anywhere outside the game: storage, an import, the sync service. */
export function parseDocument(input: unknown): Parsed {
  let doc = input;
  if (typeof doc === "object" && doc !== null && "version" in doc) {
    for (
      let version = doc.version;
      typeof version === "number" && version < SAVE_VERSION;
      version++
    ) {
      const step = MIGRATIONS[version];
      if (step === undefined) return { ok: false, reason: `no way to read version ${version}` };
      doc = { ...step(doc as Record<string, unknown>), version: version + 1 };
    }
  }
  const parsed = v.safeParse(Document, doc);
  if (!parsed.success) {
    const first = parsed.issues[0];
    const where = (first === undefined ? null : v.getDotPath(first)) ?? "";
    if (first?.received === "undefined" && where !== "")
      return { ok: false, reason: `${where} is missing` };
    return {
      ok: false,
      reason: `${where === "" ? "" : `${where}: `}${first?.message ?? "unreadable"}`,
    };
  }
  const { state, ...rest } = parsed.output;
  return { ok: true, doc: { ...rest, state } };
}

/** A save as one line of text, to copy elsewhere. */
export function exportString(doc: SaveDocument): string {
  return `${PREFIX}${btoa(JSON.stringify(doc))}`;
}

/** Reads a save that was exported as text. */
export function importString(text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed.length > MAX_SAVE_BYTES * 2) return { ok: false, reason: "too long to be a save" };
  if (!trimmed.startsWith(PREFIX)) return { ok: false, reason: "not a Lsel save" };
  let json: unknown;
  try {
    json = JSON.parse(atob(trimmed.slice(PREFIX.length)));
  } catch {
    return { ok: false, reason: "the text is damaged" };
  }
  return parseDocument(json);
}
