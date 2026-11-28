// Accounts through /api as the server wires it: real Better Auth on SQLite, a real replay, and GitHub's three OAuth URLs faked.
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type FakeGitHub, fakeGitHub } from "@sammysul/lsel/server/fake-github";
import { DAILY, dailyPuzzle, type KeyLog, parseKeys } from "@yank-wars/engine";
import { api } from "./api.ts";
import { openBoard } from "./daily.ts";
import { PUZZLES } from "./puzzles.ts";
import { Replayer } from "./replay.ts";

const ORIGIN = "http://yw.test";
const DAY = 5;
const noon = DAILY.epoch + (DAY - 1) * DAILY.dayMs + DAILY.dayMs / 2;
const today = dailyPuzzle(PUZZLES.values(), DAY);
if (today === undefined) throw new Error("no daily on day 5");

const replayer = new Replayer();
let devices = 0;

let github: FakeGitHub;
beforeAll(() => {
  github = fakeGitHub();
});
afterAll(() => {
  github.restore();
  replayer.close();
});

async function server({ withGitHub = true } = {}) {
  const routes = await api({
    accounts: new Database(":memory:", { create: true, strict: true }),
    board: openBoard(":memory:"),
    origin: ORIGIN,
    secret: "a test secret, long enough for Better Auth",
    github: withGitHub ? { clientId: "id", clientSecret: "secret" } : undefined,
    puzzles: PUZZLES,
    verify: (p, log) => replayer.verify(p, log),
    now: () => noon,
  });
  /** One browser: its own cookies, sent the way a page on the site sends them. */
  return function device() {
    const jar = new Map<string, string>();
    // each its own address, as cloudflared reports them: Better Auth limits sign-ins per address
    const address = `10.0.0.${++devices}`;
    const call = async (method: string, path: string, body?: unknown) => {
      const url = new URL(path, ORIGIN);
      const res = await routes(
        new Request(url, {
          method,
          redirect: "manual",
          headers: {
            origin: ORIGIN,
            "cf-connecting-ip": address,
            "content-type": "application/json",
            cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        url,
      );
      if (res === undefined) throw new Error(`nothing answers ${path}`);
      for (const c of res.headers.getSetCookie()) {
        const [pair = ""] = c.split(";");
        const at = pair.indexOf("=");
        const [k, v] = [pair.slice(0, at), pair.slice(at + 1)];
        if (v === "" || /max-age=0/i.test(c)) jar.delete(k);
        else jar.set(k, v);
      }
      const text = await res.text();
      return { status: res.status, body: text === "" ? null : JSON.parse(text), res };
    };
    return {
      call,
      me: async () => (await call("GET", "/api/me")).body,
      guest: () => call("POST", "/api/auth/sign-in/anonymous"),
      sync: (body: unknown) => call("PUT", "/api/me", body),
      daily: (log: KeyLog, ms: number) => call("POST", "/api/daily", { day: DAY, log, ms }),
      board: async () => (await call("GET", "/api/daily")).body,
      /** Signs in as GitHub user `login`, the whole round trip but GitHub's own page. */
      github: async (login: string, id: number) => {
        github.user(login, id);
        const start = await call("POST", "/api/auth/sign-in/social", {
          provider: "github",
          callbackURL: "/",
        });
        if (start.status !== 200)
          throw new Error(`sign-in: ${start.status} ${JSON.stringify(start.body)}`);
        const state = new URL(start.body.url).searchParams.get("state");
        const back = await call("GET", `/api/auth/callback/github?code=${login}&state=${state}`);
        return back.res.headers.get("location");
      },
    };
  };
}

const best = (keys: number, ms: number) => ({ keys, ms });

describe("accounts", () => {
  test("signed out, /api/me says so and refuses a sync; a guest is made on request", async () => {
    const a = (await server())();
    expect(await a.me()).toEqual({ account: null, github: true });
    expect((await a.sync({ daily: [1] })).status).toBe(401);
    expect((await a.guest()).status).toBe(200);
    expect(await a.me()).toEqual({
      account: { name: "", login: null, best: {}, daily: [] },
      github: true,
    });
  });

  test("without a GitHub app, /api/me says sign-in is guests only and a GitHub sign-in is refused", async () => {
    const a = (await server({ withGitHub: false }))();
    expect(await a.me()).toEqual({ account: null, github: false });
    const start = await a.call("POST", "/api/auth/sign-in/social", {
      provider: "github",
      callbackURL: "/",
    });
    expect(start.status).toBe(404);
  });

  test("a sync keeps the better best per puzzle and every day of both sides; the name changes only when sent", async () => {
    const a = (await server())();
    await a.guest();
    await a.sync({
      name: "ada",
      best: { one: best(5, 9_000), two: best(4, 1_000) },
      daily: [1, 2],
    });
    const merged = await a.sync({
      best: { one: best(5, 7_000), two: best(5, 1), three: best(3, 2_000) },
      daily: [3, 2],
    });
    expect(merged.body).toEqual({
      name: "ada",
      login: null,
      best: { one: best(5, 7_000), three: best(3, 2_000), two: best(4, 1_000) },
      daily: [1, 2, 3],
    });
    expect((await a.sync({ best: { "../x": best(1, 1) } })).status).toBe(400);
    expect((await a.sync({ daily: [0] })).status).toBe(400);
  });

  test("a guest who signs in with GitHub keeps their name, bests, streak and board run on the new account", async () => {
    const a = (await server())();
    await a.guest();
    await a.sync({ name: "ada", best: { one: best(5, 9_000) } });
    expect((await a.daily(today.solution, 4_000)).status).toBe(200);
    expect(await a.github("octocat", 1)).toBe("/");
    expect((await a.me()).account).toEqual({
      name: "ada",
      login: "octocat",
      best: { one: best(5, 9_000) },
      daily: [DAY],
    });
    const board = await a.board();
    expect([board.players, board.top]).toEqual([
      1,
      [{ rank: 1, name: "ada", score: today.solution.length, ms: 4_000, you: true }],
    ]);
  });

  test("a second device joins the same account: better bests and runs win, days add up, the account's name stays", async () => {
    const device = await server();
    const a = device();
    await a.guest();
    await a.sync({ name: "ada", best: { one: best(5, 9_000), two: best(4, 1_000) }, daily: [1] });
    await a.daily([...parseKeys("<Esc>"), ...today.solution], 4_000);
    await a.github("octocat", 1);

    const b = device();
    await b.guest();
    await b.sync({ name: "laptop", best: { one: best(4, 9_500), two: best(6, 1) }, daily: [2] });
    await b.daily(today.solution, 6_000);
    await b.github("octocat", 1);

    const account = {
      name: "ada",
      login: "octocat",
      best: { one: best(4, 9_500), two: best(4, 1_000) },
      daily: [1, 2, DAY],
    };
    expect([(await a.me()).account, (await b.me()).account]).toEqual([account, account]);
    const board = await b.board();
    expect([board.players, board.top]).toEqual([
      1,
      [{ rank: 1, name: "ada", score: today.solution.length, ms: 6_000, you: true }],
    ]);
  });

  test("signing in with GitHub first names the player after their username, and a rename shows on the board", async () => {
    const a = (await server())();
    await a.github("hubot", 2);
    expect((await a.me()).account).toEqual({ name: "hubot", login: "hubot", best: {}, daily: [] });
    await a.daily(today.solution, 3_000);
    expect((await a.board()).top[0].name).toBe("hubot");
    await a.sync({ name: "Hu Bot" });
    expect((await a.board()).top[0].name).toBe("Hu Bot");
  });

  test("signing out leaves the device signed out, and the account untouched for the next sign-in", async () => {
    const a = (await server())();
    await a.github("hubot", 2);
    await a.sync({ daily: [3] });
    expect((await a.call("POST", "/api/auth/sign-out", {})).status).toBe(200);
    expect(await a.me()).toEqual({ account: null, github: true });
    await a.github("hubot", 2);
    expect((await a.me()).account.daily).toEqual([3]);
  });
});
