// Everything under /api: accounts (/api/auth, /api/me) and the daily board (/api/daily), wired as the server runs them.

import type { Database } from "bun:sqlite";
import type { Routes } from "@sammysul/lsel/server";
import { createAuth, type GitHub, Names, playerOf } from "@sammysul/lsel/server/accounts";
import type { Board } from "@sammysul/lsel/server/board";
import type { KeyLog, Puzzle } from "@yank-wars/engine";
import { accountRoutes, Progress } from "./accounts.ts";
import { dailyRoutes } from "./daily.ts";
import type { Verdict } from "./replay.ts";

export interface ApiOptions {
  accounts: Database;
  board: Board;
  origin: string;
  secret: string;
  github?: GitHub | undefined;
  puzzles: ReadonlyMap<string, Puzzle>;
  verify: (puzzle: Puzzle, log: KeyLog) => Promise<Verdict>;
  now?: (() => number) | undefined;
}

export async function api(o: ApiOptions): Promise<Routes> {
  const names = new Names(o.accounts);
  const progress = new Progress(o.accounts, names);
  const auth = await createAuth({
    db: o.accounts,
    baseURL: o.origin,
    secret: o.secret,
    github: o.github,
    linked: (from, to, login) => {
      progress.move(from, to);
      o.board.reassign(from, to, names.of(to, login) || "anonymous");
    },
  });
  const account = accountRoutes({
    auth,
    names,
    progress,
    board: o.board,
    github: o.github !== undefined,
    now: o.now,
  });
  const daily = dailyRoutes({
    board: o.board,
    puzzles: o.puzzles,
    verify: o.verify,
    player: (req) => playerOf(auth, names, req),
    solved: (id, day) => progress.merge(id, { daily: [day] }),
    now: o.now,
  });
  return async (req, url) => (await account(req, url)) ?? daily(req, url);
}
