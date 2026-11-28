import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createAuth, Names, playerOf } from "./accounts.ts";
import { type FakeGitHub, fakeGitHub } from "./fakeGitHub.ts";

const ORIGIN = "http://app.test";
let github: FakeGitHub;
beforeAll(() => {
  github = fakeGitHub();
});
afterAll(() => github.restore());

let devices = 0;

async function server({ withGitHub = true } = {}) {
  const db = new Database(":memory:", { create: true, strict: true });
  const names = new Names(db);
  const links: [string, string, string][] = [];
  const auth = await createAuth({
    db,
    baseURL: ORIGIN,
    secret: "a test secret, long enough for Better Auth",
    github: withGitHub ? { clientId: "id", clientSecret: "secret" } : undefined,
    linked: (from, to, login) => {
      links.push([from, to, login]);
      names.move(from, to);
    },
  });
  /** One browser with its own cookies and address (Better Auth limits sign-ins per address). */
  const device = () => {
    const jar = new Map<string, string>();
    const address = `10.0.0.${++devices}`;
    const request = (method: string, path: string, body?: unknown) =>
      new Request(new URL(path, ORIGIN), {
        method,
        redirect: "manual",
        headers: {
          origin: ORIGIN,
          "cf-connecting-ip": address,
          "content-type": "application/json",
          cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await auth.handler(request(method, path, body));
      for (const c of res.headers.getSetCookie()) {
        const [pair = ""] = c.split(";");
        const at = pair.indexOf("=");
        const [k, v] = [pair.slice(0, at), pair.slice(at + 1)];
        if (v === "" || /max-age=0/i.test(c)) jar.delete(k);
        else jar.set(k, v);
      }
      return res;
    };
    return {
      call,
      who: () => playerOf(auth, names, request("GET", "/")),
      guest: () => call("POST", "/api/auth/sign-in/anonymous", {}),
      github: async (login: string, id: number) => {
        github.user(login, id);
        const start = await call("POST", "/api/auth/sign-in/social", {
          provider: "github",
          callbackURL: "/",
        });
        const { url } = (await start.json()) as { url: string };
        const state = new URL(url).searchParams.get("state");
        await call("GET", `/api/auth/callback/github?code=${login}&state=${state}`);
      },
    };
  };
  return { device, names, links };
}

describe("accounts", () => {
  test("nobody is signed in until a guest is made, who has no login and no name yet", async () => {
    const a = (await server()).device();
    expect(await a.who()).toBeNull();
    expect((await a.guest()).status).toBe(200);
    expect(await a.who()).toMatchObject({ login: null, name: "" });
  });

  test("GitHub names the player after their username until they choose a name", async () => {
    const { device, names } = await server();
    const a = device();
    await a.github("hubot", 2);
    const player = await a.who();
    expect(player).toMatchObject({ login: "hubot", name: "hubot" });
    names.rename(player?.id ?? "", "Hu Bot");
    expect((await a.who())?.name).toBe("Hu Bot");
  });

  test("a guest who signs in with GitHub is linked, and their name goes with them", async () => {
    const { device, names, links } = await server();
    const a = device();
    await a.guest();
    const guest = (await a.who())?.id ?? "";
    names.rename(guest, "ada");
    await a.github("octocat", 1);
    const account = await a.who();
    expect(links).toEqual([[guest, account?.id ?? "", "octocat"]]);
    expect([account?.login, account?.name, names.of(guest, null)]).toEqual(["octocat", "ada", ""]);
  });

  test("an account that has a name keeps it when another device's guest joins it", async () => {
    const { device, names } = await server();
    const a = device();
    await a.github("octocat", 1);
    names.rename((await a.who())?.id ?? "", "ada");
    const b = device();
    await b.guest();
    names.rename((await b.who())?.id ?? "", "laptop");
    await b.github("octocat", 1);
    expect((await b.who())?.name).toBe("ada");
  });

  test("without a GitHub app, a GitHub sign-in is refused", async () => {
    const a = (await server({ withGitHub: false })).device();
    const start = await a.call("POST", "/api/auth/sign-in/social", {
      provider: "github",
      callbackURL: "/",
    });
    expect(start.status).toBe(404);
  });
});
