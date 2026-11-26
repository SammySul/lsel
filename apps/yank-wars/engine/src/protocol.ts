// The room protocol: JSON text frames on /ws. The server parses every client frame with `parseClientFrame`.
import * as v from "valibot";
import { isVimKey } from "./keys.ts";
import { type LogEntry, RESET } from "./log.ts";
import { DIFFICULTIES, type Difficulty } from "./puzzle.ts";

export const PROTOCOL = 1;

export const LIMITS = {
  frameBytes: 16_384,
  logEntries: 5_000,
  nameLength: 24,
  framesPerSecond: 60,
} as const;

const Entry = v.custom<LogEntry>(
  (e) => typeof e === "string" && (e === RESET || isVimKey(e)),
  "not a key or reset marker",
);
const Round = v.pipe(v.number(), v.integer(), v.minValue(1));
const Index = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(LIMITS.logEntries));
const RoomId = v.pipe(v.string(), v.regex(/^[a-z2-7]{10}$/, "not a room id"));
const SeatToken = v.pipe(v.string(), v.regex(/^[0-9a-f]{32}$/, "not a seat token"));

const frame = <T extends string, E extends v.ObjectEntries>(t: T, entries: E) =>
  v.strictObject({ v: v.literal(PROTOCOL), t: v.literal(t), ...entries });

const ClientFrame = v.variant("t", [
  frame("hello", {
    room: v.optional(RoomId),
    seat: v.optional(SeatToken),
    name: v.pipe(v.string(), v.trim(), v.maxLength(LIMITS.nameLength)),
  }),
  frame("lobby", {
    ready: v.boolean(),
    difficulty: v.optional(v.nullable(v.picklist(DIFFICULTIES))),
  }),
  frame("ready", {}),
  frame("keys", {
    round: Round,
    from: Index,
    entries: v.pipe(v.array(Entry), v.maxLength(LIMITS.logEntries)),
  }),
  frame("claim", { round: Round, length: Index, doc: v.pipe(v.string(), v.maxLength(4_000)) }),
  frame("forfeit", { round: Round }),
  frame("rematch", {}),
]);

export type ClientFrame = v.InferOutput<typeof ClientFrame>;

/** A client frame, or why it is not one; a frame from another protocol version is `stale`. */
export function parseClientFrame(
  text: string,
): { ok: true; frame: ClientFrame } | { ok: false; stale: boolean; error: string } {
  if (text.length > LIMITS.frameBytes) return { ok: false, stale: false, error: "frame too large" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, stale: false, error: "not JSON" };
  }
  if (typeof data === "object" && data !== null && "v" in data && data.v !== PROTOCOL) {
    return { ok: false, stale: true, error: `protocol ${String(data.v)}, expected ${PROTOCOL}` };
  }
  const r = v.safeParse(ClientFrame, data);
  if (r.success) return { ok: true, frame: r.output };
  const issue = r.issues[0];
  return {
    ok: false,
    stale: false,
    error: `${v.getDotPath(issue) ?? "frame"}: ${issue.message}`,
  };
}

export type Seat = 0 | 1;
export type PlayerStatus = "waiting" | "playing" | "claiming" | "locked" | "forfeited";
export type RoomPhase = "lobby" | "study" | "playing" | "results";

export interface PlayerView {
  name: string;
  connected: boolean;
  lobbyReady: boolean;
  rematch: boolean;
  status: PlayerStatus;
  score: number;
  runs: number;
  /** ms from the round's start, once locked in */
  lockedAfter: number | null;
}

export interface RoundResult {
  round: number;
  puzzleId: string;
  /** null: a draw */
  winner: Seat | null;
}

export interface RoomView {
  room: string;
  phase: RoomPhase;
  round: number;
  puzzleId: string | null;
  difficulty: Difficulty | null;
  players: [PlayerView | null, PlayerView | null];
  tally: [number, number];
  /** ms left in the study window or the round (the cap, or grace once it runs) */
  phaseLeft: number | null;
  graceLeft: number | null;
  last: RoundResult | null;
}

export type ServerFrame =
  | { t: "welcome"; seat: Seat; token: string; state: RoomView; log: LogEntry[] }
  | { t: "state"; state: RoomView }
  | { t: "verdict"; round: number; ok: true; score: number }
  | { t: "verdict"; round: number; ok: false; reason: "mismatch" | "too slow" | "out of sync" }
  | { t: "error"; code: "room full" | "no such room" | "bad frame"; message: string }
  | { t: "reload" };
