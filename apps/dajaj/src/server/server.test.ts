import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "./config.ts";
import { fakePubg, WORLD } from "./fakePubg.ts";
import { Pubg } from "./pubg.ts";
import { handler, resolveStatic } from "./server.ts";

let web: string;
beforeAll(() => {
  web = join(mkdtempSync(join(tmpdir(), "dajaj-web-")), "web");
  mkdirSync(join(web, "assets"), { recursive: true });
  writeFileSync(join(web, "index.html"), "<!doctype html><title>dajaj</title>");
  writeFileSync(join(web, "assets", "app-abc.js"), "1");
});

function app() {
  const fake = fakePubg(WORLD);
  const pubg = new Pubg({
    apiKey: "test-key",
    baseUrl: "https://pubg.test/shards/steam",
    db: new Database(":memory:"),
    fetch: fake.fetch,
  });
  const players = ["AntennaTower", "Rectifier94", "Reason_ING"];
  const h = handler({ staticDir: web, players, pubg });
  const get = async (path: string) => {
    const r = await h(new Request(`http://dajaj.test${path}`));
    return { status: r.status, headers: r.headers, body: await r.text() };
  };
  return { fake, get };
}

describe("api", () => {
  test("lists the configured players", async () => {
    const { get } = app();
    const r = await get("/api/players");
    expect([r.status, JSON.parse(r.body)]).toEqual([
      200,
      { players: ["AntennaTower", "Rectifier94", "Reason_ING"] },
    ]);
  });

  test("the report covers every match both played, including one only the second player's list had", async () => {
    const { get } = app();
    const r = await get("/api/report?players=AntennaTower,Rectifier94");
    const body = JSON.parse(r.body);
    expect([r.status, r.headers.get("cache-control")]).toEqual([200, "no-store"]);
    expect([body.players, body.matchCount, body.earliest]).toEqual([
      ["AntennaTower", "Rectifier94"],
      3,
      "2026-11-10T20:05:00Z",
    ]);
    expect([body.totals.AntennaTower.kills, body.totals.Rectifier94.kills]).toEqual([7, 11]);
    expect(
      body.perMatch.map((m: { createdAt: string; stats: Record<string, { kills: number }> }) => [
        m.createdAt,
        m.stats.AntennaTower?.kills,
        m.stats.Rectifier94?.kills,
      ]),
    ).toEqual([
      ["2026-11-10T20:05:00Z", 2, 4],
      ["2026-11-12T21:40:00Z", 5, 1],
      ["2026-11-14T18:30:00Z", 0, 6],
    ]);
  });

  test("refuses empty, unknown and repeated players before asking PUBG", async () => {
    const { fake, get } = app();
    const answers = await Promise.all(
      [
        "/api/report",
        "/api/report?players=AntennaTower,Shroud",
        "/api/report?players=AntennaTower,AntennaTower",
      ].map(get),
    );
    expect(answers.map((r) => [r.status, JSON.parse(r.body).error])).toEqual([
      [400, "choose at least one player"],
      [400, "not a dajaj player: Shroud"],
      [400, "a player is listed twice"],
    ]);
    expect(fake.state.calls).toEqual([]);
  });

  test("PUBG's rate limit reaches the page as a 429 with a message", async () => {
    const { fake, get } = app();
    fake.state.fail = 429;
    const r = await get("/api/report?players=AntennaTower");
    expect([r.status, JSON.parse(r.body)]).toEqual([
      429,
      { error: "PUBG's rate limit was hit; try again in a minute" },
    ]);
  });

  test("an unknown api path is a json 404", async () => {
    const { get } = app();
    const r = await get("/api/nope");
    expect([r.status, JSON.parse(r.body)]).toEqual([404, { error: "no such endpoint" }]);
  });
});

describe("static files", () => {
  test("index, hashed assets, healthz and the security headers", async () => {
    const { get } = app();
    const [index, asset, health] = await Promise.all([
      get("/"),
      get("/assets/app-abc.js"),
      get("/healthz"),
    ]);
    expect([
      index.status,
      index.headers.get("cache-control"),
      asset.headers.get("cache-control"),
      health.body,
    ]).toEqual([200, "no-cache", "public, max-age=31536000, immutable", "ok"]);
    expect(index.headers.get("content-security-policy")).toBe(
      "default-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  test("paths leaving the web root are refused", () => {
    expect(resolveStatic("/srv/web", "/index.html")).toBe("/srv/web/index.html");
    expect(resolveStatic("/srv/web", "/..%2f..%2fetc/passwd")).toBeNull();
    expect(resolveStatic("/srv/web", "/index.html%00.js")).toBeNull();
  });
});

describe("config", () => {
  const base = {
    DAJAJ_STATIC: "/srv/web",
    DAJAJ_DB: "/var/lib/dajaj/cache.sqlite",
    PUBG_API_KEY: "k",
  };

  test("defaults and the player list", () => {
    expect(parseConfig({ ...base, DAJAJ_PLAYERS: "AntennaTower, Rectifier94" })).toEqual({
      host: "127.0.0.1",
      port: 7310,
      staticDir: "/srv/web",
      db: "/var/lib/dajaj/cache.sqlite",
      players: ["AntennaTower", "Rectifier94"],
      apiKey: "k",
      apiUrl: "https://api.pubg.com/shards/steam",
    });
  });

  test("names every bad variable without printing the key", () => {
    expect(() =>
      parseConfig({ DAJAJ_STATIC: "web", DAJAJ_DB: "/x", DAJAJ_PLAYERS: ",", PUBG_API_KEY: "" }),
    ).toThrow(
      "bad environment:\n  DAJAJ_STATIC: an absolute path to the built web app\n  DAJAJ_PLAYERS: a comma-separated list of PUBG names\n  PUBG_API_KEY: the PUBG API key",
    );
  });
});
