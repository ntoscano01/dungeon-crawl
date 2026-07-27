import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/engine/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ownerId = typeof body.ownerId === "string" ? body.ownerId : "anonymous";

  const session = createSession(ownerId);
  return NextResponse.json(session);
}
