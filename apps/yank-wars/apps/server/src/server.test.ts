import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handler } from "@sammysul/lsel/server";
import { CSP } from "./server.ts";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "yw-server-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Yank Wars</title>");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("every response allows CodeMirror's inline styles and keeps the other headers", async () => {
  const handle = handler(dir, undefined, { csp: CSP });
  for (const p of ["/", "/nope", "/healthz"]) {
    const h = (await handle(new Request(`http://yw.test${p}`))).headers;
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
