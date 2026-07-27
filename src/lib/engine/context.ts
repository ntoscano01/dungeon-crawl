// Builds the bounded TurnContext handed to the LLM each turn
// (docs/engine-llm-contract.md "Turn context passed to the LLM each turn") —
// only what the engine has already resolved as visible, never the raw
// content packs or the unrevealed map.

import type { ContentPack } from "../types/content-pack";
import type { SessionState } from "../types/state";
import type { TurnContext } from "../types/engine";

export function buildTurnContext(session: SessionState): TurnContext {
  const node = session.map.nodes.find((n) => n.id === session.party.currentTileId);
  if (!node) throw new Error(`currentTileId "${session.party.currentTileId}" not found on map`);

  const visibleExits = session.map.edges
    .filter((e) => e.fromNodeId === node.id && e.traversable)
    .map((e) => e.direction);

  return {
    party: session.party.members,
    currentTile: {
      node,
      content: node.resolvedContent,
      visibleExits,
    },
    visibleExits,
    recentLog: session.turnLog.slice(-5).map((t) => t.narration),
  };
}

// Human-readable grounding block for the LLM: resolves each id on the
// current tile to its content-pack name so the model can reference entities
// by name in prose while still calling tools with the underlying id.
export function describeTurnContext(context: TurnContext, pack: ContentPack): string {
  const tileTemplate = pack.tiles.find((t) => t.id === context.currentTile.node.tileTemplateId);

  const monsters = context.currentTile.content.monsterIds.map((id) => {
    const m = pack.monsters.find((x) => x.id === id);
    return `${id} (${m?.name ?? "unknown monster"})`;
  });
  const items = context.currentTile.content.itemIds.map((id) => {
    const i = pack.items.find((x) => x.id === id);
    return `${id} (${i?.name ?? "unknown item"})`;
  });
  const npcs = context.currentTile.content.npcIds.map((id) => {
    const n = pack.npcs.find((x) => x.id === id);
    return `${id} (${n?.name ?? "unknown npc"})`;
  });

  return `
Current tile: ${tileTemplate?.name ?? context.currentTile.node.tileTemplateId}
Visible exits: ${context.visibleExits.join(", ") || "none"}
Monsters present: ${monsters.join(", ") || "none"}
Items on the ground: ${items.join(", ") || "none"}
NPCs present: ${npcs.join(", ") || "none"}
Party: ${context.party.map((c) => `${c.name} (id ${c.id}, ${c.hp.current}/${c.hp.max} HP)`).join(", ")}
`.trim();
}
