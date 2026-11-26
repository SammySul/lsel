import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as v from "valibot";
import { handler, json, parseEnv, type Routes, type Socket, upgrade } from "./index.ts";

let web: string;
beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), "web-"));
  web = join(root, "web");
  mkdirSync(join(web, "assets"), { recursive: true });
  writeFileSync(join(root, "secret.txt"), "not for the web");
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

  test("paths leaving the web root are refused", async () => {
    const answers = await Promise.all(
      ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/index.html%00.js", "/%E0%A4%A"].map((p) =>
        get(p),
      ),
    );
    expect(answers.map((a) => [a.status, a.body])).toEqual([
      [404, "not found"],
      [404, "not found"],
      [404, "not found"],
      [404, "not found"],
    ]);
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

test("a project's CSP adds to the default, replacing directives by name, on every response", async () => {
  const h = handler(web, () => undefined, {
    csp: "style-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
  });
  const answers = await Promise.all(
    ["/", "/healthz", "/nope.js"].map((p) => h(new Request(`http://app.test${p}`))),
  );
  const csp =
    "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; style-src 'self' 'unsafe-inline'";
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

describe("sockets", () => {
  // Echoes each message with the name the upgrade gave the socket.
  const socket: Socket<{ name: string }> = {
    path: "/ws",
    data: (req) => {
      const name = new URL(req.url).searchParams.get("name");
      return name === null ? new Response("who are you", { status: 400 }) : { name };
    },
    handler: {
      message: (ws, m) => {
        ws.send(`${ws.data.name}: ${m}`);
      },
    },
  };
  const server = Bun.serve<{ name: string }>({
    port: 0,
    fetch: (req, srv) => upgrade(socket, req, srv),
    websocket: socket.handler,
  });
  afterAll(() => server.stop(true));
  const base = `ws://${server.hostname}:${server.port}/ws`;

  function first(ws: WebSocket): Promise<string> {
    return new Promise((resolve, reject) => {
      ws.onmessage = (e) => resolve(String(e.data));
      ws.onerror = () => reject(new Error("socket error"));
      ws.onclose = (e) => reject(new Error(`closed ${e.code}`));
    });
  }

  test("an upgrade carries its data to the handler", async () => {
    const ws = new WebSocket(`${base}?name=ada`);
    ws.onopen = () => ws.send("hi");
    expect(await first(ws)).toBe("ada: hi");
    ws.close();
  });

  test("a same-origin page gets past the origin check, another site's does not", async () => {
    const at = `http://${server.hostname}:${server.port}`;
    // A plain fetch has no WebSocket key, so a request past the check ends at the 426.
    const ask = (origin: string) =>
      fetch(`${at}/ws?name=ada`, {
        headers: { Origin: origin, Upgrade: "websocket", Connection: "Upgrade" },
      }).then(async (r) => [r.status, await r.text()]);
    expect(await ask(at)).toEqual([426, "expected a WebSocket upgrade"]);
    expect(await ask("https://evil.example")).toEqual([403, "cross-origin socket refused"]);
  });

  test("data refusing the socket answers with its response; a plain request is told to upgrade", async () => {
    const refused = await fetch(`http://${server.hostname}:${server.port}/ws`, {
      headers: { Upgrade: "websocket", Connection: "Upgrade" },
    });
    expect([refused.status, await refused.text()]).toEqual([400, "who are you"]);
    const plain = await fetch(`http://${server.hostname}:${server.port}/ws?name=ada`);
    expect([plain.status, await plain.text()]).toEqual([426, "expected a WebSocket upgrade"]);
  });
});
