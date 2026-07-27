// The one place mechanical randomness happens (docs/engine-llm-contract.md
// "Dice system"). The LLM never generates numbers — it calls a tool, this
// resolves the roll, and the client's 3D dice animation replays the
// already-decided result.

import type { DiceRollResult } from "../types/engine";
import { randomInt } from "./rng";

const NOTATION_RE = /^(\d+)d(\d+)(?:([+-])(\d+))?$/i;

export function rollDice(notation: string, rng: () => number): DiceRollResult {
  const match = NOTATION_RE.exec(notation.trim());
  if (!match) {
    throw new Error(`Invalid dice notation: "${notation}"`);
  }

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modSign = match[3];
  const modValue = match[4] ? parseInt(match[4], 10) : 0;
  const modifier = modSign === "-" ? -modValue : modValue;

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(randomInt(rng, 1, sides));
  }

  const rollSum = rolls.reduce((a, b) => a + b, 0);
  const result = rollSum + modifier;

  const breakdown: (number | string)[] = [...rolls];
  if (modifier !== 0) {
    breakdown.push(modifier > 0 ? `+${modifier}` : `${modifier}`);
  }

  return { notation, result, breakdown };
}
