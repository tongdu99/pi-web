import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { GET as readFile } from "@/app/api/files/[...path]/route";
import { resolveLocalFilePath } from "@/lib/file-links";
import { getViewerFileApiUrl, renderFileViewerHtml, type FileViewerTheme } from "@/lib/file-viewer-html";
import { isAudioPath, isDocumentPreviewPath, isImagePath } from "@/lib/file-types";

function parseTheme(value: string | null): FileViewerTheme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

export async function GET(request: NextRequest) {
  const filePath = resolveLocalFilePath(request.nextUrl.searchParams.get("path") ?? undefined);
  if (!filePath) return new Response("Provide an absolute file path.", { status: 400 });
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const media = isImagePath(filePath) || isAudioPath(filePath) || isDocumentPreviewPath(filePath);
  // Call the existing API handler in-process: no duplicate authorization logic or HTTP round trip.
  const apiUrl = new URL(getViewerFileApiUrl(filePath, media ? "meta" : "read", sessionId), request.url);
  const response = await readFile(new NextRequest(apiUrl), {
    params: Promise.resolve({ path: apiUrl.pathname.slice("/api/files/".length).split("/").map(decodeURIComponent) }),
  });
  const data = await response.json();
  const nonce = randomBytes(16).toString("base64");
  return new Response(renderFileViewerHtml({
    filePath, sessionId, nonce,
    content: response.ok && !media ? data.content : undefined,
    language: response.ok && !media ? data.language : undefined,
    size: response.ok && !media ? data.size : undefined,
    forceSource: request.nextUrl.searchParams.get("view") === "source",
    theme: parseTheme(request.nextUrl.searchParams.get("theme")),
    embedded: request.nextUrl.searchParams.get("embed") === "1",
    error: response.ok ? undefined : data.error || "Unable to read file",
  }), {
    status: response.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'`,
    },
  });
}
