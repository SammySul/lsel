// The fonts kept in this browser, read before the app mounts so its first paint already lists them.

import { loadStored } from "./fonts.ts";

/** Null when this browser's storage can't be opened. */
export const stored = await loadStored().catch(() => null);
