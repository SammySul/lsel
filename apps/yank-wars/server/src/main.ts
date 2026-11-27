// Starts the server: the built web app, the rooms on /ws, and /api (accounts and the daily board).

import { Database } from "bun:sqlite";
import { serve } from "@sammysul/lsel/server";
import { api } from "./api.ts";
import { CSP, ENV, github, PORT } from "./config.ts";
import { Board } from "./daily.ts";
import { mismatchLog } from "./mismatches.ts";
import { PUZZLES, picker } from "./puzzles.ts";
import { Replayer } from "./replay.ts";
import { Rooms } from "./rooms.ts";

const replayer = new Replayer();
const verify = replayer.verify.bind(replayer);
const rooms = new Rooms({
  puzzles: PUZZLES,
  pick: picker(PUZZLES),
  verify,
  // The working directory is the service's state directory on twelve.
  mismatch: mismatchLog("mismatches.jsonl"),
});

serve({
  name: "yank-wars",
  prefix: "YW",
  port: PORT,
  csp: CSP,
  extra: ENV,
  routes: (config) => {
    // Better Auth brings its tables up to date before the first request is answered
    const ready = api({
      // in the service's state directory, like the mismatch log
      accounts: new Database("accounts.sqlite", { create: true, strict: true }),
      board: new Board("daily.sqlite"),
      origin: config.YW_ORIGIN,
      secret: config.YW_AUTH_SECRET,
      github: github(config),
      puzzles: PUZZLES,
      verify,
    });
    ready.catch((e: unknown) => {
      console.error("accounts:", e);
      process.exit(1);
    });
    return async (req, url) =>
      url.pathname.startsWith("/api/") ? (await ready)(req, url) : undefined;
  },
  socket: () => rooms.socket(),
});
