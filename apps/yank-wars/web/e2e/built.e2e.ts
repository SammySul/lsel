// The production build behind the real server's CSP. Run `bun run build` first.
import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { handler, upgrade } from "@sammysul/lsel/server";
import { eachBrowser, LSEL_LOOK, lselLook, serveBuilt, watchPage } from "@sammysul/lsel/testing";
import { PUZZLES, picker } from "../../server/src/puzzles.ts";
import { type Conn, Rooms } from "../../server/src/rooms.ts";
import { CSP } from "../../server/src/server.ts";

const dist = join(import.meta.dir, "../dist");
const url = serveBuilt(dist, undefined, { csp: CSP });

// The built app and the rooms on one origin, as in production; no claims, so no replays.
const rooms = new Rooms({
  puzzles: PUZZLES,
  pick: picker(PUZZLES),
  verify: () => Promise.reject(new Error("no replays here")),
  mismatch: () => {},
});
const socket = rooms.socket();
const app = handler(dist, undefined, { csp: CSP });
const withRooms = Bun.serve<Conn>({
  port: 0,
  fetch: (req, srv) =>
    new URL(req.url).pathname === socket.path ? upgrade(socket, req, srv) : app(req),
  websocket: socket.handler,
});
afterAll(() => {
  rooms.close();
  withRooms.stop(true);
});

eachBrowser((browser) => {
  test("lsel's look, and CodeMirror styled under the server's CSP", async () => {
    const page = await browser().newPage({ viewport: { width: 1280, height: 800 } });
    const watch = watchPage(page);
    await page.goto(url(), { waitUntil: "networkidle" });
    expect(await lselLook(page)).toEqual(LSEL_LOOK);
    await page.goto(`${url()}#/p/indent-body`, { waitUntil: "networkidle" });
    await page.locator(".cm-editor").first().waitFor();
    // CodeMirror's base theme makes the editor `position: relative`, from a <style> it injects
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector(".cm-editor") as Element).position,
      ),
    ).toBe("relative");
    expect(await watch.take()).toEqual([]);
    await page.close();
  });

  test("a room's socket connects under the server's CSP", async () => {
    const page = await browser().newPage({ viewport: { width: 1280, height: 800 } });
    const watch = watchPage(page);
    await page.goto(`${withRooms.url.href}#/r`, { waitUntil: "networkidle" });
    await page.locator(".invite .link").waitFor({ timeout: 10_000 });
    expect(await page.evaluate(() => /^#\/r\/[a-z2-7]{10}$/.test(location.hash))).toBe(true);
    expect(await watch.take()).toEqual([]);
    await page.close();
  });
});
