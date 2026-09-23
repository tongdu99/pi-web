"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveDocSummary } from "@/lib/live-docs";

interface Props {
  docs: LiveDocSummary[];
  defaultDocId: string | null;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onCreate: () => void;
  onOpen: (doc: LiveDocSummary) => void;
}

export function LiveDocsMenu({ docs, defaultDocId, disabled, loading, error, onCreate, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = docs.find((doc) => doc.id === defaultDocId) ?? null;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", height: "100%" }}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={selected ? `Live Docs: ${selected.title}` : "Live Docs"}
        style={{
          display: "flex", alignItems: "center", gap: 6, height: "100%", maxWidth: 190,
          padding: "0 10px", border: "none", borderRight: "1px solid var(--border)",
          background: open ? "var(--bg-selected)" : "none", color: "var(--text-muted)",
          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, fontSize: 11,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h6" />
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.title ?? (loading ? "Loading…" : "Live Docs")}
        </span>
        <span aria-hidden="true" style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div role="menu" aria-label="Live Docs" style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 600,
          width: 250, maxHeight: 360, overflowY: "auto", padding: 5,
          border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        }}>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onCreate(); }} style={menuItemStyle}>
            <span style={{ color: "var(--accent)", fontSize: 17, lineHeight: 1 }}>+</span>
            <strong style={{ fontWeight: 500 }}>Add Live Doc</strong>
          </button>
          {docs.length > 0 && <div style={{ height: 1, background: "var(--border)", margin: "5px 2px" }} />}
          {docs.map((doc) => (
            <button key={doc.id} type="button" role="menuitemradio" aria-checked={doc.id === defaultDocId}
              onClick={() => { setOpen(false); onOpen(doc); }} style={{ ...menuItemStyle, background: doc.id === defaultDocId ? "var(--bg-selected)" : "none" }}>
              <span aria-hidden="true" style={{ width: 13, color: "var(--accent)" }}>{doc.id === defaultDocId ? "●" : ""}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</span>
            </button>
          ))}
          {!loading && docs.length === 0 && (
            <div style={{ padding: "8px 10px", color: "var(--text-dim)", fontSize: 11 }}>No Live Docs in this session</div>
          )}
          {error && <div role="alert" style={{ padding: "6px 10px", color: "#dc2626", fontSize: 11 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

const menuItemStyle = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 9px",
  border: "none", borderRadius: 5, background: "none", color: "var(--text-muted)",
  cursor: "pointer", fontSize: 12, textAlign: "left" as const,
};
