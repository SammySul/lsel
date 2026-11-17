import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "./config.ts";
import { handler, resolveStatic } from "./server.ts";

let web: string;
beforeAll(() => {
  web = join(mkdtempSync(join(tmpdir(), "typ-web-")), "web");
  mkdirSync(join(web, "assets"), { recursive: true });
  writeFileSync(join(web, "index.html"), "<!doctype html><title>typ</title>");
  writeFileSync(join(web, "assets", "app-abc.js"), "1");
});

async function get(path: string, method = "GET") {
  const r = await handler(web)(new Request(`http://typ.test${path}`, { method }));
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
      "<!doctype html><title>typ</title>",
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
    expect(parseConfig({ TYP_STATIC: "/srv/web" })).toEqual({
      host: "127.0.0.1",
      port: 7200,
      staticDir: "/srv/web",
    });
  });

  test("names every bad variable", () => {
    expect(() => parseConfig({ TYP_STATIC: "web", TYP_PORT: "70000" })).toThrow(
      "bad environment:\n  TYP_PORT: Invalid value: Expected <=65535 but received 70000\n  TYP_STATIC: an absolute path to the built web app",
    );
  });
});
