# Content Pack Schema

Content packs are the data you author to define a world: dungeon tiles, items,
monsters, NPCs, and events. The generation engine draws from these to build a
random dungeon each run; the LLM narrator draws from these (and only these)
to describe what the player encounters, so narration never contradicts the
mechanical rules.

Packs are plain JSON/YAML, loaded by the engine at session start. A "ruleset"
is one or more packs combined (e.g. a base pack + a themed expansion pack).

All entities share three common fields:

```ts
interface BaseEntity {
  id: string;          // stable slug, e.g. "goblin_scout"
  name: string;         // display name
  tags: string[];       // free-form labels used for matching/filtering,
                         // e.g. ["undead", "flammable", "low_tier"]
}
```

---

## 1. Tiles

A tile is one node in the dungeon graph. The engine assembles tiles into a
map at generation time using each tile's `exits` and `placement` rules; the
LLM never invents a tile's shape or connections, only narrates entering one.

```ts
interface Tile extends BaseEntity {
  type: "room" | "corridor" | "junction" | "stairs" | "door" | "trap" | "vault";

  // Which directions this tile exposes. The engine wires matching exits
  // between adjacent tiles when it builds the graph.
  exits: Array<"north" | "south" | "east" | "west" | "up" | "down">;

  // Generation weighting.
  placement: {
    weight: number;          // relative chance of being picked, higher = more common
    minDepth?: number;       // won't appear before this dungeon depth/level
    maxDepth?: number;
    maxPerDungeon?: number;  // e.g. only one "throne_room" per run
    requiresTags?: string[]; // only placeable adjacent to tiles with these tags
  };

  // What can appear here once placed. The engine rolls against these tables;
  // the LLM narrates the roll's result, it doesn't choose the content.
  spawnTables: {
    monsters?: { id: string; weight: number; maxCount?: number }[];
    items?: { id: string; weight: number }[];
    npcs?: { id: string; weight: number }[];
    events?: { id: string; weight: number }[];
  };

  // Short narrative seeds the LLM may draw on and vary in prose —
  // not verbatim text, just flavor anchors so descriptions stay on-rule.
  descriptionHints: string[];
}
```

Example:

```yaml
id: flooded_corridor
name: Flooded Corridor
type: corridor
exits: [north, south]
placement:
  weight: 3
  minDepth: 1
spawnTables:
  monsters:
    - { id: giant_leech, weight: 5 }
  events:
    - { id: slip_hazard, weight: 2 }
descriptionHints:
  - "ankle-deep water reflecting torchlight"
  - "the smell of stagnant water and rust"
tags: [wet, low_visibility]
```

---

## 2. Items

```ts
interface Item extends BaseEntity {
  category: "weapon" | "armor" | "consumable" | "key" | "tool" | "treasure" | "quest";
  rarity: "common" | "uncommon" | "rare" | "unique";

  // Mechanical effect, applied by the engine — the LLM never computes these.
  effects?: {
    damageDice?: string;      // e.g. "1d8"
    armorClassBonus?: number;
    healAmount?: string;      // e.g. "2d4+2"
    statModifiers?: Record<string, number>;
    grantsTag?: string;       // e.g. "can_open_locked_doors"
  };

  requirements?: { minLevel?: number; requiredTag?: string };
  stackable: boolean;
  value: number; // in-world currency value, for shops/loot balancing
}
```

---

## 3. Monsters

```ts
interface Monster extends BaseEntity {
  tier: "trivial" | "standard" | "elite" | "boss";
  stats: {
    hp: string;          // dice notation, e.g. "3d6+3"
    armorClass: number;
    attackBonus: number;
    damageDice: string;  // e.g. "1d6"
    speed: number;
  };
  behavior: "aggressive" | "defensive" | "ambush" | "fleeing" | "guard";
  lootTable: { itemId: string; weight: number; dropChance: number }[];
  descriptionHints: string[];
}
```

---

## 4. NPCs

```ts
interface NPC extends BaseEntity {
  role: "merchant" | "quest_giver" | "ally" | "prisoner" | "hostile_neutral";
  disposition: "friendly" | "neutral" | "wary" | "hostile";
  dialogueHooks: {
    topic: string;               // e.g. "rumors", "trade", "quest_hook_1"
    conditions?: string[];       // tags/flags required for this hook to be available
    summary: string;             // what this NPC conveys — LLM phrases it, doesn't invent content
  }[];
  combatStats?: Monster["stats"]; // present only if the NPC can fight
  shopInventory?: { itemId: string; price: number }[];
}
```

---

## 5. Events

Events are triggered narrative/mechanical beats: traps, discoveries, ambushes,
environmental hazards, story beats.

```ts
interface Event extends BaseEntity {
  trigger: "on_enter" | "on_interact" | "on_search" | "random_tick";
  conditions?: string[];   // required tile tags, party flags, or item possession

  // What actually happens — resolved by the engine, narrated by the LLM.
  outcomes: {
    weight: number;
    effect: {
      type: "damage" | "heal" | "grant_item" | "remove_item" | "set_flag" | "spawn_monster" | "reveal_tile";
      params: Record<string, unknown>;
    };
    narrativeHint: string;
  }[];

  requiresRoll?: { skill: string; difficultyClass: number }; // ties into the dice system
}
```

---

## World-building rules (generation constraints)

A ruleset also includes top-level generation parameters, separate from
individual entities:

```ts
interface RulesetConfig {
  minTiles: number;
  maxTiles: number;
  maxDepth: number;
  difficultyCurve: "flat" | "linear" | "spike_at_boss";
  guaranteedTiles?: string[];   // e.g. must include one "stairs_down"
  theme: string;                // used to filter which packs/tags are eligible
}
```

## How this maps to generation + narration

1. **Generation (deterministic):** the engine builds the tile graph using
   `placement` rules and `RulesetConfig`, then rolls each tile's
   `spawnTables` to populate monsters/items/NPCs/events. This all happens
   server-side with a seeded RNG — no LLM involvement, so the map is
   reproducible and debuggable.
2. **Narration (LLM):** each turn, the engine hands the LLM only the *current
   tile's* resolved content (never the whole map) plus `descriptionHints`/
   `dialogueHooks`/`narrativeHint` text. The LLM's job is prose variation
   within those bounds — it cannot introduce a monster, item, or exit that
   the engine didn't place.

This is what guarantees "randomly generated from the rules I provide": the
randomness lives in the weighted tables you author, not in the LLM's
imagination.
