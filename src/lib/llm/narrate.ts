// Turns an EngineToolResult into prose (docs/engine-llm-contract.md step 5).
// The LLM is constrained to the facts assembled below — it varies phrasing,
// it does not decide outcomes or introduce content the engine didn't place.

import { getAnthropicClient } from "./client";
import type { ContentPack } from "../types/content-pack";
import type { EngineToolResult } from "../types/engine";

function buildFacts(result: EngineToolResult, pack: ContentPack): string {
  switch (result.name) {
    case "move": {
      if (!result.moved) return `The party tried to move but could not: ${result.reason}.`;
      const tileTemplateId = result.newTile?.node.tileTemplateId;
      const tile = pack.tiles.find((t) => t.id === tileTemplateId);
      const hints = tile?.descriptionHints.join("; ") ?? "";
      const eventNote = result.eventNarrativeHint ?? "Nothing else of note here yet.";
      return `The party moves into a new area: ${tile?.name ?? "an unnamed tile"}. Flavor hints: ${hints}. ${eventNote}`;
    }
    case "attack": {
      if (!result.hit) return "The attack roll missed; the blow goes wide.";
      const dmg = result.damageRoll?.result ?? 0;
      const defeated = result.targetDefeated ? "The target is defeated." : "The target is still standing.";
      return `The attack hits, dealing ${dmg} damage. Flavor hint: ${result.narrativeHint}. ${defeated}`;
    }
    case "party_status":
      return result.party
        .map((c) => `${c.name}: ${c.hp.current}/${c.hp.max} HP`)
        .join(", ");
    case "search":
      return `Search result: ${result.narrativeHint}.`;
    case "use_item":
      return `Item use result: ${result.narrativeHint}.`;
    case "interact":
      return `Interaction result: ${result.narrativeHint}.`;
    case "rest":
      return `The party rests and recovers ${result.hpRestored} HP.`;
    case "roll_check":
      return result.success ? "The skill check succeeds." : "The skill check fails.";
    case "inspect":
      return `Inspection reveals: ${result.details}.`;
    default:
      return "";
  }
}

async function narrateViaLLM(result: EngineToolResult, pack: ContentPack): Promise<string> {
  const client = getAnthropicClient();
  const facts = buildFacts(result, pack);

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 300,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: `You are the narrator for a text-based dungeon crawler. Write 1-3 vivid sentences in second person, present tense, narrating the game event described below.

Only state facts given below — never invent names, numbers, entities, or outcomes not present in the facts. Do not add dialogue. Keep it tight.`,
    messages: [{ role: "user", content: facts }],
  });

  if (response.stop_reason === "refusal") {
    return narrateFallback(result);
  }

  const text = response.content.find(
    (block): block is Extract<(typeof response.content)[number], { type: "text" }> =>
      block.type === "text"
  );
  return text?.text.trim() || narrateFallback(result);
}

// Offline fallback so local dev/testing works without ANTHROPIC_API_KEY
// configured, and so a transient API failure doesn't break a turn.
function narrateFallback(result: EngineToolResult): string {
  switch (result.name) {
    case "move":
      if (!result.moved) return `You can't go that way — ${result.reason}.`;
      return `You move on. ${result.eventNarrativeHint ?? "The way ahead is clear."}`;
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

export async function narrate(result: EngineToolResult, pack: ContentPack): Promise<string> {
  try {
    return await narrateViaLLM(result, pack);
  } catch (err) {
    console.error("LLM narration failed, falling back to template narration:", err);
    return narrateFallback(result);
  }
}
