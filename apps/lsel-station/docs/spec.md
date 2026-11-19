# Lsel: game specification

A single-player idle game in the browser about running a salvage station on the
frontier. You train departments, build the station out module by module, send
fleets to take sectors, and manage standing with four factions.

Status: design agreed in five question rounds on 2026-11-16, defaults confirmed
on 2026-11-18. Steps 0 to 4 of the build order (section 15) and sound are
built and live at lsel-station.sammysul.com (v0.3.0).

How to read this document:

- **Locked** items were chosen by the user and are not to be changed without asking.
- **Default** items were decided by Claude without a question and confirmed
  afterwards. They are listed together in section 16.
- Stack and look follow lsel's `STACK.md` and `DESIGN.md`; where this document
  is silent, they decide.
- Every number is **tunable** unless marked fixed. Structure is fixed; numbers
  get adjusted by the balance simulator (section 14.7) and by play.

Art reference page (the four styles and three views that were compared):
https://claude.ai/artifact/JWPqdE2nQU7nQEB1fhrKHq

---

## 1. Pillars

1. **Something is always finishing.** Action bars complete every few seconds, a
   module every few hours, a sector every few days.
2. **Progress is visible.** The station grows on screen as modules are built and
   the sector map fills in with your color.
3. **Being away is never punished.** Nothing starves, expires, or is taken while
   the game is closed.
4. **Plain-spoken.** Names are what people working there would call things.
   No lore dumps.

Locked decisions:

| Area             | Decision                                                                             |
| ---------------- | ------------------------------------------------------------------------------------ |
| Players          | Single-player, AI factions                                                           |
| Role of conquest | The gate between resource tiers, not the whole game                                  |
| Art style        | "Deep Field": limited-palette pixel art, dithered shading                            |
| Scene            | Orbit view of the station; the sector map when Map is picked in the rail             |
| Premise          | Frontier salvager: you claim a derelict station between rival factions               |
| Parallelism      | Crew slots: one job at first, more crew means more jobs at once                      |
| Departments      | Ten (section 5), plus fleets                                                         |
| Crew             | Named, each with one specialty; no crew levels                                       |
| Territory        | Never lost; hostile neighbors can raid a sector and cut its output                   |
| Outposts         | Each sector gets a small specialized outpost                                         |
| Battles          | Automatic, on timers, watched in the scene                                           |
| Factions         | The Company, the Navy, the Archive, the Co-op; pirates and strays are always hostile |
| Faction endgame  | Conquer or absorb                                                                    |
| Rivalries        | Sides matter: Company against Co-op, Navy against Archive                            |
| Events           | Queued choice events that never expire                                               |
| Length           | About three months of real time to finish everything                                 |
| Audience         | Personal on twelve, built so it could be opened to anyone later                      |
| Saves            | Local saves plus a sync service from the first deployed version                      |
| Folder           | `lsel/projects/lsel-station` (`lsel` is the home base)                               |

---

## 2. Core loops

| Loop    | Length        | What happens                                                                              |
| ------- | ------------- | ----------------------------------------------------------------------------------------- |
| Action  | 2 to 15 s     | A job's bar fills: inputs are consumed, outputs, department XP and mastery XP are granted |
| Session | minutes       | Collect, reassign crew, queue a module, send a fleet, answer an event                     |
| Unlock  | hours         | A level or module opens a new item, recipe, crew slot or department                       |
| Tier    | days to weeks | A sector falls or a faction grants access; a new resource tier opens                      |
| Arc     | months        | Four factions resolved, stray space cleared, completion log filled                        |

---

## 3. Time and simulation

- The game is a deterministic simulation advanced in fixed ticks of 200 ms.
- All randomness comes from a seeded generator stored in the save.
- **Offline progress:** on load, the time since the last save is simulated, up to
  a cap of 24 hours. Everything runs offline, including combat, except that
  raids and events are not generated (events already queued stay queued).
- After catching up, a "While you were away" summary lists resources gained,
  levels gained, modules finished and fights won or lost.
- The live game and the offline catch-up use the same tick function, so the
  result is identical whether the tab was open or closed.

---

## 4. Crew and jobs

- A **job** is one crew member assigned to one action in one department, such as
  Mining an iron asteroid. It repeats until reassigned.
- If a job's inputs run out it idles, shows why, and resumes by itself when
  inputs return.
- **Crew slots** set how many jobs run at once.

| Slot   | Source                       |
| ------ | ---------------------------- |
| 1      | Start                        |
| 2 to 6 | Habitat module levels I to V |
| 7      | Research: Shift rota         |
| 8      | Co-op capstone: Open hiring  |

- The roster can hold more crew than there are slots (a bench of 4), so
  specialists can be swapped in.
- Each crew member has a name, a one-line bio, a home faction or none, and one
  specialty: a bonus to speed, yield or XP in one department.
- You start with one generalist. Others are hired for credits when a faction's
  standing reaches the required rank. The Co-op offers the most.
- Until hiring is built (step 6), each Habitat level brings the next crew
  member for free. After that only Habitat I does.
- A job that is taken off a started bar gets its inputs back. A module project
  is paid for once and keeps its progress while nobody is on it.
- About 24 crew exist in total. Sample roster in appendix A.
- **Rations:** each working crew member eats one ration an hour if any are in
  stock, giving the Fed buff (+10% job speed, more for better rations). With no
  rations there is no buff and no penalty.

Fleets do not use crew slots (section 7).

---

## 5. Departments

Each department has levels 1 to 99. Items unlock at levels 1, 15, 30, 45, 60
and 75, matching the six resource tiers; level 90 unlocks a capstone item.

XP needed for the next level is `round(60 × 1.1^(level − 1))`, about 6.8 million
in total to reach 99. Target: about 500 crew-hours of a department's jobs to
reach 99.

### 5.1 Resource tiers

Raw resources of tier N exist only in tier N sectors. You get access by owning
a sector there, by holding a protectorate, or through mining rights from the
faction that owns it (rank Trusted).

| Tier | Region      | Ore                  | Gas       | Wrecks       | Crop    | Refined                    | Component   | Ship class |
| ---- | ----------- | -------------------- | --------- | ------------ | ------- | -------------------------- | ----------- | ---------- |
| 1    | Home ring   | Iron ore, ice        | Hydrogen  | Cargo wrecks | Algae   | Iron plate, water          | Basic parts | Scout      |
| 2    | Inner belt  | Copper ore, silicate | Methane   | Mining rigs  | Beans   | Copper wire, glass         | Circuits    | Corvette   |
| 3    | The lanes   | Titanium ore         | Helium    | Freighters   | Grain   | Titanium plate, coolant    | Servos      | Frigate    |
| 4    | Borderlands | Cobalt ore           | Ammonia   | Warships     | Peppers | Cobalt alloy, fertiliser   | Power cores | Destroyer  |
| 5    | Deep field  | Iridium ore          | Deuterium | Old stations | Fruit   | Iridium plate, fusion fuel | Processors  | Cruiser    |
| 6    | Stray space | Stray shell          | Xenon     | Stray hulks  | Lichen  | Stray alloy, ion fuel      | Stray cores | Battleship |

Credits are the currency. They come from trade, loot and contracts, and are
spent on hiring, market purchases, tribute and some module costs.

The Hold limits how much of each item the station keeps: 500 at first, then
1,000, 2,500, 5,000, 10,000 and 25,000 with Hold I to V. A job whose output has
no room waits, as one short of inputs does; so do grown beds and outposts.
Nothing already held is taken, even above the limit. Credits have no limit.
(Changed from "no storage caps" on 2026-11-19: a night away paid for everything.)

### 5.2 The ten departments

| #   | Department   | Needs module   | Job                                                                                                     | Special mechanic                                                                                    | Seen in the scene as                                             |
| --- | ------------ | -------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Mining       | Drone bay      | Drone trip to an asteroid type; yields ore                                                              | Small chance of a geode (sell, or give to Research)                                                 | Drones fly out to the rock and back                              |
| 2   | Salvage      | Drone bay, tug | Strip a wreck type; each action rolls a loot table                                                      | Rare blueprints unlock recipes found nowhere else; very rare relics for the Archive                 | A tug hauls wreck pieces in                                      |
| 3   | Skimming     | Skimmer bay    | Skim a gas giant; yields fuel gas                                                                       | Gas feeds fuel cells, which fleets burn to travel                                                   | A skimmer leaves and returns with full tanks                     |
| 4   | Hydroponics  | Greenhouse     | Grow beds run on timers with no crew; the crew job is Galley, cooking crops into rations                | Beds per greenhouse level; auto-replant from Research                                               | Greenhouse glows and fills in                                    |
| 5   | Refining     | Refinery       | Ore, ice and gas into plate, water, fuel cells                                                          | Mastery gives a chance to keep the input                                                            | Refinery vents                                                   |
| 6   | Fabrication  | Workshop       | Components, drones (the tool tier for gathering), weapons, shields, armor, repair kits                  | Mastery gives a chance of a double                                                                  | Workshop sparks                                                  |
| 7   | Construction | Core           | Long projects: station modules, outpost modules, ship hulls, claim beacons                              | One project per assigned crew; 10 minutes to 12 hours                                               | Scaffold and welders on the dashed slot, then the module appears |
| 8   | Survey       | Scanner        | Scan a sector: reveals map nodes, resource sites, wreck fields, strongholds; yields data                | Per-sector mastery raises that sector's yields                                                      | Dish sweeps, a ping ring goes out                                |
| 9   | Research     | Lab            | Spend data on tech tree projects (about 60 nodes in four branches: industry, station, fleet, diplomacy) | Permanent unlocks, for example auto-replant, Shift rota, third fleet, extra outpost slot            | Lab lights pulse                                                 |
| 10  | Trade        | Market office  | Run a route to a faction market: sell what they want for credits and standing; buy what you lack        | Selling one good repeatedly lowers its price by up to 30%, recovering over time; delivery contracts | A freighter docks and leaves                                     |

As built so far (tier 1), with what was decided on the way:

- **Salvage** opens with a salvage tug, made once in Fabrication from basic
  parts, not with Drone bay II: level II needs tier 2 materials and cargo
  wrecks are tier 1.
- **Survey** scans the home ring for data until the map exists (step 4).
- **Only what has a use is built:** fleet gear and fuel use arrive with fleets
  (step 5), drone tiers with tier 2, and Research has the eight studies that
  affect systems that exist. Skimming and fuel cells are built, though nothing
  burns fuel yet.
- **Hydroponics:** a bed is planted for 2 water, grows algae in 5 minutes and
  empties when harvested; rations are 2 algae and 1 water. Crops have no
  mastery yet.
- **Things made once** (a module level, the tug, a study) share one mechanism:
  paid for once, one crew member, progress kept while paused.
- **The top bar** shows the items the selected department works with, and
  rations; pinning four comes later.

Opening order: Mining, Refining and Construction are available from the start.
The rest open as their modules are built, in roughly this order: Fabrication,
Salvage, Hydroponics, Survey, Trade, Research, fleets, Skimming.

### 5.3 Station modules

Thirteen module types, each with levels I to V. A level-up is a Construction
project. Each module has a fixed place in the station layout, so there is no
placement puzzle, and it has three visual stages (levels I, III and V).

Level N of a module is built from tier N materials, so crew slots and the
other module bonuses arrive with the tiers. The Core's level caps every other
module's.

| Module        | Effect per level                                       |
| ------------- | ------------------------------------------------------ |
| Core          | Present at start; gates the level cap of other modules |
| Habitat       | +1 crew slot                                           |
| Drone bay     | Opens Mining; raises drone tier limit                  |
| Refinery      | Opens Refining tiers                                   |
| Workshop      | Opens Fabrication tiers                                |
| Greenhouse    | Opens Hydroponics; +2 grow beds                        |
| Skimmer bay   | Opens Skimming tiers                                   |
| Scanner       | Opens Survey; raises scan range                        |
| Lab           | Opens Research branches                                |
| Market office | Opens Trade; +1 concurrent route                       |
| Dock          | Opens fleets; levels III and V give fleets 2 and 3     |
| Shipyard      | Raises the ship class that can be built                |
| Reactor       | +2% speed to all jobs                                  |
| Hold          | Raises how much of each item is kept (section 5.1)     |

---

## 6. Mastery

- Every item (each asteroid type, recipe, wreck type, route and so on) has its
  own mastery level, 1 to 99, raised by doing that action.
- Mastery thresholds at 10, 25, 50, 75 and 99 give that item bonuses in the
  department's style: faster, more yield, cheaper, or better rolls.
- A share of all mastery XP also fills the **department pool**. Pool checkpoints
  at 10%, 25%, 50% and 95% give department-wide bonuses, and pool XP can be
  spent to raise any item's mastery in that department.
- Numbers, all tunable: a second of an action is one mastery XP; the next
  mastery level costs `round(6 × 1.08^(level − 1))`, about 141,000 to reach
  99. The thresholds give a 5, 10, 15, 20 and 30% chance: of double output in
  Mining, of keeping the input in Refining, of double credits on a Trade sale
  (buy runs have no mastery, decided 2026-11-18). Half of all mastery XP also goes
  to the pool, which is full at half of its items' mastery to 99; its
  checkpoints give +3% speed, +5% chance, +5% speed and +10% chance.
- Things built once, such as station modules, have no mastery.

---

## 7. Fleets and combat

### 7.1 Ships and fleets

- Hulls are Construction projects; weapons and defenses come from Fabrication.
- Six classes, one per tier: scout, corvette, frigate, destroyer, cruiser,
  battleship. Each has hull, shield, armor, evasion, speed and slots for
  weapons, defenses and utilities.
- Up to three fleets (Dock levels). Ships per fleet grow with Command level:
  1 ship at level 1, then +1 at 10, 25, 45, 65 and 85, to a maximum of 6.
- Travel between sectors takes seconds to minutes and burns fuel cells per
  jump. A fleet without fuel cannot depart; nothing else is affected.

### 7.2 Weapons and defenses

Three weapon types and three defense types. Every enemy leans on one defense,
so you read the enemy and fit accordingly.

| Weapon   | Strong against (×1.5) | Weak against (×0.75) |
| -------- | --------------------- | -------------------- |
| Guns     | Shields               | Evasion              |
| Beams    | Armor                 | Shields              |
| Missiles | Evasion               | Armor                |

Each weapon tier has a rapid and a heavy variant. Twelve unique pieces drop
from strongholds.

### 7.3 How a battle runs

- Each ship attacks on its own timer (2 to 4 s). A hit is rolled from accuracy
  against evasion, then damage is rolled in a range and multiplied by the table
  above.
- Damage hits shields first, then hull. Shields regenerate; hull does not.
- **Repair kits** are used automatically when a ship's hull falls below a
  threshold you set (default 40%).
- A ship at zero hull is disabled and leaves the fight. Ships are never
  destroyed. If all are disabled the fleet returns home and needs repair time.
- Targets are taken in formation order, which you arrange.

Combat levels, 1 to 99: **Guns**, **Beams** and **Missiles** (from damage dealt
with that type), **Defense** (from damage absorbed) and **Command** (from
victories).

### 7.4 Where fleets fight

| Type        | What it is                                                           | Reward                                |
| ----------- | -------------------------------------------------------------------- | ------------------------------------- |
| Patrol zone | Endless enemy groups in a sector you can reach                       | Steady loot and XP                    |
| Stronghold  | A fixed run of waves ending in a boss; twelve in total, two per tier | First-clear reward and a unique piece |
| Garrison    | The waves defending a sector                                         | The sector becomes yours              |
| Raid        | Hostiles hitting one of your sectors                                 | Restores the sector's output          |

Strongholds: Scrap Cove, the Tollgate (tier 1); Rig 9, Cutter's Rest (2);
the Blockade, Dead Freighter (3); Gun Line, the Breakers (4); Quiet Station,
the Relay (5); the Hive, the Foundry (6, the final fight).

Enemies: pirates run from skiff to flagship across the tiers; strays run from
mite to foundry core. Faction navies appear only if you go to war with them.

### 7.5 Bounties

Each faction offers kill contracts: destroy a number of a named enemy in a named
zone. One bounty is active at a time; rerolling costs credits. Rewards are
standing, credits and bounty tokens spent in that faction's shop.

### 7.6 Raids

- A raid can start only while the game is open, and only one is active at a
  time.
- It targets an outpost bordering pirate, stray or at-war faction space, and
  halves that outpost's output until a fleet repels it.
- Turret modules on the outpost lower the chance and repel weak raids alone.
- The home station is never raided.

---

## 8. Map, sectors and outposts

### 8.1 The map

36 sectors joined by lanes. Unexplored sectors are hidden until Surveyed from a
neighboring sector you own or have visited.

As built in step 4:

- **The map is generated per game** from its seed: a column per tier, the
  table's holders shuffled within each tier, lanes mostly between neighboring
  tiers, and every sector reachable from home. Only the seed is stored.
  `?seed=<n>` in the address fixes the seed, for tests and for sharing a map.
- **Charting** is a 2-minute Survey job, from level 2, that puts the
  lowest-numbered hidden sector next to one of yours on the map.
- **Tier 2 materials** are bought at the Co-op's market until a tier 2 sector
  is taken (fleets, step 5). A faction's market opens once one of its sectors
  is charted.
- **Trade** runs earn credits only; standing and contracts come with factions
  (step 6). Each sale of a good lowers its price 3%, to at most 30%, and it
  recovers 3% every 5 minutes. One run at a time per Market office level and
  Trade hub.
- The map scene marks each holder with its own shape as well as color, tints
  held space, and shows the selected sector's planet in the corner.

| Tier | Sectors | Held by                   |
| ---- | ------- | ------------------------- |
| 1    | 5       | Home, 3 empty, 1 pirate   |
| 2    | 6       | 4 Co-op, 2 pirate         |
| 3    | 6       | 4 Company, 2 pirate       |
| 4    | 6       | 4 Navy, 2 pirate          |
| 5    | 6       | 4 Archive, 2 stray        |
| 6    | 7       | 6 stray, plus the Foundry |

Every tier has at least two sectors that belong to no faction, so progress
never requires going to war with one.

### 8.2 Taking a sector

| Sector is       | How it becomes yours                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| Empty           | Build a claim beacon (Construction)                                           |
| Pirate or stray | Beat its garrison                                                             |
| Faction         | Beat its garrison, which means war; or absorb the whole faction (section 9.4) |

The map is complete when every sector is owned or is a protectorate.

### 8.3 Outposts

Every owned sector has an outpost with three module slots (a fourth and fifth
from Research) and one specialization, changeable for credits. Outposts produce
without crew, so passive income grows as you expand, while crew jobs stay the
fastest source.

| Specialization | Gives                                                        |
| -------------- | ------------------------------------------------------------ |
| Mine           | A steady trickle of the sector's raw resources               |
| Yard           | Faster ship repair and a second Construction queue for hulls |
| Trade hub      | Passive credits and one more route                           |
| Listening post | Data trickle, faster Survey, raid warning                    |
| Farm           | Extra grow beds                                              |

As built in step 4: Mine (1 iron ore and 1 ice every 20 s), Trade hub (a
credit every 20 s and a route) and Farm (two beds). The yard comes with fleets
and the listening post with raids. A depot adds half again, a relay a quarter to
each neighboring outpost; kits are Construction jobs. The first set-up is free,
a change costs 200 credits.

Outpost modules: turret (raid defense), depot (more output), relay (bonus to
neighboring outposts).

Selecting a sector on the map shows a small orbit view of its outpost over a
planet generated from that sector's seed.

---

## 9. Factions and relations

### 9.1 Who they are

| Faction     | Who                                                       | Values                       | Offers                                 | Rival       |
| ----------- | --------------------------------------------------------- | ---------------------------- | -------------------------------------- | ----------- |
| The Company | Corporate trading league                                  | Trade volume, kept contracts | Components, market access, best prices | The Co-op   |
| The Navy    | Military of a fallen state, still holding its old borders | Bounties, shows of strength  | Weapons, ship blueprints               | The Archive |
| The Archive | Scholars studying pre-collapse relics                     | Data and relics              | Research, rare tech                    | The Navy    |
| The Co-op   | Independent stations and miners                           | Supplies, mutual aid         | Crew, basic goods                      | The Company |

Pirates and strays (rogue drones left over from before the collapse) are always
hostile and have no standing.

### 9.2 Standing

Standing runs from −100 to +100 for each faction.

| Rank    | Range       | Opens                                                                 |
| ------- | ----------- | --------------------------------------------------------------------- |
| Hostile | −100 to −50 | Nothing; they raid you if you share a border                          |
| Wary    | −49 to −10  | Market at poor prices                                                 |
| Neutral | −9 to 24    | Market, contracts, bounties                                           |
| Trusted | 25 to 69    | Crew recruits, blueprints, mining rights, passage through their lanes |
| Allied  | 70 to 100   | Best prices, the capstone, the charter contracts                      |

| Action                            | Effect                                       |
| --------------------------------- | -------------------------------------------- |
| Trade run, contract, bounty       | Small to medium gain                         |
| Gift of goods they value          | Small gain, with diminishing returns per day |
| Event choices                     | Stated on the choice                         |
| Attacking their sector            | Large loss and war                           |
| Gaining standing with their rival | Lose a quarter of what the rival gained      |

**Sides matter:** standing with a faction cannot rise above 69 while you are
Allied with its rival. In each pair you end up with at most one ally.

### 9.3 Capstones

| Faction     | Capstone at Allied                          |
| ----------- | ------------------------------------------- |
| The Company | Trade charter: every route pays double      |
| The Navy    | Dreadnought blueprint: a battleship variant |
| The Archive | Stray decoder: stray garrisons are weakened |
| The Co-op   | Open hiring: the eighth crew slot           |

If a faction is conquered instead, its capstone can drop as a blueprint from its
home garrison, so nothing is locked out of the completion log.

### 9.4 War, peace and absorbing

- **War** starts when you attack a faction's sector. Trade with them closes and
  they raid bordering sectors. It ends by paying tribute or completing a peace
  contract.
- **Conquer:** take all four of their sectors. The home sector's garrison is the
  hardest. The faction is gone; crew you already hired from it stay.
- **Absorb:** at Allied, a chain of five charter contracts makes the faction a
  protectorate. Its sectors count as yours for completion, give resource access
  and pay passive income. Standing is then fixed.

A typical run resolves each rival pair by absorbing one and conquering the
other. Conquering all four is also possible.

### 9.5 Contracts

Each faction offers three at a time, refreshed daily or when completed:
deliveries (Trade), bounties (fleets), survey requests (Survey) and build
requests (Construction).

### 9.6 Events

- About 40 written events, arriving every 2 to 4 hours of open play.
- They wait in an inbox of up to five; no new ones arrive while it is full.
  They never expire.
- Each has two or three choices, and every choice states its effect up front.
- Samples in appendix B.

---

## 10. Progression and pacing

Target timeline for a player who checks in a few times a day:

| When         | Where the player is                                      |
| ------------ | -------------------------------------------------------- |
| 10 minutes   | First module built, second department open               |
| 1 hour       | Second crew slot, first scout, first patrol              |
| Days 1 to 3  | Tier 1 well under way, first sector claimed, tier 2 open |
| Weeks 1 to 2 | Tiers 2 to 3, first faction at Trusted, second fleet     |
| Month 1      | Tier 4, first faction absorbed or first war              |
| Month 2      | Tier 5, both rival pairs resolved                        |
| Month 3      | Tier 6, stray space cleared, the Foundry, completion     |

- No prestige or reset.
- A **completion log** tracks items found, masteries, enemies beaten, sectors,
  events seen and crew hired, as one overall percentage.
- No tutorial screens. The first ten minutes teach by having only one thing
  available at a time.

---

## 11. Interface

### 11.1 Layout (desktop)

```
+------------------------------------------------------------------------------+
| Lsel    credits 12,480   iron plate 1,284   fuel cells 96  saved 2:02 PM ✓   |
+--------------+-----------------------------+---------------------------------+
| Mining    14 | Mining               Lv 14  |                                 |
| Salvage    6 | xp 62,300 / 74,000          |                                 |
| Skimming   - | pool 31%                    |                                 |
| Hydropon.  4 |                             |          pixel scene            |
| Refining   9 | Iron asteroid       3.0 s   |                                 |
| Fabricat.  6 | [=======>      ]   Ines     |                                 |
| Construct. 8 | Copper asteroid     4.5 s   |                                 |
| Survey     3 | mastery 22    [assign]      |                                 |
| Research   2 | Titanium asteroid   locked  |                                 |
| Trade      5 |                             |                                 |
| ------------ |                             |                                 |
| Map          |                             |                                 |
| Fleets       |                             |                                 |
| Factions     |                             |                                 |
| Log          |                             |                                 |
+--------------+-----------------------------+---------------------------------+
| Ines > Mining   Tomas > Construction   (free slot)        |  Inbox (2)       |
+------------------------------------------------------------------------------+
```

- **Left rail:** departments with level and a marker for running jobs, then
  Map, Fleets, Factions and Log.
- **Middle:** the selected department. All information lives here.
- **Right:** the scene, which follows the middle: the station for a
  department, the map for Map, a fleet for that fleet (decided 2026-11-18, in
  place of tabs). Nothing is shown only in the scene.
- **Bottom:** who is doing what, and the event inbox.
- **Top:** credits, up to four pinned resources, save and sync state. As
  built: credits once there are any, then what the selected view works with.

### 11.2 Phone

The scene sits on top and collapses to a thin strip; the department panel is
below; the rail becomes a drawer.

### 11.3 Conventions

- US spelling, 12-hour clock, metric units, thousands separated by commas.
- Level-ups and finished modules show as short toasts that clear themselves.
  The offline summary is a panel in the middle column, not a dialog; the only
  dialog is an event the player opened.
- Keyboard: `1` to `0` select departments, `j` and `k` move through the list,
  `Enter` assigns whoever is free and fastest, `x` stops, `p` raises mastery
  from the pool, `b` plants an empty bed, `m` opens the map (`j`, `k` and `Enter` move
  and claim there), `0` is Trade, `i` opens the inbox, `s` turns sound on or
  off, `Esc` backs out, `?` opens help: how the game works, the keys and the
  volumes. Every key is shown next to its action.
- Nothing is left to guess: each department and the map open with one line on
  what they are for and how they work, and the selected job says how it runs.
- With `prefers-reduced-motion` the scene is drawn as still frames; there is no
  setting for it.
- Factions are told apart by icon shape as well as color.
- The interface is lsel's `tokens.css`: its variables, its elements, JetBrains
  Mono. The palette in section 12.2 is for the scene only. A pixel face is used
  only for the title.

---

## 12. Art direction

### 12.1 Style rules

- One fixed palette of about 24 colors (below). No color outside it in the
  scene.
- Shading by 4×4 ordered dithering. No gradients, no anti-aliasing.
- Light comes from the upper right.
- Built things (station, ships, drones) have a one-pixel dark outline; natural
  things (planets, rocks, gas) do not.
- Sprites are never rotated or scaled by fractions. Ships face left or right.
- The scene is drawn at one whole-number pixel scale. When the panel is larger
  or smaller, the camera shows more or less space around the station; the art
  is never letterboxed or stretched.
- No portraits, no large illustrations, no text inside sprites.

### 12.2 Palette

| Use                                     | Colors                                           |
| --------------------------------------- | ------------------------------------------------ |
| Space                                   | `#0b1020` `#141b33`                              |
| Stars                                   | `#e8ecf7` `#5a6791`                              |
| Hull                                    | `#c9d2e6` `#7f8cab` `#414a6b`, outline `#05070f` |
| Warm accent (windows, yours on the map) | `#ffb347` `#ffd27a`                              |
| Alert, the Navy                         | `#e0523f`                                        |
| Beam, the Archive                       | `#7ef0ff`                                        |
| Solar, the Company                      | `#2b4a8c` `#6f9be0`                              |
| Green, the Co-op, crops                 | `#5fd16a` `#2f8f4a`                              |
| Planet ramp                             | `#0f2a3a` `#1b5560` `#2f8f86` `#a6e3c5`          |
| Land, crates, pirates                   | `#d98a4a` `#8a5a3a`                              |
| Rock                                    | `#9a8f8a` `#6b6064` `#3b3440`                    |
| Ghost slot                              | `#4a5788`                                        |

Other planet types reuse these ramps in different orders, plus at most four
more colors for lava and ice worlds.

### 12.3 What is made, and how

| Asset                           | How                                                                                                                                               | Count                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Starfield and nebula            | Generated from a seed                                                                                                                             | per sector           |
| Planets                         | Generated: sphere shading plus noise, six types (rock, ice, ocean, gas giant, lava, dead). May port the Pixel Planets shaders (MIT), credited     | per sector           |
| Asteroids, wreck pieces         | Generated outlines with dithered shading                                                                                                          | per type             |
| Station modules                 | Drawn by hand as palette grids, 16 to 32 px                                                                                                       | 13 × 3 stages        |
| Outposts                        | Hand-drawn base plus module add-ons                                                                                                               | 5 + 3                |
| Ships                           | Generator: mirrored mask per class, palette and silhouette rules per owner (you, four factions, pirates, strays); good seeds are picked and fixed | 6 classes × 7 owners |
| Drones, tug, skimmer, freighter | Hand-drawn, tiny                                                                                                                                  | about 8              |
| Effects                         | Code: beams, tracers, missiles, sparks, shield flicker, explosions, scan ping                                                                     | —                    |
| Map                             | Code: diamond nodes, dotted lanes, dithered territory tint, fleet markers, fog                                                                    | —                    |
| Item icons                      | About 12 hand-drawn templates (ore, plate, canister, crate, part, weapon and so on), recolored per item                                           | about 12             |
| Department and faction icons    | Hand-drawn, 12 px                                                                                                                                 | about 20             |

### 12.4 What moves in the station scene

Every running job shows up, and only running jobs do:

- Mining drones fly to the rock, fire a beam, and return.
- The salvage tug drags wreck pieces to the drone bay.
- The skimmer leaves the frame and comes back.
- Construction shows scaffold and welding sparks on the dashed slot; when the
  project finishes, the module is there.
- Workshop sparks, refinery vents, lab lights, scanner sweep, greenhouse glow.
- Freighters dock for trade runs; fleets undock and leave.
- Windows flicker; stars twinkle. This is the one decorative motion, which
  `DESIGN.md` allows inside a game's scene; like all scene motion it stops
  under `prefers-reduced-motion` (section 11.3).

A fleet tab shows two lines of ships trading fire, with shield flicker and hull
bars mirrored from the text panel.

### 12.5 Sound

- Everything is synthesized in code on the Web Audio API: no audio files and no
  framework (`docs/research-sound.md` has the why).
- **Effects** are short, low and soft: sine and triangle tones under 400 Hz,
  low-passed, with no echo (high, thin blips were tried and rejected on
  2026-11-18). A finished job is a muted knock; a milestone is two notes.
  Each is a list of ZzFX parameters, tuned by ear in ZzFX's designer. Every
  step of the build order adds the sounds for what it adds.
- **Ambience** is a deep, quiet rumble that drifts, and nothing else: no
  notes (rejected on 2026-11-18). It is generated, so it never loops audibly.
- Sound starts with the first key press or click, as browsers require, and is on
  by default at a low level. `s` mutes everything; effects and ambience have
  their own volumes. The settings are kept per device, not in the save.
- Only what happens live is heard: nothing plays while the tab is hidden, and
  what is caught up on afterwards is silent.
- Sound never draws from the game's seeded generator.

---

## 13. Tone and writing

- Dry and brief. Flavour is a single line, never a paragraph.
- Names are plain working names: iron plate, drone bay, the Navy, Rig 9.
  Nothing grand, mystical or invented-sounding.
- The player is never addressed as a chosen one. They hold a salvage claim.
- "Lsel" is a private working title.

---

## 14. Technical design

### 14.1 Stack

- lsel's `web` template (`STACK.md`): TypeScript, Svelte 5, Vite, Biome, Bun
  for install, run and tests. Canvas 2D for the scene. No game engine.
- `bun test` for unit tests, Playwright for browser tests.
- Packaged with Nix: the flake provides the dev shell and the package;
  `squares` runs it on twelve behind cloudflared.
- No requests to outside hosts at run time. Fonts are self-hosted.

### 14.2 Structure

```
src/
  sim/       pure, deterministic game logic: state, tick, formulas. No DOM.
  content/   data: items, actions, modules, ships, enemies, sectors,
             factions, crew, events, research. Typed, with ids.
  save/      schema, migrations, export/import, local store, sync client.
  web/       the Vite root.
    scene/   canvas renderer, sprite grids, generators.
    ui/      Svelte components.
  server/    Bun.serve: the built game, /healthz and the sync API.
tools/       balance simulator.
```

- `sim` knows nothing about rendering. `ui` and `scene` read a snapshot of the
  state and send commands (assign crew, start project, send fleet).
- Everything in the game is data in `content`. Adding an item means adding a
  record, not code.
- Ids are literal types derived from the content tables, so a reference to a
  record that does not exist fails to compile. Variants (job kinds, sector
  owners, event effects) are discriminated unions handled exhaustively. Saves and imports are parsed and
  validated at the boundary with Valibot.

### 14.3 Tick and offline catch-up

- `tick(state, 200 ms)` is the only function that advances the game.
- The interface updates text about five times a second and the scene about
  twelve.
- On load, missed time (up to 24 hours) is run through the same tick in chunks
  that yield to the browser, behind a progress bar, then summarized.
- A second tab opens read-only.

### 14.4 Saves

- One versioned document with a migration per version.
- Autosave to the browser every 30 seconds, after every command, on milestones
  (a module, an unlock, a recruit, a sector, a level) and when the page is put
  away. Never during catch-up.
- Export and import as a text string: `lsel-station:` and the document in
  base64. Importing replaces the game after showing its play time and date.
- A save that cannot be read is moved aside (`lsel-station.save.unreadable`,
  then `.2`, `.3` and so on),
  never overwritten, and a new game starts with a notice.
- One tab runs the game (a Web Lock); another shows it read-only and takes over
  when the first closes.
- On load, up to 24 hours away is caught up on behind a progress bar, then
  summed up in a "While you were away" panel. So is a gap of over an hour while
  the page stayed open (a sleeping laptop), and a hidden tab that comes back
  after a minute or more gets the summary of what happened meanwhile.

### 14.5 Sync

- Part of the one `Bun.serve` process that serves the game. Saves are rows in
  `bun:sqlite` in the service's state directory, backed up by `squares`.
- No accounts. The game generates a **save key**; entering it on another device
  links that device. The key is the only credential.
- `GET` and `PUT` on `/save/<key id>`, with a revision counter. If the server's
  revision is newer than the one the client started from, the client shows both
  saves (play time and last saved) and asks which to keep. Nothing is merged.
- Limits on save size and request rate.
- The game works fully without the service; sync state is shown in the top bar.

As built:

- The key is 24 random bytes in base64url and travels only in the
  `Authorization` header; the address carries its SHA-256, which is all the
  service stores.
- The service validates every save it is sent with the game's own schema, and
  refuses bodies over 128 KB. Requests: 30 a minute per save and 120 a minute
  per address (`CF-Connecting-IP` from the tunnel).
- A device sends its save every 5 minutes while open and when the page is put
  away. On load, a device whose save has not moved since it last synced takes a
  newer synced save without asking; otherwise it asks. A save sent as the page
  closes gets no answer, so on its next load the device asks the service
  whether it arrived; the service remembers the last 20 saves it stored.
- Saves, sync and the key are in the Saves panel (`o`).

### 14.6 Tests

- Tests call the sim as the game does and assert on resulting state: a job
  yields the stated output, a level unlocks the stated item, a save round-trips.
- Determinism: the same seed and commands always give the same state.
- Offline equivalence: catching up N hours equals ticking live for N hours.
- Playwright loads the built game in Chromium, Firefox and WebKit.

### 14.7 Balance simulator

A headless tool that plays the game with a simple policy for a given number of
days and reports when each milestone in section 10 is reached. This is how the
three-month target is checked without three months of play.

---

## 15. Build order

Each step ends with something playable.

| Step | Contents                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Project from lsel's `web` template, tick loop, one job (Mining iron), the station scene with a drone and a generated planet               |
| 1    | Save format, local saves, export and import, offline catch-up and summary, sync API, the app's entry in `squares`, first deploy to twelve |
| 2    | Crew slots, Refining, Construction with modules appearing in the scene, mastery                                                           |
| 3    | Fabrication, Salvage, Hydroponics and rations, Skimming, Survey, Research                                                                 |
| 4    | Sector map, claim beacons, outposts, Trade and credits                                                                                    |
| 5    | Ships, fleets, battles, patrol zones, garrisons, strongholds, the fleet scene                                                             |
| 6    | Factions: standing, contracts, bounties, recruits, events, war, raids, absorbing                                                          |
| 7    | Content filled out to tier 6, balance pass with the simulator, completion log, phone layout, polish                                       |

---

## 16. Confirmed defaults

These were decided without a question and confirmed on 2026-11-18.

1. Sound is on by default at a low level, synthesized in code (changed from "no sound" on 2026-11-18).
2. Station modules have fixed positions; the player does not place them.
3. A per-item storage limit set by the Hold module (changed 2026-11-19), and no power system.
4. Fleets do not use crew slots and have no named captains.
5. Offline cap of 24 hours; combat continues offline; raids and new events do not.
6. Rations give a speed buff and nothing is lost without them.
7. Level cap 99; six tiers at levels 1, 15, 30, 45, 60, 75.
8. 36 sectors, 12 strongholds, about 24 crew, about 40 events, about 60 research nodes.
9. Keyboard shortcuts as in section 11.3.
10. US spelling and a 12-hour clock, with metric units (lsel's rule).
11. Sync is part of the game's own `Bun.serve` process with saves in `bun:sqlite`, and the save key is the only credential.
12. No prestige, no tutorial screens.

---

## Appendix A: sample crew

| Name          | From               | Specialty                           |
| ------------- | ------------------ | ----------------------------------- |
| Ines Duarte   | Co-op              | Mining speed +10%                   |
| Tomas Greer   | Co-op              | Construction speed +10%             |
| Bea Lindqvist | Co-op              | Hydroponics yield +15%              |
| Sam Oyelaran  | Co-op              | Salvage: better loot rolls          |
| Yusra Haddad  | Company            | Trade prices +8%                    |
| Dev Malhotra  | Company            | Fabrication: +5% chance of a double |
| Carla Voss    | Company            | Refining speed +10%                 |
| Jun Sato      | Navy               | Construction: ship hulls 15% faster |
| Marek Bilal   | Navy               | Fabrication: weapons 15% faster     |
| Ruth Adeyemi  | Archive            | Research speed +10%                 |
| Leo Fontaine  | Archive            | Survey data +15%                    |
| Nadia Khoury  | Archive            | Salvage: relic chance doubled       |
| Olu Bright    | None (event)       | Skimming yield +15%                 |
| Pat Hollis    | None (event)       | Mining: geode chance doubled        |
| Kit Moreno    | None (bounty shop) | Refining: +5% chance to keep input  |
| Ana Petrov    | None (start)       | Generalist: +3% to everything       |

## Appendix B: sample events

| Event                                                                 | Choices                                                                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Mayday.** A Company freighter has lost power nearby.                | Tow it in: Company +6, one crew member busy for 30 minutes. Strip it: scrap and parts, Company −10. Leave it: nothing. |
| **Asylum.** A Navy officer asks to stay.                              | Take her in: gain crew member Jun Sato, Navy −8. Send her back: Navy +5.                                               |
| **Short harvest.** The Co-op is low on food.                          | Send 200 rations: Co-op +8. Sell them at double price: credits, Co-op −4, Company +2. Decline: nothing.                |
| **Reading room.** The Archive wants to copy your survey logs.         | Share: Archive +6, lose 100 data. Sell: credits, Archive +2. Refuse: Navy +2.                                          |
| **Toll.** Pirates want payment for a lane.                            | Pay: credits lost, no raids from that sector for a day. Refuse: a raid starts.                                         |
| **Stray signal.** A dormant drone is transmitting from a wreck field. | Recover it: a relic. Report it to the Navy: Navy +5. Report it to the Archive: Archive +5.                             |
