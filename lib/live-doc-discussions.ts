import type { SessionTreeNode } from "./types";
import { liveDocSectionPreview } from "./live-doc-target";

export const LIVE_DOC_THREAD_CUSTOM_TYPE = "pi-web.live-doc-thread";
export const LIVE_DOC_CONTEXT_CUSTOM_TYPE = "pi-web.live-doc-context";

export interface LiveDocThreadMetadata {
  version: 1;
  docId: string;
  sectionId: string;
  sectionLabel: string;
  selectedText: string;
  hostLeafId: string | null;
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
  return {
    version: 1,
    docId: value.docId,
    sectionId: value.sectionId,
    sectionLabel: typeof value.sectionLabel === "string" && value.sectionLabel.trim()
      ? value.sectionLabel.trim()
      : liveDocSectionPreview(value.selectedText),
    selectedText: value.selectedText,
    hostLeafId: value.hostLeafId,
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
  return result;
}

export function findActiveLiveDocThread(threads: LiveDocThreadDescriptor[], leafId: string | null): LiveDocThreadDescriptor | null {
  return threads.find((thread) => contains(thread.node, leafId)) ?? null;
}
