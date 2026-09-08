import { UUIDsEqual } from '@memberjunction/global';

export interface ArtifactVersionRef {
  artifactId: string;
  versionNumber: number;
}

export type ArtifactPanelAction =
  | { kind: 'none' }
  | { kind: 'open'; artifactId: string; versionNumber: number }
  | { kind: 'refresh'; artifactId: string; versionNumber: number };

/** artifactId → highest version number seen. Keys are compared as UUIDs (case-insensitive). */
export function snapshotArtifactVersions(refs: Iterable<ArtifactVersionRef>): Map<string, number> {
  const latest = new Map<string, number>();
  for (const ref of refs) {
    const key = findKey(latest, ref.artifactId) ?? ref.artifactId;
    latest.set(key, Math.max(latest.get(key) ?? 0, ref.versionNumber));
  }
  return latest;
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
 */
export function decideArtifactPanelAction(input: {
  panelOpen: boolean;
  selectedArtifactId: string | null;
  before: Map<string, number>;
  after: ArtifactVersionRef[];
}): ArtifactPanelAction {
  const after = snapshotArtifactVersions(input.after);
  const entries = [...after.entries()];

  const created = entries.filter(([id]) => findKey(input.before, id) === undefined);
  if (created.length > 0) {
    const [artifactId, versionNumber] = created[created.length - 1];
    return { kind: 'open', artifactId, versionNumber };
  }

  const bumped = entries.filter(([id, version]) => version > (input.before.get(findKey(input.before, id) ?? id) ?? 0));
  if (bumped.length === 0 || !input.panelOpen) return { kind: 'none' };

  const shown = bumped.find(([id]) => UUIDsEqual(id, input.selectedArtifactId));
  if (shown) return { kind: 'refresh', artifactId: shown[0], versionNumber: shown[1] };

  const [artifactId, versionNumber] = bumped[bumped.length - 1];
  return { kind: 'open', artifactId, versionNumber };
}

function findKey(map: Map<string, number>, id: string): string | undefined {
  for (const key of map.keys()) {
    if (UUIDsEqual(key, id)) return key;
  }
  return undefined;
}
