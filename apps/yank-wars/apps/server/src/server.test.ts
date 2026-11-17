import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";
import { parseConfig } from "./config.ts";
import { resolveStatic, startServer } from "./server.ts";

let dir: string;
let web: string;
let server: Server<undefined>;
let base: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "yw-server-"));
  web = join(dir, "web");
  mkdirSync(join(web, "assets"), { recursive: true });
  writeFileSync(join(web, "index.html"), "<!doctype html><title>Yank Wars</title>");
  writeFileSync(join(web, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(dir, "secret.txt"), "outside the web root");
  server = startServer({ host: "127.0.0.1", port: 0, staticDir: web });
  base = server.url.href.replace(/\/$/, "");
});

afterAll(() => {
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

/** Sends the path byte for byte: fetch would normalise `..` away before it left the client. */
async function rawGet(path: string): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  let data = "";
  await Bun.connect({
    hostname: "127.0.0.1",
    port: server.port ?? 0,
    socket: {
      open(s) {
        s.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
      },
      data(_s, chunk) {
        data += chunk.toString();
      },
      close() {
        resolve(data);
      },
    },
  });
  return (await promise).split("\r\n")[0] ?? "";
}

describe("static files", () => {
  test("/ is index.html, not cached", async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("<!doctype html><title>Yank Wars</title>");
    expect(r.headers.get("content-type")).toBe("text/html;charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-cache");
  });

  test("hashed assets are immutable for a year", async () => {
    const r = await fetch(`${base}/assets/index-abc123.js`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("console.log(1)");
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test("HEAD answers headers without a body", async () => {
    const r = await fetch(`${base}/`, { method: "HEAD" });
    expect([r.status, await r.text(), r.headers.get("cache-control")]).toEqual([
      200,
      "",
      "no-cache",
    ]);
  });

  test("unknown paths are 404, with no SPA fallback", async () => {
    for (const p of ["/nope", "/assets/missing.js", "/p/indent-body"]) {
      expect((await fetch(`${base}${p}`)).status).toBe(404);
    }
  });

  test("a directory is not served", async () => {
    expect((await fetch(`${base}/assets`)).status).toBe(404);
  });

  test("POST is 405", async () => {
    const r = await fetch(`${base}/`, { method: "POST" });
    expect([r.status, r.headers.get("allow")]).toEqual([405, "GET, HEAD"]);
  });

  test("paths that leave the web root never reach the file outside it", async () => {
    for (const p of [
      "/../secret.txt",
      "/assets/../../secret.txt",
      "/..%2fsecret.txt",
      "/%2e%2e%2fsecret.txt",
      "/assets/..%2f..%2fsecret.txt",
    ]) {
      expect(await rawGet(p)).toMatch(/^HTTP\/1\.1 (400|404)/);
    }
  });

  test("/healthz", async () => {
    const r = await fetch(`${base}/healthz`);
    expect([r.status, await r.text()]).toEqual([200, "ok"]);
  });

  test("every response carries the security headers, errors included", async () => {
    for (const p of ["/", "/nope", "/healthz"]) {
      const h = (await fetch(`${base}${p}`)).headers;
      expect(h.get("content-security-policy")).toBe(
        "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      expect(h.get("x-content-type-options")).toBe("nosniff");
      expect(h.get("referrer-policy")).toBe("no-referrer");
    }
  });
});

describe("resolveStatic", () => {
  test("keeps paths inside the root and refuses the rest", () => {
    expect(resolveStatic("/srv/web", "/index.html")).toBe("/srv/web/index.html");
    expect(resolveStatic("/srv/web", "/a/../index.html")).toBe("/srv/web/index.html");
    expect(resolveStatic("/srv/web", "/../web-other/x")).toBeNull();
    expect(resolveStatic("/srv/web", "/..%2f..%2fetc/passwd")).toBeNull();
    expect(resolveStatic("/srv/web", "/%E0%A4%A")).toBeNull();
    expect(resolveStatic("/srv/web", "/index.html%00.js")).toBeNull();
  });
});

describe("parseConfig", () => {
  test("defaults host and port", () => {
    expect(parseConfig({ YW_STATIC: "/srv/web" })).toEqual({
      host: "127.0.0.1",
      port: 7300,
      staticDir: "/srv/web",
    });
  });

  test("reads every variable", () => {
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
    expect(() => parseConfig({})).toThrow("YW_STATIC");
    expect(() => parseConfig({ YW_PORT: "80a", YW_STATIC: "/x" })).toThrow(
      "YW_PORT: a port number",
    );
  });
});
