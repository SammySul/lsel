import { afterEach, expect, test } from "bun:test";
import { Text } from "@codemirror/state";
import { parsePuzzle } from "@yank-wars/engine";
import { createTargetView, type TargetView } from "./targetView.ts";

const puzzle = parsePuzzle({
  id: "target-pane",
  title: "Target pane",
  language: "javascript",
  tabSize: 2,
  indentUnit: "  ",
  start: "const a = 1;\nconst b = 2;\nconst c = 3;",
  target: "const a = 1;\nlet b = 2;\nconst c = 3;",
  solution: "jcwlet",
  source: { kind: "original", author: "yank-wars" },
});

const opened: { host: HTMLElement; view: TargetView }[] = [];

function open(): HTMLElement {
  const host = document.createElement("section");
  document.body.append(host);
  opened.push({ host, view: createTargetView(host, puzzle) });
  return host;
}

function lines(host: HTMLElement): [string, string][] {
  return [...host.querySelectorAll(".cm-line")].map((el) => [
    el.textContent ?? "",
    [...el.classList].filter((c) => c.startsWith("yw-")).join(" "),
  ]);
}

afterEach(() => {
  for (const { host, view } of opened.splice(0)) {
    view.destroy();
    host.remove();
  }
});

test("shows the target with the lines the start lacks marked pending", () => {
  const host = open();
  expect(lines(host)).toEqual([
    ["const a = 1;", ""],
    ["let b = 2;", "yw-pending"],
    ["const c = 3;", ""],
  ]);
});

test("setPlayerDoc clears the mark once the player's line matches", () => {
  const host = open();
  const view = opened[0]?.view;
  view?.setPlayerDoc(Text.of(["const a = 1;", "let b = 2;", "const c = 3;"]));
  expect(lines(host)).toEqual([
    ["const a = 1;", ""],
    ["let b = 2;", ""],
    ["const c = 3;", ""],
  ]);
});

test("is not editable and has no context menu", () => {
  const host = open();
  expect(host.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
  const menu = new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  host.querySelector(".cm-line")?.dispatchEvent(menu);
  expect(menu.defaultPrevented).toBe(true);
});

test("destroy removes the editor from its host", () => {
  const host = open();
  opened[0]?.view.destroy();
  expect(host.querySelector(".cm-editor")).toBeNull();
  opened.splice(0);
  host.remove();
});
