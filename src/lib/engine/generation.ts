// Deterministic dungeon generation (docs/content-pack-schema.md
// "How this maps to generation + narration"). Runs once per session,
// seeded, with no LLM involvement — the LLM only ever narrates nodes the
// generator already placed.

import type { ContentPack, Tile } from "../types/content-pack";
import type { MapGraphState, MapNodeState, ResolvedTileContent } from "../types/state";
import { createRng, weightedPick } from "./rng";

function resolveSpawnTable(
  table: { id: string; weight: number; maxCount?: number }[] | undefined,
  rng: () => number
): string[] {
  if (!table || table.length === 0) return [];
  const maxCount = table[0]?.maxCount ?? 1;
  const count = Math.floor(rng() * (maxCount + 1));
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    results.push(weightedPick(rng, table).id);
  }
  return results;
}

export function generateMap(
  pack: ContentPack,
  seed: string,
  targetTileCount: number
): MapGraphState {
  const rng = createRng(seed);
  const startTile = pack.tiles.find((t) => t.tags.includes("start"));
  if (!startTile) throw new Error(`Pack "${pack.id}" has no tile tagged "start"`);

  const nodes: MapNodeState[] = [];
  const edges: MapGraphState["edges"] = [];

  const placeNode = (tile: Tile, depth: number, x: number, y: number): MapNodeState => {
    const content: ResolvedTileContent = {
      monsterIds: resolveSpawnTable(tile.spawnTables.monsters, rng),
      itemIds: resolveSpawnTable(tile.spawnTables.items, rng),
      npcIds: resolveSpawnTable(tile.spawnTables.npcs, rng),
      eventId: resolveSpawnTable(tile.spawnTables.events, rng)[0] ?? null,
    };
    const node: MapNodeState = {
      id: `${tile.id}_${nodes.length}`,
      tileTemplateId: tile.id,
      depth,
      revealed: depth === 0,
      resolvedContent: content,
      position: { x, y },
    };
    nodes.push(node);
    return node;
  };

  const start = placeNode(startTile, 0, 0, 0);

  const eligible = pack.tiles.filter((t) => !t.tags.includes("start"));
  let previous = start;
  let depth = 1;
  while (nodes.length < targetTileCount && eligible.length > 0) {
    const candidates = eligible.filter(
      (t) => (t.placement.minDepth ?? 0) <= depth && (t.placement.maxDepth ?? Infinity) >= depth
    );
    if (candidates.length === 0) {
      depth += 1;
      continue;
    }
    const chosen = weightedPick(
      rng,
      candidates.map((t) => ({ ...t, weight: t.placement.weight }))
    );
    const node = placeNode(chosen, depth, previous.position.x, previous.position.y + 1);
    const direction = chosen.exits[0] ?? "north";
    edges.push({
      fromNodeId: previous.id,
      toNodeId: node.id,
      direction,
      traversable: true,
    });
    previous = node;
    depth += 1;
  }

  return { nodes, edges, seed };
}
