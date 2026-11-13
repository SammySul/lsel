// Ex commands and keys the grammar emits; shrinking may only recombine keys into these.
const EX_NAME = /^(s|g|v|norm|d|m|t|j|sort|>|<lt>|y|&&)(?![A-Za-z])/;
const GLOBAL_CMD = /^(s|d|norm|m|t|j)(?![A-Za-z])/;
// :help cmdline-ranges, the forms the grammar writes plus /pat/ addresses
const RANGE = /^(?:[%.$,;+\-0-9]|\/(?:\\.|[^/\\])*\/)*/;

/** Whether one ex line (between ":" and "<CR>") is a command the grammar could have written. */
export function exLineOk(line: string): boolean {
  const rest = line.replace(RANGE, "");
  if (rest === "") return true;
  const m = EX_NAME.exec(rest);
  if (m === null) return false;
  if (m[1] !== "g" && m[1] !== "v") return true;
  const g = /^[gv]\/(?:\\.|[^/\\])*\/(.*)$/.exec(rest);
  return g !== null && GLOBAL_CMD.test(g[1] ?? "");
}

// The command-line window, Ex mode, select mode, file jumps and window commands; = indents by language.
const UNSAFE = [
  "q:",
  "q/",
  "q?",
  "gQ",
  "Q",
  "gh",
  "gH",
  "g<C-h>",
  "gf",
  "gF",
  "<C-w>",
  "<C-^>",
  "<C-]>",
  "=",
];

function occurrences(s: string, sub: string): number {
  return s.split(sub).length - 1;
}

/** Every ex line is one the grammar could write or the original had, and no UNSAFE key is new. */
export function safeCandidate(keys: string, original: string): boolean {
  for (const t of UNSAFE) if (occurrences(keys, t) > occurrences(original, t)) return false;
  const segments = keys.split("<CR>").slice(0, -1);
  for (const seg of segments) {
    for (let i = seg.indexOf(":"); i >= 0; i = seg.indexOf(":", i + 1)) {
      const line = seg.slice(i + 1);
      if (!exLineOk(line) && !original.includes(`:${line}<CR>`)) return false;
    }
  }
  return true;
}
