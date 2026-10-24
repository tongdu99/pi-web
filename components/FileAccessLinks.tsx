import { getFileViewerUrl, getLocalFileUrl } from "@/lib/file-viewer-links";
import type { FileLineRange } from "@/lib/file-links";

export function FileAccessLinks({ filePath, lineRange, sessionId, showViewerLink = true }: {
  filePath: string;
  lineRange?: FileLineRange;
  sessionId?: string | null;
  showViewerLink?: boolean;
}) {
  return (
    <>
      {showViewerLink && (
        <a href={getFileViewerUrl(filePath, lineRange, sessionId)} target="_blank" rel="noopener noreferrer" title="Open viewer in browser tab" style={{ flexShrink: 0 }}>Viewer ↗</a>
      )}
      <a href={getLocalFileUrl(filePath)} draggable="true" target="_blank" rel="noopener noreferrer" title="Open local file" style={{ flexShrink: 0, textDecoration: "underline", cursor: "pointer" }}>Open</a>
    </>
  );
}
