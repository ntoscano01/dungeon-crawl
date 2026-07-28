"use client";

import { useEffect, useState } from "react";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";
import { NarrationPanel } from "@/components/NarrationPanel";
import { MapPanel } from "@/components/MapPanel";
import { CharacterPanel } from "@/components/CharacterPanel";
import { InventoryPanel } from "@/components/InventoryPanel";
import { ResizeHandle } from "@/components/ResizeHandle";
import type { SessionState } from "@/lib/types/state";

type MobileTab = "map" | "party" | "inventory";

// Rendered only client-side (see src/app/page.tsx's next/dynamic import
// with ssr:false) — react-resizable-panels' useDefaultLayout hook defaults
// its `storage` param to the bare `localStorage` global, which doesn't
// exist during Next.js's server render.
export default function GameShell() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [pending, setPending] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");

  // Persisted panel sizes, so the user's chosen layout survives a reload.
  const outerLayout = useDefaultLayout({ id: "dungeon-crawl-outer", storage: localStorage });
  const sidebarLayout = useDefaultLayout({ id: "dungeon-crawl-sidebar", storage: localStorage });

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

  return (
    <main className="flex-1 flex flex-col min-h-0 p-3">
      {/* Desktop/tablet: fully resizable panel layout */}
      <div className="hidden md:block flex-1 min-h-0">
        <Group
          orientation="horizontal"
          className="h-full"
          defaultLayout={outerLayout.defaultLayout}
          onLayoutChanged={outerLayout.onLayoutChanged}
        >
          <Panel id="narration" defaultSize="40" minSize="25">
            <div className="h-full pr-1.5">
              <NarrationPanel log={session.turnLog} onSubmit={handleSubmit} pending={pending} />
            </div>
          </Panel>
          <ResizeHandle orientation="horizontal" />
          <Panel id="sidebar" defaultSize="60" minSize="30">
            <div className="h-full pl-1.5">
              <Group
                orientation="vertical"
                className="h-full"
                defaultLayout={sidebarLayout.defaultLayout}
                onLayoutChanged={sidebarLayout.onLayoutChanged}
              >
                <Panel id="map" defaultSize="40" minSize="15">
                  <div className="h-full pb-1.5">
                    <MapPanel map={session.map} currentTileId={session.party.currentTileId} />
                  </div>
                </Panel>
                <ResizeHandle orientation="vertical" />
                <Panel id="character" defaultSize="30" minSize="15">
                  <div className="h-full py-1.5">
                    <CharacterPanel members={session.party.members} />
                  </div>
                </Panel>
                <ResizeHandle orientation="vertical" />
                <Panel id="inventory" defaultSize="30" minSize="15">
                  <div className="h-full pt-1.5">
                    <InventoryPanel members={session.party.members} />
                  </div>
                </Panel>
              </Group>
            </div>
          </Panel>
        </Group>
      </div>

      {/* Mobile: tabbed (resizable drag panels don't make sense on narrow screens) */}
      <div className="md:hidden flex flex-1 min-h-0 flex-col gap-2">
        <div className="flex-1 min-h-[50vh]">
          <NarrationPanel log={session.turnLog} onSubmit={handleSubmit} pending={pending} />
        </div>
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
