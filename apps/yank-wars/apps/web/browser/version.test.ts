import { expect, test } from "bun:test";
import { playwrightDrift } from "./version.ts";

// Outside the dev shell there is nothing to compare against; CI runs this inside it.
test.skipIf(process.env.PLAYWRIGHT_DRIVER_VERSION === undefined)(
  "playwright-core is pinned to nixpkgs' playwright-driver",
  async () => {
    expect(await playwrightDrift()).toEqual([]);
  },
);
