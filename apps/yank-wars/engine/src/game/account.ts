// What follows a signed-in player between devices: the board name, each puzzle's best and the dailies solved.
import * as v from "valibot";
import { LIMITS, Name } from "./protocol.ts";

export const ACCOUNT = {
  /** more than the puzzles there will ever be, so a sync can't grow the database without bound */
  bests: 5_000,
  /** a dozen years of dailies */
  days: 5_000,
} as const;

const PuzzleKey = v.pipe(v.string(), v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), v.maxLength(40));

export const Best = v.strictObject({
  keys: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(LIMITS.logEntries)),
  // solo play has no round cap: a day bounds it
  ms: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(86_400_000)),
});
export type Best = v.InferOutput<typeof Best>;

/** One device's side of a sync: the server keeps the better best and every day of both sides. */
export const AccountSync = v.strictObject({
  /** sent only when the player renames, so another device's stale name never wins */
  name: v.optional(Name),
  best: v.optional(
    v.pipe(
      v.record(PuzzleKey, Best),
      v.check((r) => Object.keys(r).length <= ACCOUNT.bests, "too many bests"),
    ),
  ),
  daily: v.optional(
    v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), v.maxLength(ACCOUNT.days)),
  ),
});
export type AccountSync = v.InferOutput<typeof AccountSync>;

/** `raw` as a sync, or null when it isn't one. */
export function parseAccountSync(raw: unknown): AccountSync | null {
  const r = v.safeParse(AccountSync, raw);
  return r.success ? r.output : null;
}

/** The signed-in player, as the server has them after a sync. */
export interface Account {
  /** the board name; empty until chosen, for a guest */
  readonly name: string;
  /** the GitHub username, or null for a guest */
  readonly login: string | null;
  readonly best: Readonly<Record<string, Best>>;
  /** days solved, oldest first */
  readonly daily: readonly number[];
}

/** `GET /api/me`: the account, when signed in, and whether the server offers GitHub sign-in. */
export interface Me {
  readonly account: Account | null;
  readonly github: boolean;
}
