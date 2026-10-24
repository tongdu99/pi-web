import StandaloneRichPreview from "@/components/StandaloneRichPreview";
import { resolveLocalFilePath } from "@/lib/file-links";

export default async function ViewerPreviewPage({ searchParams }: {
  searchParams: Promise<{ path?: string | string[]; sessionId?: string | string[] }>;
}) {
  const params = await searchParams;
  const filePath = typeof params.path === "string" ? resolveLocalFilePath(params.path) : null;
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : undefined;
  if (!filePath) return <p>Provide an absolute file path.</p>;
  return <main style={{ height: "100dvh" }}><StandaloneRichPreview filePath={filePath} sessionId={sessionId} /></main>;
}
