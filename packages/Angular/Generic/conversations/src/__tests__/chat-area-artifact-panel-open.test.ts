import '@angular/compiler';
import { EventEmitter } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import {
  BeforeArtifactPanelOpenEventArgs,
  AfterArtifactPanelOpenEventArgs,
} from '../lib/events/chat-events';
import { LazyArtifactInfo } from '../lib/models/lazy-artifact-info';

interface Harness {
  component: ConversationChatAreaComponent;
  before: BeforeArtifactPanelOpenEventArgs[];
  after: AfterArtifactPanelOpenEventArgs[];
  loadPermissions: ReturnType<typeof vi.fn>;
  scrollToMessage: ReturnType<typeof vi.fn>;
  detectChanges: ReturnType<typeof vi.fn>;
}

function createHarness(options: { cancel?: boolean } = {}): Harness {
  const component = Object.create(
    ConversationChatAreaComponent.prototype
  ) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const before: BeforeArtifactPanelOpenEventArgs[] = [];
  const after: AfterArtifactPanelOpenEventArgs[] = [];
  const beforeEmitter = new EventEmitter<BeforeArtifactPanelOpenEventArgs>();
  const afterEmitter = new EventEmitter<AfterArtifactPanelOpenEventArgs>();

  beforeEmitter.subscribe((args: BeforeArtifactPanelOpenEventArgs) => {
    before.push(args);
    if (options.cancel) {
      args.Cancel = true;
    }
  });
  afterEmitter.subscribe((args: AfterArtifactPanelOpenEventArgs) => {
    after.push(args);
  });

  const loadPermissions = vi.fn().mockResolvedValue(undefined);
  const scrollToMessage = vi.fn();
  const detectChanges = vi.fn();
  const mockUser = { ID: 'user-1' } as unknown as UserInfo;

  open.ConversationId = 'conv-1';
  open.CurrentUser = mockUser;
  open.artifactSelectionEpoch = 0;
  open.SelectedArtifactId = null;
  open.SelectedVersionNumber = undefined;
  open.ShowArtifactPanel = false;
  open.ShowArtifactsModal = true;
  open.SelectedTaskGraphPanel = null;
  open.ShowRemoteBrowserPanel = false;
  open.ArtifactsByDetailId = new Map<string, LazyArtifactInfo[]>([
    [
      'detail-1',
      [
        new LazyArtifactInfo(
          {
            ConversationDetailID: 'detail-1',
            Direction: 'Output',
            ArtifactID: 'art-1',
            ArtifactVersionID: 'ver-3',
            VersionNumber: 3,
            ArtifactName: 'Q3 Policy Brief',
            ArtifactType: 'Document',
            Visibility: 'Always',
          },
          mockUser
        ),
      ],
    ],
  ]);
  open.BeforeArtifactPanelOpen = beforeEmitter;
  open.AfterArtifactPanelOpen = afterEmitter;
  open.loadArtifactPermissions = loadPermissions;
  open.isActiveConversation = () => true;
  open.scrollToMessage = scrollToMessage;
  open.cdr = { detectChanges };

  return {
    component,
    before,
    after,
    loadPermissions,
    scrollToMessage,
    detectChanges,
  };
}

describe('ConversationChatAreaComponent — BeforeArtifactPanelOpen / AfterArtifactPanelOpen', () => {
  describe('OnArtifactClicked', () => {
    it('opens the built-in artifact panel and emits AfterArtifactPanelOpen when not canceled', async () => {
      const h = createHarness({ cancel: false });
      await h.component.OnArtifactClicked({ artifactId: 'art-1', versionId: 'ver-3' });

      expect(h.before).toHaveLength(1);
      expect(h.before[0]).toMatchObject({
        ArtifactId: 'art-1',
        VersionNumber: 3,
        VersionId: 'ver-3',
        Cancel: false,
      });
      expect(h.component.ShowArtifactPanel).toBe(true);
      expect(h.component.SelectedArtifactId).toBe('art-1');
      expect(h.component.SelectedVersionNumber).toBe(3);
      expect(h.after).toHaveLength(1);
      expect(h.after[0]).toMatchObject({
        ArtifactId: 'art-1',
        VersionNumber: 3,
        VersionId: 'ver-3',
      });
      expect(h.loadPermissions).toHaveBeenCalledWith('art-1', 'conv-1', 'art-1');
    });

    it('leaves ShowArtifactPanel false and does not emit AfterArtifactPanelOpen when canceled', async () => {
      const h = createHarness({ cancel: true });
      await h.component.OnArtifactClicked({ artifactId: 'art-1', versionId: 'ver-3' });

      expect(h.before).toHaveLength(1);
      expect(h.before[0]).toMatchObject({
        ArtifactId: 'art-1',
        VersionNumber: 3,
        VersionId: 'ver-3',
        Cancel: true,
      });
      expect(h.component.ShowArtifactPanel).toBe(false);
      expect(h.component.SelectedArtifactId).toBeNull();
      expect(h.after).toHaveLength(0);
      expect(h.loadPermissions).not.toHaveBeenCalled();
    });

    it('resolves versionNumber from SystemArtifactsByDetailId using case-insensitive UUID matching', async () => {
      const h = createHarness({ cancel: true });
      const open = h.component as unknown as Record<string, unknown>;
      const mockUser = { ID: 'user-1' } as unknown as UserInfo;
      open.SystemArtifactsByDetailId = new Map<string, LazyArtifactInfo[]>([
        [
          'detail-sys',
          [
            new LazyArtifactInfo(
              {
                ConversationDetailID: 'detail-sys',
                Direction: 'Output',
                ArtifactID: 'art-sys',
                ArtifactVersionID: 'AAAA1111-2222-4333-8444-555555555555',
                VersionNumber: 4,
                ArtifactName: 'System Report',
                ArtifactType: 'Document',
                Visibility: 'System Only',
              },
              mockUser
            ),
          ],
        ],
      ]);

      await h.component.OnArtifactClicked({
        artifactId: 'art-sys',
        versionId: 'aaaa1111-2222-4333-8444-555555555555',
      });

      expect(h.before).toHaveLength(1);
      expect(h.before[0].VersionNumber).toBe(4);
    });

    it('preserves existing open panel state when opening a second artifact is canceled', async () => {
      const h = createHarness({ cancel: true });
      h.component.ShowArtifactPanel = true;
      h.component.SelectedArtifactId = 'art-1';
      h.component.SelectedVersionNumber = 3;

      await h.component.OnArtifactClicked({ artifactId: 'art-2', versionId: 'ver-1' });

      expect(h.component.ShowArtifactPanel).toBe(true);
      expect(h.component.SelectedArtifactId).toBe('art-1');
      expect(h.component.SelectedVersionNumber).toBe(3);
      expect(h.after).toHaveLength(0);
    });
  });

  describe('OpenArtifactFromModal', () => {
    it('closes the modal, skips opening the built-in panel when canceled, and does not emit AfterArtifactPanelOpen', async () => {
      const h = createHarness({ cancel: true });
      await h.component.OpenArtifactFromModal('art-1', 3);

      expect(h.component.ShowArtifactsModal).toBe(false);
      expect(h.component.ShowArtifactPanel).toBe(false);
      expect(h.after).toHaveLength(0);
    });
  });

  describe('applyArtifactPanelAction & decideAndApplyArtifactPanel', () => {
    it('respects BeforeArtifactPanelOpen cancellation on post-turn auto-open', async () => {
      const h = createHarness({ cancel: true });
      const apply = (
        h.component as unknown as {
          applyArtifactPanelAction: (
            action: { kind: 'open'; artifactId: string; versionNumber: number },
            conversationId: string
          ) => Promise<void>;
        }
      ).applyArtifactPanelAction.bind(h.component);

      await apply({ kind: 'open', artifactId: 'art-1', versionNumber: 3 }, 'conv-1');

      expect(h.before).toHaveLength(1);
      expect(h.component.ShowArtifactPanel).toBe(false);
      expect(h.after).toHaveLength(0);
    });

    it('emits BeforeArtifactPanelOpen on a post-turn version bump (v1 -> v2) when the host canceled the initial v1 open', async () => {
      const h = createHarness({ cancel: true });
      const open = h.component as unknown as Record<string, unknown>;
      open.artifactMapConversationId = 'conv-1';
      open.artifactMapGeneration = 1;
      open.allArtifactRefs = () => [
        { artifactId: 'art-1', versionNumber: 2, versionCreatedAt: new Date() },
      ];

      const apply = (
        h.component as unknown as {
          applyArtifactPanelAction: (
            action: { kind: 'open'; artifactId: string; versionNumber: number },
            conversationId: string
          ) => Promise<void>;
        }
      ).applyArtifactPanelAction.bind(h.component);
      const decideAndApply = (
        h.component as unknown as {
          decideAndApplyArtifactPanel: (
            baseline: {
              Versions: Map<string, number>;
              conversationId: string;
              MapConversationId: string;
              MapGeneration: number;
              SelectionEpoch: number;
            },
            conversationId: string
          ) => Promise<void>;
        }
      ).decideAndApplyArtifactPanel.bind(h.component);

      // Turn 1: initial open of v1 is canceled by the host
      await apply({ kind: 'open', artifactId: 'art-1', versionNumber: 1 }, 'conv-1');
      expect(h.before).toHaveLength(1);
      expect(h.component.ShowArtifactPanel).toBe(false);

      // Turn 2: art-1 bumps from v1 to v2 while the built-in panel is still closed
      await decideAndApply(
        {
          Versions: new Map([['art-1', 1]]),
          conversationId: 'conv-1',
          MapConversationId: 'conv-1',
          MapGeneration: 1,
          SelectionEpoch: 0,
        },
        'conv-1'
      );

      expect(h.before).toHaveLength(2);
      expect(h.before[1]).toMatchObject({
        ArtifactId: 'art-1',
        VersionNumber: 2,
        Cancel: true,
      });
      expect(h.component.ShowArtifactPanel).toBe(false);
    });
  });

  describe('handleCaptureDataSnapshotCommand', () => {
    it('aborts opening the panel and does not wait for a snapshot when BeforeArtifactPanelOpen is canceled', async () => {
      const h = createHarness({ cancel: true });
      const open = h.component as unknown as Record<string, unknown>;
      const waitForViewerSnapshot = vi.fn().mockResolvedValue(null);
      open.waitForViewerSnapshot = waitForViewerSnapshot;

      const handleCapture = (
        h.component as unknown as {
          handleCaptureDataSnapshotCommand: (cmd: { artifactId: string }) => Promise<void>;
        }
      ).handleCaptureDataSnapshotCommand.bind(h.component);

      await handleCapture({ artifactId: 'art-1' });

      expect(h.before).toHaveLength(1);
      expect(h.component.ShowArtifactPanel).toBe(false);
      expect(waitForViewerSnapshot).not.toHaveBeenCalled();
    });

    it('does not re-emit BeforeArtifactPanelOpen when the panel is already open on the same artifact (case-insensitive UUID)', async () => {
      const h = createHarness({ cancel: false });
      const open = h.component as unknown as Record<string, unknown>;
      const waitForViewerSnapshot = vi.fn().mockResolvedValue(null);
      open.waitForViewerSnapshot = waitForViewerSnapshot;
      h.component.ShowArtifactPanel = true;
      h.component.SelectedArtifactId = 'AAAA1111-2222-4333-8444-555555555555';

      const handleCapture = (
        h.component as unknown as {
          handleCaptureDataSnapshotCommand: (cmd: { artifactId: string }) => Promise<void>;
        }
      ).handleCaptureDataSnapshotCommand.bind(h.component);

      await handleCapture({ artifactId: 'aaaa1111-2222-4333-8444-555555555555' });

      expect(h.before).toHaveLength(0);
      expect(waitForViewerSnapshot).toHaveBeenCalledOnce();
    });
  });

  describe('handlePendingArtifactNavigation', () => {
    it('still scrolls to the message even when opening the built-in panel is canceled', async () => {
      const h = createHarness({ cancel: true });
      const open = h.component as unknown as Record<string, unknown>;
      open.PendingArtifactId = 'ART-1';
      open.PendingArtifactVersionNumber = 3;
      open.PendingArtifactConversationId = 'conv-1';
      open.PendingArtifactConsumed = { emit: vi.fn() };

      const handlePending = (
        h.component as unknown as { handlePendingArtifactNavigation: () => Promise<void> }
      ).handlePendingArtifactNavigation.bind(h.component);
      await handlePending();

      expect(h.before).toHaveLength(1);
      expect(h.before[0]).toMatchObject({
        ArtifactId: 'ART-1',
        VersionNumber: 3,
        VersionId: 'ver-3',
      });
      expect(h.component.ShowArtifactPanel).toBe(false);
      expect(h.scrollToMessage).toHaveBeenCalledWith('detail-1');
      expect(h.after).toHaveLength(0);
    });
  });
});
