"use client";

import { FileViewer } from "./FileViewer";
import { I18nProvider } from "@/hooks/useI18n";
import { getFileDirectory } from "@/lib/file-paths";
import { getFileViewerUrl } from "@/lib/file-viewer-links";
import type { FileLineRange } from "@/lib/file-links";

export default function StandaloneRichPreview({ filePath, sessionId, lineRange }: {
  filePath: string;
  sessionId?: string | null;
  lineRange?: FileLineRange;
}) {
  return (
    <I18nProvider>
      <FileViewer
        filePath={filePath}
        cwd={getFileDirectory(filePath)}
        sourceSessionId={sessionId}
        targetLineRange={lineRange}
        initialDisplayMode={lineRange ? "source" : "preview"}
        watchEnabled={false}
        onOpenFile={(path, lines) => window.location.assign(getFileViewerUrl(path, lines, sessionId))}
      />
    </I18nProvider>
  );
}
