// A room's rules as a pure reducer: the shell (rooms.ts) owns sockets, timers and the replay worker.
import {
  type Difficulty,
  LIMITS,
  type LogEntry,
  type PlayerStatus,
  type PlayerView,
  RESET,
  ROUND,
  type RoomPhase,
  type RoomView,
  type RoundResult,
  type Seat,
  scoreOf,
} from "@yank-wars/engine";

export const RULES = {
  studyMs: ROUND.studyMs,
  capMs: ROUND.capMs,
  graceShare: 0.3,
  graceMinMs: 10_000,
  graceMaxMs: 60_000,
  reconnectMs: 15_000,
} as const;

export interface Player {
  name: string;
  connected: boolean;
  droppedAt: number | null;
  lobbyReady: boolean;
  studyReady: boolean;
  rematch: boolean;
  status: PlayerStatus;
  log: LogEntry[];
  claimedAt: number | null;
  lockedAt: number | null;
  /** the verified score, once locked in */
  score: number | null;
}

export interface Room {
  id: string;
  phase: RoomPhase;
  difficulty: Difficulty | null;
  round: number;
  puzzleId: string | null;
  played: readonly string[];
  players: readonly [Player | null, Player | null];
  studyEndsAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  graceEndsAt: number | null;
  tally: readonly [number, number];
  last: RoundResult | null;
}

export type RoomEvent =
  | { type: "join"; seat: Seat; name: string }
  | { type: "rejoin"; seat: Seat }
  | { type: "drop"; seat: Seat }
  | { type: "lobby"; seat: Seat; ready: boolean; difficulty?: Difficulty | null | undefined }
  | { type: "ready"; seat: Seat }
  | { type: "keys"; seat: Seat; round: number; from: number; entries: readonly LogEntry[] }
  | { type: "claim"; seat: Seat; round: number; length: number }
  | { type: "verdict"; seat: Seat; round: number; ok: true; score: number }
  | { type: "verdict"; seat: Seat; round: number; ok: false }
  | { type: "forfeit"; seat: Seat; round: number }
  | { type: "rematch"; seat: Seat }
  | { type: "tick" };

export type Effect =
  | { type: "verify"; seat: Seat; round: number; puzzleId: string; log: LogEntry[] }
  | { type: "refuse"; seat: Seat; round: number; reason: "out of sync" };

/** The next puzzle for a round: one not in `played` at `difficulty` (null: any), or any if none is left. */
export type Pick = (difficulty: Difficulty | null, played: readonly string[]) => string;

export function createRoom(id: string): Room {
  return {
    id,
    phase: "lobby",
    difficulty: "easy",
    round: 0,
    puzzleId: null,
    played: [],
    players: [null, null],
    studyEndsAt: null,
    startedAt: null,
    endsAt: null,
    graceEndsAt: null,
    tally: [0, 0],
    last: null,
  };
}

const SEATS: readonly Seat[] = [0, 1];

function newPlayer(name: string): Player {
  return {
    name,
    connected: true,
    droppedAt: null,
    lobbyReady: false,
    studyReady: false,
    rematch: false,
    status: "waiting",
    log: [],
    claimedAt: null,
    lockedAt: null,
    score: null,
  };
}

function withPlayer(room: Room, seat: Seat, p: Player | null): Room {
  const players: [Player | null, Player | null] = [room.players[0], room.players[1]];
  players[seat] = p;
  return { ...room, players };
}

function update(room: Room, seat: Seat, f: (p: Player) => Player): Room {
  const p = room.players[seat];
  return p === null ? room : withPlayer(room, seat, f(p));
}

const both = (room: Room, f: (p: Player) => boolean) =>
  room.players.every((p) => p !== null && f(p));

/** When the round stops taking keys and claims: the cap, or grace once it runs. */
export function deadline(room: Room): number | null {
  if (room.endsAt === null) return null;
  return room.graceEndsAt === null ? room.endsAt : Math.min(room.endsAt, room.graceEndsAt);
}

function startRound(room: Room, now: number, pick: Pick): Room {
  const puzzleId = pick(room.difficulty, room.played);
  const fresh = (p: Player | null): Player | null =>
    p === null
      ? null
      : { ...newPlayer(p.name), connected: p.connected, droppedAt: p.droppedAt, status: "playing" };
  return {
    ...room,
    phase: "study",
    round: room.round + 1,
    puzzleId,
    players: [fresh(room.players[0]), fresh(room.players[1])],
    studyEndsAt: now + RULES.studyMs,
    startedAt: null,
    endsAt: null,
    graceEndsAt: null,
  };
}

function startPlaying(room: Room, at: number): Room {
  return { ...room, phase: "playing", startedAt: at, endsAt: at + RULES.capMs };
}

function graceEnd(room: Room): number | null {
  const first = Math.min(
    ...room.players.map((p) =>
      p?.status === "locked" && p.lockedAt !== null ? p.lockedAt : Infinity,
    ),
  );
  if (first === Infinity || room.startedAt === null || room.endsAt === null) return null;
  const grace = Math.min(
    RULES.graceMaxMs,
    Math.max(RULES.graceMinMs, RULES.graceShare * (first - room.startedAt)),
  );
  return Math.min(room.endsAt, first + grace);
}

function winnerOf(room: Room): Seat | null {
  const locked = SEATS.filter((s) => room.players[s]?.status === "locked");
  if (locked.length < 2) return locked[0] ?? null;
  const [a, b] = room.players as [Player, Player];
  const byScore = (a.score ?? 0) - (b.score ?? 0);
  const byTime = (a.lockedAt ?? 0) - (b.lockedAt ?? 0);
  const order = byScore !== 0 ? byScore : byTime;
  return order < 0 ? 0 : order > 0 ? 1 : null;
}

function finish(room: Room): Room {
  const winner = winnerOf(room);
  const tally: [number, number] = [room.tally[0], room.tally[1]];
  if (winner !== null) tally[winner]++;
  const puzzleId = room.puzzleId as string;
  return {
    ...room,
    phase: "results",
    tally,
    played: [...room.played, puzzleId],
    last: { round: room.round, puzzleId, winner },
  };
}

/** Back to the lobby when a seat empties between rounds. */
function toLobby(room: Room): Room {
  const reset = (p: Player | null): Player | null =>
    p === null ? null : { ...p, lobbyReady: false, rematch: false, status: "waiting" };
  return { ...room, phase: "lobby", players: [reset(room.players[0]), reset(room.players[1])] };
}

/** What time alone changes: study ending, drops running out, the deadline. */
function settle(room: Room, now: number): Room {
  let r = room;
  for (const seat of SEATS) {
    const p = r.players[seat];
    if (p === null || p.droppedAt === null || now - p.droppedAt < RULES.reconnectMs) continue;
    if (r.phase === "lobby" || r.phase === "results") r = toLobby(withPlayer(r, seat, null));
    else if (p.status === "playing") r = withPlayer(r, seat, { ...p, status: "forfeited" });
  }
  if (r.phase === "study" && r.studyEndsAt !== null && now >= r.studyEndsAt) {
    r = startPlaying(r, r.studyEndsAt);
  }
  if (r.phase === "playing") {
    const claiming = r.players.some((p) => p?.status === "claiming");
    const done = both(r, (p) => p.status === "locked" || p.status === "forfeited");
    const end = deadline(r);
    if (!claiming && (done || (end !== null && now >= end))) r = finish(r);
  }
  return r;
}

function open(room: Room, seat: Seat, round: number, now: number): boolean {
  const end = deadline(room);
  return (
    room.phase === "playing" &&
    room.round === round &&
    end !== null &&
    now < end &&
    room.players[seat] !== null
  );
}

function apply(room: Room, e: RoomEvent, now: number, pick: Pick, effects: Effect[]): Room {
  switch (e.type) {
    case "join":
      return room.phase === "lobby" && room.players[e.seat] === null
        ? withPlayer(room, e.seat, newPlayer(e.name))
        : room;
    case "rejoin":
      return update(room, e.seat, (p) => ({ ...p, connected: true, droppedAt: null }));
    case "drop":
      return update(room, e.seat, (p) => ({ ...p, connected: false, droppedAt: now }));
    case "lobby": {
      if (room.phase !== "lobby") return room;
      let r = update(room, e.seat, (p) => ({ ...p, lobbyReady: e.ready }));
      if (e.difficulty !== undefined) r = { ...r, difficulty: e.difficulty };
      return both(r, (p) => p.connected && p.lobbyReady) ? startRound(r, now, pick) : r;
    }
    case "ready": {
      if (room.phase !== "study") return room;
      const r = update(room, e.seat, (p) => ({ ...p, studyReady: true }));
      return both(r, (p) => p.studyReady) ? startPlaying(r, now) : r;
    }
    case "keys": {
      const p = room.players[e.seat];
      if (p === null || !open(room, e.seat, e.round, now) || p.status !== "playing") return room;
      if (e.from > p.log.length) return room;
      const fresh = e.entries.slice(p.log.length - e.from);
      const log = [...p.log, ...fresh].slice(0, LIMITS.logEntries);
      return withPlayer(room, e.seat, { ...p, log });
    }
    case "claim": {
      const p = room.players[e.seat];
      if (p === null || !open(room, e.seat, e.round, now) || p.status !== "playing") return room;
      if (e.length > p.log.length) {
        effects.push({ type: "refuse", seat: e.seat, round: e.round, reason: "out of sync" });
        return room;
      }
      const log = p.log.slice(0, e.length);
      effects.push({
        type: "verify",
        seat: e.seat,
        round: e.round,
        puzzleId: room.puzzleId as string,
        log,
      });
      return withPlayer(room, e.seat, { ...p, log, status: "claiming", claimedAt: now });
    }
    case "verdict": {
      const p = room.players[e.seat];
      if (p === null || room.round !== e.round || p.status !== "claiming") return room;
      if (!e.ok) return withPlayer(room, e.seat, { ...p, status: "playing", claimedAt: null });
      const r = withPlayer(room, e.seat, {
        ...p,
        status: "locked",
        lockedAt: p.claimedAt,
        score: e.score,
      });
      return { ...r, graceEndsAt: graceEnd(r) };
    }
    case "forfeit": {
      const p = room.players[e.seat];
      if (
        p === null ||
        room.round !== e.round ||
        (room.phase !== "study" && room.phase !== "playing")
      )
        return room;
      return p.status === "playing"
        ? withPlayer(room, e.seat, { ...p, status: "forfeited" })
        : room;
    }
    case "rematch": {
      if (room.phase !== "results") return room;
      const r = update(room, e.seat, (p) => ({ ...p, rematch: true }));
      return both(r, (p) => p.connected && p.rematch) ? startRound(r, now, pick) : r;
    }
    case "tick":
      return room;
  }
}

/** Time first, so an event that arrives after a deadline sees the round as it then stood. */
export function reduceRoom(
  room: Room,
  e: RoomEvent,
  now: number,
  pick: Pick,
): { room: Room; effects: Effect[] } {
  const effects: Effect[] = [];
  const r = settle(apply(settle(room, now), e, now, pick, effects), now);
  return { room: r, effects };
}

/** When the room next changes without an event, for the shell's timer. */
export function nextWake(room: Room): number | null {
  const times = room.players.map((p) =>
    p?.droppedAt == null ? Infinity : p.droppedAt + RULES.reconnectMs,
  );
  if (room.phase === "study" && room.studyEndsAt !== null) times.push(room.studyEndsAt);
  const end = deadline(room);
  if (room.phase === "playing" && end !== null) times.push(end);
  const t = Math.min(...times);
  return t === Infinity ? null : t;
}

function playerView(p: Player, room: Room): PlayerView {
  return {
    name: p.name,
    connected: p.connected,
    lobbyReady: p.lobbyReady,
    rematch: p.rematch,
    status: p.status,
    score: p.score ?? scoreOf(p.log),
    runs: 1 + p.log.filter((e) => e === RESET).length,
    lockedAfter:
      p.lockedAt === null || room.startedAt === null ? null : p.lockedAt - room.startedAt,
  };
}

export function viewOf(room: Room, now: number): RoomView {
  const end = deadline(room);
  const left = (t: number | null) => (t === null ? null : Math.max(0, t - now));
  return {
    room: room.id,
    phase: room.phase,
    round: room.round,
    puzzleId: room.puzzleId,
    difficulty: room.difficulty,
    players: [
      room.players[0] === null ? null : playerView(room.players[0], room),
      room.players[1] === null ? null : playerView(room.players[1], room),
    ],
    tally: [room.tally[0], room.tally[1]],
    phaseLeft:
      room.phase === "study" ? left(room.studyEndsAt) : room.phase === "playing" ? left(end) : null,
    graceLeft: room.phase === "playing" ? left(room.graceEndsAt) : null,
    last: room.last,
  };
}
