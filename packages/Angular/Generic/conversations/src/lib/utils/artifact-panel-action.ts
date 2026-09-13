import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

export interface ArtifactVersionRef {
  artifactId: string;
  versionNumber: number;
  /**
   * When that version row was created. Used ONLY to order candidates against each other, never
   * compared against the client clock — the values come from one database, so their relative
   * order is meaningful even though the absolute offset from the browser's clock is not.
   */
  versionCreatedAt?: Date | null;
}

/**
 * What the chat area records before a turn so it can later tell whether the artifact population
 * changed BECAUSE of that turn. See `snapshotArtifactPanelBaseline` in the chat area for why the
 * version map on its own is not a sufficient baseline.
 */
export interface ArtifactPanelBaseline {
  /** artifactId → highest version, from {@link snapshotArtifactVersions}. */
  versions: Map<string, number>;
  /** The conversation on screen when the snapshot was taken. */
  conversationId: string | null;
  /** The conversation whose artifacts the map was actually holding, or null if none had loaded. */
  mapConversationId: string | null;
  /** Paging-merge counter at snapshot time. */
  mapGeneration: number;
  /** User-selection counter at snapshot time. */
  selectionEpoch: number;
}

export type ArtifactPanelAction =
  | { kind: 'none' }
  | { kind: 'open'; artifactId: string; versionNumber: number }
  | { kind: 'refresh'; artifactId: string; versionNumber: number };

/** The highest version seen for one artifact, and when it landed. */
interface LatestVersion {
  /**
   * The id AS IT APPEARED in the input, not the normalized lookup key. Ids are matched
   * case-insensitively but handed back untouched, so nothing downstream sees an id in a different
   * case than the row it came from.
   */
  artifactId: string;
  versionNumber: number;
  versionCreatedAt?: Date | null;
}

/**
 * artifactId → highest version number seen.
 *
 * Keys are NORMALIZED UUIDs, so lookups are case-insensitive by construction (SQL Server returns
 * upper case, PostgreSQL lower) at O(1) rather than by scanning every key for a `UUIDsEqual` hit.
 */
export function snapshotArtifactVersions(refs: Iterable<ArtifactVersionRef>): Map<string, number> {
  const latest = new Map<string, number>();
  for (const ref of refs) {
    const key = NormalizeUUID(ref.artifactId);
    latest.set(key, Math.max(latest.get(key) ?? 0, ref.versionNumber));
  }
  return latest;
}

/** Same reduction as {@link snapshotArtifactVersions}, keeping the timestamp for ordering. */
function latestByArtifact(refs: Iterable<ArtifactVersionRef>): Map<string, LatestVersion> {
  const latest = new Map<string, LatestVersion>();
  for (const ref of refs) {
    const key = NormalizeUUID(ref.artifactId);
    const existing = latest.get(key);
    if (!existing || ref.versionNumber > existing.versionNumber) {
      latest.set(key, { artifactId: ref.artifactId, versionNumber: ref.versionNumber, versionCreatedAt: ref.versionCreatedAt });
    }
  }
  return latest;
}

/** Newest first, with an absent timestamp sorting last so a real date always wins. */
function newestFirst(a: [string, LatestVersion], b: [string, LatestVersion]): number {
  const at = a[1].versionCreatedAt ? new Date(a[1].versionCreatedAt).getTime() : Number.NEGATIVE_INFINITY;
  const bt = b[1].versionCreatedAt ? new Date(b[1].versionCreatedAt).getTime() : Number.NEGATIVE_INFINITY;
  return bt - at;
}

/**
 * The best candidate among several: newest version wins, and ties break toward the one seen LAST,
 * which is what the previous "take the final map entry" rule did. `sort` is stable, so reversing
 * first is what makes equal timestamps resolve that way rather than the opposite.
 */
function bestCandidate(entries: Array<[string, LatestVersion]>): LatestVersion {
  return [...entries].reverse().sort(newestFirst)[0][1];
}

/**
 * Decide what the artifact panel should do after an agent run, from a before/after diff of
 * artifact versions across the whole conversation:
 *  - a NEW artifact opens, whether or not the panel is open (a `build` in a conversation that
 *    already had a component — #529);
 *  - a bumped version of the SHOWN artifact refreshes it;
 *  - a bumped version of ANOTHER existing artifact switches the panel to it (retargeting);
 *  - a version bump with the panel closed does nothing (historical behavior).
 *
 * A creation always wins over a bump: when one run both creates an artifact and versions the shown
 * one, the new artifact opens, because a `build` must surface rather than stay hidden behind it.
 *
 * ## Why "absent from `before`" is not on its own enough
 *
 * `before` and `after` are snapshots of a map the component rebuilds for other reasons entirely,
 * so an artifact can enter it without anything having been created: switching conversations leaves
 * the previous conversation's artifacts in place until the rebuild lands, and paging up merges in
 * artifacts from older messages mid-turn. Either way every arriving artifact is absent from
 * `before`, and a set difference alone would open a months-old artifact and claim a run had just
 * built it — while ALSO short-circuiting the refresh of the artifact actually on screen, because a
 * creation outranks a bump. `baselineComparable` is how the caller reports that the two snapshots
 * describe the same population; when it is false, creations are not inferred at all and only the
 * shown artifact's own bump (an inference that needs no baseline, since it is corroborated by the
 * id being present in both snapshots) is acted on.
 *
 * @param input.panelOpen - Whether the artifact panel is currently open.
 * @param input.selectedArtifactId - The artifact currently displayed, if any.
 * @param input.before - Snapshot taken before the turn, from {@link snapshotArtifactVersions}.
 * @param input.after - Every artifact version known now.
 * @param input.baselineComparable - Defaults to true. False when `before` cannot be compared with
 *   `after` (the map was holding another conversation's artifacts, or a page of older messages
 *   merged in while the turn was in flight).
 * @param input.userChangedSelection - Defaults to false. True when the user picked or closed an
 *   artifact while the turn was in flight; the panel is then left where they put it.
 */
export function decideArtifactPanelAction(input: {
  panelOpen: boolean;
  selectedArtifactId: string | null;
  before: Map<string, number>;
  after: ArtifactVersionRef[];
  baselineComparable?: boolean;
  userChangedSelection?: boolean;
}): ArtifactPanelAction {
  const after = latestByArtifact(input.after);
  const entries = [...after.entries()];
  const baselineComparable = input.baselineComparable !== false;
  const userChangedSelection = input.userChangedSelection === true;

  // A bump is "this id was in both snapshots and its version went up" — self-corroborating, so it
  // survives an untrustworthy baseline.
  const bumped = entries.filter(([id, latest]) => {
    const previous = input.before.get(id);
    return previous !== undefined && latest.versionNumber > previous;
  });
  const shown = bumped.find(([, latest]) => UUIDsEqual(latest.artifactId, input.selectedArtifactId));

  // The user's own choice outranks the run's: refresh what they are looking at if it moved, but
  // never pull the panel onto something else underneath them.
  //
  // Only while the panel is OPEN, though. A closed panel is displacing nothing, so a run that
  // genuinely built something still surfaces it — suppressing that would break the very case this
  // feature exists for, and a user who closed the panel mid-run has expressed no preference about
  // an artifact that did not exist yet.
  if (userChangedSelection && input.panelOpen) {
    if (shown) {
      return { kind: 'refresh', artifactId: shown[1].artifactId, versionNumber: shown[1].versionNumber };
    }
    return { kind: 'none' };
  }

  if (baselineComparable) {
    const created = entries.filter(([id]) => !input.before.has(id));
    if (created.length > 0) {
      // Newest version wins. The previous "last entry" rule inherited map insertion order, which
      // is the order the component happened to iterate conversation details in — not recency.
      const latest = bestCandidate(created);
      return { kind: 'open', artifactId: latest.artifactId, versionNumber: latest.versionNumber };
    }
  }

  if (bumped.length === 0 || !input.panelOpen) return { kind: 'none' };

  if (shown) return { kind: 'refresh', artifactId: shown[1].artifactId, versionNumber: shown[1].versionNumber };

  // Retargeting: the run versioned some other artifact in this conversation. Only meaningful when
  // the two snapshots describe the same population.
  if (!baselineComparable) return { kind: 'none' };

  const latest = bestCandidate(bumped);
  return { kind: 'open', artifactId: latest.artifactId, versionNumber: latest.versionNumber };
}
