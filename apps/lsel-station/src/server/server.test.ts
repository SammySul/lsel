import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportString, toDocument } from "../save/document.ts";
import { keyId } from "../save/key.ts";
import { apply } from "../sim/commands.ts";
import { newGame } from "../sim/state.ts";
import { tick } from "../sim/tick.ts";
import { PREFIX, parseConfig } from "./config.ts";
import { openSaves } from "./saves.ts";
import { handler, resolveStatic } from "./server.ts";

let web: string;
beforeAll(() => {
  web = join(mkdtempSync(join(tmpdir(), "web-")), "web");
  mkdirSync(join(web, "assets"), { recursive: true });
  writeFileSync(join(web, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(web, "assets", "app-abc.js"), "1");
});

async function get(path: string, method = "GET") {
  const r = await handler({ staticDir: web, saves: openSaves(":memory:") })(
    new Request(`http://app.test${path}`, { method }),
  );
  return { status: r.status, headers: r.headers, body: await r.text() };
}

describe("static files", () => {
  test("index, hashed assets, healthz and the security headers", async () => {
    const [index, asset, health] = await Promise.all([
      get("/"),
      get("/assets/app-abc.js"),
      get("/healthz"),
    ]);
    expect([
      index.status,
      index.body,
      index.headers.get("cache-control"),
      asset.headers.get("cache-control"),
      health.body,
    ]).toEqual([
      200,
      "<!doctype html><title>app</title>",
      "no-cache",
      "public, max-age=31536000, immutable",
      "ok",
    ]);
    expect(index.headers.get("content-security-policy")).toBe(
      "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  test("a missing file is a 404 and only GET and HEAD are allowed", async () => {
    const [missing, post, head] = await Promise.all([
      get("/nope.js"),
      get("/", "POST"),
      get("/", "HEAD"),
    ]);
    expect([
      missing.status,
      post.status,
      post.headers.get("allow"),
      head.status,
      head.body,
    ]).toEqual([404, 405, "GET, HEAD", 200, ""]);
  });

  test("paths leaving the web root are refused", () => {
    expect(resolveStatic("/srv/web", "/index.html")).toBe("/srv/web/index.html");
    expect(resolveStatic("/srv/web", "/..%2f..%2fetc/passwd")).toBeNull();
    expect(resolveStatic("/srv/web", "/index.html%00.js")).toBeNull();
  });
});

describe("config", () => {
  test("defaults", () => {
    expect(
      parseConfig({
        [`${PREFIX}_STATIC`]: "/srv/web",
        [`${PREFIX}_DB`]: "/var/lib/x/saves.sqlite",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 7000,
      staticDir: "/srv/web",
      db: "/var/lib/x/saves.sqlite",
    });
  });

  test("names every bad variable", () => {
    expect(() => parseConfig({ [`${PREFIX}_STATIC`]: "web", [`${PREFIX}_PORT`]: "70000" })).toThrow(
      `bad environment:\n  ${PREFIX}_PORT: Invalid value: Expected <=65535 but received 70000\n  ${PREFIX}_STATIC: an absolute path to the built web app\n  ${PREFIX}_DB: an absolute path to the saves database`,
    );
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
    const serve = handler({ staticDir: web, saves: openSaves(":memory:") });
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
