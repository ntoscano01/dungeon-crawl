// In-memory session store. TODO: replace with Prisma persistence
// (prisma/schema.prisma already models this) once auth/accounts exist —
// this exists purely so the turn loop is runnable/testable now.

import type { SessionState } from "../types/state";
import { loadContentPack } from "../content-packs/loader";
import { generateMap } from "./generation";

const sessions = new Map<string, SessionState>();

export function createSession(ownerId: string, rulesetId = "base"): SessionState {
  const pack = loadContentPack(rulesetId);
  const seed = `${ownerId}-${Date.now()}`;
  const map = generateMap(pack, seed, 8);
  const startNode = map.nodes[0];

  const session: SessionState = {
    id: crypto.randomUUID(),
    ownerId,
    rulesetId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    party: {
      members: [
        {
          id: crypto.randomUUID(),
          name: "Adventurer",
          classId: "fighter",
          level: 1,
          hp: { current: 12, max: 12 },
          stats: { strength: 14, dexterity: 12, constitution: 13, intelligence: 10, wisdom: 10, charisma: 8 },
          armorClass: 12,
          statusEffects: [],
          equipment: [{ slot: "mainHand", itemId: "rusty_sword" }],
          inventory: [{ itemId: "minor_healing_draught", quantity: 1 }],
          isDowned: false,
        },
      ],
      sharedFlags: {},
      currentTileId: startNode.id,
      turnOrder: [],
    },
    map,
    turnLog: [],
    status: "active",
  };

  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): SessionState | undefined {
  return sessions.get(id);
}

export function saveSession(session: SessionState): void {
  session.updatedAt = new Date().toISOString();
  sessions.set(session.id, session);
}
