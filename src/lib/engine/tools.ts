// Handlers for each EngineTool (docs/engine-llm-contract.md). Each handler
// validates legality against real state, resolves any dice roll via
// dice.ts, mutates the session, and returns a typed result — the LLM
// narrates the result, it never decides it.

import type { ContentPack } from "../types/content-pack";
import type { EngineTool, EngineToolResult, AttackResult, MoveResult } from "../types/engine";
import type { SessionState } from "../types/state";
import { createRng } from "./rng";
import { rollDice } from "./dice";

// Thrown for a tool call that's well-formed but not currently legal (e.g.
// no such exit, target not present, tool not implemented yet) — expected
// player-facing outcomes, distinct from genuine bugs. The API layer
// catches these and returns a clean narration instead of a 500.
export class EngineValidationError extends Error {}

export function resolveEngineTool(
  session: SessionState,
  pack: ContentPack,
  call: EngineTool
): EngineToolResult {
  // Per-call RNG derived from the session seed + turn number keeps every
  // roll reproducible from the seed alone, without a shared mutable stream.
  const rng = createRng(`${session.map.seed}:${session.turnLog.length}:${call.name}`);

  switch (call.name) {
    case "move":
      return { name: "move", ...resolveMove(session, call.args) };
    case "attack":
      return { name: "attack", ...resolveAttack(session, pack, call.args, rng) };
    case "party_status":
      return { name: "party_status", party: session.party.members };
    case "search":
    case "use_item":
    case "interact":
    case "rest":
    case "roll_check":
    case "inspect":
      throw new EngineValidationError(`Tool "${call.name}" not implemented yet`);
    default: {
      const _exhaustive: never = call;
      throw new EngineValidationError(`Unknown tool: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function resolveMove(
  session: SessionState,
  args: { direction: string; via?: string }
): MoveResult {
  const edge = session.map.edges.find(
    (e) =>
      e.fromNodeId === session.party.currentTileId &&
      e.direction === args.direction &&
      (!args.via || e.via === args.via)
  );

  if (!edge || !edge.traversable) {
    return { moved: false, reason: "no such exit from here" };
  }

  const targetNode = session.map.nodes.find((n) => n.id === edge.toNodeId);
  if (!targetNode) {
    return { moved: false, reason: "destination not found" };
  }

  const wasRevealed = targetNode.revealed;
  targetNode.revealed = true;
  session.party.currentTileId = targetNode.id;

  return {
    moved: true,
    newTile: {
      node: targetNode,
      content: targetNode.resolvedContent,
      visibleExits: session.map.edges
        .filter((e) => e.fromNodeId === targetNode.id && e.traversable)
        .map((e) => e.direction),
    },
    triggeredEventId: targetNode.resolvedContent.eventId ?? undefined,
    mapDelta: wasRevealed
      ? undefined
      : { addedNodeId: targetNode.id, connection: { fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId, direction: edge.direction } },
  };
}

function resolveAttack(
  session: SessionState,
  pack: ContentPack,
  args: { targetId: string; weaponId?: string },
  rng: () => number
): AttackResult {
  const attacker = session.party.members[0]; // TODO: pass acting character once turn order UI exists
  const weapon = args.weaponId
    ? pack.items.find((i) => i.id === args.weaponId)
    : undefined;
  const damageDice = weapon?.effects?.damageDice ?? "1d4";

  const currentNode = session.map.nodes.find((n) => n.id === session.party.currentTileId);
  const monsterId = currentNode?.resolvedContent.monsterIds.find((id) => id === args.targetId);
  if (!monsterId) {
    throw new EngineValidationError(`Target "${args.targetId}" is not present on the current tile`);
  }
  const monster = pack.monsters.find((m) => m.id === monsterId);
  if (!monster) throw new EngineValidationError(`Unknown monster "${monsterId}" in pack "${pack.id}"`);

  const attackBonus = Math.floor((attacker.stats["strength"] ?? 10) / 2) - 5; // placeholder ability-mod math
  const roll = rollDice("1d20", rng);
  const totalToHit = roll.result + attackBonus;
  const hit = totalToHit >= monster.stats.armorClass;

  const targetHpBefore = monster.stats.hp ? rollDice(monster.stats.hp, rng).result : 0;
  let targetHpAfter = targetHpBefore;
  let damageRoll;
  if (hit) {
    damageRoll = rollDice(damageDice, rng);
    targetHpAfter = Math.max(0, targetHpBefore - damageRoll.result);
  }

  return {
    roll: { ...roll, result: totalToHit },
    hit,
    damageRoll,
    targetHpBefore,
    targetHpAfter,
    targetDefeated: targetHpAfter <= 0,
    narrativeHint: hit
      ? monster.descriptionHints[0] ?? "the blow lands"
      : "the attack goes wide",
  };
}
