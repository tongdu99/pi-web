import type { LiveDocRevision, LiveDocSection } from "./live-docs";

export interface LiveDocRevisionPreview {
  sections: LiveDocSection[];
  changedSectionIds: Set<string>;
}

/** Find the snapshot immediately newer than a target in a newest-first list. */
export function findAdjacentNewerRevision(
  revisions: LiveDocRevision[],
  newestFirstRevisionIds: string[],
  targetRevisionId: string,
): LiveDocRevision | undefined {
  const targetIndex = newestFirstRevisionIds.indexOf(targetRevisionId);
  if (targetIndex <= 0) return undefined;
  const newerRevisionId = newestFirstRevisionIds[targetIndex - 1];
  return revisions.find((revision) => revision.id === newerRevisionId);
}

/**
 * Compare a hovered snapshot with a newer comparison snapshot. Modified
 * sections show the hovered content, while sections added in the newer
 * snapshot remain visible so they can be highlighted as additions. Sections
 * removed from the newer snapshot are reinserted near their historical
 * position for the preview.
 */
export function buildLiveDocRevisionPreview(
  comparison: LiveDocRevision,
  target?: LiveDocRevision,
): LiveDocRevisionPreview {
  if (!target || target.id === comparison.id) {
    return { sections: comparison.sections, changedSectionIds: new Set() };
  }

  const comparisonById = new Map(comparison.sections.map((section) => [section.id, section]));
  const targetById = new Map(target.sections.map((section) => [section.id, section]));
  const changedSectionIds = new Set<string>();

  for (const section of comparison.sections) {
    const historical = targetById.get(section.id);
    if (!historical || historical.markdown !== section.markdown) changedSectionIds.add(section.id);
  }
  for (const section of target.sections) {
    if (!comparisonById.has(section.id)) changedSectionIds.add(section.id);
  }

  const sections = comparison.sections.map((section) => {
    const historical = targetById.get(section.id);
    return historical && historical.markdown !== section.markdown ? historical : section;
  });

  // Reinsert sections that existed in the hovered snapshot but have since been
  // removed, keeping them beside the nearest surviving historical neighbor.
  for (let targetIndex = 0; targetIndex < target.sections.length; targetIndex += 1) {
    const section = target.sections[targetIndex];
    if (comparisonById.has(section.id)) continue;
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
