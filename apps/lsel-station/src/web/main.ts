// Mounts the game, read-only when another tab already runs it.

import "@sammysul/lsel/tokens.css";
import { start } from "@sammysul/lsel";
import App from "./App.svelte";

const LOCK = "lsel-station.game";

const run = (readOnly: boolean) => start(App, { props: { readOnly } });

// leaving lets go of the lock at once, so a waiting tab takes over; a page back from the bfcache starts over
const leaving = new AbortController();
window.addEventListener("pagehide", () => leaving.abort(), { once: true });
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
const untilLeaving = () =>
  new Promise<void>((resolve) => leaving.signal.addEventListener("abort", () => resolve()));
const ignore = () => {};

// one tab runs the game; any other shows it read-only, and takes over with the save when the first closes
if (navigator.locks === undefined) void run(false);
else {
  navigator.locks
    .request(LOCK, { ifAvailable: true }, (lock) => {
      if (lock === null) {
        void run(true);
        navigator.locks
          .request(LOCK, { signal: leaving.signal }, () => {
            location.reload();
            return untilLeaving();
          })
          .catch(ignore);
        return;
      }
      void run(false);
      return untilLeaving();
    })
    .catch(ignore);
}
