import { NextResponse } from "next/server";
import { createLiveDoc, listLiveDocs } from "@/lib/live-docs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sessionId = new URL(req.url).searchParams.get("sessionId")?.trim();
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    return NextResponse.json({ docs: await listLiveDocs(sessionId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { sessionId?: unknown; title?: unknown };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const title = typeof body.title === "string" ? body.title : undefined;
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    return NextResponse.json({ doc: await createLiveDoc(sessionId, title) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
