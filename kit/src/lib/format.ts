const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const count = (n: number) => whole.format(n);

export const plural = (n: number, one: string, many: string) =>
  `${count(n)} ${n === 1 ? one : many}`;

export const percent = (share: number) => `${whole.format(share * 100)}%`;

// decided on the rounded value, so 999.6 m doesn't print as "1,000 m"
export const distance = (meters: number) =>
  Math.abs(Math.round(meters)) < 1000
    ? `${whole.format(meters)} m`
    : `${oneDecimal.format(meters / 1000)} km`;

const pad = (n: number) => String(n).padStart(2, "0");

/** Rounds down, so a clock never shows a second that hasn't passed. */
export function duration(ms: number, as: "h:mm" | "m:ss" | "m:ss.t"): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const seconds = Math.floor(tenths / 10);
  const minutes = Math.floor(seconds / 60);
  if (as === "h:mm") return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
  const base = `${minutes}:${pad(seconds % 60)}`;
  return as === "m:ss" ? base : `${base}.${tenths % 10}`;
}

/** For dates from outside (a feed, an API), which can be anything. */
export function parseDate(value: string | number): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type Moment = Date | number;

const formatters = new Map<string, Intl.DateTimeFormat>();

function parts(at: Moment, withDate: boolean, timeZone?: string) {
  const name = `${withDate}:${timeZone ?? ""}`;
  let format = formatters.get(name);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-US", {
      ...(withDate ? { month: "short", day: "numeric" } : {}),
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...(timeZone === undefined ? {} : { timeZone }),
    });
    formatters.set(name, format);
  }
  const all = format.formatToParts(at);
  return (type: Intl.DateTimeFormatPartTypes) => all.find((p) => p.type === type)?.value ?? "";
}

/** "3:05 PM". */
export function clock(at: Moment, timeZone?: string): string {
  const part = parts(at, false, timeZone);
  return `${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

/** "Nov 18, 9:16 PM", from parts: engines join date and time differently ("Nov 18 at 9:16 PM"). */
export function when(at: Moment, timeZone?: string): string {
  const part = parts(at, true, timeZone);
  return `${part("month")} ${part("day")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}
