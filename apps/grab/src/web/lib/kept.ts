// Every profile this visit loaded, so switching back shows it at once while the server is asked again.

import { SvelteMap } from "svelte/reactivity";
import type { Profile } from "../../shared/types.ts";

const kept = new SvelteMap<string, Profile>();

/** The copy to show for `username`: the last answer, unless it is partial and a whole one was kept. */
export const shownFor = (username: string): Profile | undefined => kept.get(username);

/** A whole profile is never swapped for a partial one, so a refresh moves nothing until it is in. */
export function keep(username: string, answer: Profile): void {
  const old = kept.get(username);
  if (old === undefined || old.pending > 0 || answer.pending === 0) kept.set(username, answer);
}
