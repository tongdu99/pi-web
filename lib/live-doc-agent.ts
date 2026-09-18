import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { getLiveDoc, liveDocContent, updateLiveDoc } from "./live-docs";

export const LIVE_DOC_UPDATE_TOOL = "live_doc_update";

export interface ActiveLiveDocBinding {
  requestId: string;
  sessionId: string;
  docId: string;
  expectedRevisionId: string;
  sectionId?: string;
  selectedText?: string;
  sourceMarkdown?: string;
  discussionEntryId?: string;
  purpose: "merge-response" | "discussion";
}

const state = globalThis as typeof globalThis & {
  __piWebActiveLiveDocBindings?: Map<string, ActiveLiveDocBinding>;
};
const activeBindings = state.__piWebActiveLiveDocBindings ??= new Map<string, ActiveLiveDocBinding>();

export function setActiveLiveDocBinding(binding: ActiveLiveDocBinding): void {
  activeBindings.set(binding.sessionId, binding);
}

export function clearActiveLiveDocBinding(sessionId: string, requestId: string): void {
  if (activeBindings.get(sessionId)?.requestId === requestId) activeBindings.delete(sessionId);
}

export function getActiveLiveDocBinding(sessionId: string): ActiveLiveDocBinding | null {
  return activeBindings.get(sessionId) ?? null;
}

export async function buildLiveDocContext(binding: ActiveLiveDocBinding): Promise<string> {
  const doc = await getLiveDoc(binding.docId);
  if (!doc) throw new Error("Live Doc not found");
  if (!doc.sessionIds.includes(binding.sessionId)) throw new Error("Live Doc is not linked to this session");
  if (doc.headRevisionId !== binding.expectedRevisionId) {
    binding.expectedRevisionId = doc.headRevisionId;
  }
  const head = doc.revisions.find((revision) => revision.id === doc.headRevisionId)!;
  const section = binding.sectionId ? head.sections.find((candidate) => candidate.id === binding.sectionId) : undefined;
  if (binding.sectionId && !section) throw new Error("The selected Live Doc section no longer exists");

  return [
    "You are working in a Pi Web Live Update request.",
    `Live Doc: ${doc.title}`,
    `Live Doc ID: ${doc.id}`,
    `Current revision: ${doc.headRevisionId}`,
    binding.sectionId ? `Bound section ID: ${binding.sectionId}` : "Target: whole Live Doc",
    binding.selectedText ? `Selected quote:\n---\n${binding.selectedText}\n---` : "",
    binding.sourceMarkdown ? `Source assistant response to merge:\n---\n${binding.sourceMarkdown}\n---` : "",
    section ? `Current bound section:\n---\n${section.markdown}\n---` : "",
    `Current complete Live Doc:\n---\n${liveDocContent(doc)}\n---`,
    binding.purpose === "merge-response"
      ? "This is an explicit Add to Live Doc request. You must call live_doc_update exactly once with the complete merged document."
      : "Answer the user's request normally. When the discussion justifies a document change, call live_doc_update exactly once with the complete replacement Markdown for the bound section.",
    "Preserve useful existing content, organize it into coherent Markdown sections, and avoid duplicating information already present.",
    "An empty replacement removes a bound section. Do not claim an update succeeded until the tool confirms it.",
  ].filter(Boolean).join("\n\n");
}

export function createLiveDocUpdateTool() {
  return defineTool({
    name: LIVE_DOC_UPDATE_TOOL,
    label: "Update Live Doc",
    description: "Commit the requested replacement Markdown to the Live Doc bound by Pi Web. The destination is enforced by the host.",
    parameters: Type.Object({
      replacementMarkdown: Type.String({ description: "Complete replacement Markdown for the bound section or whole Live Doc" }),
      summary: Type.Optional(Type.String({ description: "Brief description of the revision" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      const sessionId = ctx.sessionManager.getSessionId();
      const binding = getActiveLiveDocBinding(sessionId);
      if (!binding) throw new Error("No active Live Doc update is bound to this run");
      const doc = await updateLiveDoc(binding.docId, {
        expectedRevisionId: binding.expectedRevisionId,
        replacementMarkdown: params.replacementMarkdown,
        ...(binding.sectionId ? { sectionId: binding.sectionId } : {}),
        requestId: binding.requestId,
        sessionId,
        ...(binding.discussionEntryId ? { discussionEntryId: binding.discussionEntryId } : {}),
        summary: params.summary ?? (binding.purpose === "merge-response" ? "Added assistant response" : "Live Update Discussion"),
      });
      binding.expectedRevisionId = doc.headRevisionId;
      return {
        content: [{ type: "text" as const, text: `Updated ${doc.title} (revision ${doc.headRevisionId}).` }],
        details: { docId: doc.id, revisionId: doc.headRevisionId, sectionId: binding.sectionId },
      };
    },
  });
}
