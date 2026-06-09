/**
 * Artifact-grouping utilities for rendering a message's attached artifacts.
 *
 * A single conversation message can carry more than one DISTINCT artifact — for
 * example a research report PLUS a standalone generated infographic. The UI must
 * surface all of them. At the same time, a single artifact can have multiple
 * versions, and only the latest should render. This helper reconciles both.
 */

/** Minimal shape needed to dedupe artifacts — satisfied by `LazyArtifactInfo`. */
export interface DistinctArtifactKey {
  artifactId: string;
  versionNumber: number;
}

/**
 * Collapses a message's artifact list to one entry per distinct `artifactId`,
 * keeping the highest `versionNumber` for each. Distinct artifacts are all
 * retained (so a report and an image both surface); multiple versions of the
 * SAME artifact collapse to the latest. Input order of distinct artifacts is
 * preserved (first-seen wins for ordering).
 */
export function selectDistinctLatestArtifacts<T extends DistinctArtifactKey>(list: readonly T[]): T[] {
  const latestByArtifact = new Map<string, T>();
  for (const info of list) {
    const existing = latestByArtifact.get(info.artifactId);
    if (!existing || info.versionNumber > existing.versionNumber) {
      latestByArtifact.set(info.artifactId, info);
    }
  }
  return Array.from(latestByArtifact.values());
}
