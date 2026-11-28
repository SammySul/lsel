// A daily board in SQLite: each player's best run per day, ranked by score, then time, then who got there first.

import { Database } from "bun:sqlite";
import type { BoardEntry, DayBoard } from "../daily.ts";

export type { BoardEntry, DayBoard };

/** One run as the board keeps it; `puzzle` is what the day was when it was played. */
export interface Run {
  readonly day: number;
  readonly player: string;
  readonly puzzle: string;
  readonly name: string;
  readonly score: number;
  readonly ms: number;
  readonly at: number;
}

export interface BoardOptions {
  /** whether a lower score wins (keystrokes) or a higher one (points) */
  better: "lower" | "higher";
  /** how many runs the top of a board shows */
  size?: number;
}

type Row = Pick<Run, "player" | "name" | "score" | "ms">;

export class Board {
  readonly #db: Database;
  readonly #size: number;
  readonly #order: string;
  readonly #ahead: string;
  readonly #better: string;

  constructor(path: string, o: BoardOptions) {
    this.#size = o.size ?? 10;
    const [asc, beats] = o.better === "lower" ? ["ASC", "<"] : ["DESC", ">"];
    this.#order = `score ${asc}, ms, at`;
    this.#ahead = `(r.score ${beats} me.score OR (r.score = me.score AND
      (r.ms < me.ms OR (r.ms = me.ms AND r.at < me.at))))`;
    // the new run beats the stored one, or the stored one was on a puzzle the day no longer has
    this.#better = `(excluded.puzzle <> puzzle OR excluded.score ${beats} score OR
      (excluded.score = score AND excluded.ms < ms))`;
    this.#db = new Database(path, { create: true, strict: true });
    this.#db.run("PRAGMA journal_mode = WAL");
    this.#db.run(`CREATE TABLE IF NOT EXISTS runs (
      day INTEGER NOT NULL,
      player TEXT NOT NULL,
      puzzle TEXT NOT NULL,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      ms INTEGER NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (day, player)
    )`);
  }

  /** Keeps `run` if it beats the player's run of the day (or that was another puzzle); the name always updates. */
  record(run: Run): void {
    this.#db
      .query(
        `INSERT INTO runs (day, player, puzzle, name, score, ms, at)
         VALUES ($day, $player, $puzzle, $name, $score, $ms, $at)
         ON CONFLICT (day, player) DO UPDATE SET name = excluded.name, ${this.#keepBetter()}`,
      )
      .run({ ...run });
  }

  board(day: number, puzzle: string, player: string | null): DayBoard {
    const entry = (r: Row, rank: number): BoardEntry => ({
      rank,
      name: r.name,
      score: r.score,
      ms: r.ms,
      you: r.player === player,
    });
    const top = this.#db
      .query<Row, [number, string, number]>(
        `SELECT player, name, score, ms FROM runs WHERE day = ? AND puzzle = ?
         ORDER BY ${this.#order} LIMIT ?`,
      )
      .all(day, puzzle, this.#size)
      .map((r, i) => entry(r, i + 1));
    const players =
      this.#db
        .query<{ n: number }, [number, string]>(
          "SELECT count(*) AS n FROM runs WHERE day = ? AND puzzle = ?",
        )
        .get(day, puzzle)?.n ?? 0;
    let you: BoardEntry | null = null;
    if (player !== null && !top.some((e) => e.you)) {
      const mine = this.#db
        .query<Row & { ahead: number }, [number, string, string]>(
          `SELECT me.player, me.name, me.score, me.ms,
             (SELECT count(*) FROM runs r WHERE r.day = me.day AND r.puzzle = me.puzzle AND ${this.#ahead}) AS ahead
           FROM runs me WHERE me.day = ? AND me.puzzle = ? AND me.player = ?`,
        )
        .get(day, puzzle, player);
      if (mine !== null) you = entry(mine, mine.ahead + 1);
    }
    return { day, puzzle, players, top, you };
  }

  /** A new board name shows on every run of the player's. */
  rename(player: string, name: string): void {
    this.#db.query("UPDATE runs SET name = ? WHERE player = ?").run(name, player);
  }

  /** A guest's runs join the account it signed in to, keeping the better run of any day both played. */
  reassign(from: string, to: string, name: string): void {
    this.#db.transaction(() => {
      // WHERE true: SQLite's upsert after a SELECT needs it to parse ON CONFLICT
      this.#db
        .query(
          `INSERT INTO runs (day, player, puzzle, name, score, ms, at)
           SELECT day, ?2, puzzle, name, score, ms, at FROM runs WHERE player = ?1 AND true
           ON CONFLICT (day, player) DO UPDATE SET ${this.#keepBetter()}`,
        )
        .run(from, to);
      this.#db.query("DELETE FROM runs WHERE player = ?").run(from);
      this.rename(to, name);
    })();
  }

  close(): void {
    this.#db.close();
  }

  #keepBetter(): string {
    return ["puzzle", "score", "ms", "at"]
      .map((c) => `${c} = CASE WHEN ${this.#better} THEN excluded.${c} ELSE ${c} END`)
      .join(", ");
  }
}
