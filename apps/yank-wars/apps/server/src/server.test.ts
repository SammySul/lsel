import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, parseConfig } from "./server.ts";

let dir: string;
let handle: (req: Request) => Promise<Response>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "yw-server-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Yank Wars</title>");
  handle = app(dir);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string) => handle(new Request(`http://yw.test${path}`));

describe("app", () => {
  test("serves the web app and /healthz, with no SPA fallback", async () => {
    const [index, health, route] = await Promise.all([get("/"), get("/healthz"), get("/p/x")]);
    expect([
      index.status,
      await index.text(),
      health.status,
      await health.text(),
      route.status,
    ]).toEqual([200, "<!doctype html><title>Yank Wars</title>", 200, "ok", 404]);
  });

  test("every response allows CodeMirror's inline styles and keeps the other headers", async () => {
    for (const p of ["/", "/nope", "/healthz", "/assets"]) {
      const h = (await get(p)).headers;
      expect([
        h.get("content-security-policy"),
        h.get("x-content-type-options"),
        h.get("referrer-policy"),
      ]).toEqual([
        "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "nosniff",
        "no-referrer",
      ]);
    }
  });
});

describe("parseConfig", () => {
  test("reads YW_ variables, defaulting to 127.0.0.1:7300", () => {
    expect(parseConfig({ YW_STATIC: "/srv/web" })).toEqual({
      host: "127.0.0.1",
      port: 7300,
      staticDir: "/srv/web",
    });
    expect(parseConfig({ YW_HOST: "0.0.0.0", YW_PORT: "8080", YW_STATIC: "/x" })).toEqual({
      host: "0.0.0.0",
      port: 8080,
      staticDir: "/x",
    });
  });

  test("names each bad variable", () => {
    expect(() => parseConfig({ YW_PORT: "70000", YW_STATIC: "web" })).toThrow(
      "bad environment:\n  YW_PORT: Invalid value: Expected <=65535 but received 70000\n  YW_STATIC: an absolute path to the built web app",
    );
  });
});
