import type { SessionTreeNode } from "./types";
import { liveDocSectionPreview } from "./live-doc-target";

export const LIVE_DOC_THREAD_CUSTOM_TYPE = "pi-web.live-doc-thread";
export const LIVE_DOC_CONTEXT_CUSTOM_TYPE = "pi-web.live-doc-context";

export type LiveDocConversationKind = "discussion" | "merge-response";

export interface LiveDocThreadMetadata {
  version: 1;
  docId: string;
  sectionId: string;
  sectionLabel: string;
  selectedText: string;
  hostLeafId: string | null;
  kind: LiveDocConversationKind;
  status: "open";
}

export interface LiveDocThreadDescriptor extends LiveDocThreadMetadata {
  id: string;
  latestLeafId: string;
  node: SessionTreeNode;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLiveDocThreadMetadata(value: unknown): LiveDocThreadMetadata | null {
  if (!record(value) || value.version !== 1 || typeof value.docId !== "string"
    || typeof value.sectionId !== "string" || typeof value.selectedText !== "string"
    || !(typeof value.hostLeafId === "string" || value.hostLeafId === null)) return null;
  const kind: LiveDocConversationKind = value.kind === "merge-response" ? "merge-response" : "discussion";
  return {
    version: 1,
    docId: value.docId,
    sectionId: value.sectionId,
    sectionLabel: typeof value.sectionLabel === "string" && value.sectionLabel.trim()
      ? value.sectionLabel.trim()
      : value.sectionId ? liveDocSectionPreview(value.selectedText) : "Whole document",
    selectedText: value.selectedText,
    hostLeafId: value.hostLeafId,
    kind,
    status: "open",
  };
}

function latestLeaf(root: SessionTreeNode): string {
  let latest = root;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.children.length === 0 && Date.parse(node.entry.timestamp) >= Date.parse(latest.entry.timestamp)) latest = node;
    stack.push(...node.children);
  }
  return latest.entry.id;
}

function contains(root: SessionTreeNode, id: string | null): boolean {
  if (!id) return false;
  if (root.entry.id === id) return true;
  const stack = [...root.children];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.entry.id === id || node.compressedEntryIds?.includes(id)) return true;
    stack.push(...node.children);
  }
  return false;
}

export function collectLiveDocThreads(tree: SessionTreeNode[]): LiveDocThreadDescriptor[] {
  const result: LiveDocThreadDescriptor[] = [];
  const stack = [...tree];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.entry.type === "custom" && node.entry.customType === LIVE_DOC_THREAD_CUSTOM_TYPE) {
      const metadata = parseLiveDocThreadMetadata(node.entry.data);
      if (metadata) result.push({ ...metadata, id: node.entry.id, latestLeafId: latestLeaf(node), node });
    }
    stack.push(...node.children);
  }
  return result.sort((a, b) => Date.parse(a.node.entry.timestamp) - Date.parse(b.node.entry.timestamp));
}

export function groupLiveDocThreadsByDoc(
  threads: LiveDocThreadDescriptor[],
): Map<string, LiveDocThreadDescriptor[]> {
  const grouped = new Map<string, LiveDocThreadDescriptor[]>();
  for (const thread of threads) {
    const current = grouped.get(thread.docId) ?? [];
    current.push(thread);
    grouped.set(thread.docId, current);
  }
  return grouped;
}

export function findActiveLiveDocThread(threads: LiveDocThreadDescriptor[], leafId: string | null): LiveDocThreadDescriptor | null {
  return threads.find((thread) => contains(thread.node, leafId)) ?? null;
}
