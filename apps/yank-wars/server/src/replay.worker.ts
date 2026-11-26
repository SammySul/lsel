// Verifies lock-in claims one at a time; vim's process-global state lives and dies with this worker.
import "./dom.ts";
import { verifyRun } from "@yank-wars/engine";
import type { ReplayReply, ReplayRequest } from "./replay.ts";

declare const self: Worker;

self.onmessage = (e: MessageEvent<ReplayRequest>) => {
  const { id, puzzle, log } = e.data;
  let reply: ReplayReply;
  try {
    const { ok, score, result } = verifyRun(puzzle, log);
    reply = { id, ok, score, doc: result.doc, errors: result.errors };
  } catch (err) {
    reply = { id, ok: false, score: 0, doc: "", errors: [{ index: -1, message: String(err) }] };
  }
  self.postMessage(reply);
};
