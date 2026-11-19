import { ITEMS, type Stack } from "../../content/items.ts";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 12480 as "12,480". */
export const count = (n: number) => whole.format(n);

/** 0.05 as "5%". */
export const percent = (share: number) => `${Math.round(share * 100)}%`;

/** 3000 as "3.0 s". */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** 600000 as "10:00", 4000 as "4.0 s": bars under a minute are read in seconds. */
export function duration(ms: number): string {
  if (ms < 60_000) return seconds(ms);
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Stacks as "20 iron plate, 10 water". */
export const stacks = (list: readonly Stack[]) =>
  list
    .map(({ item, amount }) => {
      const { name, one } = ITEMS[item];
      return `${count(amount)} ${(amount === 1 ? (one ?? name) : name).toLowerCase()}`;
    })
    .join(", ");

/** Item names alone, as "iron ore, ice". */
export const names = (list: readonly Stack[]) =>
  [...new Set(list.map(({ item }) => ITEMS[item].name.toLowerCase()))].join(", ");

const clockFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const whenFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** A time of day as "2:02 PM". */
export const clock = (ms: number) => clockFormat.format(ms);

/** A moment as "Nov 18, 2:02 PM". */
export const when = (ms: number) => whenFormat.format(ms);
