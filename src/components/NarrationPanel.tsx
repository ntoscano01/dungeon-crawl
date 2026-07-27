"use client";

import { useState } from "react";
import type { NarrationPanelProps } from "@/lib/types/ui";

export function NarrationPanel({ log, onSubmit, pending }: NarrationPanelProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || pending) return;
    onSubmit(input.trim());
    setInput("");
  };

  return (
    <div className="flex h-full flex-col border border-white/10 rounded-lg bg-black/30">
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        {log.length === 0 && (
          <p className="text-white/40 italic">Your story begins...</p>
        )}
        {log.map((entry) => (
          <div key={entry.turnNumber} className="space-y-1">
            <p className="text-white/50">&gt; {entry.playerInput}</p>
            <p>{entry.narration}</p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-white/10 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Try "go north" or "attack the goblin"'
          className="flex-1 bg-white/5 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/30"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded bg-white/10 text-sm hover:bg-white/20 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
