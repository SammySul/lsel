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
});
type Link = v.InferOutput<typeof Link>;

const Stored = v.object({
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  savedAt: v.number(),
  playedMs: v.number(),
  data: v.string(),
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
  let lastPush = 0;
  let busy = false;

  function remember(next: Link | null): void {
    link = next;
    writeItem(LINK, next === null ? null : JSON.stringify(next));
  }

  async function call(method: "GET" | "PUT", body?: unknown, keepalive = false): Promise<Reply> {
    if (link === null) return { kind: "unreachable", reason: "sync is off" };
    try {
      const response = await fetch(`/save/${await keyId(link.key)}`, {
        method,
        keepalive,
        headers: { authorization: `Bearer ${link.key}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

  /** Sends this device's latest save, from the revision it last agreed with. */
  async function push(keepalive = false): Promise<void> {
    if (link === null || busy || status.kind === "conflict") return;
    busy = true;
    lastPush = Date.now();
    const doc = opts.latest();
    const reply = await call("PUT", { base: link.revision, data: exportString(doc) }, keepalive);
    busy = false;
    if (link === null) return;
    if (
      reply.kind === "answer" &&
      reply.status === 200 &&
      typeof reply.body === "object" &&
      reply.body !== null &&
      "revision" in reply.body
    ) {
      remember({ ...link, revision: Number(reply.body.revision), syncedAt: doc.savedAt });
      status = { kind: "synced", at: Date.now() };
    } else if (reply.kind === "answer" && reply.status === 409) {
      const theirs = v.safeParse(Stored, reply.body);
      if (theirs.success) conflict(theirs.output);
      else status = { kind: "failed", reason: "the service sent a save that cannot be read" };
    } else status = { kind: "failed", reason: reasonOf(reply) };
  }

  /** Reads the synced save: an untouched device takes a newer one, a device that moved on is asked. */
  async function pull(asking: boolean): Promise<void> {
    if (link === null) return;
    status = { kind: "syncing" };
    const reply = await call("GET");
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
    if (theirs.revision === link.revision) return push();
    if (opts.latest().savedAt <= link.syncedAt) return useTheirs(theirs);
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
    start: () => pull(false),
    /** After every save: sends it when the page is going away, or when the last send is a while ago. */
    saved(): void {
      if (link === null) return;
      if (document.visibilityState === "hidden") void push(true);
      else if (Date.now() - lastPush >= PUSH_EVERY_MS) void push();
    },
    syncNow: () => (status.kind === "conflict" ? Promise.resolve() : pull(false)),
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
      await pull(true);
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
