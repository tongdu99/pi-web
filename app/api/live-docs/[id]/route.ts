import { NextResponse } from "next/server";
import { getLiveDoc, liveDocContent, renameLiveDoc } from "@/lib/live-docs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await getLiveDoc(id);
    if (!doc) return NextResponse.json({ error: "Live doc not found" }, { status: 404 });
    return NextResponse.json({ doc, content: liveDocContent(doc) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as { title?: unknown };
    if (typeof body.title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    return NextResponse.json({ doc: await renameLiveDoc(id, body.title) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: message === "Live doc not found" ? 404 : 400 });
  }
}
