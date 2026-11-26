import { describe, expect, test } from "bun:test";
import { type LogEntry, parseKeys, RESET } from "@yank-wars/engine";
import {
  createRoom,
  type Effect,
  nextWake,
  type Pick,
  type Room,
  type RoomEvent,
  reduceRoom,
  viewOf,
} from "./room.ts";

const S = 1_000;
const pick: Pick = (played) => `p-${played.length + 1}`;

/** A room driven by events at given times; `effects` collects what the shell would do. */
class Harness {
  room: Room = createRoom("abcdefgh23");
  now = 0;
  effects: Effect[] = [];

  at(t: number, e: RoomEvent): this {
    this.now = t;
    const r = reduceRoom(this.room, e, t, pick);
    this.room = r.room;
    this.effects.push(...r.effects);
    return this;
  }

  /** Two players in a round that started playing at `t` (both skipped study). */
  static playing(t = 0): Harness {
    return new Harness()
      .at(t, { type: "join", seat: 0, name: "ada" })
      .at(t, { type: "join", seat: 1, name: "bob" })
      .at(t, { type: "lobby", seat: 0, ready: true })
      .at(t, { type: "lobby", seat: 1, ready: true })
      .at(t, { type: "ready", seat: 0 })
      .at(t, { type: "ready", seat: 1 });
  }

  /** Keys in notation, with `<Reset>` for the reset marker. */
  type(t: number, seat: 0 | 1, notation: string, from = this.room.players[seat]?.log.length ?? 0) {
    const entries = notation
      .split(RESET)
      .flatMap((run, i): LogEntry[] => (i === 0 ? parseKeys(run) : [RESET, ...parseKeys(run)]));
    return this.at(t, { type: "keys", seat, round: this.room.round, from, entries });
  }

  lockIn(t: number, seat: 0 | 1, score: number): this {
    const length = this.room.players[seat]?.log.length ?? 0;
    return this.at(t, { type: "claim", seat, round: this.room.round, length }).at(t + 50, {
      type: "verdict",
      seat,
      round: this.room.round,
      ok: true,
      score,
    });
  }
}

const statuses = (h: Harness) => h.room.players.map((p) => p?.status);

describe("lobby and study", () => {
  test("the round starts once both are in and ready, on a puzzle the room picks", () => {
    const h = new Harness()
      .at(0, { type: "join", seat: 0, name: "ada" })
      .at(0, { type: "lobby", seat: 0, ready: true })
      .at(S, { type: "join", seat: 1, name: "bob" })
      .at(S, { type: "lobby", seat: 1, ready: false, name: "" });
    expect([h.room.phase, h.room.players[1]?.name]).toEqual(["lobby", "anonymous"]);
    h.at(2 * S, { type: "lobby", seat: 1, ready: true });
    expect([h.room.phase, h.room.round, h.room.puzzleId, h.room.studyEndsAt]).toEqual([
      "study",
      1,
      "p-1",
      7 * S,
    ]);
  });

  test("a player who dropped holds the start back; a taken seat can't be joined", () => {
    const h = new Harness()
      .at(0, { type: "join", seat: 0, name: "ada" })
      .at(0, { type: "join", seat: 1, name: "bob" })
      .at(0, { type: "join", seat: 1, name: "eve" })
      .at(0, { type: "drop", seat: 1 })
      .at(0, { type: "lobby", seat: 0, ready: true })
      .at(0, { type: "lobby", seat: 1, ready: true });
    expect([h.room.phase, h.room.players[1]?.name]).toEqual(["lobby", "bob"]);
  });

  test("study ends when both are ready, or after 5 s", () => {
    expect(Harness.playing(S).room.startedAt).toBe(S);
    const h = new Harness()
      .at(0, { type: "join", seat: 0, name: "ada" })
      .at(0, { type: "join", seat: 1, name: "bob" })
      .at(0, { type: "lobby", seat: 0, ready: true })
      .at(0, { type: "lobby", seat: 1, ready: true })
      .at(S, { type: "ready", seat: 0 });
    expect(nextWake(h.room)).toBe(5 * S);
    h.at(6 * S, { type: "tick" });
    expect([h.room.phase, h.room.startedAt, h.room.endsAt]).toEqual(["playing", 5 * S, 245 * S]);
  });
});

describe("keys and claims", () => {
  test("a resend overlapping what the server has appends only the rest; a gap is dropped", () => {
    const h = Harness.playing()
      .type(S, 0, "dw")
      .type(2 * S, 0, "wx", 1)
      .type(3 * S, 0, "q", 9);
    expect(h.room.players[0]?.log).toEqual(parseKeys("dwx"));
  });

  test("a claim is replayed on the claimed log; a claim past the log is refused", () => {
    const h = Harness.playing().type(S, 0, "dd").type(S, 0, "<Reset>x");
    h.at(2 * S, { type: "claim", seat: 0, round: 1, length: 9 });
    h.at(2 * S, { type: "claim", seat: 0, round: 1, length: 4 });
    expect(h.effects).toEqual([
      { type: "refuse", seat: 0, round: 1, reason: "out of sync" },
      {
        type: "verify",
        seat: 0,
        round: 1,
        puzzleId: "p-1",
        log: [...parseKeys("dd"), RESET, ...parseKeys("x")],
      },
    ]);
    expect(statuses(h)).toEqual(["claiming", "playing"]);
  });

  test("a rejected claim keeps the player in the round; keys go on counting", () => {
    const h = Harness.playing().type(S, 0, "x");
    h.at(2 * S, { type: "claim", seat: 0, round: 1, length: 1 });
    h.at(2 * S, { type: "verdict", seat: 0, round: 1, ok: false }).type(3 * S, 0, "y");
    expect(statuses(h)).toEqual(["playing", "playing"]);
    expect(h.room.players[0]?.log).toEqual(parseKeys("xy"));
  });
});

describe("grace and the end of a round", () => {
  test("grace is 30% of the first lock-in's time, at least 10 s and at most 60 s, never past the cap", () => {
    const graceAfter = (lockAt: number) => {
      const h = Harness.playing().type(S, 0, "x").lockIn(lockAt, 0, 1);
      return (h.room.graceEndsAt as number) - lockAt;
    };
    expect(graceAfter(5 * S)).toBe(10 * S);
    expect(graceAfter(100 * S)).toBe(30 * S);
    expect(graceAfter(210 * S)).toBe(30 * S);
    expect(graceAfter(235 * S)).toBe(5 * S);
  });

  test("the lock-in time is the claim's arrival, not the verdict's", () => {
    const h = Harness.playing().type(S, 0, "x");
    h.at(20 * S, { type: "claim", seat: 0, round: 1, length: 1 });
    h.at(21 * S, { type: "verdict", seat: 0, round: 1, ok: true, score: 1 });
    expect([h.room.players[0]?.lockedAt, h.room.graceEndsAt]).toEqual([20 * S, 30 * S]);
  });

  test("keys after grace are refused and the round ends with the one who locked in winning", () => {
    const h = Harness.playing()
      .type(S, 0, "x")
      .lockIn(5 * S, 0, 1)
      .type(14 * S, 1, "a");
    h.type(16 * S, 1, "b");
    expect(h.room.players[1]?.log).toEqual(parseKeys("a"));
    expect([h.room.phase, h.room.last, h.room.tally]).toEqual([
      "results",
      { round: 1, puzzleId: "p-1", winner: 0 },
      [1, 0],
    ]);
  });

  test("fewer keys win; equal keys go to the earlier lock-in; both locked ends the round at once", () => {
    const fewer = Harness.playing()
      .lockIn(10 * S, 0, 5)
      .lockIn(12 * S, 1, 4);
    expect([fewer.room.phase, fewer.room.last?.winner]).toEqual(["results", 1]);
    const tie = Harness.playing()
      .lockIn(10 * S, 1, 4)
      .lockIn(12 * S, 0, 4);
    expect(tie.room.last?.winner).toBe(1);
  });

  test("nobody locked in by the cap is a draw; the other forfeiting ends the round", () => {
    const draw = Harness.playing().at(240 * S, { type: "tick" });
    expect([draw.room.phase, draw.room.last?.winner, draw.room.tally]).toEqual([
      "results",
      null,
      [0, 0],
    ]);
    const quit = Harness.playing()
      .lockIn(10 * S, 0, 3)
      .at(11 * S, { type: "forfeit", seat: 1, round: 1 });
    expect([quit.room.phase, quit.room.last?.winner]).toEqual(["results", 0]);
  });

  test("a claim in flight at the deadline holds the round open until its verdict", () => {
    const h = Harness.playing()
      .lockIn(5 * S, 0, 3)
      .type(S, 1, "x");
    h.at(14 * S, { type: "claim", seat: 1, round: 1, length: 1 }).at(16 * S, { type: "tick" });
    expect(h.room.phase).toBe("playing");
    h.at(17 * S, { type: "verdict", seat: 1, round: 1, ok: true, score: 1 });
    expect([h.room.phase, h.room.last?.winner]).toEqual(["results", 1]);
  });
});

describe("drops, rematch and the view", () => {
  test("a drop in a round forfeits after 15 s unless the player is back", () => {
    const back = Harness.playing()
      .at(S, { type: "drop", seat: 1 })
      .at(10 * S, { type: "rejoin", seat: 1 });
    back.at(20 * S, { type: "tick" });
    expect(statuses(back)).toEqual(["playing", "playing"]);
    const gone = Harness.playing().at(S, { type: "drop", seat: 1 });
    expect(nextWake(gone.room)).toBe(16 * S);
    gone.at(16 * S, { type: "tick" });
    expect(statuses(gone)).toEqual(["playing", "forfeited"]);
  });

  test("a rematch needs both, and plays a puzzle the room hasn't had", () => {
    const h = Harness.playing()
      .lockIn(5 * S, 0, 3)
      .at(6 * S, { type: "forfeit", seat: 1, round: 1 });
    h.at(7 * S, { type: "rematch", seat: 0 });
    expect(h.room.phase).toBe("results");
    h.at(8 * S, { type: "rematch", seat: 1 });
    expect([h.room.phase, h.room.round, h.room.puzzleId, h.room.played]).toEqual([
      "study",
      2,
      "p-2",
      ["p-1"],
    ]);
    expect(h.room.players.map((p) => p?.log.length)).toEqual([0, 0]);
  });

  test("leaving the results for good empties the seat and goes back to the lobby", () => {
    const h = Harness.playing()
      .at(240 * S, { type: "tick" })
      .at(241 * S, { type: "drop", seat: 1 });
    h.at(256 * S, { type: "tick" });
    expect([h.room.phase, h.room.players[1], h.room.players[0]?.status]).toEqual([
      "lobby",
      null,
      "waiting",
    ]);
  });

  test("the view counts keys and runs, the time played, and the time left in the round and grace", () => {
    const h = Harness.playing()
      .type(S, 1, "dd<Reset>x")
      .lockIn(10 * S, 0, 7);
    const v = viewOf(h.room, 12 * S);
    expect([v.phaseLeft, v.elapsed, v.graceLeft]).toEqual([8 * S, 12 * S, 8 * S]);
    expect(v.players.map((p) => [p?.status, p?.score, p?.runs, p?.lockedAfter])).toEqual([
      ["locked", 7, 1, 10 * S],
      ["playing", 1, 2, null],
    ]);
  });
});
