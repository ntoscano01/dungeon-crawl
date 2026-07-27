// Maps between the app's runtime SessionState (docs/data-model.md) and the
// relational Prisma schema. Reads reconstruct the full object graph in one
// query; writes use a "replace the mutable parts" strategy rather than a
// diff — simple and correct for this scale (a handful of characters/nodes
// per session), traded for the row churn of delete-and-recreate on every
// save. Revisit with incremental updates if that churn becomes a problem.

import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "../db/client";
import type {
  CharacterState,
  EquipmentSlot,
  MapEdgeState,
  MapNodeState,
  MonsterInstanceState,
  PartyState,
  ResolvedTileContent,
  SessionState,
  SessionStatus,
  TurnLogEntry,
} from "../types/state";

const EQUIPMENT_SLOTS: EquipmentSlot[] = ["mainHand", "offHand", "armor", "accessory1", "accessory2"];

// ---------- write: create ----------

export async function createSessionInDb(session: SessionState): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.session.create({
    data: {
      id: session.id,
      ownerId: session.ownerId,
      rulesetId: session.rulesetId,
      status: session.status,
      seed: session.map.seed,
      currentTileId: session.party.currentTileId,
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
      characters: {
        create: session.party.members.map((c) => characterToCreateInput(c, session.party)),
      },
      mapNodes: {
        create: session.map.nodes.map(nodeToCreateInput),
      },
      sharedFlags: {
        create: Object.entries(session.party.sharedFlags).map(([key, value]) => ({ key, value })),
      },
    },
  });

  // Edges reference MapNode rows by id; create them once the nodes above
  // (created in the same statement) actually exist as rows.
  if (session.map.edges.length > 0) {
    await prisma.mapEdge.createMany({
      data: session.map.edges.map((e) => ({
        sessionId: session.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        direction: e.direction,
        via: e.via ?? null,
        traversable: e.traversable,
      })),
    });
  }
}

function characterToCreateInput(
  c: CharacterState,
  party: PartyState
): Prisma.CharacterStateCreateWithoutSessionInput {
  const turnOrderIndex = party.turnOrder.indexOf(c.id);
  const equippedRows = c.equipment
    .filter((e): e is { slot: EquipmentSlot; itemId: string } => e.itemId !== null)
    .map((e) => ({ itemId: e.itemId, quantity: 1, equippedSlot: e.slot as string }));
  const inventoryRows = c.inventory.map((i) => ({
    itemId: i.itemId,
    quantity: i.quantity,
    equippedSlot: null,
  }));

  return {
    id: c.id,
    name: c.name,
    classId: c.classId,
    level: c.level,
    hpCurrent: c.hp.current,
    hpMax: c.hp.max,
    armorClass: c.armorClass,
    stats: c.stats,
    turnOrderIndex: turnOrderIndex >= 0 ? turnOrderIndex : null,
    isDowned: c.isDowned,
    items: { create: [...equippedRows, ...inventoryRows] },
    statusEffects: {
      create: c.statusEffects.map((s) => ({
        effectId: s.id,
        remainingTurns: typeof s.remainingTurns === "number" ? s.remainingTurns : null,
      })),
    },
  };
}

function nodeToCreateInput(node: MapNodeState): Prisma.MapNodeCreateWithoutSessionInput {
  return {
    id: node.id,
    tileTemplateId: node.tileTemplateId,
    depth: node.depth,
    revealed: node.revealed,
    positionX: node.position.x,
    positionY: node.position.y,
    content: { create: contentRowsForNode(node.resolvedContent) },
  };
}

function contentRowsForNode(
  content: ResolvedTileContent
): Prisma.MapNodeContentCreateWithoutMapNodeInput[] {
  const rows: Prisma.MapNodeContentCreateWithoutMapNodeInput[] = [];
  for (const m of content.monsters) {
    rows.push({
      kind: "monster",
      refId: m.templateId,
      instanceId: m.instanceId,
      hpCurrent: m.hp.current,
      hpMax: m.hp.max,
    });
  }
  for (const itemId of content.itemIds) {
    rows.push({ kind: "item", refId: itemId });
  }
  for (const npcId of content.npcIds) {
    rows.push({ kind: "npc", refId: npcId });
  }
  if (content.eventId) {
    rows.push({ kind: "event", refId: content.eventId });
  }
  return rows;
}

// ---------- write: save (replace the mutable parts) ----------

export async function saveSessionToDb(session: SessionState): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: {
        status: session.status,
        currentTileId: session.party.currentTileId,
        updatedAt: new Date(session.updatedAt),
      },
    });

    // Characters/items/statusEffects and per-node content are small and
    // fully replaced each save rather than diffed.
    await tx.characterState.deleteMany({ where: { sessionId: session.id } });
    for (const character of session.party.members) {
      await tx.characterState.create({
        data: { ...characterToCreateInput(character, session.party), sessionId: session.id },
      });
    }

    await tx.mapNodeContent.deleteMany({ where: { mapNode: { sessionId: session.id } } });
    for (const node of session.map.nodes) {
      await tx.mapNode.update({
        where: { id: node.id },
        data: {
          revealed: node.revealed,
          content: { create: contentRowsForNode(node.resolvedContent) },
        },
      });
    }

    await tx.sharedFlag.deleteMany({ where: { sessionId: session.id } });
    if (Object.keys(session.party.sharedFlags).length > 0) {
      await tx.sharedFlag.createMany({
        data: Object.entries(session.party.sharedFlags).map(([key, value]) => ({
          sessionId: session.id,
          key,
          value,
        })),
      });
    }

    // Append-only: insert whatever turnLog entries aren't in the DB yet.
    const { _max } = await tx.turnLogEntry.aggregate({
      where: { sessionId: session.id },
      _max: { turnNumber: true },
    });
    const persistedThrough = _max.turnNumber ?? 0;
    const newEntries = session.turnLog.filter((t) => t.turnNumber > persistedThrough);
    if (newEntries.length > 0) {
      await tx.turnLogEntry.createMany({
        data: newEntries.map((t) => ({
          sessionId: session.id,
          turnNumber: t.turnNumber,
          playerInput: t.playerInput,
          toolCall: t.toolCall as Prisma.InputJsonValue,
          toolResult: t.toolResult as Prisma.InputJsonValue,
          narration: t.narration,
        })),
      });
    }
  });
}

// ---------- read ----------

export async function loadSessionFromDb(id: string): Promise<SessionState | null> {
  const prisma = getPrismaClient();

  const row = await prisma.session.findUnique({
    where: { id },
    include: {
      characters: { include: { items: true, statusEffects: true } },
      mapNodes: { include: { content: true } },
      mapEdges: true,
      sharedFlags: true,
      turnLog: { orderBy: { turnNumber: "asc" } },
    },
  });
  if (!row) return null;

  const members: CharacterState[] = row.characters.map(characterFromRow);
  const turnOrder = row.characters
    .filter((c) => c.turnOrderIndex !== null)
    .sort((a, b) => (a.turnOrderIndex ?? 0) - (b.turnOrderIndex ?? 0))
    .map((c) => c.id);

  const sharedFlags: Record<string, boolean> = {};
  for (const f of row.sharedFlags) sharedFlags[f.key] = f.value;

  const nodes: MapNodeState[] = row.mapNodes.map(nodeFromRow);

  const edges: MapEdgeState[] = row.mapEdges.map((e) => ({
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    direction: e.direction as MapEdgeState["direction"],
    via: e.via ?? undefined,
    traversable: e.traversable,
  }));

  const turnLog: TurnLogEntry[] = row.turnLog.map((t) => ({
    turnNumber: t.turnNumber,
    playerInput: t.playerInput,
    toolCall: t.toolCall as TurnLogEntry["toolCall"],
    toolResult: t.toolResult as TurnLogEntry["toolResult"],
    narration: t.narration,
  }));

  return {
    id: row.id,
    ownerId: row.ownerId,
    rulesetId: row.rulesetId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    party: {
      members,
      sharedFlags,
      currentTileId: row.currentTileId,
      turnOrder,
    },
    map: { nodes, edges, seed: row.seed },
    turnLog,
    status: row.status as SessionStatus,
  };
}

type CharacterRow = Prisma.CharacterStateGetPayload<{
  include: { items: true; statusEffects: true };
}>;

function characterFromRow(row: CharacterRow): CharacterState {
  const equipment = EQUIPMENT_SLOTS.map((slot) => {
    const match = row.items.find((i) => i.equippedSlot === slot);
    return { slot, itemId: match?.itemId ?? null };
  });
  const inventory = row.items
    .filter((i) => i.equippedSlot === null)
    .map((i) => ({ itemId: i.itemId, quantity: i.quantity }));

  return {
    id: row.id,
    name: row.name,
    classId: row.classId,
    level: row.level,
    hp: { current: row.hpCurrent, max: row.hpMax },
    stats: row.stats as Record<string, number>,
    armorClass: row.armorClass,
    statusEffects: row.statusEffects.map((s) => ({
      id: s.effectId,
      remainingTurns: s.remainingTurns ?? "until_rest",
    })),
    equipment,
    inventory,
    isDowned: row.isDowned,
  };
}

type NodeRow = Prisma.MapNodeGetPayload<{ include: { content: true } }>;

function nodeFromRow(row: NodeRow): MapNodeState {
  const monsters: MonsterInstanceState[] = [];
  const itemIds: string[] = [];
  const npcIds: string[] = [];
  let eventId: string | null = null;

  for (const c of row.content) {
    switch (c.kind) {
      case "monster":
        monsters.push({
          instanceId: c.instanceId ?? c.id,
          templateId: c.refId,
          hp: { current: c.hpCurrent ?? 0, max: c.hpMax ?? 0 },
        });
        break;
      case "item":
        itemIds.push(c.refId);
        break;
      case "npc":
        npcIds.push(c.refId);
        break;
      case "event":
        eventId = c.refId;
        break;
    }
  }

  return {
    id: row.id,
    tileTemplateId: row.tileTemplateId,
    depth: row.depth,
    revealed: row.revealed,
    resolvedContent: { monsters, itemIds, npcIds, eventId },
    position: { x: row.positionX, y: row.positionY },
  };
}
