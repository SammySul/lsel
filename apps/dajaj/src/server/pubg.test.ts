import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FakeWorld, fakePubg, WORLD } from "./fakePubg.ts";
import { Pubg, PubgError } from "./pubg.ts";

const BASE = "https://pubg.test/shards/steam";

function setup(opts: { now?: () => number; db?: Database; world?: FakeWorld } = {}) {
  const fake = fakePubg(opts.world ?? WORLD);
  const pubg = new Pubg({
    apiKey: "test-key",
    baseUrl: BASE,
    db: opts.db ?? new Database(":memory:"),
    fetch: fake.fetch,
    ...(opts.now ? { now: opts.now } : {}),
  });
  return { fake, pubg };
}

async function failure(p: Promise<unknown>): Promise<[string, string]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof PubgError) return [e.kind, e.message];
    throw e;
  }
  throw new Error("expected a PubgError");
}

test("players are looked up in one call and then come from memory", async () => {
  const { fake, pubg } = setup();
  expect(await pubg.players(["AntennaTower", "Rectifier94"])).toEqual([
    { id: "account.antenna", name: "AntennaTower" },
    { id: "account.rect", name: "Rectifier94" },
  ]);
  await pubg.players(["Rectifier94", "AntennaTower"]);
  expect(fake.state.calls).toEqual(["/players?filter[playerNames]=AntennaTower,Rectifier94"]);
});

test("a new name is looked up alone, the known ones stay cached", async () => {
  const { fake, pubg } = setup();
  await pubg.players(["AntennaTower"]);
  await pubg.players(["AntennaTower", "Reason_ING"]);
  expect(fake.state.calls).toEqual([
    "/players?filter[playerNames]=AntennaTower",
    "/players?filter[playerNames]=Reason_ING",
  ]);
});

test("an unknown player is a not-found error naming them", async () => {
  const { pubg } = setup();
  expect(await failure(pubg.players(["Nobody"]))).toEqual([
    "not-found",
    "PUBG has no player called Nobody",
  ]);
});

test("recent matches are cached for 20 minutes, then asked for again", async () => {
  let now = 0;
  const { fake, pubg } = setup({ now: () => now });
  expect(await pubg.recentMatchIds("account.antenna")).toEqual(["m-1", "m-2", "m-3"]);
  now = 19 * 60_000;
  await pubg.recentMatchIds("account.antenna");
  now = 21 * 60_000;
  await pubg.recentMatchIds("account.antenna");
  expect(fake.state.calls).toEqual([
    "/players/account.antenna/seasons/lifetime",
    "/players/account.antenna/seasons/lifetime",
  ]);
});

test("a match keeps only participants and survives a restart, so PUBG is asked once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dajaj-"));
  const first = setup({ db: new Database(join(dir, "cache.sqlite")) });
  const m = await first.pubg.match("m-2");
  expect([m.id, m.createdAt, m.participants.map((p) => [p.playerId, p.kills])]).toEqual([
    "m-2",
    "2026-11-12T21:40:00Z",
    [
      ["account.antenna", 5],
      ["account.rect", 1],
      ["account.reason", 3],
    ],
  ]);
  const second = setup({ db: new Database(join(dir, "cache.sqlite")) });
  expect(await second.pubg.match("m-2")).toEqual(m);
  expect([first.fake.state.calls, second.fake.state.calls]).toEqual([["/matches/m-2"], []]);
});

test("identical requests in flight are merged into one call", async () => {
  const { fake, pubg } = setup();
  await Promise.all([
    pubg.match("m-1"),
    pubg.match("m-1"),
    pubg.recentMatchIds("account.rect"),
    pubg.recentMatchIds("account.rect"),
  ]);
  expect(fake.state.calls.sort()).toEqual([
    "/matches/m-1",
    "/players/account.rect/seasons/lifetime",
  ]);
});

test("recent matches of several players are fetched once each", async () => {
  const { fake, pubg } = setup();
  const players = await pubg.players(["AntennaTower", "Rectifier94"]);
  const { matches, missing } = await pubg.recentMatches(players);
  expect([matches.map((m) => m.id).sort(), missing]).toEqual([["m-1", "m-2", "m-3", "m-4"], 0]);
  expect(fake.state.calls.filter((c) => c.startsWith("/matches/")).sort()).toEqual([
    "/matches/m-1",
    "/matches/m-2",
    "/matches/m-3",
    "/matches/m-4",
  ]);
});

test("a match that fails to load is counted as missing; the rest still make the report", async () => {
  // m-gone is in AntennaTower's recent list, but PUBG has no such match
  const world = { ...WORLD, recent: { ...WORLD.recent, "account.antenna": ["m-1", "m-gone"] } };
  const { pubg } = setup({ world });
  const players = await pubg.players(["AntennaTower"]);
  const { matches, missing } = await pubg.recentMatches(players);
  expect([matches.map((m) => m.id), missing]).toEqual([["m-1"], 1]);
});

test("when no match loads, the first failure is the error", async () => {
  const { fake, pubg } = setup();
  const players = await pubg.players(["Reason_ING"]);
  await pubg.recentMatchIds("account.reason");
  fake.state.fail = 503;
  expect(await failure(pubg.recentMatches(players))).toEqual(["unavailable", "PUBG answered 503"]);
});

test("at most 8 matches are fetched at once", async () => {
  const ids = Array.from({ length: 20 }, (_, i) => `m-${i}`);
  const world: FakeWorld = {
    players: { AntennaTower: "account.antenna" },
    recent: { "account.antenna": ids },
    matches: ids.map((id) => ({ id, createdAt: "2026-11-10T20:05:00Z", kills: {} })),
  };
  const fake = fakePubg(world);
  let running = 0;
  let most = 0;
  const pubg = new Pubg({
    apiKey: "test-key",
    baseUrl: BASE,
    db: new Database(":memory:"),
    fetch: async (url, init) => {
      most = Math.max(most, ++running);
      await Bun.sleep(5);
      running--;
      return fake.fetch(url, init);
    },
  });
  const { matches } = await pubg.recentMatches(await pubg.players(["AntennaTower"]));
  expect([matches.length, most]).toEqual([20, 8]);
});

test("PUBG's failures become typed errors", async () => {
  const { fake, pubg } = setup();
  fake.state.fail = 429;
  expect(await failure(pubg.players(["AntennaTower"]))).toEqual([
    "rate-limited",
    "PUBG's rate limit was hit; try again in a minute",
  ]);
  fake.state.fail = 503;
  expect(await failure(pubg.match("m-1"))).toEqual(["unavailable", "PUBG answered 503"]);
  fake.state.fail = undefined;
  fake.state.apiKey = "another-key";
  expect(await failure(pubg.players(["AntennaTower"]))).toEqual([
    "refused",
    "PUBG refused dajaj's API key",
  ]);
});

test("a response in a shape dajaj doesn't read fails loudly, naming the field", async () => {
  const pubg = new Pubg({
    apiKey: "k",
    baseUrl: BASE,
    db: new Database(":memory:"),
    fetch: async () => new Response(JSON.stringify({ data: [{ id: "x", attributes: {} }] })),
  });
  expect(await failure(pubg.players(["AntennaTower"]))).toEqual([
    "unexpected",
    'PUBG\'s player lookup has an unexpected shape at data.0.attributes.name: Invalid key: Expected "name" but received undefined',
  ]);
});

test("a match with a date that isn't one fails loudly, naming the field", async () => {
  const world = {
    ...WORLD,
    matches: [{ id: "m-1", createdAt: "yesterday", kills: { "account.antenna": 1 } }],
  };
  const { pubg } = setup({ world });
  expect(await failure(pubg.match("m-1"))).toEqual([
    "unexpected",
    'PUBG\'s match has an unexpected shape at data.attributes.createdAt: Invalid timestamp: Received "yesterday"',
  ]);
});

test("PUBG being unreachable is an unavailable error", async () => {
  const pubg = new Pubg({
    apiKey: "k",
    baseUrl: BASE,
    db: new Database(":memory:"),
    fetch: async () => {
      throw new Error("connection refused");
    },
  });
  expect(await failure(pubg.match("m-1"))).toEqual([
    "unavailable",
    "PUBG could not be reached: connection refused",
  ]);
});
