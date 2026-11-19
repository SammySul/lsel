import * as v from "valibot";
import { exportString, importString, playedMs, type SaveDocument } from "../save/document.ts";
import { KEY_PATTERN, keyId, newKey } from "../save/key.ts";
import { readItem, writeItem } from "./storage.ts";

const LINK = "lsel-station.sync";
// besides when the page is put away, the save is sent at most this often
const PUSH_EVERY_MS = 5 * 60_000;

const Link = v.object({
  key: v.pipe(v.string(), v.regex(KEY_PATTERN)),
  /** The service's revision this device last agreed with; 0 before the first. */
  revision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /** The savedAt of the save it agreed on: a local save later than this has moved on since. */
  syncedAt: v.number(),
  /** The savedAt of a save sent whose answer has not come, as when its page closed: if the service has it, it is this device's. */
  sent: v.optional(v.number()),
});
type Link = v.InferOutput<typeof Link>;

const Stored = v.object({
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  savedAt: v.number(),
  playedMs: v.number(),
  data: v.string(),
  landed: v.optional(v.boolean()),
});
export type Stored = v.InferOutput<typeof Stored>;

export type Side = { readonly savedAt: number; readonly playedMs: number };

export type SyncStatus =
  | { readonly kind: "off" }
  | { readonly kind: "syncing" }
  | { readonly kind: "synced"; readonly at: number }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "conflict"; readonly mine: Side; readonly theirs: Stored & Side };

function readLink(): Link | null {
  const raw = readItem(LINK);
  if (raw === null) return null;
  try {
    const parsed = v.safeParse(Link, JSON.parse(raw));
    return parsed.success ? parsed.output : null;
  } catch {
    return null;
  }
}

type Reply =
  | { kind: "answer"; status: number; body: unknown }
  | { kind: "unreachable"; reason: string };

/** Keeps one save across devices through the game's own service, keyed by a secret only the player holds. */
export function createSync(opts: {
  /** The save this device last wrote. */
  latest: () => SaveDocument;
  /** Replaces this device's game with another save: the page reloads. */
  replace: (doc: SaveDocument) => void;
}) {
  // state, so the panel follows sync being turned on and off
  let link = $state.raw<Link | null>(readLink());
  let status = $state.raw<SyncStatus>(link === null ? { kind: "off" } : { kind: "syncing" });
  // worked out ahead: a send as the page goes away has no time to wait for it
  let id: { key: string; id: string } | null = null;
  // the save as this page loaded it, before any catch-up moved it on
  const loadedAt = opts.latest().savedAt;
  let lastPush = 0;
  let busy = false;
  let again = false;

  function learnId(key: string): void {
    void keyId(key).then((found) => {
      if (link?.key === key) id = { key, id: found };
    });
  }
  if (link !== null) learnId(link.key);

  function remember(next: Link | null): void {
    if (next !== null && next.key !== link?.key) learnId(next.key);
    link = next;
    writeItem(LINK, next === null ? null : JSON.stringify(next));
  }

  async function call(
    method: "GET" | "PUT",
    request: { body?: unknown; keepalive?: boolean; query?: string } = {},
  ): Promise<Reply> {
    if (link === null) return { kind: "unreachable", reason: "sync is off" };
    const key = link.key;
    try {
      const path = id?.key === key ? id.id : await keyId(key);
      const response = await fetch(`/save/${path}${request.query ?? ""}`, {
        method,
        keepalive: request.keepalive ?? false,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      });
      const json = response.headers.get("content-type") === "application/json";
      return { kind: "answer", status: response.status, body: json ? await response.json() : null };
    } catch {
      return { kind: "unreachable", reason: "the sync service cannot be reached" };
    }
  }

  const reasonOf = (reply: Reply) =>
    reply.kind === "unreachable"
      ? reply.reason
      : typeof reply.body === "object" && reply.body !== null && "error" in reply.body
        ? String(reply.body.error)
        : `the service answered ${reply.status}`;

  function conflict(theirs: Stored): void {
    const mine = opts.latest();
    status = {
      kind: "conflict",
      mine: { savedAt: mine.savedAt, playedMs: playedMs(mine) },
      theirs,
    };
  }

  /** Sends this device's latest save, from the revision it last agreed with; one asked for meanwhile follows it. */
  async function push(): Promise<void> {
    if (link === null || status.kind === "conflict") return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    again = false;
    lastPush = Date.now();
    const doc = opts.latest();
    // a send outlives its page, so one under way as the page closes still lands: `sent` lets the next load learn whether it did
    remember({ ...link, sent: doc.savedAt });
    const reply = await call("PUT", {
      body: { base: link.revision, data: exportString(doc) },
      keepalive: true,
    });
    busy = false;
    if (link === null) return;
    if (
      reply.kind === "answer" &&
      reply.status === 200 &&
      typeof reply.body === "object" &&
      reply.body !== null &&
      "revision" in reply.body
    ) {
      remember({ key: link.key, revision: Number(reply.body.revision), syncedAt: doc.savedAt });
      status = { kind: "synced", at: Date.now() };
      if (again) return push();
    } else if (reply.kind === "answer" && reply.status === 409) {
      const theirs = v.safeParse(Stored, reply.body);
      if (theirs.success) conflict(theirs.output);
      else status = { kind: "failed", reason: "the service sent a save that cannot be read" };
    } else status = { kind: "failed", reason: reasonOf(reply) };
  }

  /** Reads the synced save: a newer one replaces a save that has not moved since `mine`; otherwise it asks. */
  async function pull(asking: boolean, mine: number): Promise<void> {
    if (link === null || busy) return;
    status = { kind: "syncing" };
    // no send meanwhile: it would move the service on before this has seen what is there
    busy = true;
    const reply = await call("GET", {
      ...(link.sent === undefined ? {} : { query: `?sent=${link.sent}` }),
    });
    busy = false;
    if (link === null) return;
    if (reply.kind === "answer" && reply.status === 404 && link.revision === 0 && !asking) {
      return push();
    }
    if (reply.kind !== "answer" || reply.status !== 200) {
      status = { kind: "failed", reason: reasonOf(reply) };
      return;
    }
    const parsed = v.safeParse(Stored, reply.body);
    if (!parsed.success) {
      status = { kind: "failed", reason: "the service sent a save that cannot be read" };
      return;
    }
    const theirs = parsed.output;
    if (asking) return conflict(theirs);
    // the save sent as the page closed arrived: this device agreed with the service then
    if (link.sent !== undefined && theirs.landed === true) {
      const revision = theirs.savedAt === link.sent ? theirs.revision : link.revision;
      remember({ key: link.key, revision, syncedAt: link.sent });
    }
    if (theirs.revision === link.revision) {
      // `again`: a save asked to be sent while this was reading
      if (mine > link.syncedAt || again) return push();
      status = { kind: "synced", at: Date.now() };
      return;
    }
    if (mine <= link.syncedAt) return useTheirs(theirs);
    conflict(theirs);
  }

  function useTheirs(theirs: Stored): void {
    const doc = importString(theirs.data);
    if (!doc.ok || link === null) {
      status = { kind: "failed", reason: doc.ok ? "sync is off" : doc.reason };
      return;
    }
    remember({ ...link, revision: theirs.revision, syncedAt: doc.doc.savedAt });
    opts.replace(doc.doc);
  }

  return {
    get status(): SyncStatus {
      return status;
    },
    get key(): string | null {
      return link?.key ?? null;
    },
    /** On load: brings this device in line with the synced save, if sync is on. */
    start: () => pull(false, loadedAt),
    /** After every save: sends it when the page is going away, or when the last send is a while ago. */
    saved(): void {
      if (link === null) return;
      if (document.visibilityState === "hidden" || Date.now() - lastPush >= PUSH_EVERY_MS) {
        void push();
      }
    },
    syncNow: () =>
      status.kind === "conflict" ? Promise.resolve() : pull(false, opts.latest().savedAt),
    /** Starts a synced save from this device's game, under a new key. */
    async enable(): Promise<void> {
      remember({ key: newKey(), revision: 0, syncedAt: 0 });
      status = { kind: "syncing" };
      await push();
    },
    /** Links this device to a save another device synced, then asks which game to keep. */
    async join(key: string): Promise<string | null> {
      const trimmed = key.trim();
      if (!KEY_PATTERN.test(trimmed)) return "That is not a save key.";
      remember({ key: trimmed, revision: 0, syncedAt: 0 });
      await pull(true, opts.latest().savedAt);
      if (status.kind === "failed") {
        const reason = status.reason;
        remember(null);
        status = { kind: "off" };
        return reason === "no such save" ? "No save has that key." : `Sync failed: ${reason}.`;
      }
      return null;
    },
    async keepMine(): Promise<void> {
      if (status.kind !== "conflict" || link === null) return;
      remember({ ...link, revision: status.theirs.revision });
      status = { kind: "syncing" };
      await push();
    },
    useTheirs(): void {
      if (status.kind === "conflict") useTheirs(status.theirs);
    },
    /** Stops syncing on this device. The synced save stays for the others. */
    forget(): void {
      remember(null);
      status = { kind: "off" };
    },
  };
}
