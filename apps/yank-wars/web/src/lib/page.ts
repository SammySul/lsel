// The frame's props every screen shares: the app's name, its version and where its source lives.

import { version } from "../../../package.json";

export const PAGE = {
  name: "Yank Wars",
  version,
  source: "https://git.sammysul.com/SammySul/lsel/src/branch/main/apps/yank-wars",
} as const;

/** What the list and the keyboard notice say under the name. */
export const TAGLINE = "Vim golf against the clock: fewest keys wins";
