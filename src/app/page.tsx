"use client";

import dynamic from "next/dynamic";

// ssr:false — GameShell's resizable panels use localStorage-backed layout
// persistence that requires the browser environment; see GameShell.tsx.
const GameShell = dynamic(() => import("@/components/GameShell"), { ssr: false });

export default function Page() {
  return <GameShell />;
}
