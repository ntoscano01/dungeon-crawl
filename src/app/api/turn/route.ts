import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/engine/session";
import { loadContentPack } from "@/lib/content-packs/loader";
import { resolveEngineTool, EngineValidationError } from "@/lib/engine/tools";
import { parseIntent } from "@/lib/llm/parse-intent";
import { narrate } from "@/lib/llm/narrate";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = body?.sessionId;
  const input = body?.input;

  if (typeof sessionId !== "string" || typeof input !== "string") {
    return NextResponse.json({ error: "sessionId and input are required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const intent = parseIntent(input);
  if ("clarify" in intent) {
    return NextResponse.json({ session, narration: intent.clarify, clarify: true });
  }

  const pack = loadContentPack(session.rulesetId);

  let result;
  try {
    result = resolveEngineTool(session, pack, intent);
  } catch (err) {
    if (err instanceof EngineValidationError) {
      return NextResponse.json({ session, narration: err.message, clarify: true });
    }
    throw err;
  }
  const narration = narrate(result);

  session.turnLog.push({
    turnNumber: session.turnLog.length + 1,
    playerInput: input,
    toolCall: intent,
    toolResult: result as unknown as Record<string, unknown>,
    narration,
  });
  saveSession(session);

  return NextResponse.json({ session, narration, toolResult: result });
}
