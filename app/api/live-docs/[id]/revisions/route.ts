import { NextResponse } from "next/server";
import { getLiveDoc, LiveDocConflictError, restoreLiveDoc } from "@/lib/live-docs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await getLiveDoc(id);
    if (!doc) return NextResponse.json({ error: "Live doc not found" }, { status: 404 });
    return NextResponse.json({
      headRevisionId: doc.headRevisionId,
      mainRevisionIds: [...doc.mainRevisionIds].reverse(),
      archivedRevisionIds: [...doc.archivedRevisionIds].reverse(),
      revisions: doc.revisions.map(({ id, previousRevisionId, createdAt, summary, source, change }) => ({
        id, previousRevisionId, createdAt, summary, source, change,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as { revisionId?: unknown; expectedRevisionId?: unknown };
    if (typeof body.revisionId !== "string" || typeof body.expectedRevisionId !== "string") {
      return NextResponse.json({ error: "revisionId and expectedRevisionId are required" }, { status: 400 });
    }
    return NextResponse.json({ doc: await restoreLiveDoc(id, body.revisionId, body.expectedRevisionId) });
  } catch (error) {
    if (error instanceof LiveDocConflictError) {
      return NextResponse.json({ error: error.message, currentRevisionId: error.currentRevisionId }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}
