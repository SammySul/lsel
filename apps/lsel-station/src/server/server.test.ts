import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler, parseEnv } from "@sammysul/lsel/server";
import { name } from "../../package.json";
import { exportString, toDocument } from "../save/document.ts";
import { keyId } from "../save/key.ts";
import { apply } from "../sim/commands.ts";
import { newGame } from "../sim/state.ts";
import { tick } from "../sim/tick.ts";
import { openSaves } from "./saves.ts";
import { ENV, syncRoutes } from "./sync.ts";

let web: string;
beforeAll(() => {
  web = mkdtempSync(join(tmpdir(), "web-"));
});

describe("config", () => {
  test("the saves database is read from LSEL_STATION_DB", () => {
    expect(
      parseEnv(
        name,
        { LSEL_STATION_STATIC: "/srv/web", LSEL_STATION_DB: "/var/lib/x/saves.sqlite" },
        ENV,
      ),
    ).toEqual({
      host: "127.0.0.1",
      port: 7000,
      staticDir: "/srv/web",
      LSEL_STATION_DB: "/var/lib/x/saves.sqlite",
    });
  });

  test("a missing or relative database path is named", () => {
    expect(() => parseEnv(name, { LSEL_STATION_STATIC: "/srv/web" }, ENV)).toThrow(
      "bad environment:\n  LSEL_STATION_DB: an absolute path to the saves database",
    );
    expect(() =>
      parseEnv(name, { LSEL_STATION_STATIC: "/srv/web", LSEL_STATION_DB: "saves.sqlite" }, ENV),
    ).toThrow("bad environment:\n  LSEL_STATION_DB: an absolute path to the saves database");
  });
});

describe("sync", () => {
  const KEY = "k3y-0f-at-least-16-chars";
  const save = (ore: number) => {
    const state = newGame(7);
    state.items["iron-ore"] = ore;
    apply(state, { kind: "assign", crew: "ana-petrov", action: "iron-asteroid" });
    for (let i = 0; i < 50; i++) tick(state);
    return exportString(toDocument(state, 1_800_000_000_000 + ore));
  };

  async function service() {
    const id = await keyId(KEY);
    const serve = handler(web, syncRoutes(openSaves(":memory:")));
    const call = async (method: string, body?: unknown, key = KEY, path = `/save/${id}`) => {
      const r = await serve(
        new Request(`http://app.test${path}`, {
          method,
          headers: { authorization: `Bearer ${key}` },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      const json = r.headers.get("content-type") === "application/json";
      return { status: r.status, body: json ? await r.json() : await r.text() };
    };
    return { id, call };
  }

  test("the id in the address is the SHA-256 of the key", async () => {
    expect(await keyId("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("a save is stored at revision 1, read back, and moved on only from the revision it is at", async () => {
    const { call } = await service();
    const first = save(1);
    expect(await call("GET")).toEqual({ status: 404, body: { error: "no such save" } });
    expect(await call("PUT", { base: 0, data: first })).toEqual({
      status: 200,
      body: { revision: 1 },
    });
    expect(await call("GET")).toEqual({
      status: 200,
      body: { revision: 1, savedAt: 1_800_000_000_001, playedMs: 10_000, data: first },
    });
    expect(await call("PUT", { base: 1, data: save(2) })).toEqual({
      status: 200,
      body: { revision: 2 },
    });
  });

  test("a device that started from an older revision gets the newer save back, and nothing is stored", async () => {
    const { call } = await service();
    await call("PUT", { base: 0, data: save(1) });
    await call("PUT", { base: 1, data: save(2) });
    expect([
      await call("PUT", { base: 1, data: save(3) }),
      await call("PUT", { base: 0, data: save(4) }),
    ]).toEqual([
      {
        status: 409,
        body: { revision: 2, savedAt: 1_800_000_000_002, playedMs: 10_000, data: save(2) },
      },
      {
        status: 409,
        body: { revision: 2, savedAt: 1_800_000_000_002, playedMs: 10_000, data: save(2) },
      },
    ]);
  });

  test("a device whose send went unanswered learns whether one of the last 20 stored was its own", async () => {
    const { id, call } = await service();
    for (let ore = 1; ore <= 22; ore++) await call("PUT", { base: ore - 1, data: save(ore) });
    const landed = async (ore: number) =>
      (await call("GET", undefined, KEY, `/save/${id}?sent=${1_800_000_000_000 + ore}`)).body
        .landed;
    expect([await landed(22), await landed(3), await landed(2), await landed(99)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  test("the wrong key, a bad body, a damaged save and a huge one are refused", async () => {
    const { id, call } = await service();
    expect([
      await call("GET", undefined, "another-key-of-16-chars"),
      await call("GET", undefined, "short"),
      await call("PUT", { base: "0", data: save(1) }),
      await call("PUT", { base: 0, data: "lsel-station:garbage" }),
      await call("PUT", { base: 0, data: "x".repeat(200_000) }),
      await call("DELETE"),
      await call("GET", undefined, KEY, `/save/${id.slice(1)}`),
    ]).toEqual([
      { status: 403, body: { error: "wrong key" } },
      { status: 403, body: { error: "wrong key" } },
      { status: 400, body: { error: "expected { base, data }" } },
      { status: 400, body: { error: "the text is damaged" } },
      { status: 413, body: { error: "save too large" } },
      { status: 405, body: "method not allowed" },
      { status: 404, body: "not found" },
    ]);
  });

  test("one save gets 30 requests a minute", async () => {
    const { call } = await service();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await call("GET")).status);
    expect([statuses.slice(0, 30).every((s) => s === 404), statuses[30]]).toEqual([true, 429]);
  });
});
