// The factions that hold sectors on the map, and the names of every sector holder.

export type FactionId = "co-op" | "company" | "navy" | "archive";

/** Who holds a sector: you, nobody, the always-hostile pirates and strays, or a faction. */
export type Owner = "you" | "none" | "pirates" | "strays" | FactionId;

export const OWNER_NAMES: Readonly<Record<Owner, string>> = {
  you: "Yours",
  none: "Unclaimed",
  pirates: "Pirates",
  strays: "Strays",
  "co-op": "The Co-op",
  company: "The Company",
  navy: "The Navy",
  archive: "The Archive",
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
