// Natural-language -> EngineTool mapping (docs/engine-llm-contract.md
// "Natural language parsing strategy"). The LLM's job is bounded: given the
// player's text plus the current TurnContext, emit exactly one tool call
// matching EngineTool, or plain text (no tool call) when the input is
// ambiguous or references something not in context.

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "./client";
import { describeTurnContext } from "../engine/context";
import type { ContentPack, Direction } from "../types/content-pack";
import type { EngineTool, TurnContext } from "../types/engine";

const DIRECTIONS: Direction[] = ["north", "south", "east", "west", "up", "down"];

const TOOLS: Anthropic.Tool[] = [
  {
    name: "move",
    description: "Move the party through an exit from the current tile.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: DIRECTIONS },
        via: {
          type: "string",
          description: 'How the player is moving, if stated, e.g. "ladder" or "door".',
        },
      },
      required: ["direction"],
      additionalProperties: false,
    },
  },
  {
    name: "attack",
    description: "Attack a monster present on the current tile.",
    input_schema: {
      type: "object",
      properties: {
        targetId: { type: "string", description: "id of a monster listed as present" },
        weaponId: { type: "string", description: "id of the equipped weapon used, if relevant" },
      },
      required: ["targetId"],
      additionalProperties: false,
    },
  },
  {
    name: "use_item",
    description: "Use or consume an item from a party member's inventory.",
    input_schema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        targetId: { type: "string", description: "optional target of the item's effect" },
      },
      required: ["itemId"],
      additionalProperties: false,
    },
  },
  {
    name: "interact",
    description: "Interact with an NPC or object present on the tile (talk, open, pull, etc).",
    input_schema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        action: { type: "string", description: 'short verb, e.g. "talk", "open", "pull"' },
      },
      required: ["targetId", "action"],
      additionalProperties: false,
    },
  },
  {
    name: "search",
    description: "Search the current tile for hidden items or details.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "rest",
    description: "Rest to recover hit points.",
    input_schema: {
      type: "object",
      properties: { type: { type: "string", enum: ["short", "long"] } },
      required: ["type"],
      additionalProperties: false,
    },
  },
  {
    name: "roll_check",
    description: "Make a skill check against a difficulty class (e.g. perception, stealth).",
    input_schema: {
      type: "object",
      properties: {
        skill: { type: "string" },
        difficultyClass: { type: "integer" },
      },
      required: ["skill", "difficultyClass"],
      additionalProperties: false,
    },
  },
  {
    name: "inspect",
    description: "Look closely at a monster, item, or NPC present on the tile. No other effect.",
    input_schema: {
      type: "object",
      properties: { targetId: { type: "string" } },
      required: ["targetId"],
      additionalProperties: false,
    },
  },
  {
    name: "party_status",
    description: "Check the party's current health, status effects, and equipment.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function buildSystemPrompt(context: TurnContext, pack: ContentPack): string {
  return `You are the intent parser for a dungeon-crawl game engine. Map the player's natural-language input to exactly one tool call describing a legal action right now.

${describeTurnContext(context, pack)}

Rules:
- Only reference entity ids explicitly listed above. Never invent an id.
- Only call "move" with a direction that appears in the visible exits.
- If the input is ambiguous (e.g. multiple valid targets), doesn't match any legal action, or references something not present, do NOT call a tool. Respond with a single short clarifying question in plain text instead.
- Do not narrate outcomes or explain your reasoning — only resolve the action.`;
}

function toolUseToEngineTool(toolUse: Anthropic.ToolUseBlock): EngineTool | null {
  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  switch (toolUse.name) {
    case "move":
      return {
        name: "move",
        args: {
          direction: input.direction as Direction,
          via: typeof input.via === "string" ? input.via : undefined,
        },
      };
    case "attack":
      return {
        name: "attack",
        args: {
          targetId: String(input.targetId),
          weaponId: typeof input.weaponId === "string" ? input.weaponId : undefined,
        },
      };
    case "use_item":
      return {
        name: "use_item",
        args: {
          itemId: String(input.itemId),
          targetId: typeof input.targetId === "string" ? input.targetId : undefined,
        },
      };
    case "interact":
      return {
        name: "interact",
        args: { targetId: String(input.targetId), action: String(input.action) },
      };
    case "search":
      return { name: "search", args: {} };
    case "rest":
      return { name: "rest", args: { type: input.type as "short" | "long" } };
    case "roll_check":
      return {
        name: "roll_check",
        args: { skill: String(input.skill), difficultyClass: Number(input.difficultyClass) },
      };
    case "inspect":
      return { name: "inspect", args: { targetId: String(input.targetId) } };
    case "party_status":
      return { name: "party_status", args: {} };
    default:
      return null;
  }
}

async function parseIntentViaLLM(
  input: string,
  context: TurnContext,
  pack: ContentPack
): Promise<EngineTool | { clarify: string }> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: buildSystemPrompt(context, pack),
    tools: TOOLS,
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: input }],
  });

  if (response.stop_reason === "refusal") {
    return { clarify: "I can't help with that." };
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    const text = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    return { clarify: text?.text.trim() || "I'm not sure what you mean." };
  }

  const tool = toolUseToEngineTool(toolUse);
  if (!tool) {
    return { clarify: "I'm not sure what you mean." };
  }
  return tool;
}

// Offline fallback so local dev/testing works without ANTHROPIC_API_KEY
// configured, and so a transient API failure doesn't break a turn.
function parseIntentFallback(input: string): EngineTool | { clarify: string } {
  const text = input.trim().toLowerCase();

  const direction = DIRECTIONS.find((d) => text.includes(d));
  if (direction || /\b(go|move|walk|climb|descend|head)\b/.test(text)) {
    if (!direction) return { clarify: "Which direction?" };
    const via = /ladder/.test(text) ? "ladder" : /door/.test(text) ? "door" : undefined;
    return { name: "move", args: { direction, via } };
  }

  const attackMatch = /\battack\s+(?:the\s+)?(\w+)/.exec(text);
  if (attackMatch) {
    return { name: "attack", args: { targetId: attackMatch[1] } };
  }

  if (/\b(search|look around|examine room)\b/.test(text)) {
    return { name: "search", args: {} };
  }

  if (/\b(status|inventory|party)\b/.test(text)) {
    return { name: "party_status", args: {} };
  }

  return { clarify: "I'm not sure what you mean — try a direction, \"attack <target>\", or \"search\"." };
}

export async function parseIntent(
  input: string,
  context: TurnContext,
  pack: ContentPack
): Promise<EngineTool | { clarify: string }> {
  try {
    return await parseIntentViaLLM(input, context, pack);
  } catch (err) {
    console.error("LLM intent parsing failed, falling back to keyword parser:", err);
    return parseIntentFallback(input);
  }
}
