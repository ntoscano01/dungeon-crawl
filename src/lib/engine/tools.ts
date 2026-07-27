// Handlers for each EngineTool (docs/engine-llm-contract.md). Each handler
// validates legality against real state, resolves any dice roll via
// dice.ts, mutates the session, and returns a typed result — the LLM
// narrates the result, it never decides it.

import type { ContentPack } from "../types/content-pack";
import type {
  EngineTool,
  EngineToolResult,
  AttackResult,
  MoveResult,
  DiceRollResult,
} from "../types/engine";
import type { CharacterState, SessionState } from "../types/state";
import { createRng } from "./rng";
import { rollDice } from "./dice";
import { resolveEvent } from "./events";

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
      return { name: "move", ...resolveMove(session, pack, call.args, rng) };
    case "attack":
      return { name: "attack", ...resolveAttack(session, pack, call.args, rng) };
    case "use_item":
      return { name: "use_item", ...resolveUseItem(session, pack, call.args, rng) };
    case "interact":
      return { name: "interact", ...resolveInteract(session, pack, call.args, rng) };
    case "search":
      return { name: "search", ...resolveSearch(session, pack, rng) };
    case "rest":
      return { name: "rest", ...resolveRest(session, call.args, rng) };
    case "roll_check":
      return { name: "roll_check", ...resolveRollCheck(session, call.args, rng) };
    case "inspect":
      return { name: "inspect", ...resolveInspect(session, pack, call.args) };
    case "party_status":
      return { name: "party_status", party: session.party.members };
    default: {
      const _exhaustive: never = call;
      throw new EngineValidationError(`Unknown tool: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function currentNode(session: SessionState) {
  return session.map.nodes.find((n) => n.id === session.party.currentTileId);
}

function actingCharacter(session: SessionState): CharacterState {
  return session.party.members[0]; // TODO: pass acting character once turn order UI exists
}

function resolveMove(
  session: SessionState,
  pack: ContentPack,
  args: { direction: string; via?: string },
  rng: () => number
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

  // Only events tagged "on_enter" auto-fire on arrival; "on_search" and
  // "on_interact" events sitting on this tile wait for the matching tool.
  let triggeredEventId: string | undefined;
  let eventNarrativeHint: string | undefined;
  const pendingEventId = targetNode.resolvedContent.eventId;
  if (pendingEventId) {
    const event = pack.events.find((e) => e.id === pendingEventId);
    if (event?.trigger === "on_enter") {
      const resolution = resolveEvent(session, pack, event, rng);
      triggeredEventId = event.id;
      eventNarrativeHint = resolution.narrativeHint;
      targetNode.resolvedContent.eventId = null; // one-shot — don't re-fire on re-entry
    }
  }

  return {
    moved: true,
    newTile: {
      node: targetNode,
      content: targetNode.resolvedContent,
      visibleExits: session.map.edges
        .filter((e) => e.fromNodeId === targetNode.id && e.traversable)
        .map((e) => e.direction),
    },
    triggeredEventId,
    eventNarrativeHint,
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
  const attacker = actingCharacter(session);
  const weapon = args.weaponId
    ? pack.items.find((i) => i.id === args.weaponId)
    : undefined;
  const damageDice = weapon?.effects?.damageDice ?? "1d4";

  const node = currentNode(session);
  const instance = node?.resolvedContent.monsters.find((m) => m.instanceId === args.targetId);
  if (!instance) {
    throw new EngineValidationError(`Target "${args.targetId}" is not present on the current tile`);
  }
  const monster = pack.monsters.find((m) => m.id === instance.templateId);
  if (!monster) throw new EngineValidationError(`Unknown monster "${instance.templateId}" in pack "${pack.id}"`);

  const attackBonus = abilityModifier(attacker, "strength");
  const roll = rollDice("1d20", rng);
  const totalToHit = roll.result + attackBonus;
  const hit = totalToHit >= monster.stats.armorClass;

  const targetHpBefore = instance.hp.current;
  let targetHpAfter = targetHpBefore;
  let damageRoll;
  if (hit) {
    damageRoll = rollDice(damageDice, rng);
    targetHpAfter = Math.max(0, targetHpBefore - damageRoll.result);
    instance.hp.current = targetHpAfter;
    if (targetHpAfter <= 0 && node) {
      node.resolvedContent.monsters = node.resolvedContent.monsters.filter(
        (m) => m.instanceId !== instance.instanceId
      );
    }
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

function resolveUseItem(
  session: SessionState,
  pack: ContentPack,
  args: { itemId: string; targetId?: string },
  rng: () => number
): { applied: boolean; narrativeHint: string } {
  const character = actingCharacter(session);
  const invEntry = character.inventory.find((i) => i.itemId === args.itemId);
  if (!invEntry) {
    throw new EngineValidationError(`"${args.itemId}" is not in your inventory`);
  }
  const item = pack.items.find((i) => i.id === args.itemId);
  if (!item) throw new EngineValidationError(`Unknown item "${args.itemId}" in pack "${pack.id}"`);

  let applied = false;
  let narrativeHint = `${item.name} has no effect right now.`;

  if (item.effects?.healAmount) {
    const missing = character.hp.max - character.hp.current;
    if (missing <= 0) {
      narrativeHint = `${character.name} is already at full health; the ${item.name} has no effect.`;
    } else {
      const rolled = rollDice(item.effects.healAmount, rng).result;
      const restored = Math.min(missing, rolled);
      character.hp.current += restored;
      narrativeHint = `${character.name} recovers ${restored} HP from the ${item.name}.`;
      applied = true;
    }
  } else if (item.effects?.grantsTag) {
    session.party.sharedFlags[item.effects.grantsTag] = true;
    narrativeHint = `${character.name} gains the effect of ${item.name}.`;
    applied = true;
  }

  if (applied && item.category === "consumable") {
    invEntry.quantity -= 1;
    if (invEntry.quantity <= 0) {
      character.inventory = character.inventory.filter((i) => i !== invEntry);
    }
  }

  return { applied, narrativeHint };
}

function resolveInteract(
  session: SessionState,
  pack: ContentPack,
  args: { targetId: string; action: string },
  rng: () => number
): { outcomeId: string; narrativeHint: string } {
  const node = currentNode(session);
  const npcId = node?.resolvedContent.npcIds.find((id) => id === args.targetId);

  if (npcId) {
    const npc = pack.npcs.find((n) => n.id === npcId);
    if (!npc) throw new EngineValidationError(`Unknown NPC "${npcId}" in pack "${pack.id}"`);
    const hook =
      npc.dialogueHooks.find((h) => h.topic === args.action) ?? npc.dialogueHooks[0];
    if (!hook) {
      return { outcomeId: "no_dialogue", narrativeHint: `${npc.name} has nothing to say.` };
    }
    return { outcomeId: hook.topic, narrativeHint: hook.summary };
  }

  const pendingEventId = node?.resolvedContent.eventId;
  if (pendingEventId) {
    const event = pack.events.find((e) => e.id === pendingEventId);
    if (event?.trigger === "on_interact") {
      const resolution = resolveEvent(session, pack, event, rng);
      if (node) node.resolvedContent.eventId = null;
      return { outcomeId: event.id, narrativeHint: resolution.narrativeHint };
    }
  }

  throw new EngineValidationError(
    `There's nothing here to ${args.action} called "${args.targetId}"`
  );
}

function resolveSearch(
  session: SessionState,
  pack: ContentPack,
  rng: () => number
): { found: (string | { itemId: string })[]; narrativeHint: string } {
  const node = currentNode(session);
  if (!node) throw new EngineValidationError("Current tile not found");

  const character = actingCharacter(session);
  const foundItemIds = [...node.resolvedContent.itemIds];
  for (const itemId of foundItemIds) {
    const existing = character.inventory.find((i) => i.itemId === itemId);
    if (existing) existing.quantity += 1;
    else character.inventory.push({ itemId, quantity: 1 });
  }
  node.resolvedContent.itemIds = [];

  const pendingEventId = node.resolvedContent.eventId;
  let eventNarrative: string | undefined;
  if (pendingEventId) {
    const event = pack.events.find((e) => e.id === pendingEventId);
    if (event?.trigger === "on_search") {
      const resolution = resolveEvent(session, pack, event, rng);
      eventNarrative = resolution.narrativeHint;
      node.resolvedContent.eventId = null;
    }
  }

  const itemNames = foundItemIds.map((id) => pack.items.find((i) => i.id === id)?.name ?? id);
  const narrativeHint =
    eventNarrative ??
    (itemNames.length > 0
      ? `The search turns up: ${itemNames.join(", ")}.`
      : "The search turns up nothing new.");

  return { found: foundItemIds, narrativeHint };
}

function resolveRest(
  session: SessionState,
  args: { type: "short" | "long" },
  rng: () => number
): { hpRestored: number } {
  let totalRestored = 0;
  for (const character of session.party.members) {
    const missing = character.hp.max - character.hp.current;
    if (missing <= 0) continue;
    const restored =
      args.type === "long" ? missing : Math.min(missing, rollDice("1d8", rng).result);
    character.hp.current += restored;
    totalRestored += restored;
  }
  return { hpRestored: totalRestored };
}

const SKILL_TO_STAT: Record<string, string> = {
  perception: "wisdom",
  insight: "wisdom",
  survival: "wisdom",
  medicine: "wisdom",
  animal_handling: "wisdom",
  stealth: "dexterity",
  acrobatics: "dexterity",
  sleight_of_hand: "dexterity",
  athletics: "strength",
  arcana: "intelligence",
  investigation: "intelligence",
  history: "intelligence",
  nature: "intelligence",
  religion: "intelligence",
  persuasion: "charisma",
  deception: "charisma",
  intimidation: "charisma",
  performance: "charisma",
};

function abilityModifier(character: CharacterState, stat: string): number {
  return Math.floor(((character.stats[stat] ?? 10) - 10) / 2);
}

function resolveRollCheck(
  session: SessionState,
  args: { skill: string; difficultyClass: number },
  rng: () => number
): { roll: DiceRollResult; success: boolean } {
  const character = actingCharacter(session);
  const stat = SKILL_TO_STAT[args.skill.toLowerCase()] ?? args.skill.toLowerCase();
  const modifier = abilityModifier(character, stat);
  const roll = rollDice("1d20", rng);
  const total = roll.result + modifier;
  return { roll: { ...roll, result: total }, success: total >= args.difficultyClass };
}

function resolveInspect(
  session: SessionState,
  pack: ContentPack,
  args: { targetId: string }
): { details: string } {
  const node = currentNode(session);

  const monsterInstance = node?.resolvedContent.monsters.find((m) => m.instanceId === args.targetId);
  if (monsterInstance) {
    const monster = pack.monsters.find((m) => m.id === monsterInstance.templateId);
    if (monster) {
      return {
        details: `${monster.name} (${monsterInstance.hp.current}/${monsterInstance.hp.max} HP): ${monster.descriptionHints.join("; ")}`,
      };
    }
  }
  if (node?.resolvedContent.itemIds.includes(args.targetId)) {
    const item = pack.items.find((i) => i.id === args.targetId);
    if (item) return { details: `${item.name} (${item.category}, ${item.rarity})` };
  }
  if (node?.resolvedContent.npcIds.includes(args.targetId)) {
    const npc = pack.npcs.find((n) => n.id === args.targetId);
    if (npc) return { details: `${npc.name} — a ${npc.disposition} ${npc.role}` };
  }
  const carriedItem = session.party.members
    .flatMap((c) => c.inventory)
    .find((i) => i.itemId === args.targetId);
  if (carriedItem) {
    const item = pack.items.find((i) => i.id === args.targetId);
    if (item) return { details: `${item.name} (${item.category}, ${item.rarity}) — carried` };
  }

  throw new EngineValidationError(`There's nothing here called "${args.targetId}" to inspect`);
}
