import { afterAll, expect, test } from "bun:test";
import { getJson } from "./getJson.ts";

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/ok") return Response.json({ greeting: "hi" });
    if (path === "/limited") {
      return Response.json({ error: "PUBG is rate limiting" }, { status: 429 });
    }
    if (path === "/slow") {
      return new Promise((done) => setTimeout(() => done(Response.json({})), 1000));
    }
    return new Response("<html>oops</html>", { status: 502 });
  },
});
afterAll(() => server.stop(true));
const at = (path: string) => `http://127.0.0.1:${server.port}${path}`;
const never = new AbortController().signal;

const failure = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e: Error) => `${e.name}: ${e.message}`,
  );

test("an answer comes back as its JSON", async () => {
  expect(await getJson(at("/ok"), never, "the server")).toEqual({ greeting: "hi" });
});

test("a failure is the server's own error, or names who answered without one", async () => {
  expect(await failure(getJson(at("/limited"), never, "dajaj"))).toBe(
    "Error: PUBG is rate limiting",
  );
  expect(await failure(getJson(at("/broken"), never, "dajaj"))).toBe("Error: dajaj answered 502");
});

test("a server that isn't there can't be reached; an abort stays an abort", async () => {
  const closed = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const gone = `http://127.0.0.1:${closed.port}/ok`;
  await closed.stop(true);
  expect(await failure(getJson(gone, never, "grab's server"))).toBe(
    "Error: grab's server could not be reached",
  );
  const controller = new AbortController();
  const asked = getJson(at("/slow"), controller.signal, "grab's server");
  controller.abort();
  expect(await failure(asked)).toBe("AbortError: The operation was aborted.");
});
