// Mounts an app once its fonts are in, so no line is first set in a fallback face and then moved.

import { type Component, type MountOptions, mount } from "svelte";

/** A slow network gets the page in this long, in whatever faces have arrived. */
const WAIT = 500;

type NoProps = Record<string, never>;

/** `target` is #app unless given; `props` may be left out only when the app needs none. */
export type StartOptions<Props> = { target?: HTMLElement | null } & (NoProps extends Props
  ? { props?: Props }
  : { props: Props });

/** Every app's main.ts: the app, mounted once every face the page knows has loaded or WAIT has passed. */
export async function start<Props extends Record<string, unknown>>(
  app: Component<Props>,
  ...[options]: NoProps extends Props ? [StartOptions<Props>?] : [StartOptions<Props>]
): Promise<void> {
  const target = options?.target === undefined ? document.getElementById("app") : options.target;
  if (target === null) throw new Error("index.html has no #app element");
  // every face, used yet or not: one nothing has set yet would otherwise load after the first layout
  await Promise.race([
    Promise.allSettled([...document.fonts].map((face) => face.load())),
    new Promise((done) => setTimeout(done, WAIT)),
  ]);
  // the conditional on Props is settled at the call; mount can't see that through a generic
  mount(app, { target, props: options?.props } as MountOptions<Props>);
}
