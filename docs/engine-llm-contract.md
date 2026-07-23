# Engine / LLM Contract

The LLM is the **narrator and natural-language intent parser**. It never
tracks canonical state and never decides outcomes on its own — it calls
tools, the engine resolves them deterministically against the content packs
and current game state, and the LLM narrates whatever the engine returns.

This keeps HP, inventory, position, and dice results consistent across a
long session, and keeps the LLM from improvising content that contradicts
your rulesets.

## Turn loop

1. Player types natural language (e.g. "go down the ladder", "attack the
   goblin with my sword", "check my inventory", "search the room").
2. The LLM receives the current **turn context** (below) and the player's
   text, and responds by calling exactly one tool (or, for pure
   conversation/flavor questions with no world effect, plain text).
3. The engine validates and executes the tool call against real state,
   rolling any dice server-side with a seeded RNG.
4. The engine returns a **result object** to the LLM.
5. The LLM narrates the result in prose, using only the entities and
   `descriptionHints`/`narrativeHint` text the result object gave it.
6. The client updates the four UI panels from the same result object the
   LLM narrated from — map, portrait/status, inventory, and log all derive
   from one source of truth, so they can't drift out of sync with each other
   or with the narration.

## Turn context passed to the LLM each turn

```ts
interface TurnContext {
  party: CharacterState[];        // current HP, status effects, equipped items
  currentTile: ResolvedTile;      // only the tile the party occupies — not the full map
  visibleExits: string[];
  activeEvent?: ResolvedEvent;    // if one triggered on entry
  recentLog: string[];            // last few narrated turns, for continuity
}
```

The LLM is never given the raw content packs or the unrevealed map — only
what the engine has already resolved as visible/known. This is what stops it
from spoiling or inventing rooms that haven't been generated into context
yet.

## Tools the LLM can call

```ts
type EngineTool =
  | { name: "move"; args: { direction: "north"|"south"|"east"|"west"|"up"|"down"; via?: string } }
  | { name: "attack"; args: { targetId: string; weaponId?: string } }
  | { name: "use_item"; args: { itemId: string; targetId?: string } }
  | { name: "interact"; args: { targetId: string; action: string } } // e.g. talk, open, pull
  | { name: "search"; args: {} }
  | { name: "rest"; args: { type: "short" | "long" } }
  | { name: "roll_check"; args: { skill: string; difficultyClass: number } }
  | { name: "inspect"; args: { targetId: string } } // no state change, just detail lookup
  | { name: "party_status"; args: {} };             // no state change, UI-only query
```

Each tool call maps to one engine-side handler that:
- validates legality (e.g. can't move through a wall that has no exit, can't
  attack a target not present),
- resolves any dice roll needed (attack rolls, damage, skill checks) via the
  shared dice module,
- mutates canonical state in the session store,
- returns a typed result.

### Example: `attack`

```ts
// LLM calls:
{ name: "attack", args: { targetId: "goblin_scout_3", weaponId: "rusty_sword" } }

// Engine resolves server-side and returns:
{
  roll: { notation: "1d20+2", result: 17, breakdown: [15, "+2"] },
  hit: true,
  damageRoll: { notation: "1d6+1", result: 5 },
  targetHpBefore: 11,
  targetHpAfter: 6,
  targetDefeated: false,
  narrativeHint: "a solid strike catches the goblin across the shoulder"
}
```

The LLM narrates this result — it does not invent whether the attack hit or
how much damage landed. This is also what "simulate dice in real time"
means mechanically: the *result* is fixed by the engine's RNG the instant
the tool resolves; the client's 3D dice animation is a deterministic replay
of that already-decided roll, so it's fair even though it looks live.

### Example: `move`

```ts
// LLM calls:
{ name: "move", args: { direction: "down", via: "ladder" } }

// Engine returns:
{
  moved: true,
  newTile: ResolvedTile,      // freshly generated/revealed if not visited before
  triggeredEvent?: ResolvedEvent,
  mapDelta: { addedTileId: string, connection: {...} } // drives the live map panel
}
```

If `direction`/`via` doesn't match any real exit on the current tile, the
engine returns `moved: false` with a reason, and the LLM narrates that the
path doesn't exist — it can't just decide to let the player through.

## Natural language parsing strategy

The LLM's intent-parsing job is bounded, not open-ended: given the player's
text plus `visibleExits` and the entities actually present in `currentTile`,
map it to one tool call with valid args. If the input is ambiguous ("attack
it" with two enemies present) or refers to something not in context (an exit
that doesn't exist, an item not carried), the LLM should ask a one-line
clarifying question instead of guessing — no tool call, plain text back to
the player.

## Dice system

- A single shared `rollDice(notation, seed)` engine function is the only
  place randomness happens for anything mechanical (attacks, checks, loot,
  generation). The LLM never generates numbers.
- Every roll result is logged with its full breakdown so it's auditable —
  useful for debugging and for players who want to see "why" a roll landed
  where it did.
- The client-side 3D dice animation takes the already-computed result as
  input and animates to land on it, rather than running independent physics
  that could disagree with the server.

## Why this split matters for your requirements

- **"Randomly generated from rules I provide"** → randomness lives in the
  engine's weighted tables and seeded RNG, not the LLM's imagination.
- **Natural language movement/combat** → the LLM's only job is mapping text
  to one of a small fixed set of tool calls, which is a much more reliable
  task than asking it to *be* the game engine.
- **Traditional dice rolling** → real dice math, computed once, animated
  faithfully — not vibes-based narration of "you probably hit."
- **Consistent multi-panel UI** → map, portraits, inventory, and log are all
  read-only views over the same engine result objects, so they can never
  show contradictory state.
