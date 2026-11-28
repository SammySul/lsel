// The browser's side of sign-in: Better Auth's endpoints under /api/auth, called with fetch so no client library ships.

const post = (path: string, body: unknown) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Makes this browser a guest; throws when the server can't be reached or refuses. */
export async function signInAsGuest(): Promise<void> {
  const res = await post("/api/auth/sign-in/anonymous", {});
  if (!res.ok) throw new Error(`guest sign-in refused (${res.status})`);
}

/** Off to GitHub, and back at `callbackURL` signed in; throws when the server refuses. */
export async function signInWithGitHub(callbackURL: string): Promise<void> {
  const res = await post("/api/auth/sign-in/social", { provider: "github", callbackURL });
  if (!res.ok) throw new Error(`GitHub sign-in refused (${res.status})`);
  const { url } = (await res.json()) as { url?: string };
  if (url === undefined) throw new Error("no GitHub page to sign in on");
  location.assign(url);
}

/** Signs this browser out; throws, still signed in, when the server refuses. */
export async function signOut(): Promise<void> {
  const res = await post("/api/auth/sign-out", {});
  if (!res.ok) throw new Error(`sign-out refused (${res.status})`);
}
