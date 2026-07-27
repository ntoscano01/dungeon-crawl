# Data Model

This is the canonical state the engine owns and mutates — the thing the LLM
narrates from and the UI renders from (per `engine-llm-contract.md`). It
splits into three layers: **character/party**, **map graph**, and
**session/save**.

Party support is built into the shape from the start (1–4 characters per
session) even though v1 only exercises it with one.

---

## 1. Character

```ts
interface CharacterState {
  id: string;
  name: string;
  classId: string;          // references a class/archetype defined in a content pack
  level: number;

  hp: { current: number; max: number };
  stats: Record<string, number>; // e.g. { strength: 14, dexterity: 12, ... }
  armorClass: number;

  statusEffects: {
    id: string;              // e.g. "poisoned", "blessed"
    remainingTurns: number | "until_rest";
  }[];

  equipment: {
    slot: "mainHand" | "offHand" | "armor" | "accessory1" | "accessory2";
    itemId: string | null;
  }[];

  inventory: {
    itemId: string;
    quantity: number;
  }[];

  isDowned: boolean;
}
```

Each character's `equipment` + `hp` + `statusEffects` is exactly what
drives UI panel 3 (portrait/status); `inventory` drives panel 4. Both are
plain derived views over this object — no separate state to keep in sync.

## 2. Party

```ts
interface PartyState {
  members: CharacterState[];   // 1–4
  sharedFlags: Record<string, boolean>;  // quest/story flags, e.g. "met_the_hermit"
  currentTileId: string;       // party moves as a unit; no split-party in v1
  turnOrder: string[];         // character IDs, for combat initiative
}
```

Keeping the party on a single `currentTileId` avoids a whole class of sync
problems (partial-visibility map states, independent combat encounters)
that only matter once remote multiplayer becomes a goal.

## 3. Map graph

Generated once at session start (per `content-pack-schema.md`'s generation
rules), then incrementally *revealed* as the party moves — the client never
receives unrevealed tiles.

```ts
// A live monster on a tile — distinct from the Monster content-pack
// template. instanceId is unique per spawn so two monsters from the same
// template (e.g. two goblin_scout) can be targeted and defeated
// independently, and hp persists across attacks instead of being re-rolled
// on every hit.
interface MonsterInstance {
  instanceId: string;
  templateId: string;       // references the Monster definition from the content pack
  hp: { current: number; max: number };
}

interface MapNode {
  id: string;               // unique instance ID, distinct from the Tile template's id
  tileTemplateId: string;   // references the Tile definition from the content pack
  depth: number;
  revealed: boolean;
  resolvedContent: {        // this instance's actual rolled spawn-table results
    monsters: MonsterInstance[];
    itemIds: string[];
    npcIds: string[];
    eventId: string | null;
  };
  position: { x: number; y: number }; // for map layout only, not gameplay logic
}

interface MapEdge {
  fromNodeId: string;
  toNodeId: string;
  direction: "north" | "south" | "east" | "west" | "up" | "down";
  via?: string;              // e.g. "ladder", "locked_door"
  traversable: boolean;      // false until a condition is met (locked, collapsed, etc.)
}

interface MapGraph {
  nodes: MapNode[];
  edges: MapEdge[];
  seed: string;              // RNG seed used to generate this graph — makes runs reproducible/debuggable
}
```

`mapDelta` in the `move` tool result (see `engine-llm-contract.md`) is just
"the node(s)/edge(s) whose `revealed` flipped to true this turn" — that's
what the live map panel animates in.

## 4. Session / save state

The top-level object persisted to Postgres and rehydrated on load.

```ts
interface SessionState {
  id: string;
  ownerId: string;
  rulesetId: string;         // which content pack combination this run uses
  createdAt: string;
  updatedAt: string;

  party: PartyState;
  map: MapGraph;

  turnLog: {
    turnNumber: number;
    playerInput: string;
    toolCall: { name: string; args: Record<string, unknown> };
    toolResult: Record<string, unknown>;
    narration: string;
  }[];

  status: "active" | "victory" | "party_wiped" | "abandoned";
}
```

`turnLog` is the full replay/audit trail — every dice roll and state change
is reconstructable from it, which matters both for debugging engine bugs and
for "what just happened" UI (scrollback in panel 1 is literally this log's
`narration` field, in order).

## Persistence (Postgres via Prisma)

Implemented in `prisma/schema.prisma` (connection config in
`prisma.config.ts` — Prisma 7 moved this out of the schema file) and
`src/lib/engine/persistence.ts`:

```
Session        (id, ownerId, rulesetId, status, seed, currentTileId, createdAt, updatedAt)
Character      (id, sessionId FK, name, classId, level, hpCurrent, hpMax, armorClass, ...)
CharacterItem  (id, characterId FK, itemId, quantity, equippedSlot nullable)
StatusEffect   (id, characterId FK, effectId, remainingTurns)
MapNode        (id, sessionId FK, tileTemplateId, depth, revealed, positionX, positionY)
MapNodeContent (id, mapNodeId FK, kind [monster|item|npc|event], refId, instanceId/hpCurrent/hpMax if monster)
MapEdge        (id, sessionId FK, fromNodeId FK, toNodeId FK, direction, via, traversable)
TurnLogEntry   (id, sessionId FK, turnNumber, playerInput, toolCall JSON, toolResult JSON, narration)
```

`toolCall`/`toolResult` as JSON columns keep the log flexible as new tool
types get added without a migration each time; everything else stays
relational since it's queried/filtered directly (e.g. "all active sessions
for a user", "current HP for party UI").

`MapNode.id` is generated as `${sessionId}_${tileTemplateId}_${index}` —
prefixed with the owning session's id so it's globally unique once it's a
real primary key, not just unique within one session's in-memory node
array (an early version of this scheme collided across sessions for
exactly that reason).

`session.ts` falls back to an in-memory `Map` if the database is
unreachable, mirroring the LLM call's fail-closed pattern in
`src/lib/llm/` — a missing `DATABASE_URL` or connection failure is logged,
not fatal, and self-heals once the database is reachable again.

## How this ties the panels together

| UI panel | Reads from |
|---|---|
| 1. Prompt/response | `turnLog[].narration`, appended each turn |
| 2. Live map | `MapGraph` filtered to `revealed: true`, animated via `mapDelta` |
| 3. Character portrait/status | `CharacterState.hp`, `.statusEffects`, `.equipment` |
| 4. Inventory | `CharacterState.inventory` |

All four are pure reads off `SessionState` — no panel holds independent
state, so there's nothing for them to disagree about.
