// Run `bun run build` first.
import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  eachBrowser,
  LSEL_LAYOUT,
  LSEL_LOOK,
  lselLayout,
  lselLook,
  serveBuilt,
  watchPage,
} from "@sammysul/lsel/testing";
import { name as project } from "../package.json";
import { api } from "../src/server/api.ts";

const url = serveBuilt(
  join(import.meta.dir, "../dist"),
  api(() => new Date("2026-11-27T14:05:00Z")),
);

eachBrowser((browser) => {
  test("the page renders in lsel's look under the strict CSP, with a quiet console", async () => {
    const ctx = await browser().newContext({ timezoneId: "UTC" });
    const page = await ctx.newPage();
    const watch = watchPage(page);
    await page.goto(url());
    expect(await page.getByRole("heading", { level: 1 }).textContent()).toBe(project);
    await page.getByText("Hello from the server").waitFor();
    expect(await page.locator(".answer").textContent()).toBe(
      "Hello from the server, Nov 27, 2:05 PM.",
    );
    expect(await lselLook(page)).toEqual(LSEL_LOOK);
    expect(await lselLayout(page)).toEqual(LSEL_LAYOUT);
    expect(await watch.take()).toEqual([]);
    await ctx.close();
  });
});
