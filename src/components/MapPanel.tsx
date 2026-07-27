"use client";

import type { MapPanelProps } from "@/lib/types/ui";

// Minimal placeholder renderer: revealed nodes as a grid of labeled cells,
// positioned by MapNodeState.position. TODO: swap for a proper canvas/SVG
// renderer with connection lines and reveal animation driven by MoveResult's
// mapDelta once the real turn loop is wired to the UI.
export function MapPanel({ map, currentTileId }: MapPanelProps) {
  const revealed = map.nodes.filter((n) => n.revealed);

  return (
    <div className="h-full border border-white/10 rounded-lg bg-black/30 p-4 overflow-auto">
      <h2 className="text-xs uppercase tracking-wide text-white/40 mb-3">Map</h2>
      <div className="grid grid-cols-4 gap-2">
        {revealed.map((node) => (
          <div
            key={node.id}
            className={`aspect-square rounded flex items-center justify-center text-[10px] text-center p-1 ${
              node.id === currentTileId
                ? "bg-white/30 ring-1 ring-white/50"
                : "bg-white/10"
            }`}
            title={node.tileTemplateId}
          >
            {node.tileTemplateId.replace(/_/g, " ")}
          </div>
        ))}
      </div>
    </div>
  );
}
