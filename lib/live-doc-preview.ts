import type { LiveDocRevision, LiveDocSection } from "./live-docs";

export interface LiveDocRevisionPreview {
  sections: LiveDocSection[];
  changedSectionIds: Set<string>;
}

/**
 * Compare the current head with a hovered snapshot. Modified sections show the
 * hovered content, while sections added since that snapshot remain visible so
 * they can be highlighted as additions. Sections removed since the snapshot
 * are reinserted near their historical position for the preview.
 */
export function buildLiveDocRevisionPreview(
  head: LiveDocRevision,
  target?: LiveDocRevision,
): LiveDocRevisionPreview {
  if (!target || target.id === head.id) {
    return { sections: head.sections, changedSectionIds: new Set() };
  }

  const headById = new Map(head.sections.map((section) => [section.id, section]));
  const targetById = new Map(target.sections.map((section) => [section.id, section]));
  const changedSectionIds = new Set<string>();

  for (const section of head.sections) {
    const historical = targetById.get(section.id);
    if (!historical || historical.markdown !== section.markdown) changedSectionIds.add(section.id);
  }
  for (const section of target.sections) {
    if (!headById.has(section.id)) changedSectionIds.add(section.id);
  }

  const sections = head.sections.map((section) => {
    const historical = targetById.get(section.id);
    return historical && historical.markdown !== section.markdown ? historical : section;
  });

  // Reinsert sections that existed in the hovered snapshot but have since been
  // removed, keeping them beside the nearest surviving historical neighbor.
  for (let targetIndex = 0; targetIndex < target.sections.length; targetIndex += 1) {
    const section = target.sections[targetIndex];
    if (headById.has(section.id)) continue;
    const previousIds = target.sections.slice(0, targetIndex).map((item) => item.id).reverse();
    const previousIndex = sections.findLastIndex((item) => previousIds.includes(item.id));
    if (previousIndex >= 0) sections.splice(previousIndex + 1, 0, section);
    else {
      const nextIds = new Set(target.sections.slice(targetIndex + 1).map((item) => item.id));
      const nextIndex = sections.findIndex((item) => nextIds.has(item.id));
      sections.splice(nextIndex >= 0 ? nextIndex : sections.length, 0, section);
    }
  }

  return { sections, changedSectionIds };
}
