import { count, duration } from "@sammysul/lsel/format";
import type { Stat } from "../../shared/stats.ts";

interface Unit {
  label: string;
  /** PUBG's raw number in the unit the column shows */
  value(raw: number): number;
  text(raw: number): string;
}

const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const plain = (label: string): Unit => ({ label, value: (r) => r, text: count });
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
  longestKill: plain("Longest kill (m)"),
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
    text: (r) => duration(r * 1000, "h:mm"),
  },
  vehicleDestroys: plain("Vehicles destroyed"),
  walkDistance: km("Walk distance"),
};
