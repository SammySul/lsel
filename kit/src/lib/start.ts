// Mounts an app once its fonts are in, so no line is first set in a fallback face and then moved.

import { type Component, type MountOptions, mount } from "svelte";

// a first visit fetches every face over the tunnel (about a second each, preloaded together); a cached one is instant
const WAIT = 1500;

type NoProps = Record<string, never>;

/** `props` may be left out only when the app needs none. */
export type StartOptions<Props> = NoProps extends Props ? { props?: Props } : { props: Props };

/** Every app's main.ts: the app, mounted once every face the page knows has loaded or WAIT has passed. */
export async function start<Props extends Record<string, unknown>>(
  app: Component<Props>,
  ...[options]: NoProps extends Props ? [StartOptions<Props>?] : [StartOptions<Props>]
): Promise<void> {
  const target = document.getElementById("app");
  if (target === null) throw new Error("index.html has no #app element");
  // every face, used yet or not: one nothing has set yet would otherwise load after the first layout
  await Promise.race([
    Promise.allSettled([...document.fonts].map((face) => face.load())),
    new Promise((done) => setTimeout(done, WAIT)),
  ]);
  // the conditional on Props is settled at the call; mount can't see that through a generic
  mount(app, { target, props: options?.props } as MountOptions<Props>);
}
