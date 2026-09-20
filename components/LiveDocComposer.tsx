"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveDocComposerState, LiveDocContextMode } from "@/lib/live-doc-composer";

interface Props {
  docId: string;
  composer: LiveDocComposerState;
}

const contextLabels: Record<LiveDocContextMode, string> = {
  section: "Section",
  relevant: "Relevant context",
  full: "Full document",
};

export function LiveDocComposer({ docId, composer }: Props) {
  const [draft, setDraft] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wholeTargetRequestedForRef = useRef<string | null>(null);
  const targetKey = composer.target ? `${composer.target.docId}:${composer.target.sectionId}:${composer.target.selectedText}` : "";

  useEffect(() => {
    if (composer.target) {
      wholeTargetRequestedForRef.current = docId;
      return;
    }
    if (!composer.canSend || composer.busy || wholeTargetRequestedForRef.current === docId) return;
    wholeTargetRequestedForRef.current = docId;
    composer.onTargetWholeDocument(docId);
  }, [composer, docId]);

  useEffect(() => {
    if (!targetKey || !composer.active) return;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [composer.active, targetKey]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [draft]);

  useEffect(() => {
    if (!composer.result) return;
    setResultOpen(true);
    const timer = window.setTimeout(() => setResultOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, [composer.result]);

  const activate = () => {
    composer.onActivate();
    if (!composer.target) {
      wholeTargetRequestedForRef.current = docId;
      composer.onTargetWholeDocument(docId);
    }
  };

  const send = async () => {
    const message = draft.trim();
    if (!message || !composer.active || !composer.canSend || composer.busy || !composer.target) return;
    setDraft("");
    const accepted = await composer.onSend(message);
    if (!accepted) {
      setDraft(message);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const result = composer.result;
  return (
    <div aria-disabled={!composer.active} style={{ flexShrink: 0, position: "relative", padding: "10px", borderTop: "1px solid var(--border)", background: "transparent", opacity: composer.active ? 1 : 0.55, transition: "opacity 0.15s" }}>
      {!composer.active && (
        <button type="button" onClick={activate} aria-label="Activate Live Doc composer" title="Click to use the Live Doc composer"
          style={{ position: "absolute", inset: 0, zIndex: 20, width: "100%", border: 0, background: "transparent", cursor: "text" }} />
      )}
      {result && resultOpen && (
        <div role={result.status === "error" ? "alert" : "status"} style={{ marginBottom: 8, padding: "9px 11px", border: "1px solid color-mix(in srgb, #a855f7 28%, var(--border))", borderLeft: "3px solid #a855f7", borderRadius: 7, background: "var(--bg-panel)", fontSize: 11, lineHeight: 1.45 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ flex: 1, color: result.status === "error" ? "#dc2626" : "var(--text-muted)" }}>{result.message}</span>
            {result.threadEntryId && <button type="button" onClick={() => composer.onOpenConversation(result.threadEntryId!)} style={linkButtonStyle}>Open conversation</button>}
            <button type="button" onClick={() => setResultOpen(false)} aria-label="Collapse result" style={iconButtonStyle}>×</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, minHeight: 22 }}>
        {composer.target ? (
          <>
            <span title={composer.target.selectedText || composer.target.sectionLabel} style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#a855f7", fontSize: 11, fontWeight: 600 }}>
              Context: {composer.target.sectionLabel}
            </span>
            {composer.target.sectionId && (
              <button type="button" onClick={() => composer.onTargetWholeDocument(docId)} disabled={composer.busy} style={linkButtonStyle}>Whole document</button>
            )}
            <select aria-label="Document context" title="Choose how much of the document to include" value={composer.contextMode} disabled={composer.busy || !composer.active}
              onChange={(event) => composer.onContextModeChange(event.target.value as LiveDocContextMode)}
              style={{ maxWidth: 120, padding: "2px 4px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg)", color: "var(--text-muted)", fontSize: 10 }}>
              {(Object.keys(contextLabels) as LiveDocContextMode[]).map((mode) => <option key={mode} value={mode}>{contextLabels[mode]}</option>)}
            </select>
            <button type="button" onClick={composer.onClearTarget} disabled={composer.busy || !composer.active} aria-label="Clear document context" style={iconButtonStyle}>×</button>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
            <span style={{ minWidth: 0, flex: 1, color: "var(--text-dim)", fontSize: 11 }}>Select a section or target the entire document.</span>
            <button type="button" onClick={() => composer.onTargetWholeDocument(docId)} disabled={composer.busy || !composer.canSend} style={linkButtonStyle}>Use whole document</button>
          </div>
        )}
        {result && !resultOpen && (
          <button type="button" onClick={() => setResultOpen(true)} title="Show last Live Doc result" aria-label="Show last Live Doc result" style={{ ...iconButtonStyle, display: "flex", color: result.status === "error" ? "#dc2626" : "#a855f7" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            </svg>
          </button>
        )}
      </div>

      {composer.busy && (
        <div style={{ marginBottom: 6, color: "var(--text-muted)", fontSize: 11 }}>
          <span className="animate-[pulse_1.5s_infinite]">{composer.phase || "Updating document…"}</span>
        </div>
      )}
      <div onClick={() => { if (!composer.target) activate(); }} style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 10px 14px", border: "1px solid color-mix(in srgb, var(--border) 70%, transparent)", borderRadius: 14, background: "var(--bg)", boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)" }}>
        <textarea ref={textareaRef} value={draft} rows={1} readOnly={!composer.active} disabled={!composer.canSend || composer.busy || !composer.target}
          aria-label="Live Doc request"
          placeholder={composer.target ? "Request an update…" : "Select document context first"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          style={{ flex: 1, minWidth: 0, width: "100%", minHeight: 24, maxHeight: 200, resize: "none", overflow: "auto", padding: 0, border: 0, background: "none", color: "var(--text)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.6, outline: "none" }} />
        {composer.busy ? (
          <button type="button" onClick={composer.onAbort} style={{ ...sendButtonStyle, color: "#dc2626" }}>Stop</button>
        ) : (
          <button type="button" onClick={() => { void send(); }} disabled={!composer.active || !draft.trim() || !composer.canSend || !composer.target} style={sendButtonStyle}>Send</button>
        )}
      </div>
    </div>
  );
}

const iconButtonStyle = {
  border: 0, padding: "1px 4px", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontSize: 13,
};

const linkButtonStyle = {
  border: 0, padding: 0, background: "transparent", color: "#a855f7", cursor: "pointer", fontSize: 10, whiteSpace: "nowrap" as const,
};

const sendButtonStyle = {
  height: 34, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-selected)", color: "var(--text)", cursor: "pointer", fontSize: 11,
};
