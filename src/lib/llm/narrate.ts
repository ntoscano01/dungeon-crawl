// Turns an EngineToolResult into prose (docs/engine-llm-contract.md step 5).
// TODO: replace with a Claude API call — pass TurnContext + this result as
// context, constrained to only the descriptionHints/narrativeHint text the
// result carries, so narration can't introduce content the engine didn't
// place. This stub is template text so the turn loop is exercisable now.

import type { EngineToolResult } from "../types/engine";

export function narrate(result: EngineToolResult): string {
  switch (result.name) {
    case "move":
      if (!result.moved) return `You can't go that way — ${result.reason}.`;
      return `You move on. ${result.newTile?.content.eventId ? "Something feels off here." : "The way ahead is clear."}`;
    case "attack":
      if (!result.hit) return "Your attack goes wide, missing entirely.";
      return `${result.narrativeHint} — you deal ${result.damageRoll?.result} damage.${
        result.targetDefeated ? " It falls." : ""
      }`;
    case "party_status":
      return result.party
        .map((c) => `${c.name}: ${c.hp.current}/${c.hp.max} HP`)
        .join(", ");
    case "search":
      return result.narrativeHint;
    case "use_item":
    case "interact":
      return result.narrativeHint;
    case "rest":
      return `You rest and recover ${result.hpRestored} HP.`;
    case "roll_check":
      return result.success ? "You succeed." : "You fail.";
    case "inspect":
      return result.details;
    default:
      return "";
  }
}
