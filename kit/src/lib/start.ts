// Mounts an app once its fonts are in, so no line is first set in a fallback face and then moved.

import { type Component, mount } from "svelte";

// tokens.css's faces; a face nothing on the page uses would otherwise load only once text needs it, after the first layout
const FACES = [
  '400 1em "Cantarell"',
  '700 1em "Cantarell"',
  '400 1em "DejaVu Sans Mono"',
  '700 1em "DejaVu Sans Mono"',
  '400 1em "MrRobot"',
];

/** A slow network gets the page in this long, in whatever faces have arrived. */
const WAIT = 500;

/** Every app's main.ts: the app, mounted in #app once the kit's fonts have loaded or WAIT has passed. */
export async function start(
  app: Component,
  target: HTMLElement | null = document.getElementById("app"),
): Promise<void> {
  if (target === null) throw new Error("index.html has no #app element");
  await Promise.race([
    Promise.allSettled(FACES.map((face) => document.fonts.load(face))),
    new Promise((done) => setTimeout(done, WAIT)),
  ]);
  mount(app, { target });
}
