export function liveDocSectionPreview(markdown: string, maxLength = 48): string {
  const normalized = markdown
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+] |\d+[.)]\s+)/gm, "")
    .replace(/[`*_~>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Selected section";
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}…`
    : normalized;
}

export function liveDocConversationLabel(docTitle: string, selectedMarkdown: string): string {
  return `${docTitle} › ${liveDocSectionPreview(selectedMarkdown)}`;
}
