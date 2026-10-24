import type { FileLineRange } from "./file-links";

/** Browser-facing viewer URL; authorization remains with the existing file API. */
export function getFileViewerUrl(filePath: string, lineRange?: FileLineRange, sessionId?: string | null): string {
  const params = new URLSearchParams({ path: filePath });
  if (sessionId) params.set("sessionId", sessionId);
  const fragment = lineRange
    ? `#L${lineRange.startLine}${lineRange.endLine !== lineRange.startLine ? `-L${lineRange.endLine}` : ""}`
    : "";
  return `/viewer?${params}${fragment}`;
}

/** A local-machine fallback, intentionally without unsupported line fragments. */
export function getLocalFileUrl(filePath: string): string {
  const normalized = /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\")
    ? filePath.replace(/\\/g, "/")
    : filePath;
  const encoded = normalized.split("/").map((part) => encodeURIComponent(part)).join("/");
  if (normalized.startsWith("//")) return `file:${encoded}`;
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${normalized.slice(0, 2)}${encoded.slice(4)}`;
  return `file://${encoded}`;
}
