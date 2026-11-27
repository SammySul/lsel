// The signed-in account: a guest made on first use of the server, GitHub sign-in, and the sync of bests, dailies and name.

import { type Account, type AccountSync, Best, type Me } from "@yank-wars/engine";
import * as v from "valibot";
import { prefs as appPrefs, type Change, type Prefs } from "./prefs.svelte.ts";

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export class AccountStore {
  account = $state.raw<Account | null>(null);
  readonly #prefs: Prefs;
  #last: Promise<void> = Promise.resolve();

  constructor(prefs: Prefs) {
    this.#prefs = prefs;
    prefs.listen((change) => {
      if (this.account !== null) this.#last = this.#sync(change);
    });
  }

  /** Asks who's signed in, if this browser ever was, and syncs this device with the account. */
  async load(): Promise<void> {
    if (!this.#prefs.signedIn) return;
    await this.#ask();
  }

  async #ask(): Promise<void> {
    let me: Me;
    try {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      me = (await res.json()) as Me;
    } catch {
      return;
    }
    this.account = me.account;
    this.#prefs.signedIn = me.account !== null;
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

  /** Off to GitHub; back on this page signed in, with this device's progress joined to the account. */
  async signIn(): Promise<void> {
    const res = await fetch(
      "/api/auth/sign-in/social",
      json({ provider: "github", callbackURL: location.href }),
    );
    const { url } = (await res.json()) as { url?: string };
    if (url === undefined) return;
    // back from GitHub, the page asks who's signed in; a sign-in given up finds no one and forgets it
    this.#prefs.signedIn = true;
    location.assign(url);
  }

  /** Resolves once the latest change has reached the server, or failed to. */
  settled(): Promise<void> {
    return this.#last;
  }

  /** Signed out here; the progress stays on this device too. */
  async signOut(): Promise<void> {
    await fetch("/api/auth/sign-out", json({}));
    this.account = null;
    this.#prefs.signedIn = false;
  }

  async #sync(change: Change | "all" | "all+name"): Promise<void> {
    const p = this.#prefs;
    const body: AccountSync = {};
    if (change !== "name" && change !== "daily") {
      // a malformed best from an old version stays local rather than spoil the whole sync
      body.best = Object.fromEntries(Object.entries(p.best).filter(([, b]) => v.is(Best, b)));
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
