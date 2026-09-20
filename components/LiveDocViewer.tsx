"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveDocRecord, LiveDocRevision, LiveDocSection } from "@/lib/live-docs";
import type { LiveDocThreadDescriptor } from "@/lib/live-doc-discussions";
import type { FileLineRange } from "@/lib/file-links";
import { buildLiveDocRevisionPreview } from "@/lib/live-doc-preview";
import { MarkdownBody } from "./MarkdownBody";

interface Props {
  docId: string;
  sessionId?: string;
  headRevisionId?: string;
  refreshKey?: string;
  focusedSectionId?: string;
  focusedSectionActive?: boolean;
  conversations?: LiveDocThreadDescriptor[];
  cwd?: string;
  onOpenFile?: (filePath: string, lineRange?: FileLineRange) => void;
  onOpenUrl?: (url: string) => void;
  onChanged?: (doc: LiveDocRecord) => void;
  onStartDiscussion?: (section: LiveDocSection, selectedText: string) => void;
  onOpenDiscussion?: (discussionEntryId: string) => void;
}

type RevisionSummary = Pick<LiveDocRevision, "id" | "previousRevisionId" | "createdAt" | "summary" | "source" | "change">;

interface RevisionHistory {
  revisions: RevisionSummary[];
  mainRevisionIds: string[];
  archivedRevisionIds: string[];
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok || body.error) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

export function LiveDocViewer({ docId, sessionId, headRevisionId, refreshKey, focusedSectionId, focusedSectionActive, conversations = [], cwd, onOpenFile, onOpenUrl, onChanged, onStartDiscussion, onOpenDiscussion }: Props) {
  const [doc, setDoc] = useState<LiveDocRecord | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [mainRevisionIds, setMainRevisionIds] = useState<string[]>([]);
  const [archivedRevisionIds, setArchivedRevisionIds] = useState<string[]>([]);
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!focusedSectionId) return;
    requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLElement>(`[data-live-doc-section="${focusedSectionId}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [doc?.headRevisionId, focusedSectionId]);

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
    const result = await responseJson<RevisionHistory>(await fetch(`/api/live-docs/${encodeURIComponent(docId)}/revisions`, { cache: "no-store" }));
    setRevisions(result.revisions);
    setMainRevisionIds(result.mainRevisionIds);
    setArchivedRevisionIds(result.archivedRevisionIds);
  }, [docId]);

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) {
      setConversationsOpen(false);
      void loadHistory().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    }
  };

  const toggleConversations = () => {
    setConversationsOpen((current) => !current);
    setHistoryOpen(false);
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
      setPreviewRevisionId(null);
      onChanged?.(result.doc);
      await loadHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setRestoring(null); }
  };

  const switchDiscussionTarget = (section: LiveDocSection, event: React.MouseEvent<HTMLDivElement>) => {
    if (previewRevisionId || !focusedSectionId || section.id === focusedSectionId || !onStartDiscussion) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("a, button, input, textarea, select, summary")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    onStartDiscussion(section, section.markdown);
  };

  const captureSelection = (section: LiveDocSection, event: React.MouseEvent<HTMLDivElement>) => {
    if (previewRevisionId || !onStartDiscussion) return;
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
  const previewRevision = previewRevisionId ? doc.revisions.find((revision) => revision.id === previewRevisionId) : undefined;
  const preview = head
    ? buildLiveDocRevisionPreview(head, previewRevision)
    : { sections: [], changedSectionIds: new Set<string>() };
  const displayedSections = preview.sections;
  const previewChangedIds = preview.changedSectionIds;
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));

  const revisionGroup = (label: string, ids: string[]) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>{label}</div>
      {ids.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 10, padding: "5px 0" }}>None</div>}
      {ids.map((revisionId, index) => {
        const revision = revisionById.get(revisionId);
        if (!revision) return null;
        const current = revisionId === doc.headRevisionId;
        return (
          <div key={revision.id}
            onMouseEnter={() => setPreviewRevisionId(revision.id)}
            onMouseLeave={() => setPreviewRevisionId((value) => value === revision.id ? null : value)}
            style={{ padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
            <div style={{ color: current ? "var(--accent)" : "var(--text-muted)" }}>{current ? "Current" : `${label === "History" ? "Revision" : "Archived"} ${ids.length - index}`}</div>
            <div style={{ color: "var(--text-dim)", margin: "2px 0 5px" }}>{revision.summary ?? new Date(revision.createdAt).toLocaleString()}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {!current && <button type="button" disabled={Boolean(restoring)} onClick={() => { void restore(revision.id); }} style={smallButtonStyle}>{restoring === revision.id ? "Restoring…" : "Restore"}</button>}
              {revision.source?.discussionEntryId && revision.source.sessionId === sessionId && onOpenDiscussion && (
                <button type="button" onClick={() => onOpenDiscussion(revision.source!.discussionEntryId!)} style={{ ...smallButtonStyle, color: "#a855f7" }}>Open conversation</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)" }}>
        <input value={title} disabled={savingTitle} aria-label="Live Doc name"
          onChange={(event) => setTitle(event.target.value)} onBlur={() => { void saveTitle(); }}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setTitle(doc.title); event.currentTarget.blur(); } }}
          style={{ flex: 1, minWidth: 0, padding: "4px 6px", border: "1px solid transparent", borderRadius: 4, background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 600 }} />
        {previewRevision && <span style={{ color: "var(--accent)", fontSize: 10 }}>Preview</span>}
        <span style={{ color: "var(--text-dim)", fontSize: 10 }}>Rev {doc.revisions.length}</span>
        <button type="button" onClick={toggleConversations} style={{ ...smallButtonStyle, color: conversationsOpen ? "#a855f7" : smallButtonStyle.color }}>Conversations ({conversations.length})</button>
        <button type="button" onClick={toggleHistory} style={smallButtonStyle}>History</button>
      </div>
      {error && <div role="alert" style={{ padding: "6px 12px", background: "color-mix(in srgb, #dc2626 10%, transparent)", color: "#dc2626", fontSize: 11 }}>{error}</div>}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div ref={contentRef} style={{ flex: 1, position: "relative", overflowY: "auto", padding: "18px 22px" }}>
          {displayedSections.length === 0 ? (
            <div style={{ color: "var(--text-dim)", fontSize: 13, fontStyle: "italic" }}>This Live Doc is empty. Add an assistant response to begin.</div>
          ) : displayedSections.map((section) => {
            const sectionHovered = hoveredSectionId === section.id;
            const sectionFocused = !previewRevision && focusedSectionId === section.id;
            const sectionChangedInPreview = previewChangedIds.has(section.id);
            return (
              <div
                key={section.id}
                data-live-doc-section={section.id}
                data-live-doc-revision-change={sectionChangedInPreview || undefined}
                onMouseEnter={() => setHoveredSectionId(section.id)}
                onMouseLeave={() => setHoveredSectionId((current) => current === section.id ? null : current)}
                onMouseUp={(event) => captureSelection(section, event)}
                onClick={(event) => switchDiscussionTarget(section, event)}
                title={!previewRevision && focusedSectionId && section.id !== focusedSectionId ? "Click to switch the document context" : undefined}
                style={{
                  position: "relative", margin: 0, padding: 0,
                  cursor: !previewRevision && focusedSectionId && section.id !== focusedSectionId ? "pointer" : undefined,
                  outline: sectionChangedInPreview
                    ? "2px solid color-mix(in srgb, var(--accent) 70%, var(--border))"
                    : sectionFocused
                    ? `${focusedSectionActive ? 2 : 1}px solid color-mix(in srgb, #a855f7 72%, var(--border))`
                    : sectionHovered
                      ? "1px solid color-mix(in srgb, #a855f7 38%, var(--border))"
                      : "1px solid transparent",
                  outlineOffset: 4, borderRadius: 5, transition: "outline-color 0.12s, background 0.12s",
                  background: sectionChangedInPreview
                    ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                    : sectionFocused
                    ? "color-mix(in srgb, #a855f7 7%, transparent)"
                    : sectionHovered
                      ? "color-mix(in srgb, #a855f7 3%, transparent)"
                      : "transparent",
                }}
              >
                <MarkdownBody cwd={cwd} onOpenFile={onOpenFile} onOpenUrl={onOpenUrl}>{section.markdown}</MarkdownBody>
                {onStartDiscussion && !previewRevision && (
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onStartDiscussion(section, section.markdown); }}
                    title="Start a document conversation about this section"
                    style={{
                      ...smallButtonStyle, position: "absolute", bottom: 0, right: 0, transform: "translateY(50%)",
                      opacity: sectionHovered ? 1 : 0, pointerEvents: sectionHovered ? "auto" : "none",
                      color: "#a855f7", borderColor: "color-mix(in srgb, #a855f7 45%, var(--border))",
                      transition: "opacity 0.12s, color 0.12s",
                    }}
                  >
                    ↳ Discuss & update
                  </button>
                )}
              </div>
            );
          })}
          {selectionAction && (
            <button type="button" onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onStartDiscussion?.(selectionAction.section, selectionAction.text); setSelectionAction(null); window.getSelection()?.removeAllRanges(); }}
              style={{ ...smallButtonStyle, position: "absolute", zIndex: 5, left: selectionAction.left, top: selectionAction.top, color: "#a855f7", borderColor: "#a855f7", background: "var(--bg-panel)" }}>
              ↳ Discuss & update selection
            </button>
          )}
        </div>
        {conversationsOpen && (
          <aside style={{ width: 230, overflowY: "auto", borderLeft: "1px solid var(--border)", padding: 10, background: "var(--bg-panel)" }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Document conversations</div>
            {conversations.length === 0 ? (
              <div style={{ color: "var(--text-dim)", fontSize: 11 }}>No conversations for this document yet.</div>
            ) : conversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => onOpenDiscussion?.(conversation.id)} disabled={!onOpenDiscussion}
                style={{ display: "block", width: "100%", padding: "8px 6px", border: 0, borderBottom: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: onOpenDiscussion ? "pointer" : "default", textAlign: "left" }}>
                <div style={{ color: "var(--text)", fontSize: 11, fontWeight: 600 }}>{conversation.sectionLabel}</div>
                <div style={{ marginTop: 2, color: "var(--text-dim)", fontSize: 10 }}>
                  {conversation.kind === "merge-response" ? "Added response" : "Section discussion"} · {new Date(conversation.node.entry.timestamp).toLocaleString()}
                </div>
              </button>
            ))}
          </aside>
        )}
        {historyOpen && (
          <aside style={{ width: 210, overflowY: "auto", borderLeft: "1px solid var(--border)", padding: 10, background: "var(--bg-panel)" }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Revision history</div>
            {revisionGroup("History", mainRevisionIds)}
            {revisionGroup("Archived", archivedRevisionIds)}
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
