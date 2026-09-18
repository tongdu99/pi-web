"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveDocRecord, LiveDocRevision, LiveDocSection } from "@/lib/live-docs";
import { MarkdownBody } from "./MarkdownBody";

interface Props {
  docId: string;
  headRevisionId?: string;
  refreshKey?: string;
  onChanged?: (doc: LiveDocRecord) => void;
  onStartDiscussion?: (section: LiveDocSection, selectedText: string) => void;
}

type RevisionSummary = Pick<LiveDocRevision, "id" | "previousRevisionId" | "createdAt" | "summary" | "source">;

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok || body.error) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

export function LiveDocViewer({ docId, headRevisionId, refreshKey, onChanged, onStartDiscussion }: Props) {
  const [doc, setDoc] = useState<LiveDocRecord | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [selectionAction, setSelectionAction] = useState<{ section: LiveDocSection; text: string; left: number; top: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const result = await responseJson<{ doc: LiveDocRecord }>(await fetch(`/api/live-docs/${encodeURIComponent(docId)}`, { cache: "no-store" }));
    setDoc(result.doc);
    setTitle(result.doc.title);
    setError(null);
    onChanged?.(result.doc);
  }, [docId, onChanged]);

  useEffect(() => {
    setDoc((current) => current?.id === docId ? current : null);
    setSelectionAction(null);
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [docId, headRevisionId, load, refreshKey]);

  const saveTitle = useCallback(async () => {
    if (!doc || !title.trim() || title.trim() === doc.title) {
      if (doc) setTitle(doc.title);
      return;
    }
    setSavingTitle(true);
    try {
      const result = await responseJson<{ doc: LiveDocRecord }>(await fetch(`/api/live-docs/${encodeURIComponent(doc.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
      }));
      setDoc(result.doc);
      setTitle(result.doc.title);
      onChanged?.(result.doc);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setTitle(doc.title);
    } finally { setSavingTitle(false); }
  }, [doc, onChanged, title]);

  const loadHistory = useCallback(async () => {
    const result = await responseJson<{ revisions: RevisionSummary[] }>(await fetch(`/api/live-docs/${encodeURIComponent(docId)}/revisions`, { cache: "no-store" }));
    setRevisions(result.revisions);
  }, [docId]);

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) void loadHistory().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  };

  const restore = async (revisionId: string) => {
    if (!doc || restoring) return;
    setRestoring(revisionId);
    try {
      const result = await responseJson<{ doc: LiveDocRecord }>(await fetch(`/api/live-docs/${encodeURIComponent(doc.id)}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId, expectedRevisionId: doc.headRevisionId }),
      }));
      setDoc(result.doc);
      onChanged?.(result.doc);
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setRestoring(null); }
  };

  const captureSelection = (section: LiveDocSection, event: React.MouseEvent<HTMLDivElement>) => {
    if (!onStartDiscussion) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionAction(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!event.currentTarget.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    const host = contentRef.current?.getBoundingClientRect();
    setSelectionAction({
      section,
      text: selection.toString().trim(),
      left: Math.max(8, rect.left - (host?.left ?? 0)),
      top: rect.bottom - (host?.top ?? 0) + 5,
    });
  };

  if (!doc && !error) return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>Loading Live Doc…</div>;
  if (!doc) return <div role="alert" style={{ padding: 16, color: "#dc2626", fontSize: 12 }}>{error}</div>;
  const head = doc.revisions.find((revision) => revision.id === doc.headRevisionId);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
        <input value={title} disabled={savingTitle} aria-label="Live Doc name"
          onChange={(event) => setTitle(event.target.value)} onBlur={() => { void saveTitle(); }}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setTitle(doc.title); event.currentTarget.blur(); } }}
          style={{ flex: 1, minWidth: 0, padding: "4px 6px", border: "1px solid transparent", borderRadius: 4, background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 600 }} />
        <span style={{ color: "var(--text-dim)", fontSize: 10 }}>Rev {doc.revisions.length}</span>
        <button type="button" onClick={toggleHistory} style={smallButtonStyle}>History</button>
      </div>
      {error && <div role="alert" style={{ padding: "6px 12px", background: "color-mix(in srgb, #dc2626 10%, transparent)", color: "#dc2626", fontSize: 11 }}>{error}</div>}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div ref={contentRef} style={{ flex: 1, position: "relative", overflowY: "auto", padding: "18px 22px" }}>
          {!head || head.sections.length === 0 ? (
            <div style={{ color: "var(--text-dim)", fontSize: 13, fontStyle: "italic" }}>This Live Doc is empty. Add an assistant response to begin.</div>
          ) : head.sections.map((section) => (
            <div key={section.id} data-live-doc-section={section.id} onMouseUp={(event) => captureSelection(section, event)}
              style={{ position: "relative", borderLeft: "2px solid transparent", paddingLeft: 10, marginLeft: -12 }}>
              <MarkdownBody>{section.markdown}</MarkdownBody>
              {onStartDiscussion && (
                <button type="button" onClick={() => onStartDiscussion(section, section.markdown)} title="Start Live Update Discussion"
                  style={{ ...smallButtonStyle, position: "absolute", top: 0, right: 0, opacity: 0.7, color: "#a855f7", borderColor: "color-mix(in srgb, #a855f7 45%, var(--border))" }}>↳ Live update</button>
              )}
            </div>
          ))}
          {selectionAction && (
            <button type="button" onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onStartDiscussion?.(selectionAction.section, selectionAction.text); setSelectionAction(null); window.getSelection()?.removeAllRanges(); }}
              style={{ ...smallButtonStyle, position: "absolute", zIndex: 5, left: selectionAction.left, top: selectionAction.top, color: "#a855f7", borderColor: "#a855f7", background: "var(--bg-panel)" }}>
              ↳ Live Update Discussion
            </button>
          )}
        </div>
        {historyOpen && (
          <aside style={{ width: 210, overflowY: "auto", borderLeft: "1px solid var(--border)", padding: 10, background: "var(--bg-panel)" }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Revision history</div>
            {revisions.map((revision, index) => (
              <div key={revision.id} style={{ padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
                <div style={{ color: index === 0 ? "var(--accent)" : "var(--text-muted)" }}>{index === 0 ? "Current" : `Revision ${revisions.length - index}`}</div>
                <div style={{ color: "var(--text-dim)", margin: "2px 0 5px" }}>{revision.summary ?? new Date(revision.createdAt).toLocaleString()}</div>
                {index > 0 && <button type="button" disabled={Boolean(restoring)} onClick={() => { void restore(revision.id); }} style={smallButtonStyle}>{restoring === revision.id ? "Restoring…" : "Restore"}</button>}
              </div>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

const smallButtonStyle = {
  border: "1px solid var(--border)", borderRadius: 4, padding: "4px 7px", background: "var(--bg)",
  color: "var(--text-muted)", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap" as const,
};
