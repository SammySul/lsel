import { afterEach, describe, expect, test } from "bun:test";
import { EditorState, type Extension, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { diffField, linesOffOf, setPlayerDoc, targetDiffField } from "./diff.ts";

const text = (s: string) => Text.of(s.split("\n"));
const views: EditorView[] = [];

function mount(doc: string, extension: Extension): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: extension }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

function lines(view: EditorView): [string, string][] {
  return [...view.contentDOM.querySelectorAll(".cm-line")].map((el) => [
    el.textContent ?? "",
    [...el.classList].filter((c) => c.startsWith("yw-")).join(" "),
  ]);
}

afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
});

describe("player diff", () => {
  test("a line that differs from the target is tinted", () => {
    const view = mount("a\nb\nc", diffField(text("a\nX\nc")));
    expect(lines(view)).toEqual([
      ["a", ""],
      ["b", "yw-diff"],
      ["c", ""],
    ]);
    expect(linesOffOf(view.state)).toBe(1);
  });

  test("deleting that line leaves one missing-line marker at the gap", () => {
    const view = mount("a\nb\nc", diffField(text("a\nX\nc")));
    view.dispatch({ changes: { from: 2, to: 4 } });
    expect(view.state.doc.toString()).toBe("a\nc");
    expect(lines(view)).toEqual([
      ["a", ""],
      ["c", "yw-diff-missing"],
    ]);
    expect(linesOffOf(view.state)).toBe(1);
  });

  test("identical docs have no decorations", () => {
    const view = mount("a\nb\nc", diffField(text("a\nb\nc")));
    expect(lines(view)).toEqual([
      ["a", ""],
      ["b", ""],
      ["c", ""],
    ]);
    expect(linesOffOf(view.state)).toBe(0);
  });

  test("inserting a line above re-aligns, so the lines below stay untinted", () => {
    const view = mount("a\nb\nc", diffField(text("a\nb\nc")));
    view.dispatch({ changes: { from: 0, insert: "Z\n" } });
    expect(lines(view)).toEqual([
      ["Z", "yw-diff"],
      ["a", ""],
      ["b", ""],
      ["c", ""],
    ]);
    expect(linesOffOf(view.state)).toBe(1);
  });

  test("a chunk that ends in an empty line tints the empty line too", () => {
    const view = mount("a\nX\n\nc", diffField(text("a\nc")));
    expect(lines(view)).toEqual([
      ["a", ""],
      ["X", "yw-diff"],
      ["", "yw-diff"],
      ["c", ""],
    ]);
    expect(linesOffOf(view.state)).toBe(2);
  });

  test("one extra line at the end tints only that line", () => {
    const view = mount("fn {\n  x\n}\n", diffField(text("fn {\n  x\n}")));
    expect(lines(view)).toEqual([
      ["fn {", ""],
      ["  x", ""],
      ["}", ""],
      ["", "yw-diff"],
    ]);
    expect(linesOffOf(view.state)).toBe(1);
  });

  test("an extra last line is tinted, the correct line above is not", () => {
    const view = mount("a\nb\nc", diffField(text("a\nb")));
    expect(lines(view)).toEqual([
      ["a", ""],
      ["b", ""],
      ["c", "yw-diff"],
    ]);
    expect(linesOffOf(view.state)).toBe(1);
  });

  test("a missing last line is marked below the last line, which stays untinted", () => {
    const view = mount("a\nb", diffField(text("a\nb\nc")));
    expect(lines(view)).toEqual([
      ["a", ""],
      ["b", "yw-diff-missing-after"],
    ]);
    expect(linesOffOf(view.state)).toBe(1);
  });

  test("selection-only and effects-only transactions keep the count", () => {
    const view = mount("a\nb\nc", diffField(text("a\nX\nc")));
    view.dispatch({ selection: { anchor: 4 } });
    expect(linesOffOf(view.state)).toBe(1);
  });

  test("a state without the diff field reports 0 lines off", () => {
    expect(linesOffOf(EditorState.create({ doc: "a" }))).toBe(0);
  });
});

describe("target diff", () => {
  test("target lines the player has not reached yet are pending", () => {
    const view = mount("a\nX\nc", targetDiffField(text("a\nb\nc")));
    expect(lines(view)).toEqual([
      ["a", ""],
      ["X", "yw-pending"],
      ["c", ""],
    ]);
  });

  test("setPlayerDoc re-diffs against the player's buffer", () => {
    const view = mount("a\nX\nc", targetDiffField(text("a\nb\nc")));
    view.dispatch({ effects: setPlayerDoc.of(text("a\nX\nc")) });
    expect(lines(view)).toEqual([
      ["a", ""],
      ["X", ""],
      ["c", ""],
    ]);
    view.dispatch({ effects: setPlayerDoc.of(text("q\nX\nc")) });
    expect(lines(view)).toEqual([
      ["a", "yw-pending"],
      ["X", ""],
      ["c", ""],
    ]);
  });

  test("a target line missing at the end of the player's buffer is the only pending one", () => {
    const view = mount("a\nb\nc", targetDiffField(text("a\nb")));
    expect(lines(view)).toEqual([
      ["a", ""],
      ["b", ""],
      ["c", "yw-pending"],
    ]);
  });

  test("an extra line in the player's buffer marks nothing on the target", () => {
    const view = mount("a\nX\nc", targetDiffField(text("a\nX\nY\nc")));
    expect(lines(view)).toEqual([
      ["a", ""],
      ["X", ""],
      ["c", ""],
    ]);
  });
});
