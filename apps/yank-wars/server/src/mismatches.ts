// Logs claims the server rejected, so parity bugs show up in production.

import { appendFileSync, statSync } from "node:fs";
import type { Mismatch } from "./rooms.ts";

export const MISMATCH_CAP_BYTES = 10 * 1024 * 1024;

/** Appends each rejected claim as a JSON line to `path`, until the file reaches the cap. */
export function mismatchLog(path: string, cap = MISMATCH_CAP_BYTES): (m: Mismatch) => void {
  let full = false;
  return (m) => {
    if (full) return;
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {}
    if (size >= cap) {
      full = true;
      console.error(`${path} reached ${cap} bytes; no more mismatches are written`);
      return;
    }
    appendFileSync(path, `${JSON.stringify(m)}\n`);
  };
}
