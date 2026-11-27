// The signed-in account: a guest made on first use of the server, GitHub sign-in, and the sync of bests, dailies and name.

import type { Account, AccountSync, Me } from "@yank-wars/engine";
import { prefs as appPrefs, type Change, type Prefs } from "./prefs.svelte.ts";

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export class AccountStore {
  account = $state.raw<Account | null>(null);
  /** Whether the server offers GitHub sign-in; null until it has said. */
  github = $state<boolean | null>(null);
  readonly #prefs: Prefs;
  #last: Promise<void> = Promise.resolve();

  constructor(prefs: Prefs) {
    this.#prefs = prefs;
    prefs.listen((change) => {
      if (this.account !== null) this.#last = this.#sync(change);
    });
  }

  /** Asks who's signed in and whether GitHub sign-in is on, and syncs this device with the account. */
  async load(): Promise<void> {
    await this.#ask();
  }

  async #ask(): Promise<void> {
    let me: Me;
    try {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error(`error ${res.status}`);
      me = (await res.json()) as Me;
    } catch {
      this.github ??= false;
      return;
    }
    this.account = me.account;
    this.github = me.github;
    // a guest with no name yet takes the one this device has
    if (me.account !== null) await this.#sync(me.account.name === "" ? "all+name" : "all");
  }

  /** Signed in, as a new guest if need be; false when the server can't be reached. */
  async ensure(): Promise<boolean> {
    if (this.account !== null) return true;
    try {
      await fetch("/api/auth/sign-in/anonymous", json({}));
    } catch {
      return false;
    }
    await this.#ask();
    return this.account !== null;
  }

  /** Off to GitHub, and back on this page signed in, this device's progress joined to the account; throws when the server refuses. */
  async signIn(): Promise<void> {
    const res = await fetch(
      "/api/auth/sign-in/social",
      json({ provider: "github", callbackURL: location.href }),
    );
    if (!res.ok) throw new Error(`GitHub sign-in refused (${res.status})`);
    const { url } = (await res.json()) as { url?: string };
    if (url === undefined) throw new Error("no GitHub page to sign in on");
    location.assign(url);
  }

  /** Resolves once the latest change has reached the server, or failed to. */
  settled(): Promise<void> {
    return this.#last;
  }

  /** Signed out here, the progress staying on this device too; throws, still signed in, when the server refuses. */
  async signOut(): Promise<void> {
    const res = await fetch("/api/auth/sign-out", json({}));
    if (!res.ok) throw new Error(`sign-out refused (${res.status})`);
    this.account = null;
  }

  async #sync(change: Change | "all" | "all+name"): Promise<void> {
    const p = this.#prefs;
    const body: AccountSync = {};
    if (change !== "name" && change !== "daily") {
      body.best = { ...p.best };
    }
    if (change !== "name" && change !== "best") body.daily = [...p.daily];
    if (change === "name" || (change === "all+name" && p.name !== "")) body.name = p.name;
    try {
      const res = await fetch("/api/me", { ...json(body), method: "PUT" });
      if (!res.ok) return;
      const account = (await res.json()) as Account;
      this.account = account;
      p.adopt(account);
    } catch {}
  }
}

export const account = new AccountStore(appPrefs);
