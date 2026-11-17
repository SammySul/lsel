import type { Stat } from "../../shared/stats.ts";

interface Unit {
  label: string;
  /** PUBG's raw number in the unit the column shows */
  value(raw: number): number;
  text(raw: number): string;
}

const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const plain = (label: string): Unit => ({ label, value: (r) => r, text: (r) => count.format(r) });
const km = (label: string): Unit => ({
  label: `${label} (km)`,
  value: (r) => r / 1000,
  text: (r) => oneDecimal.format(r / 1000),
});

export const STAT_UNITS: Record<Stat, Unit> = {
  kills: plain("Kills"),
  knockouts: plain("Knockouts"),
  damage: plain("Damage"),
  assists: plain("Assists"),
  headshotKills: plain("Headshot kills"),
  longestKill: { label: "Longest kill (m)", value: (r) => r, text: (r) => count.format(r) },
  revives: plain("Revives"),
  boosts: plain("Boosts"),
  heals: plain("Heals"),
  weaponsAcquired: plain("Weapons picked up"),
  teamKills: plain("Team kills"),
  rideDistance: km("Ride distance"),
  roadKills: plain("Road kills"),
  swimDistance: km("Swim distance"),
  timeSurvived: {
    label: "Time survived (h:mm)",
    value: (r) => r / 3600,
    text: (r) => {
      const minutes = Math.floor(r / 60);
      return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
    },
  },
  vehicleDestroys: plain("Vehicles destroyed"),
  walkDistance: km("Walk distance"),
};

const WHEN: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** "Nov 18, 9:16 PM", in the viewer's time zone; assembled from parts because engines join them differently ("at"). */
export function formatWhen(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat(
    "en-US",
    timeZone === undefined ? WHEN : { ...WHEN, timeZone },
  ).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((x) => x.type === type)?.value ?? "";
  return `${part("month")} ${part("day")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}
