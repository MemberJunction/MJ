import { describe, it, expect } from 'vitest';
import { decideArtifactPanelAction, snapshotArtifactVersions } from '../lib/utils/artifact-panel-action';

/**
 * #529: with the panel open on artifact A, a NEW artifact B must open (build), a bumped version
 * of A refreshes, and a bumped version of another existing artifact C switches to C (retargeting).
 * Panel closed + version bump stays quiet, matching the historical behavior.
 */
describe('decideArtifactPanelAction', () => {
  const ref = (artifactId: string, versionNumber: number) => ({ artifactId, versionNumber });

  it('opens a brand-new artifact even when the panel is open on another one', () => {
    const before = snapshotArtifactVersions([ref('A', 2)]);
    const action = decideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 2), ref('B', 1)] });
    expect(action).toEqual({ kind: 'open', artifactId: 'B', versionNumber: 1 });
  });

  it('opens a brand-new artifact when the panel is closed', () => {
    const before = snapshotArtifactVersions([]);
    expect(decideArtifactPanelAction({ panelOpen: false, selectedArtifactId: null, before, after: [ref('A', 1)] }))
      .toEqual({ kind: 'open', artifactId: 'A', versionNumber: 1 });
  });

  it('refreshes when the SHOWN artifact gained a version', () => {
    const before = snapshotArtifactVersions([ref('A', 2), ref('C', 1)]);
    expect(decideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 2), ref('A', 3), ref('C', 1)] }))
      .toEqual({ kind: 'refresh', artifactId: 'A', versionNumber: 3 });
  });

  it('switches to ANOTHER existing artifact that gained a version (retargeting)', () => {
    const before = snapshotArtifactVersions([ref('A', 2), ref('C', 1)]);
    expect(decideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 2), ref('C', 1), ref('C', 2)] }))
      .toEqual({ kind: 'open', artifactId: 'C', versionNumber: 2 });
  });

  it('stays quiet on a version bump when the panel is closed', () => {
    const before = snapshotArtifactVersions([ref('A', 1)]);
    expect(decideArtifactPanelAction({ panelOpen: false, selectedArtifactId: null, before, after: [ref('A', 1), ref('A', 2)] }))
      .toEqual({ kind: 'none' });
  });

  it('does nothing when nothing changed', () => {
    const before = snapshotArtifactVersions([ref('A', 1)]);
    expect(decideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 1)] })).toEqual({ kind: 'none' });
  });

  it('compares artifact ids case-insensitively (UUIDs)', () => {
    const before = snapshotArtifactVersions([ref('abc-1', 1)]);
    expect(decideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'ABC-1', before, after: [ref('ABC-1', 1), ref('ABC-1', 2)] }))
      .toEqual({ kind: 'refresh', artifactId: 'ABC-1', versionNumber: 2 });
  });

  it('prefers a CREATED artifact over a bumped one when a run does both', () => {
    const before = snapshotArtifactVersions([ref('A', 1)]);
    expect(decideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 1), ref('A', 2), ref('B', 1)] }))
      .toEqual({ kind: 'open', artifactId: 'B', versionNumber: 1 });
  });
});
