import { afterEach, describe, expect, test } from "bun:test";
import {
  createSession,
  destroySession,
  type EditorSession,
  feedKey,
  type HudState,
  parseKeys,
  parsePuzzle,
  sessionSnapshot,
  type VimMode,
} from "./index.ts";

const puzzle = parsePuzzle({
  id: "snapshot-probe",
  title: "probe",
  difficulty: "easy",
  language: "text",
  tabSize: 4,
  indentUnit: "    ",
  start: "one two\nthree",
  target: "one\nthree",
  solution: "wDx",
  source: { kind: "original", author: "yank-wars" },
});

let session: EditorSession | null = null;

function after(notation: string): HudState {
  if (session) destroySession(session);
  session = createSession(puzzle, { parent: document.body });
  for (const key of parseKeys(notation)) feedKey(session, key);
  return sessionSnapshot(session);
}

afterEach(() => {
  if (session) destroySession(session);
  session = null;
});

describe("sessionSnapshot", () => {
  test("a fresh session", () => {
    expect(after("")).toEqual({
      mode: "normal",
      insertModeReturn: false,
      pending: "",
      prompt: null,
      message: null,
      recording: null,
      error: null,
    });
  });

  test.each<[string, VimMode]>([
    ["i", "insert"],
    ["i<Esc>", "normal"],
    ["v", "visual"],
    ["V", "visual line"],
    ["<C-v>", "visual block"],
    ["v<Esc>", "normal"],
    ["R", "replace"],
    ["R<Esc>", "normal"],
    ["i<Ins>", "replace"],
    ["i<Ins><Ins>", "insert"],
  ])("mode after %j is %j", (keys, mode) => {
    expect(after(keys).mode).toBe(mode);
  });

  test("pending keys of an unfinished command", () => {
    expect(after("2d").pending).toBe("2d");
    expect(after("2dw").pending).toBe("");
  });

  test("an open command-line prompt", () => {
    expect(after(":s/o").prompt).toEqual({ prefix: ":", value: "s/o" });
    expect(after(":s/o<Esc>").prompt).toBeNull();
  });

  test("macro recording", () => {
    expect(after("qa").recording).toBe("a");
    expect(after("qaxq").recording).toBeNull();
  });

  test("<C-o> in insert mode is a one-shot normal command", () => {
    const hud = after("i<C-o>");
    expect(hud.insertModeReturn).toBe(true);
    expect(hud.mode).toBe("normal");
  });

  test("a blocked ex command leaves a message", () => {
    expect(after(":map a b<CR>").message).toBe("mappings and :set are disabled in Yank Wars");
  });
});
