"use client";

import type { InventoryPanelProps } from "@/lib/types/ui";

export function InventoryPanel({ members }: InventoryPanelProps) {
  return (
    <div className="h-full border border-white/10 rounded-lg bg-black/30 p-4 overflow-auto space-y-4">
      <h2 className="text-xs uppercase tracking-wide text-white/40">Inventory</h2>
      {members.map((c) => (
        <div key={c.id}>
          <p className="text-sm text-white/70 mb-1">{c.name}</p>
          {c.inventory.length === 0 ? (
            <p className="text-xs text-white/30 italic">empty</p>
          ) : (
            <ul className="text-xs space-y-1">
              {c.inventory.map((i) => (
                <li key={i.itemId} className="flex justify-between text-white/60">
                  <span>{i.itemId.replace(/_/g, " ")}</span>
                  <span>x{i.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
