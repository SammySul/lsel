export interface KnownFailure {
  browsers: string[];
  /** process.platform values it was seen on; other platforms run the case normally */
  platforms: string[];
  reason: string;
}

/** Case id -> where the live editor knowingly differs from the headless engine; a listed case that passes fails the run. */
export const KNOWN_BROWSER_FAILURES: Readonly<Record<string, KnownFailure>> = {};

export function knownFailure(id: string, browser: string): KnownFailure | undefined {
  const k = KNOWN_BROWSER_FAILURES[id];
  return k?.browsers.includes(browser) && k.platforms.includes(process.platform) ? k : undefined;
}
