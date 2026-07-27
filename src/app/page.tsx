"use client";

import { useEffect, useState } from "react";
import { NarrationPanel } from "@/components/NarrationPanel";
import { MapPanel } from "@/components/MapPanel";
import { CharacterPanel } from "@/components/CharacterPanel";
import { InventoryPanel } from "@/components/InventoryPanel";
import type { SessionState } from "@/lib/types/state";

type MobileTab = "map" | "party" | "inventory";

export default function GamePage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [pending, setPending] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");

  useEffect(() => {
    fetch("/api/session", { method: "POST", body: JSON.stringify({}) })
      .then((r) => r.json())
      .then(setSession);
  }, []);

  const handleSubmit = async (input: string) => {
    if (!session) return;
    setPending(true);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, input }),
      });
      const data = await res.json();
      if (data.session) setSession(data.session);
    } finally {
      setPending(false);
    }
  };

  if (!session) {
    return (
      <main className="flex-1 flex items-center justify-center text-white/50 text-sm">
        Generating dungeon...
      </main>
    );
  }

  const sidePanels = (
    <>
      <div className="h-64 md:h-1/3">
        <MapPanel map={session.map} currentTileId={session.party.currentTileId} />
      </div>
      <div className="h-64 md:h-1/3">
        <CharacterPanel members={session.party.members} />
      </div>
      <div className="h-64 md:h-1/3">
        <InventoryPanel members={session.party.members} />
      </div>
    </>
  );

  return (
    <main className="flex-1 flex flex-col md:flex-row gap-3 p-3 min-h-0">
      <div className="flex-1 min-h-[50vh] md:min-h-0">
        <NarrationPanel log={session.turnLog} onSubmit={handleSubmit} pending={pending} />
      </div>

      {/* Desktop: all three side panels stacked */}
      <div className="hidden md:flex md:flex-col md:w-80 gap-3 min-h-0">{sidePanels}</div>

      {/* Mobile: tabbed */}
      <div className="md:hidden flex flex-col gap-2">
        <div className="flex gap-1 text-xs">
          {(["map", "party", "inventory"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2 rounded capitalize ${
                mobileTab === tab ? "bg-white/20" : "bg-white/5"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="h-72">
          {mobileTab === "map" && (
            <MapPanel map={session.map} currentTileId={session.party.currentTileId} />
          )}
          {mobileTab === "party" && <CharacterPanel members={session.party.members} />}
          {mobileTab === "inventory" && <InventoryPanel members={session.party.members} />}
        </div>
      </div>
    </main>
  );
}
