// Counts what is waiting right now, for the loading bar.

/** How long a wait goes unshown, so a fast answer doesn't flash a waiting line or the bar. */
export const DELAY = 300;

/** How many things are waiting right now: requests, busy actions. The loading bar reads it. */
export const activity = $state({ count: 0 });

/** Counts one wait; the returned function ends it, once. */
export function begin(): () => void {
  activity.count++;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activity.count--;
  };
}
