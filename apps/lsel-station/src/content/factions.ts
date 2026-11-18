import { idsOf } from "./table.ts";

export type Faction = { readonly name: string; readonly rival: string };

const table = {
  "co-op": { name: "The Co-op", rival: "company" },
  company: { name: "The Company", rival: "co-op" },
  navy: { name: "The Navy", rival: "archive" },
  archive: { name: "The Archive", rival: "navy" },
} as const satisfies Record<string, Faction>;

export type FactionId = keyof typeof table;
export const FACTIONS: Readonly<Record<FactionId, Faction>> = table;
export const FACTION_IDS = idsOf(table);

/** Who holds a sector: you, nobody, the always-hostile pirates and strays, or a faction. */
export type Owner = "you" | "none" | "pirates" | "strays" | FactionId;

export const OWNER_NAMES: Readonly<Record<Owner, string>> = {
  you: "Yours",
  none: "Unclaimed",
  pirates: "Pirates",
  strays: "Strays",
  "co-op": table["co-op"].name,
  company: table.company.name,
  navy: table.navy.name,
  archive: table.archive.name,
};

/** The six regions, tier 1 to 6: who holds their sectors at the start, and what the sectors are called. */
export const REGIONS: readonly {
  readonly name: string;
  readonly sector: string;
  readonly holders: readonly Owner[];
}[] = [
  { name: "Home ring", sector: "Ring", holders: ["none", "none", "none", "pirates"] },
  {
    name: "Inner belt",
    sector: "Belt",
    holders: ["co-op", "co-op", "co-op", "co-op", "pirates", "pirates"],
  },
  {
    name: "The lanes",
    sector: "Lane",
    holders: ["company", "company", "company", "company", "pirates", "pirates"],
  },
  {
    name: "Borderlands",
    sector: "Border",
    holders: ["navy", "navy", "navy", "navy", "pirates", "pirates"],
  },
  {
    name: "Deep field",
    sector: "Deep",
    holders: ["archive", "archive", "archive", "archive", "strays", "strays"],
  },
  {
    name: "Stray space",
    sector: "Stray",
    holders: ["strays", "strays", "strays", "strays", "strays", "strays"],
  },
];
