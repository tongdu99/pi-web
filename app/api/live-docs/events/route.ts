import { subscribeLiveDocs } from "@/lib/live-docs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) return Response.json({ error: "sessionId is required" }, { status: 400 });

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      const unsubscribe = subscribeLiveDocs((event) => {
        if (!event.sessionIds.includes(sessionId)) return;
        try { send(event); } catch { /* stream closed */ }
      });
      send({ type: "ready" });
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(":\n\n")); } catch { /* stream closed */ }
      }, 30_000);
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* stream closed */ }
      };
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
