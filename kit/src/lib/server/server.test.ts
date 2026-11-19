import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as v from "valibot";
import { handler, json, parseEnv, type Routes, resolveStatic } from "./index.ts";

let web: string;
beforeAll(() => {
  web = join(mkdtempSync(join(tmpdir(), "web-")), "web");
  mkdirSync(join(web, "assets"), { recursive: true });
  writeFileSync(join(web, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(web, "assets", "app-abc.js"), "1");
});

async function get(path: string, method = "GET", routes?: Routes) {
  const h = handler(web, routes);
  const r = await h(new Request(`http://app.test${path}`, { method }));
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

  test("a missing file is a 404 and only GET and HEAD reach the files", async () => {
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

describe("a project's routes", () => {
  const routes: Routes = (req, url) => {
    if (url.pathname === "/api/save" && req.method === "PUT") return json({ saved: true });
    if (url.pathname.startsWith("/api/")) return json({ error: "no such endpoint" }, 404);
    return undefined;
  };

  test("answer before the files, with any method, and fall through when they pass", async () => {
    const [put, unknown, index, health] = await Promise.all([
      get("/api/save", "PUT", routes),
      get("/api/nope", "GET", routes),
      get("/", "GET", routes),
      get("/healthz", "GET", () => json({ shadowed: true })),
    ]);
    expect([put.status, put.body, put.headers.get("cache-control")]).toEqual([
      200,
      '{"saved":true}',
      "no-store",
    ]);
    expect([unknown.status, unknown.body]).toEqual([404, '{"error":"no such endpoint"}']);
    expect([index.status, index.body]).toEqual([200, "<!doctype html><title>app</title>"]);
    expect(health.body).toBe("ok");
    expect(put.headers.get("content-security-policy")).toStartWith("default-src 'self'");
  });
});

test("a project's own CSP replaces the default on every response", async () => {
  const csp = "default-src 'self'; style-src 'self' 'unsafe-inline'";
  const h = handler(web, () => undefined, { csp });
  const answers = await Promise.all(
    ["/", "/healthz", "/nope.js"].map((p) => h(new Request(`http://app.test${p}`))),
  );
  expect(answers.map((r) => [r.status, r.headers.get("content-security-policy")])).toEqual([
    [200, csp],
    [200, csp],
    [404, csp],
  ]);
});

describe("environment", () => {
  test("defaults, from the package's name", () => {
    expect(parseEnv("my-app", { MY_APP_STATIC: "/srv/web" })).toEqual({
      host: "127.0.0.1",
      port: 7000,
      staticDir: "/srv/web",
    });
    expect(parseEnv("my-app", { MY_APP_STATIC: "/srv/web" }, {}, 7310).port).toBe(7310);
  });

  test("a project's own variables come back under their names", () => {
    const config = parseEnv(
      "dajaj",
      { DAJAJ_STATIC: "/srv/web", DAJAJ_PORT: "7311", PUBG_API_KEY: "k3y" },
      { PUBG_API_KEY: v.pipe(v.string(), v.nonEmpty("the PUBG API key")) },
    );
    expect(config).toEqual({
      host: "127.0.0.1",
      port: 7311,
      staticDir: "/srv/web",
      PUBG_API_KEY: "k3y",
    });
  });

  test("names every bad variable, a project's own among them", () => {
    expect(() =>
      parseEnv(
        "my-app",
        { MY_APP_STATIC: "web", MY_APP_PORT: "70000" },
        { MY_APP_DB: v.string("an absolute path to the database") },
      ),
    ).toThrow(
      "bad environment:\n  MY_APP_DB: an absolute path to the database\n  MY_APP_PORT: Invalid value: Expected <=65535 but received 70000\n  MY_APP_STATIC: an absolute path to the built web app",
    );
  });
});
