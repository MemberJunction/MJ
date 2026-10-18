import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import { DecideArtifactPanelAction, SnapshotArtifactVersions } from '../lib/utils/artifact-panel-action';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MAIN_OPEN_VIEW } from '../lib/utils/conversation-forks';

/**
 * #529: with the panel open on artifact A, a NEW artifact B must open (build), a bumped version
 * of A refreshes, and a bumped version of another existing artifact C switches to C (retargeting).
 * Panel closed + version bump stays quiet, matching the historical behavior.
 */
describe('decideArtifactPanelAction', () => {
  const ref = (artifactId: string, versionNumber: number) => ({ artifactId, versionNumber });

  it('opens a brand-new artifact even when the panel is open on another one', () => {
    const before = SnapshotArtifactVersions([ref('A', 2)]);
    const action = DecideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 2), ref('B', 1)] });
    expect(action).toEqual({ kind: 'open', artifactId: 'B', versionNumber: 1 });
  });

  it('opens a brand-new artifact when the panel is closed', () => {
    const before = SnapshotArtifactVersions([]);
    expect(DecideArtifactPanelAction({ panelOpen: false, selectedArtifactId: null, before, after: [ref('A', 1)] }))
      .toEqual({ kind: 'open', artifactId: 'A', versionNumber: 1 });
  });

  it('refreshes when the SHOWN artifact gained a version', () => {
    const before = SnapshotArtifactVersions([ref('A', 2), ref('C', 1)]);
    expect(DecideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 2), ref('A', 3), ref('C', 1)] }))
      .toEqual({ kind: 'refresh', artifactId: 'A', versionNumber: 3 });
  });

  it('switches to ANOTHER existing artifact that gained a version (retargeting)', () => {
    const before = SnapshotArtifactVersions([ref('A', 2), ref('C', 1)]);
    expect(DecideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 2), ref('C', 1), ref('C', 2)] }))
      .toEqual({ kind: 'open', artifactId: 'C', versionNumber: 2 });
  });

  it('stays quiet on a version bump when the panel is closed', () => {
    const before = SnapshotArtifactVersions([ref('A', 1)]);
    expect(DecideArtifactPanelAction({ panelOpen: false, selectedArtifactId: null, before, after: [ref('A', 1), ref('A', 2)] }))
      .toEqual({ kind: 'none' });
  });

  it('does nothing when nothing changed', () => {
    const before = SnapshotArtifactVersions([ref('A', 1)]);
    expect(DecideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 1)] })).toEqual({ kind: 'none' });
  });

  it('compares artifact ids case-insensitively (UUIDs)', () => {
    const before = SnapshotArtifactVersions([ref('abc-1', 1)]);
    expect(DecideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'ABC-1', before, after: [ref('ABC-1', 1), ref('ABC-1', 2)] }))
      .toEqual({ kind: 'refresh', artifactId: 'ABC-1', versionNumber: 2 });
  });

  it('prefers a CREATED artifact over a bumped one when a run does both', () => {
    const before = SnapshotArtifactVersions([ref('A', 1)]);
    expect(DecideArtifactPanelAction({ panelOpen: true, selectedArtifactId: 'A', before, after: [ref('A', 1), ref('A', 2), ref('B', 1)] }))
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
      const before = SnapshotArtifactVersions([ref('OLD-CONVERSATION-ARTIFACT', 4)]);
      expect(DecideArtifactPanelAction({
        panelOpen: false,
        selectedArtifactId: null,
        before,
        after: [ref('B', 1), ref('C', 7)],
        baselineComparable: false,
      })).toEqual({ kind: 'none' });
    });

    it('still refreshes the SHOWN artifact when it demonstrably gained a version', () => {
      // Present in both snapshots with a higher version — self-corroborating, so no baseline needed.
      const before = SnapshotArtifactVersions([ref('A', 2)]);
      expect(DecideArtifactPanelAction({
        panelOpen: true,
        selectedArtifactId: 'A',
        before,
        after: [ref('A', 3), ref('B', 1)],
        baselineComparable: false,
      })).toEqual({ kind: 'refresh', artifactId: 'A', versionNumber: 3 });
    });

    it('does NOT retarget to another artifact that gained a version', () => {
      const before = SnapshotArtifactVersions([ref('A', 2), ref('C', 1)]);
      expect(DecideArtifactPanelAction({
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
      const before = SnapshotArtifactVersions([ref('A', 1)]);
      expect(DecideArtifactPanelAction({
        panelOpen: true,
        selectedArtifactId: 'A',
        before,
        after: [ref('A', 1), ref('B', 1)],
        userChangedSelection: true,
      })).toEqual({ kind: 'none' });
    });

    it('still opens a genuine creation when the user CLOSED the panel (nothing to displace)', () => {
      const before = SnapshotArtifactVersions([ref('A', 1)]);
      expect(DecideArtifactPanelAction({
        panelOpen: false,
        selectedArtifactId: null,
        before,
        after: [ref('A', 1), ref('B', 1)],
        userChangedSelection: true,
      })).toEqual({ kind: 'open', artifactId: 'B', versionNumber: 1 });
    });

    it('still refreshes whatever the user is now looking at when it gained a version', () => {
      const before = SnapshotArtifactVersions([ref('A', 1), ref('B', 1)]);
      expect(DecideArtifactPanelAction({
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
      const before = SnapshotArtifactVersions([]);
      expect(DecideArtifactPanelAction({
        panelOpen: false,
        selectedArtifactId: null,
        before,
        // Listed oldest-last: map insertion order is the order conversation details were iterated,
        // which carries no recency information at all.
        after: [at('NEWER', 1, '2026-09-08T12:00:00Z'), at('OLDER', 1, '2026-09-01T09:00:00Z')],
      })).toEqual({ kind: 'open', artifactId: 'NEWER', versionNumber: 1 });
    });

    it('falls back to the last one seen when no timestamps are available', () => {
      const before = SnapshotArtifactVersions([]);
      expect(DecideArtifactPanelAction({
        panelOpen: false,
        selectedArtifactId: null,
        before,
        after: [ref('FIRST', 1), ref('LAST', 1)],
      })).toEqual({ kind: 'open', artifactId: 'LAST', versionNumber: 1 });
    });
  });
});

describe('ConversationChatAreaComponent artifact auto-open across resetComponentState', () => {
  function createChatAreaHarness(conversationId: string): {
    component: ConversationChatAreaComponent;
    open: Record<string, unknown>;
  } {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;

    open['_conversationId'] = conversationId;
    open['openView'] = MAIN_OPEN_VIEW;
    open['windowView'] = MAIN_OPEN_VIEW;
    open['conversationLoadToken'] = 1;
    open['lastLoadedConversationId'] = null;
    open['artifactMapConversationId'] = null;
    open['artifactMapGeneration'] = 0;
    open['artifactSelectionEpoch'] = 0;
    open['ShowArtifactPanel'] = false;
    open['SelectedArtifactId'] = null;
    open['SelectedVersionNumber'] = undefined;
    open['ShowSystemArtifacts'] = false;
    open['AgentRunsByDetailId'] = new Map();
    open['ArtifactsByDetailId'] = new Map();
    open['SystemArtifactsByDetailId'] = new Map();
    open['RatingsByDetailId'] = new Map();
    open['AttachmentsByDetailId'] = new Map();
    open['ArtifactViewerRefresh$'] = new Subject();
    open['messages'] = [];
    open['cdr'] = { detectChanges: vi.fn(), markForCheck: vi.fn() };
    open['attachmentService'] = {
      loadAttachmentsForMessages: vi.fn(async () => new Map()),
    };
    open['loadRealtimeSessionMeta'] = vi.fn(async () => undefined);
    open['loadArtifactPermissions'] = vi.fn(async () => undefined);
    open['followTranscript'] = vi.fn();
    open['windowStore'] = {
      ApplyLocalDetail: vi.fn(),
      GetSnapshot: vi.fn(() => ({
        Details: [],
        AgentRunsByDetailId: new Map(),
        ArtifactsByDetailId: new Map(),
        RatingsByDetailId: new Map(),
      })),
    };

    return { component, open };
  }

  it('auto-opens a newly created artifact on OnAgentResponse even after resetComponentState zeroes lastLoadedConversationId', async () => {
    const { component, open } = createChatAreaHarness('CONV-1');

    // 1. Initial peripheral load populates CONV-1 with 0 artifacts
    await (open['loadPeripheralData'] as (id: string, snap: unknown) => Promise<void>).call(
      component,
      'CONV-1',
      {
        Details: [],
        AgentRunsByDetailId: new Map(),
        ArtifactsByDetailId: new Map(),
        RatingsByDetailId: new Map(),
      }
    );
    expect(open['lastLoadedConversationId']).toBe('CONV-1');
    expect(open['artifactMapConversationId']).toBe('CONV-1');

    // 2. Sending a user message calls resetComponentState('CONV-1'), which zeroes lastLoadedConversationId
    (open['resetComponentState'] as (id: string) => void).call(component, 'CONV-1');
    expect(open['lastLoadedConversationId']).toBeNull();
    expect(open['artifactMapConversationId']).toBe('CONV-1');

    // 3. Agent responds and reloadArtifactsForMessage populates the new artifact
    open['reloadArtifactsForMessage'] = vi.fn(async () => {
      component.ArtifactsByDetailId.set('DETAIL-2', [
        {
          conversationDetailId: 'DETAIL-2',
          artifactId: 'ART-NEW-1',
          versionId: 'VER-1',
          versionNumber: 1,
          name: 'Generated Report',
          type: 'Markdown',
          visibility: 'Always',
          direction: 'Output',
          versionCreatedAt: new Date('2026-10-18T12:00:00Z'),
        },
      ]);
    });

    await component.OnAgentResponse({
      message: {
        ID: 'DETAIL-2',
        ConversationID: 'CONV-1',
        BranchID: null,
        ReplacedAt: null,
      } as never,
      agentResult: {},
    });

    expect(component.ShowArtifactPanel).toBe(true);
    expect(component.SelectedArtifactId).toBe('ART-NEW-1');
    expect(component.SelectedVersionNumber).toBe(1);
  });

  it('auto-opens a newly created artifact on OnArtifactCreated after OnMessageSent invalidated lastLoadedConversationId', async () => {
    const { component, open } = createChatAreaHarness('CONV-1');

    // Initial load of CONV-1
    await (open['loadPeripheralData'] as (id: string, snap: unknown) => Promise<void>).call(
      component,
      'CONV-1',
      {
        Details: [],
        AgentRunsByDetailId: new Map(),
        ArtifactsByDetailId: new Map(),
        RatingsByDetailId: new Map(),
      }
    );

    // User sends message -> resetComponentState zeroes lastLoadedConversationId
    (open['resetComponentState'] as (id: string) => void).call(component, 'CONV-1');
    expect(open['lastLoadedConversationId']).toBeNull();

    // Agent finishes and emits ArtifactCreated
    open['reloadArtifactsForMessage'] = vi.fn(async () => {
      component.ArtifactsByDetailId.set('DETAIL-3', [
        {
          conversationDetailId: 'DETAIL-3',
          artifactId: 'ART-NEW-2',
          versionId: 'VER-1',
          versionNumber: 1,
          name: 'Quarterly Chart',
          type: 'Component',
          visibility: 'Always',
          direction: 'Output',
          versionCreatedAt: new Date('2026-10-18T12:05:00Z'),
        },
      ]);
    });

    await component.OnArtifactCreated({
      conversationId: 'CONV-1',
      conversationDetailId: 'DETAIL-3',
      artifactId: '',
      versionId: '',
      versionNumber: 0,
      name: '',
    });

    expect(component.ShowArtifactPanel).toBe(true);
    expect(component.SelectedArtifactId).toBe('ART-NEW-2');
    expect(component.SelectedVersionNumber).toBe(1);
  });

  it('still treats baseline as non-comparable when switching to CONV-2 while ArtifactsByDetailId still holds CONV-1', async () => {
    const { component, open } = createChatAreaHarness('CONV-1');

    // Load CONV-1 with an artifact
    component.ArtifactsByDetailId.set('DETAIL-1', [
      {
        conversationDetailId: 'DETAIL-1',
        artifactId: 'ART-CONV-1',
        versionId: 'VER-1',
        versionNumber: 1,
        name: 'Conv 1 Doc',
        type: 'Markdown',
        visibility: 'Always',
        direction: 'Output',
      },
    ]);
    open['artifactMapConversationId'] = 'CONV-1';

    // Switch active conversation ID to CONV-2 before CONV-2's loadPeripheralData runs
    open['_conversationId'] = 'CONV-2';
    const baseline = (open['snapshotArtifactPanelBaseline'] as () => unknown).call(component);

    // Now CONV-2's historical artifact arrives in the map
    component.ArtifactsByDetailId.clear();
    component.ArtifactsByDetailId.set('DETAIL-99', [
      {
        conversationDetailId: 'DETAIL-99',
        artifactId: 'ART-CONV-2-HISTORICAL',
        versionId: 'VER-99',
        versionNumber: 3,
        name: 'Old Conv 2 Doc',
        type: 'Markdown',
        visibility: 'Always',
        direction: 'Output',
      },
    ]);
    open['artifactMapConversationId'] = 'CONV-2';

    await (open['decideAndApplyArtifactPanel'] as (b: unknown, c: string) => Promise<void>).call(
      component,
      baseline,
      'CONV-2'
    );

    // Must NOT open CONV-2's historical artifact because baseline.MapConversationId was 'CONV-1'
    expect(component.ShowArtifactPanel).toBe(false);
    expect(component.SelectedArtifactId).toBeNull();
  });
});

