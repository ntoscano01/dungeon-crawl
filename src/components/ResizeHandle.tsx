"use client";

import { Separator } from "react-resizable-panels";

interface ResizeHandleProps {
  orientation: "horizontal" | "vertical";
}

// A draggable divider between two Panels. `orientation` here matches the
// parent Group's orientation ("horizontal" Group = side-by-side panels =
// a vertical divider bar the user drags left/right, and vice versa).
export function ResizeHandle({ orientation }: ResizeHandleProps) {
  const isHorizontalGroup = orientation === "horizontal";
  return (
    <Separator
      className={`shrink-0 bg-white/10 hover:bg-white/30 active:bg-white/40 transition-colors ${
        isHorizontalGroup ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"
      }`}
    />
  );
}
