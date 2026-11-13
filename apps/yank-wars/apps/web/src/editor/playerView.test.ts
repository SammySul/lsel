import { afterEach, expect, test } from "bun:test";
import { type KeyResult, parsePuzzle } from "@yank-wars/engine";
import { linesOffOf } from "./diff.ts";
import { createPlayerView, type PlayerView, type PlayerViewOptions } from "./playerView.ts";

const puzzle = parsePuzzle({
  id: "player-pane",
  title: "Player pane",
  language: "javascript",
  tabSize: 2,
  indentUnit: "  ",
  start: "const a = 1;\nconst b = 2;",
  target: "const a = 1;\nlet b = 2;",
  solution: "jcwlet",
  source: { kind: "original", author: "yank-wars" },
});

interface Harness {
  host: HTMLElement;
  player: PlayerView;
  keys: string[];
  results: KeyResult[];
  docs: string[];
}

const open: Harness[] = [];

function mount(overrides: Partial<PlayerViewOptions> = {}): Harness {
  const host = document.createElement("section");
  document.body.append(host);
  const keys: string[] = [];
  const results: KeyResult[] = [];
  const docs: string[] = [];
  const player = createPlayerView({
    parent: host,
    puzzle,
    platform: "other",
    relativeNumbers: true,
    onKey: (key, result) => {
      keys.push(key);
      results.push(result);
    },
    onDoc: (doc) => docs.push(doc.toString()),
    ...overrides,
  });
  const h = { host, player, keys, results, docs };
  open.push(h);
  return h;
}

function press(h: Harness, key: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  h.player.session.view.contentDOM.dispatchEvent(e);
  return e;
}

function numbers(h: Harness): string[] {
  return [...h.host.querySelectorAll(".cm-lineNumbers .cm-gutterElement")]
    .filter((el) => (el as HTMLElement).style.visibility !== "hidden")
    .map((el) => el.textContent ?? "");
}

afterEach(() => {
  for (const h of open.splice(0)) {
    h.player.destroy();
    h.host.remove();
  }
});

test("keydowns go through the engine, are reported, and the buffer locks in", () => {
  const h = mount();
  const state = () => h.player.session.view.state;
  expect(linesOffOf(state())).toBe(1);
  const events = ["j", "c", "w", "l", "e", "t"].map((k) => press(h, k));
  expect(events.every((e) => e.defaultPrevented)).toBe(true);
  expect(h.keys).toEqual(["j", "c", "w", "l", "e", "t"]);
  expect(h.results.map((r) => r.solved)).toEqual([false, false, false, false, false, true]);
  expect(h.docs).toEqual([
    "const a = 1;\n b = 2;",
    "const a = 1;\nl b = 2;",
    "const a = 1;\nle b = 2;",
    "const a = 1;\nlet b = 2;",
  ]);
  expect(state().doc.toString()).toBe("const a = 1;\nlet b = 2;");
  expect(linesOffOf(state())).toBe(0);
});

// vim with noautoindent and expandtab: no bracket, quote or indent helper adds a character.
test("typed brackets, quotes, <CR>, <Tab> and } insert exactly themselves", () => {
  const h = mount();
  const keys = ["A", "(", "[", "{", '"', "'", "`", "<", "Enter", "Tab", "}", "Escape"];
  for (const k of keys) press(h, k);
  expect(h.player.session.view.state.doc.toString()).toBe(
    "const a = 1;([{\"'`<\n  }\nconst b = 2;",
  );
  expect(h.keys).toEqual([
    "A",
    "(",
    "[",
    "{",
    '"',
    "'",
    "`",
    "<lt>",
    "<CR>",
    "<Tab>",
    "}",
    "<Esc>",
  ]);
});

test("the player pane tints the line that still differs from the target", () => {
  const h = mount();
  const tinted = [...h.host.querySelectorAll(".cm-line.yw-diff")].map((el) => el.textContent);
  expect(tinted).toEqual(["const b = 2;"]);
});

test("options reach the key capture: a refused key is neither fed nor reported", () => {
  const h = mount({ accept: () => false });
  const e = press(h, "x");
  expect(e.defaultPrevented).toBe(true);
  expect(h.keys).toEqual([]);
  expect(h.player.session.view.state.doc.toString()).toBe("const a = 1;\nconst b = 2;");
});

test("setRelativeNumbers switches the gutter without touching the buffer or the log", () => {
  const h = mount();
  press(h, "j");
  expect(numbers(h)).toEqual(["1", "2"]);
  h.player.setRelativeNumbers(false);
  expect(numbers(h)).toEqual(["1", "2"]);
  press(h, "k");
  expect(numbers(h)).toEqual(["1", "2"]);
  h.player.setRelativeNumbers(true);
  expect(numbers(h)).toEqual(["1", "1"]);
  expect(h.keys).toEqual(["j", "k"]);
  expect(h.docs).toEqual([]);
});

test("destroy removes the editor from its host", () => {
  const h = mount();
  h.player.destroy();
  expect(h.host.querySelector(".cm-editor")).toBeNull();
  open.splice(0);
  h.host.remove();
});
