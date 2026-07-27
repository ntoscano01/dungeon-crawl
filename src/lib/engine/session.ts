// Session store backed by Postgres via Prisma (persistence.ts), with an
// in-memory fallback so the app still runs if the database is unreachable
// (no DATABASE_URL configured, connection refused, etc.) — the same
// graceful-degradation pattern used for the LLM calls in src/lib/llm/.

import type { SessionState } from "../types/state";
import { loadContentPack } from "../content-packs/loader";
import { generateMap } from "./generation";
import { createSessionInDb, loadSessionFromDb, saveSessionToDb } from "./persistence";

const memorySessions = new Map<string, SessionState>();

function buildNewSession(ownerId: string, rulesetId: string): SessionState {
  const pack = loadContentPack(rulesetId);
  const sessionId = crypto.randomUUID();
  const seed = `${ownerId}-${Date.now()}`;
  const map = generateMap(pack, seed, 8, sessionId);
  const startNode = map.nodes[0];

  return {
    id: sessionId,
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
}

export async function createSession(ownerId: string, rulesetId = "base"): Promise<SessionState> {
  const session = buildNewSession(ownerId, rulesetId);
  try {
    await createSessionInDb(session);
  } catch (err) {
    console.error("DB session creation failed, falling back to in-memory store:", err, (err as { meta?: unknown })?.meta);
    memorySessions.set(session.id, session);
  }
  return session;
}

export async function getSession(id: string): Promise<SessionState | undefined> {
  try {
    const fromDb = await loadSessionFromDb(id);
    if (fromDb) return fromDb;
  } catch (err) {
    console.error("DB session load failed, falling back to in-memory store:", err);
  }
  return memorySessions.get(id);
}

export async function saveSession(session: SessionState): Promise<void> {
  session.updatedAt = new Date().toISOString();
  try {
    await saveSessionToDb(session);
    memorySessions.delete(session.id); // clear a stale in-memory copy now that the DB has it
  } catch (err) {
    console.error("DB session save failed, falling back to in-memory store:", err);
    memorySessions.set(session.id, session);
  }
}
