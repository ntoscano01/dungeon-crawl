// Mirrors docs/data-model.md — the canonical runtime state the engine owns.

export interface StatusEffectState {
  id: string;
  remainingTurns: number | "until_rest";
}

export type EquipmentSlot = "mainHand" | "offHand" | "armor" | "accessory1" | "accessory2";

export interface CharacterState {
  id: string;
  name: string;
  classId: string;
  level: number;

  hp: { current: number; max: number };
  stats: Record<string, number>;
  armorClass: number;

  statusEffects: StatusEffectState[];

  equipment: { slot: EquipmentSlot; itemId: string | null }[];
  inventory: { itemId: string; quantity: number }[];

  isDowned: boolean;
}

export interface PartyState {
  members: CharacterState[];
  sharedFlags: Record<string, boolean>;
  currentTileId: string;
  turnOrder: string[];
}

export interface ResolvedTileContent {
  monsterIds: string[];
  itemIds: string[];
  npcIds: string[];
  eventId: string | null;
}

export interface MapNodeState {
  id: string;
  tileTemplateId: string;
  depth: number;
  revealed: boolean;
  resolvedContent: ResolvedTileContent;
  position: { x: number; y: number };
}

export interface MapEdgeState {
  fromNodeId: string;
  toNodeId: string;
  direction: "north" | "south" | "east" | "west" | "up" | "down";
  via?: string;
  traversable: boolean;
}

export interface MapGraphState {
  nodes: MapNodeState[];
  edges: MapEdgeState[];
  seed: string;
}

export interface TurnLogEntry {
  turnNumber: number;
  playerInput: string;
  toolCall: { name: string; args: Record<string, unknown> };
  toolResult: Record<string, unknown>;
  narration: string;
}

export type SessionStatus = "active" | "victory" | "party_wiped" | "abandoned";

export interface SessionState {
  id: string;
  ownerId: string;
  rulesetId: string;
  createdAt: string;
  updatedAt: string;

  party: PartyState;
  map: MapGraphState;
  turnLog: TurnLogEntry[];

  status: SessionStatus;
}
