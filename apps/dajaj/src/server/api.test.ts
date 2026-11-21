import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler, parseEnv } from "@sammysul/lsel/server";
import { api } from "./api.ts";
import { ENV, PORT } from "./config.ts";
import { fakePubg, WORLD } from "./fakePubg.ts";
import { Pubg } from "./pubg.ts";

let web: string;
beforeAll(() => {
  web = join(mkdtempSync(join(tmpdir(), "dajaj-web-")), "web");
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, "index.html"), "<!doctype html><title>dajaj</title>");
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
  const h = handler(web, api({ players, pubg }));
  const get = async (path: string, method = "GET") => {
    const r = await h(new Request(`http://dajaj.test${path}`, { method }));
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
      ].map((path) => get(path)),
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

  test("an unknown api path is a json 404, only GET and HEAD reach the api, and the rest is the web app", async () => {
    const { get } = app();
    const [nope, post, index] = await Promise.all([
      get("/api/nope"),
      get("/api/players", "POST"),
      get("/"),
    ]);
    expect([
      nope.status,
      JSON.parse(nope.body),
      post.status,
      post.headers.get("allow"),
      index.status,
      index.body,
    ]).toEqual([
      404,
      { error: "no such endpoint" },
      405,
      "GET, HEAD",
      200,
      "<!doctype html><title>dajaj</title>",
    ]);
  });
});

describe("config", () => {
  const base = {
    DAJAJ_STATIC: "/srv/web",
    DAJAJ_DB: "/var/lib/dajaj/cache.sqlite",
    PUBG_API_KEY: "k",
  };
  const parse = (env: Record<string, string>) => parseEnv("dajaj", env, ENV, PORT);

  test("defaults and the player list", () => {
    expect(parse({ ...base, DAJAJ_PLAYERS: "AntennaTower, Rectifier94" })).toEqual({
      host: "127.0.0.1",
      port: 7310,
      staticDir: "/srv/web",
      DAJAJ_DB: "/var/lib/dajaj/cache.sqlite",
      DAJAJ_PLAYERS: ["AntennaTower", "Rectifier94"],
      PUBG_API_KEY: "k",
      PUBG_API_URL: "https://api.pubg.com/shards/steam",
    });
  });

  test("names every missing variable", () => {
    expect(() => parse({})).toThrow(
      "bad environment:\n  DAJAJ_DB: an absolute path to the match cache (an SQLite file)\n  DAJAJ_PLAYERS: a comma-separated list of PUBG names\n  DAJAJ_STATIC: an absolute path to the built web app\n  PUBG_API_KEY: the PUBG API key",
    );
  });

  test("names every bad variable without printing the key", () => {
    expect(() =>
      parse({ DAJAJ_STATIC: "/srv/web", DAJAJ_DB: "cache", DAJAJ_PLAYERS: ",", PUBG_API_KEY: "" }),
    ).toThrow(
      "bad environment:\n  DAJAJ_DB: an absolute path to the match cache (an SQLite file)\n  DAJAJ_PLAYERS: a comma-separated list of PUBG names\n  PUBG_API_KEY: the PUBG API key",
    );
    expect(() =>
      parse({ ...base, DAJAJ_PLAYERS: "a,b,c,d,e,f,g,h,i,j,k", PUBG_API_KEY: "secret-key" }),
    ).toThrow(/^bad environment:\n {2}DAJAJ_PLAYERS: at most 10 names \(one PUBG lookup\)$/);
  });
});
