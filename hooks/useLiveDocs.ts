"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveDocRecord, LiveDocSummary } from "@/lib/live-docs";

const storageKey = (sessionId: string) => `pi-live-doc-default:${sessionId}`;

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok || body.error) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

export function useLiveDocs(sessionId: string | null) {
  const [docs, setDocs] = useState<LiveDocSummary[]>([]);
  const [defaultDocId, setDefaultDocIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setDocs([]);
      setDefaultDocIdState(null);
      return [];
    }
    const generation = generationRef.current;
    const result = await json<{ docs: LiveDocSummary[] }>(await fetch(`/api/live-docs?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" }));
    if (generation !== generationRef.current) return result.docs;
    setDocs(result.docs);
    setDefaultDocIdState((current) => {
      const stored = current ?? localStorage.getItem(storageKey(sessionId));
      const next = result.docs.some((doc) => doc.id === stored) ? stored : result.docs[0]?.id ?? null;
      if (next) localStorage.setItem(storageKey(sessionId), next);
      else localStorage.removeItem(storageKey(sessionId));
      return next;
    });
    return result.docs;
  }, [sessionId]);

  useEffect(() => {
    generationRef.current += 1;
    setError(null);
    setLoading(Boolean(sessionId));
    void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false));
  }, [refresh, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/api/live-docs/events?sessionId=${encodeURIComponent(sessionId)}`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (payload.type !== "ready") void refresh();
      } catch { /* ignore malformed event */ }
    };
    return () => source.close();
  }, [refresh, sessionId]);

  const setDefaultDocId = useCallback((docId: string | null) => {
    setDefaultDocIdState(docId);
    if (!sessionId) return;
    if (docId) localStorage.setItem(storageKey(sessionId), docId);
    else localStorage.removeItem(storageKey(sessionId));
  }, [sessionId]);

  const createDoc = useCallback(async (): Promise<LiveDocRecord> => {
    if (!sessionId) throw new Error("Save the session before adding a Live Doc");
    setError(null);
    const result = await json<{ doc: LiveDocRecord }>(await fetch("/api/live-docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }));
    setDefaultDocId(result.doc.id);
    await refresh();
    return result.doc;
  }, [refresh, sessionId, setDefaultDocId]);

  const updateSummary = useCallback((doc: LiveDocRecord) => {
    setDocs((current) => {
      const next = current.map((entry) => entry.id === doc.id ? {
        id: doc.id,
        title: doc.title,
        format: doc.format,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        sessionIds: doc.sessionIds,
        headRevisionId: doc.headRevisionId,
      } : entry);
      return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);

  return { docs, defaultDocId, setDefaultDocId, createDoc, refresh, updateSummary, loading, error };
}
