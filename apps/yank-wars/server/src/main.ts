// Starts the server: the built web app, the rooms on /ws and the daily board on /api/daily.

import { serve } from "@sammysul/lsel/server";
import { Board, dailyRoutes } from "./daily.ts";
import { mismatchLog } from "./mismatches.ts";
import { PUZZLES, picker } from "./puzzles.ts";
import { Replayer } from "./replay.ts";
import { Rooms } from "./rooms.ts";
import { CSP } from "./server.ts";

const replayer = new Replayer();
const rooms = new Rooms({
  puzzles: PUZZLES,
  pick: picker(PUZZLES),
  verify: (puzzle, log) => replayer.verify(puzzle, log),
  // The working directory is the service's state directory on twelve.
  mismatch: mismatchLog("mismatches.jsonl"),
});

const daily = dailyRoutes({
  // in the service's state directory, like the mismatch log
  board: new Board("daily.sqlite"),
  puzzles: PUZZLES,
  verify: (puzzle, log) => replayer.verify(puzzle, log),
});

serve({
  name: "yank-wars",
  prefix: "YW",
  port: 7300,
  csp: CSP,
  routes: () => daily,
  socket: () => rooms.socket(),
});
