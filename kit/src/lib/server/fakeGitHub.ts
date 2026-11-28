// GitHub's OAuth as Better Auth's provider calls it, for tests: a code buys a token, the token names a user.

export interface FakeGitHub {
  /** Makes `login` a GitHub user; the code that signs them in is their login. */
  user(login: string, id: number): void;
  restore(): void;
}

/** Answers GitHub's token and user URLs in this process's fetch; any other github.com URL is a 404. */
export function fakeGitHub(): FakeGitHub {
  const users = new Map<string, { id: number; login: string }>();
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.href === "https://github.com/login/oauth/access_token") {
      const code = new URLSearchParams(await req.text()).get("code") ?? "";
      return Response.json({ access_token: `t-${code}`, token_type: "bearer", scope: "read:user" });
    }
    const user = users.get(req.headers.get("authorization")?.replace(/^Bearer t-/, "") ?? "");
    if (url.href === "https://api.github.com/user" && user !== undefined) {
      return Response.json({ ...user, name: null, email: null, avatar_url: null });
    }
    if (url.href === "https://api.github.com/user/emails" && user !== undefined) {
      return Response.json([{ email: `${user.login}@users.test`, primary: true, verified: true }]);
    }
    if (url.hostname.endsWith("github.com")) return new Response("not faked", { status: 404 });
    return real(input, init);
  }) as typeof fetch;
  return {
    user: (login, id) => users.set(login, { id, login }),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
