import { NextResponse } from "next/server";
import { resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession } from "@/lib/rpc-manager";
import { LIVE_DOC_UPDATE_TOOL } from "@/lib/live-doc-agent";

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let commandType: string | undefined;
  let promptAccepted = false;

  try {
    const body = await req.json() as { type: string; [key: string]: unknown };
    commandType = typeof body.type === "string" ? body.type : undefined;

    // Fast path: already-running session
    let existing = getRpcSession(id);
    let restoreAttachment = false;
    const needsLiveDocToolUpgrade = body.type === "live_doc_prompt"
      && !existing?.hasActiveTool?.(LIVE_DOC_UPDATE_TOOL);
    const needsMergeConversationUpgrade = body.type === "start_live_doc_thread"
      && body.kind === "merge-response"
      && !existing?.supportsLiveDocMergeConversations?.();
    const needsWholeDocumentConversationUpgrade = body.type === "start_live_doc_thread"
      && !body.sectionId
      && !existing?.supportsWholeLiveDocConversations?.();
    if (existing?.isAlive() && (needsLiveDocToolUpgrade || needsMergeConversationUpgrade || needsWholeDocumentConversationUpgrade)) {
      // globalThis keeps wrappers alive across dev hot reloads and application
      // upgrades. Recreate wrappers whose provider tool surface or command
      // protocol predates the requested Live Doc operation.
      restoreAttachment = existing.isAttached();
      await existing.shutdown();
      existing = undefined;
    }
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      promptAccepted = body.type === "prompt" || body.type === "live_doc_prompt";
      return NextResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({
        error: "Session not found",
        ...(body.type === "prompt" || body.type === "live_doc_prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 404 });
    }

    const { session } = await startRpcSession(id, filePath, undefined, restoreAttachment ? {
      attach: true,
      sessionStartEvent: { type: "session_start", reason: "resume" },
    } : undefined);
    if (restoreAttachment) await session.waitUntilReady();
    const result = await session.send(body);
    promptAccepted = body.type === "prompt" || body.type === "live_doc_prompt";

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(((commandType === "prompt" && !promptAccepted)
        || (commandType === "live_doc_prompt" && !promptAccepted))
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      // No registry entry means the session is being reviewed, not attached.
      return NextResponse.json({ running: false, attached: false });
    }

    const state = await session.send({ type: "get_state" });
    return NextResponse.json({ running: true, attached: session.isAttached(), state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
