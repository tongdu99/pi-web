"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentMessage, AssistantMessage, TextContent } from "@/lib/types";
import { LIVE_DOC_CONTEXT_CUSTOM_TYPE, type LiveDocThreadDescriptor } from "@/lib/live-doc-discussions";
import { useI18n } from "@/hooks/useI18n";
import { MessageView } from "./MessageView";

interface ThreadContext {
  messages: AgentMessage[];
  entryIds: string[];
}

interface Props {
  sessionId: string;
  thread: LiveDocThreadDescriptor;
  docTitle: string;
  modelNames?: Record<string, string>;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  onOpenChangedFile?: (filePath: string) => void;
  onOpenUrl?: (url: string) => void;
  onContinue: () => void;
}

function messageText(message: AgentMessage | undefined): string {
  if (!message) return "";
  if (message.role === "user") {
    return typeof message.content === "string"
      ? message.content
      : message.content.filter((block): block is TextContent => block.type === "text").map((block) => block.text).join("\n");
  }
  if (message.role === "assistant") {
    return message.content.filter((block): block is TextContent => block.type === "text").map((block) => block.text).join("\n");
  }
  return "";
}

function compact(value: string, limit = 180): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function discussionDelta(context: ThreadContext, thread: LiveDocThreadDescriptor): ThreadContext {
  const hostIndex = thread.hostLeafId ? context.entryIds.indexOf(thread.hostLeafId) : -1;
  let start = hostIndex >= 0 ? hostIndex + 1 : 0;
  const contextIndex = context.messages.findIndex((message, index) => (
    index >= start && message.role === "custom" && message.customType === LIVE_DOC_CONTEXT_CUSTOM_TYPE
  ));
  if (contextIndex >= 0) start = contextIndex + 1;
  return { messages: context.messages.slice(start), entryIds: context.entryIds.slice(start) };
}

export function documentOutcome(messages: AgentMessage[]): "updated" | "unchanged" | "failed" {
  const updateCalls = new Set<string>();
  let succeeded = false;
  let failed = false;
  for (const message of messages) {
    if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "toolCall" && block.toolName === "live_doc_update") updateCalls.add(block.toolCallId);
      }
    } else if (message.role === "toolResult" && updateCalls.has(message.toolCallId)) {
      if (message.isError) failed = true;
      else succeeded = true;
    }
  }
  return succeeded ? "updated" : failed ? "failed" : "unchanged";
}

function displayMessage(message: AgentMessage): AgentMessage | null {
  if (message.role === "user") return message;
  if (message.role !== "assistant") return null;
  return message.content.length ? message as AssistantMessage : null;
}

export function LiveDocDiscussionPanel({ sessionId, thread, docTitle, modelNames, cwd, onOpenFile, onOpenChangedFile, onOpenUrl, onContinue }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState<{ leafId: string; context: ThreadContext } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
    const controller = new AbortController();
    const params = new URLSearchParams({ leafId: thread.latestLeafId, deferThinking: "1", deferMedia: "1" });
    void fetch(`/api/sessions/${encodeURIComponent(sessionId)}/context?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ context: ThreadContext }>;
      })
      .then((result) => setLoaded({ leafId: thread.latestLeafId, context: result.context }))
      .catch((error) => {
        if ((error as { name?: string }).name !== "AbortError") setLoadError(true);
      });
    return () => controller.abort();
  }, [sessionId, thread.latestLeafId]);

  const delta = useMemo(() => loaded ? discussionDelta(loaded.context, thread) : null, [loaded, thread]);
  const visible = useMemo(() => (delta?.messages ?? []).map((message, index) => ({ message: displayMessage(message), entryId: delta?.entryIds[index] })).filter((item): item is { message: AgentMessage; entryId: string | undefined } => Boolean(item.message)), [delta]);
  const toolResults = useMemo(() => {
    const results = new Map<string, Extract<AgentMessage, { role: "toolResult" }>>();
    for (const message of delta?.messages ?? []) {
      if (message.role === "toolResult") results.set(message.toolCallId, message);
    }
    return results;
  }, [delta]);
  const firstUser = visible.find((item) => item.message.role === "user")?.message;
  const lastAssistant = visible.findLast((item) => item.message.role === "assistant" && messageText(item.message))?.message;
  const request = compact(messageText(firstUser));
  const response = compact(messageText(lastAssistant));
  const turnCount = visible.filter((item) => item.message.role === "user").length;
  const outcome = delta ? documentOutcome(delta.messages) : null;
  const outcomeText = outcome === "updated"
    ? t("chat.documentUpdated", { title: docTitle })
    : outcome === "failed" ? t("chat.documentUpdateFailed") : t("chat.documentUnchanged");
  const outcomeColor = outcome === "updated" ? "#16a34a" : outcome === "failed" ? "#dc2626" : "var(--text-dim)";

  return (
    <section style={{ margin: "8px 0", border: "1px solid color-mix(in srgb, #a855f7 28%, var(--border))", borderLeft: "3px solid #a855f7", borderRadius: 7, background: "var(--bg-panel)", overflow: "hidden" }}>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
        style={{ display: "block", width: "100%", padding: "9px 11px", border: 0, background: "transparent", color: "var(--text)", cursor: "pointer", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{t("chat.documentConversationTitle", { section: thread.sectionLabel })}</strong>
          {turnCount > 0 && <span style={{ color: "var(--text-dim)", fontSize: 10, whiteSpace: "nowrap" }}>{t("chat.conversationTurns", { count: turnCount })}</span>}
          {outcome && <span style={{ color: outcomeColor, fontSize: 10, whiteSpace: "nowrap" }}>{outcomeText}</span>}
          <span aria-hidden="true" style={{ color: "var(--text-dim)", fontSize: 14, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>›</span>
        </div>
        {loadError ? (
          <div style={{ marginTop: 5, color: "#dc2626", fontSize: 11 }}>{t("chat.discussionLoadFailed")}</div>
        ) : !loaded ? (
          <div style={{ marginTop: 5, color: "var(--text-dim)", fontSize: 11 }}>{t("chat.discussionLoading")}</div>
        ) : (
          <div style={{ marginTop: 5, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
            {request && <div><span style={{ color: "var(--text-dim)" }}>{t("chat.discussionRequest")}</span> {request}</div>}
            {response && <div><span style={{ color: "var(--text-dim)" }}>{t("chat.discussionResult")}</span> {response}</div>}
          </div>
        )}
      </button>
      {expanded && loaded && (
        <div style={{ padding: "4px 11px 10px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
          {visible.map(({ message, entryId }, index) => (
            <MessageView key={entryId ?? `live-doc-discussion-${index}`} message={message} toolResults={toolResults} modelNames={modelNames} cwd={cwd}
              onOpenFile={onOpenFile} onOpenChangedFile={onOpenChangedFile} onOpenUrl={onOpenUrl}
              entryId={entryId} showTimestamp={message.role === "assistant"} sessionId={sessionId} />
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onContinue} style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg)", color: "#a855f7", cursor: "pointer", fontSize: 11 }}>{t("chat.openConversation")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
