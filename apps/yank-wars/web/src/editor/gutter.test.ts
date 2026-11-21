import { afterEach, expect, test } from "bun:test";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { absoluteGutter, relativeFormat, relativeGutter } from "./gutter.ts";

const views: EditorView[] = [];

function mount(doc: string, extension: Extension): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: extension }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

// The spacer element (visibility: hidden) sizes the gutter and is not a line number.
function numbers(view: EditorView): string[] {
  return [...view.dom.querySelectorAll(".cm-lineNumbers .cm-gutterElement")]
    .filter((el) => (el as HTMLElement).style.visibility !== "hidden")
    .map((el) => el.textContent ?? "");
}

afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
});

test("relativeFormat shows the absolute number on the cursor line and distances elsewhere", () => {
  expect(relativeFormat(5, 5)).toBe("5");
  expect(relativeFormat(5, 2)).toBe("3");
  expect(relativeFormat(5, 9)).toBe("4");
});

test("the relative gutter follows the cursor", () => {
  const view = mount("one\ntwo\nthree\nfour\nfive", relativeGutter);
  expect(numbers(view)).toEqual(["1", "1", "2", "3", "4"]);
  view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
  expect(numbers(view)).toEqual(["2", "1", "3", "1", "2"]);
});

test("the relative gutter renumbers after a line is deleted", () => {
  const view = mount("one\ntwo\nthree", relativeGutter);
  view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
  view.dispatch({ changes: { from: 0, to: 4 } });
  expect(numbers(view)).toEqual(["1", "2"]);
});

test("the absolute gutter numbers lines from 1", () => {
  const view = mount("one\ntwo\nthree", absoluteGutter);
  expect(numbers(view)).toEqual(["1", "2", "3"]);
});
