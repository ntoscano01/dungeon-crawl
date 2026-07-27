// Natural-language -> EngineTool mapping (docs/engine-llm-contract.md
// "Natural language parsing strategy"). This is a placeholder keyword
// parser so the turn loop is exercisable end-to-end before the real LLM
// call is wired in.
//
// TODO: replace with a Claude API tool-use call, passing TurnContext as
// context and EngineTool's shape as the tool schema. The real version
// should return a one-line clarifying question (no tool call) when the
// input is ambiguous or references something not in TurnContext, per the
// contract doc — this stub does not do that yet.

import type { EngineTool } from "../types/engine";
import type { Direction } from "../types/content-pack";

const DIRECTIONS: Direction[] = ["north", "south", "east", "west", "up", "down"];

export function parseIntent(input: string): EngineTool | { clarify: string } {
  const text = input.trim().toLowerCase();

  const direction = DIRECTIONS.find((d) => text.includes(d));
  if (direction || /\b(go|move|walk|climb|descend|head)\b/.test(text)) {
    if (!direction) {
      return { clarify: "Which direction?" };
    }
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
