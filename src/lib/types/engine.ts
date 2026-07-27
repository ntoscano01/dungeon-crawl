// Mirrors docs/engine-llm-contract.md — the tool-calling interface between
// the LLM narrator and the deterministic engine. The LLM only ever
// produces one of these calls (or plain text for non-world-affecting
// replies); it never mutates state directly.

import type { Direction } from "./content-pack";
import type { CharacterState, MapNodeState, ResolvedTileContent } from "./state";

export type EngineTool =
  | { name: "move"; args: { direction: Direction; via?: string } }
  | { name: "attack"; args: { targetId: string; weaponId?: string } }
  | { name: "use_item"; args: { itemId: string; targetId?: string } }
  | { name: "interact"; args: { targetId: string; action: string } }
  | { name: "search"; args: Record<string, never> }
  | { name: "rest"; args: { type: "short" | "long" } }
  | { name: "roll_check"; args: { skill: string; difficultyClass: number } }
  | { name: "inspect"; args: { targetId: string } }
  | { name: "party_status"; args: Record<string, never> };

export interface DiceRollResult {
  notation: string;
  result: number;
  breakdown: (number | string)[];
}

export interface ResolvedTile {
  node: MapNodeState;
  content: ResolvedTileContent;
  visibleExits: Direction[];
}

export interface TurnContext {
  party: CharacterState[];
  currentTile: ResolvedTile;
  visibleExits: Direction[];
  recentLog: string[];
}

export interface AttackResult {
  roll: DiceRollResult;
  hit: boolean;
  damageRoll?: DiceRollResult;
  targetHpBefore: number;
  targetHpAfter: number;
  targetDefeated: boolean;
  narrativeHint: string;
}

export interface MoveResult {
  moved: boolean;
  reason?: string;
  newTile?: ResolvedTile;
  triggeredEventId?: string;
  mapDelta?: {
    addedNodeId?: string;
    connection?: { fromNodeId: string; toNodeId: string; direction: Direction };
  };
}

// Discriminated union so a handler's return type is inferable from the
// tool name at the call site.
export type EngineToolResult =
  | ({ name: "move" } & MoveResult)
  | ({ name: "attack" } & AttackResult)
  | { name: "use_item"; applied: boolean; narrativeHint: string }
  | { name: "interact"; outcomeId: string; narrativeHint: string }
  | { name: "search"; found: (string | { itemId: string })[]; narrativeHint: string }
  | { name: "rest"; hpRestored: number }
  | { name: "roll_check"; roll: DiceRollResult; success: boolean }
  | { name: "inspect"; details: string }
  | { name: "party_status"; party: CharacterState[] };
