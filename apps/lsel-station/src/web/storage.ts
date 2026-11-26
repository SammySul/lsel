// Keeps the save in the browser, and an unreadable one aside instead of losing it.

import { parseDocument, type SaveDocument } from "../save/document.ts";

const SAVE = "lsel-station.save";
const UNREADABLE = "lsel-station.save.unreadable";

// lsel-allow: the game's save and its sync link are the player's data, not a screen's choices
const store = () => localStorage;

export type Loaded =
  | { kind: "none" }
  | { kind: "save"; doc: SaveDocument }
  | { kind: "unreadable"; reason: string };

/** The save in this browser. One that cannot be read is moved aside, never overwritten. */
export function loadSave(): Loaded {
  let raw: string | null;
  try {
    raw = store().getItem(SAVE);
  } catch {
    return { kind: "unreadable", reason: "this browser keeps no storage for the page" };
  }
  if (raw === null) return { kind: "none" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = undefined;
  }
  const parsed = parseDocument(json);
  if (parsed.ok) return { kind: "save", doc: parsed.doc };
  try {
    // an earlier unreadable save keeps its place; this one goes beside it
    let aside = UNREADABLE;
    for (let n = 2; store().getItem(aside) !== null; n++) aside = `${UNREADABLE}.${n}`;
    store().setItem(aside, raw);
    store().removeItem(SAVE);
  } catch {
    // nothing more can be done in a browser that refuses storage
  }
  return { kind: "unreadable", reason: parsed.reason };
}

/** Whether the save was written. A full or refused storage keeps the game running unsaved. */
export function writeSave(doc: SaveDocument): boolean {
  try {
    store().setItem(SAVE, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function readItem(key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string | null): void {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    // kept for this visit only
  }
}
