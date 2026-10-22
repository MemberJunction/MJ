/**
 * Artifact-grouping utilities for rendering a message's attached artifacts.
 *
 * A single conversation message can carry more than one DISTINCT artifact — for
 * example a research report PLUS a standalone generated infographic. The UI must
 * surface all of them. At the same time, a single artifact can have multiple
 * versions, and only the latest should render. This helper reconciles both.
 */

import { NormalizeUUID } from '@memberjunction/global';

/** Minimal shape needed to dedupe and chronologically order artifacts — satisfied by `LazyArtifactInfo`. */
export interface DistinctArtifactKey {
  artifactId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  versionNumber: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  versionCreatedAt?: Date | string | null;
}

/**
 * Collapses a message's artifact list to one entry per distinct `artifactId`,
 * keeping the highest `versionNumber` for each. Distinct artifacts are all
 * retained (so a report and an image both surface); multiple versions of the
 * SAME artifact collapse to the latest.
 *
 * When `versionCreatedAt` timestamps are present on the latest versions, the
 * resulting distinct artifacts are ordered chronologically (`versionCreatedAt`
 * ascending) so multi-step workflow outputs render in creation order with the
 * final deliverable last. When timestamps are absent or equal, first-seen input
 * order is preserved.
 *
 * Ids are grouped as UUIDs, not as raw strings: SQL Server returns them upper-case and PostgreSQL
 * lower-case, so a list assembled from differently-cased sources would otherwise render the same
 * artifact as two cards.
 *
 * Related but NOT interchangeable: `snapshotArtifactVersions` in `artifact-panel-action.ts` reduces
 * the whole conversation to id → max version for a before/after diff. This one is per-message and
 * returns the objects themselves.
 */
export function SelectDistinctLatestArtifacts<T extends DistinctArtifactKey>(list: readonly T[]): T[] {
  const latestByArtifact = new Map<string, { item: T; firstSeenIndex: number }>();
  let index = 0;
  for (const info of list) {
    const key = NormalizeUUID(info.artifactId);
    const existing = latestByArtifact.get(key);
    if (!existing) {
      latestByArtifact.set(key, { item: info, firstSeenIndex: index });
    } else if (info.versionNumber > existing.item.versionNumber) {
      latestByArtifact.set(key, { item: info, firstSeenIndex: existing.firstSeenIndex });
    }
    index++;
  }
  const entries = Array.from(latestByArtifact.values());
  entries.sort((a, b) => {
    const aTime = a.item.versionCreatedAt ? new Date(a.item.versionCreatedAt).getTime() : NaN;
    const bTime = b.item.versionCreatedAt ? new Date(b.item.versionCreatedAt).getTime() : NaN;
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    return a.firstSeenIndex - b.firstSeenIndex;
  });
  return entries.map((e) => e.item);
}

/** @deprecated Use {@link SelectDistinctLatestArtifacts}. */
export function selectDistinctLatestArtifacts<T extends DistinctArtifactKey>(list: readonly T[]): T[] {
  return SelectDistinctLatestArtifacts(list);
}
