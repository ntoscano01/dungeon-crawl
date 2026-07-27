// Mirrors docs/content-pack-schema.md — the data authors write to define a
// world. Kept as plain interfaces (not classes) since packs are just
// parsed JSON/YAML.

export interface BaseEntity {
  id: string;
  name: string;
  tags: string[];
}

export type Direction = "north" | "south" | "east" | "west" | "up" | "down";

export interface SpawnEntry {
  id: string;
  weight: number;
  maxCount?: number;
}

export interface Tile extends BaseEntity {
  type: "room" | "corridor" | "junction" | "stairs" | "door" | "trap" | "vault";
  exits: Direction[];
  placement: {
    weight: number;
    minDepth?: number;
    maxDepth?: number;
    maxPerDungeon?: number;
    requiresTags?: string[];
  };
  spawnTables: {
    monsters?: SpawnEntry[];
    items?: SpawnEntry[];
    npcs?: SpawnEntry[];
    events?: SpawnEntry[];
  };
  descriptionHints: string[];
}

export interface Item extends BaseEntity {
  category: "weapon" | "armor" | "consumable" | "key" | "tool" | "treasure" | "quest";
  rarity: "common" | "uncommon" | "rare" | "unique";
  effects?: {
    damageDice?: string;
    armorClassBonus?: number;
    healAmount?: string;
    statModifiers?: Record<string, number>;
    grantsTag?: string;
  };
  requirements?: { minLevel?: number; requiredTag?: string };
  stackable: boolean;
  value: number;
}

export interface Monster extends BaseEntity {
  tier: "trivial" | "standard" | "elite" | "boss";
  stats: {
    hp: string;
    armorClass: number;
    attackBonus: number;
    damageDice: string;
    speed: number;
  };
  behavior: "aggressive" | "defensive" | "ambush" | "fleeing" | "guard";
  lootTable: { itemId: string; weight: number; dropChance: number }[];
  descriptionHints: string[];
}

export interface DialogueHook {
  topic: string;
  conditions?: string[];
  summary: string;
}

export interface NPC extends BaseEntity {
  role: "merchant" | "quest_giver" | "ally" | "prisoner" | "hostile_neutral";
  disposition: "friendly" | "neutral" | "wary" | "hostile";
  dialogueHooks: DialogueHook[];
  combatStats?: Monster["stats"];
  shopInventory?: { itemId: string; price: number }[];
}

export type EventEffectType =
  | "damage"
  | "heal"
  | "grant_item"
  | "remove_item"
  | "set_flag"
  | "spawn_monster"
  | "reveal_tile";

export interface EventOutcome {
  weight: number;
  effect: { type: EventEffectType; params: Record<string, unknown> };
  narrativeHint: string;
}

export interface DungeonEvent extends BaseEntity {
  trigger: "on_enter" | "on_interact" | "on_search" | "random_tick";
  conditions?: string[];
  outcomes: EventOutcome[];
  requiresRoll?: { skill: string; difficultyClass: number };
}

export interface RulesetConfig {
  minTiles: number;
  maxTiles: number;
  maxDepth: number;
  difficultyCurve: "flat" | "linear" | "spike_at_boss";
  guaranteedTiles?: string[];
  theme: string;
}

export interface ContentPack {
  id: string;
  tiles: Tile[];
  items: Item[];
  monsters: Monster[];
  npcs: NPC[];
  events: DungeonEvent[];
}

export interface Ruleset {
  config: RulesetConfig;
  packs: ContentPack[];
}
