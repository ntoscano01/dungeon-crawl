"use client";

import type { CharacterPanelProps } from "@/lib/types/ui";

export function CharacterPanel({ members }: CharacterPanelProps) {
  return (
    <div className="h-full border border-white/10 rounded-lg bg-black/30 p-4 overflow-auto space-y-4">
      <h2 className="text-xs uppercase tracking-wide text-white/40">Party</h2>
      {members.map((c) => {
        const hpPct = Math.max(0, Math.round((c.hp.current / c.hp.max) * 100));
        return (
          <div key={c.id} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{c.name}</span>
              <span className="text-white/50">
                {c.hp.current}/{c.hp.max} HP
              </span>
            </div>
            <div className="h-2 rounded bg-white/10 overflow-hidden">
              <div
                className={`h-full ${hpPct > 50 ? "bg-emerald-500" : hpPct > 20 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
            {c.statusEffects.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {c.statusEffects.map((s) => (
                  <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10">
                    {s.id}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[10px] text-white/40">
              {c.equipment
                .filter((e) => e.itemId)
                .map((e) => `${e.slot}: ${e.itemId}`)
                .join(" · ") || "unarmed"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
