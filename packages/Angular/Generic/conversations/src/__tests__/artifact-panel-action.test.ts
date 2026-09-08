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

  /**
   * An artifact can enter the chat area's map without anything having been created: a conversation
   * switch leaves the previous conversation's artifacts in place until the rebuild lands, and
   * paging up merges in artifacts from older messages. `baselineComparable: false` is how the
   * caller says the two snapshots describe different populations, and a creation must NOT be
   * inferred from that — it would open a months-old artifact AND suppress the refresh of the one
   * actually on screen, because a creation outranks a bump.
   */
  describe('an untrustworthy baseline', () => {
    it('does NOT treat arriving artifacts as created', () => {
      const before = snapshotArtifactVersions([ref('OLD-CONVERSATION-ARTIFACT', 4)]);
      expect(decideArtifactPanelAction({
        panelOpen: false,
        selectedArtifactId: null,
        before,
        after: [ref('B', 1), ref('C', 7)],
        baselineComparable: false,
      })).toEqual({ kind: 'none' });
    });

    it('still refreshes the SHOWN artifact when it demonstrably gained a version', () => {
      // Present in both snapshots with a higher version — self-corroborating, so no baseline needed.
      const before = snapshotArtifactVersions([ref('A', 2)]);
      expect(decideArtifactPanelAction({
        panelOpen: true,
        selectedArtifactId: 'A',
        before,
        after: [ref('A', 3), ref('B', 1)],
        baselineComparable: false,
      })).toEqual({ kind: 'refresh', artifactId: 'A', versionNumber: 3 });
    });

    it('does NOT retarget to another artifact that gained a version', () => {
      const before = snapshotArtifactVersions([ref('A', 2), ref('C', 1)]);
      expect(decideArtifactPanelAction({
        panelOpen: true,
        selectedArtifactId: 'A',
        before,
        after: [ref('A', 2), ref('C', 2)],
        baselineComparable: false,
      })).toEqual({ kind: 'none' });
    });
  });

  /**
   * Two completion handlers run per turn, each holding its own pre-turn snapshot, and the slower
   * one can resolve a second after the user has clicked a different artifact card. The user's
   * choice wins.
   */
  describe('the user changed the selection mid-turn', () => {
    it('does not steal the panel, even for a genuine creation', () => {
      const before = snapshotArtifactVersions([ref('A', 1)]);
      expect(decideArtifactPanelAction({
        panelOpen: true,
        selectedArtifactId: 'A',
        before,
        after: [ref('A', 1), ref('B', 1)],
        userChangedSelection: true,
      })).toEqual({ kind: 'none' });
    });

    it('still opens a genuine creation when the user CLOSED the panel (nothing to displace)', () => {
      const before = snapshotArtifactVersions([ref('A', 1)]);
      expect(decideArtifactPanelAction({
        panelOpen: false,
        selectedArtifactId: null,
        before,
        after: [ref('A', 1), ref('B', 1)],
        userChangedSelection: true,
      })).toEqual({ kind: 'open', artifactId: 'B', versionNumber: 1 });
    });

    it('still refreshes whatever the user is now looking at when it gained a version', () => {
      const before = snapshotArtifactVersions([ref('A', 1), ref('B', 1)]);
      expect(decideArtifactPanelAction({
        panelOpen: true,
        selectedArtifactId: 'B',
        before,
        after: [ref('A', 1), ref('B', 2)],
        userChangedSelection: true,
      })).toEqual({ kind: 'refresh', artifactId: 'B', versionNumber: 2 });
    });
  });

  describe('choosing between several new artifacts', () => {
    const at = (artifactId: string, versionNumber: number, iso: string) =>
      ({ artifactId, versionNumber, versionCreatedAt: new Date(iso) });

    it('opens the one whose version landed most recently, not the one listed last', () => {
      const before = snapshotArtifactVersions([]);
      expect(decideArtifactPanelAction({
        panelOpen: false,
        selectedArtifactId: null,
        before,
        // Listed oldest-last: map insertion order is the order conversation details were iterated,
        // which carries no recency information at all.
        after: [at('NEWER', 1, '2026-09-08T12:00:00Z'), at('OLDER', 1, '2026-09-01T09:00:00Z')],
      })).toEqual({ kind: 'open', artifactId: 'NEWER', versionNumber: 1 });
    });

    it('falls back to the last one seen when no timestamps are available', () => {
      const before = snapshotArtifactVersions([]);
      expect(decideArtifactPanelAction({
        panelOpen: false,
        selectedArtifactId: null,
        before,
        after: [ref('FIRST', 1), ref('LAST', 1)],
      })).toEqual({ kind: 'open', artifactId: 'LAST', versionNumber: 1 });
    });
  });
});
