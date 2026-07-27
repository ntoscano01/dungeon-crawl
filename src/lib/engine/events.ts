// Resolves a DungeonEvent's outcome table (docs/content-pack-schema.md
// "Events") and applies its effect to session state. Outcome selection is a
// weighted pick over `outcomes` — the same mechanism generation.ts uses for
// spawn tables — independent of `requiresRoll`, which gates the separate
// player-initiated `roll_check` tool rather than branching outcome
// selection automatically. Called once per event trigger; the caller is
// responsible for clearing the tile's eventId afterward so it doesn't
// re-fire.

import type { ContentPack, DungeonEvent, EventOutcome } from "../types/content-pack";
import type { SessionState } from "../types/state";
import { rollDice } from "./dice";
import { weightedPick } from "./rng";

export interface EventResolution {
  narrativeHint: string;
}

export function resolveEvent(
  session: SessionState,
  pack: ContentPack,
  event: DungeonEvent,
  rng: () => number
): EventResolution {
  const outcome = weightedPick(rng, event.outcomes);
  applyEffect(session, pack, outcome, rng);
  return { narrativeHint: outcome.narrativeHint };
}

function applyEffect(
  session: SessionState,
  pack: ContentPack,
  outcome: EventOutcome,
  rng: () => number
): void {
  const character = session.party.members[0]; // TODO: apply to whole party once split-target effects are needed
  const { type, params } = outcome.effect;

  switch (type) {
    case "damage": {
      const amount = params.amount;
      const damage = typeof amount === "string" ? rollDice(amount, rng).result : Number(amount);
      character.hp.current = Math.max(0, character.hp.current - damage);
      break;
    }
    case "heal": {
      const amount = params.amount;
      const healed = typeof amount === "string" ? rollDice(amount, rng).result : Number(amount);
      character.hp.current = Math.min(character.hp.max, character.hp.current + healed);
      break;
    }
    case "grant_item": {
      const itemId = String(params.itemId);
      const existing = character.inventory.find((i) => i.itemId === itemId);
      if (existing) existing.quantity += 1;
      else character.inventory.push({ itemId, quantity: 1 });
      break;
    }
    case "remove_item": {
      const itemId = String(params.itemId);
      const existing = character.inventory.find((i) => i.itemId === itemId);
      if (existing) {
        existing.quantity -= 1;
        if (existing.quantity <= 0) {
          character.inventory = character.inventory.filter((i) => i !== existing);
        }
      }
      break;
    }
    case "set_flag": {
      session.party.sharedFlags[String(params.key)] = true;
      break;
    }
    case "spawn_monster": {
      const node = session.map.nodes.find((n) => n.id === session.party.currentTileId);
      const templateId = String(params.monsterId);
      const monster = pack.monsters.find((m) => m.id === templateId);
      if (node && monster) {
        const maxHp = rollDice(monster.stats.hp, rng).result;
        node.resolvedContent.monsters.push({
          instanceId: `${node.id}_${templateId}_${node.resolvedContent.monsters.length}`,
          templateId,
          hp: { current: maxHp, max: maxHp },
        });
      }
      break;
    }
    case "reveal_tile":
      // Not yet resolvable: the schema doesn't identify which tile to
      // reveal (no target node id in `params`). No-op until that's added.
      break;
  }
}
