/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import {
  ArtifactPermissionEngine,
  type MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { DocumentCollaborationService } from '../lib/services/document-collaboration.service';
import { DocumentImportExportService } from '../lib/services/document-import-export.service';
import {
  MarkdownArtifactViewerComponent,
  ParseMarkdownFrontmatterHeader,
} from '../lib/components/plugins/markdown-artifact-viewer.component';

interface MockDocProviderOptions {
  currentUserId: string;
  artifactId: string;
  artifactOwnerId: string;
  permissionSource: 'Owner' | 'Delegate' | 'ArtifactPermission';
  canRead?: boolean;
  canEdit?: boolean;
  canShare?: boolean;
}

function buildDocViewerProvider(options: MockDocProviderOptions): {
  provider: IMetadataProvider;
  setPermissionSource: (source: 'Owner' | 'Delegate' | 'ArtifactPermission', canEdit?: boolean) => void;
  setArtifactOwnerId: (ownerId: string) => void;
  getArtifactOwnerQueryCount: () => number;
} {
  let currentSource = options.permissionSource;
  let currentCanEdit = options.canEdit ?? true;
  let currentOwnerId = options.artifactOwnerId;
  let artifactOwnerQueryCount = 0;

  const runViewImpl = async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
    if (params.EntityName === 'MJ: Artifacts') {
      artifactOwnerQueryCount += 1;
      const row = { ID: options.artifactId, UserID: currentOwnerId };
      return {
        Success: true,
        Results: [row as T],
        TotalRowCount: 1,
        RowCount: 1,
        UserViewRunID: '',
        ExecutionTime: 1,
        ErrorMessage: '',
      };
    }
    return {
      Success: true,
      Results: [],
      TotalRowCount: 0,
      RowCount: 0,
      UserViewRunID: '',
      ExecutionTime: 1,
      ErrorMessage: '',
    };
  };

  const base = Object.create(null) as IMetadataProvider;
  const provider = Object.assign(base, {
    CurrentUser: {
      ID: options.currentUserId,
      Name: 'Test Doc User',
      Email: 'docuser@example.com',
    },
    Entities: [],
    EntityByName: () => undefined,
    Queries: [],
    ConfigData: { URL: 'https://example.com/graphql' },
    ExecuteGQL: async (query: string) => {
      if (query.includes('ResolveArtifactPermissions')) {
        return {
          ResolveArtifactPermissions: {
            ArtifactID: options.artifactId,
            CanRead: options.canRead ?? true,
            CanEdit: currentCanEdit,
            CanDelete: false,
            CanShare: options.canShare ?? false,
            Source: currentSource,
          },
        };
      }
      if (query.includes('MintArtifactCollaborationTicket')) {
        return {
          MintArtifactCollaborationTicket: {
            Success: false,
            Ticket: '',
            WsPath: '',
            CanRead: options.canRead ?? true,
            CanEdit: currentCanEdit,
          },
        };
      }
      return {};
    },
    RunView: runViewImpl,
    RunViews: async () => [],
    GetRunViewProvider: async () => ({
      RunView: runViewImpl,
      RunViews: async () => [],
    }),
  });

  return {
    provider,
    setPermissionSource: (source, canEdit) => {
      currentSource = source;
      if (typeof canEdit === 'boolean') {
        currentCanEdit = canEdit;
      }
    },
    setArtifactOwnerId: (ownerId) => {
      currentOwnerId = ownerId;
    },
    getArtifactOwnerQueryCount: () => artifactOwnerQueryCount,
  };
}

function createMarkdownViewer(collabService: DocumentCollaborationService): MarkdownArtifactViewerComponent {
  const mockNotifier = Object.assign(
    Object.create(MJNotificationService.prototype) as MJNotificationService,
    { CreateSimpleNotification: vi.fn() },
  );
  const injector = Injector.create({
    providers: [
      {
        provide: ChangeDetectorRef,
        useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() },
      },
      { provide: DocumentCollaborationService, useValue: collabService },
      { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
      { provide: MJNotificationService, useValue: mockNotifier },
    ],
  });
  return runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('MarkdownArtifactViewerComponent R3 Fixes', () => {
  describe('[R3-P1-1] CutDocsSelectionOrBlock', () => {
    it('copies selectedText to clipboard and preserves the block when selectedText is non-empty but absent from raw markdown', () => {
      const collabService = new DocumentCollaborationService();
      const component = createMarkdownViewer(collabService);
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      const prevClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: writeTextSpy },
      });
      const prevGetSelection = window.getSelection;
      window.getSelection = (() => ({
        toString: () => 'bold and italic',
        rangeCount: 0,
      })) as typeof window.getSelection;

      try {
        component.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
          ID: 'ver-cut-1',
          ArtifactID: '',
          VersionNumber: 1,
          Name: 'Cut Test',
          Content: '# Title\n\nParagraph with **bold** and *italic* words\n\nClosing paragraph',
        });
        component.readonly = false;
        component.ngOnInit();

        const targetSeg = component.DocumentSegments.find((s) =>
          s.RawMarkdown.includes('**bold** and *italic*'),
        );
        expect(targetSeg).toBeDefined();
        const initialSegmentCount = component.DocumentSegments.length;
        const deleteSpy = vi.spyOn(component, 'DeleteSegment');

        component.OnDocsSegmentContextMenu(
          new MouseEvent('contextmenu', { clientX: 12, clientY: 24 }),
          targetSeg!,
        );
        component.OnDocsContextMenuCommand({
          Type: 'clipboard',
          Action: 'cut',
          SegmentID: targetSeg!.SegmentID,
        });

        expect(writeTextSpy).toHaveBeenCalledTimes(1);
        expect(writeTextSpy).toHaveBeenCalledWith('bold and italic');
        expect(deleteSpy).not.toHaveBeenCalled();
        expect(component.DocumentSegments).toHaveLength(initialSegmentCount);
        expect(component.MarkdownContent).toContain('Paragraph with **bold** and *italic* words');
        expect(component.StatusBannerMessage).toBe('Copied selection to clipboard.');

        component.ngOnDestroy();
      } finally {
        window.getSelection = prevGetSelection;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: prevClipboard,
        });
        collabService.ngOnDestroy();
      }
    });

    it('cuts a verbatim selected substring in place without deleting the whole segment, and still cuts whole block when selection is empty', () => {
      const collabService = new DocumentCollaborationService();
      const component = createMarkdownViewer(collabService);
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      const prevClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: writeTextSpy },
      });
      const prevGetSelection = window.getSelection;
      let activeSelection = 'quick brown ';
      window.getSelection = (() => ({
        toString: () => activeSelection,
        rangeCount: 0,
      })) as typeof window.getSelection;

      try {
        component.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
          ID: 'ver-cut-2',
          ArtifactID: '',
          VersionNumber: 1,
          Name: 'Cut Verbatim Test',
          Content: '# Title\n\nThe quick brown fox\n\nClosing paragraph',
        });
        component.readonly = false;
        component.ngOnInit();

        const targetSeg = component.DocumentSegments.find((s) => s.RawMarkdown.includes('quick brown'));
        expect(targetSeg).toBeDefined();
        const deleteSpy = vi.spyOn(component, 'DeleteSegment');

        // Verbatim selection: removes only the selection
        component.OnDocsSegmentContextMenu(
          new MouseEvent('contextmenu', { clientX: 12, clientY: 24 }),
          targetSeg!,
        );
        component.OnDocsContextMenuCommand({
          Type: 'clipboard',
          Action: 'cut',
          SegmentID: targetSeg!.SegmentID,
        });

        expect(writeTextSpy).toHaveBeenCalledWith('quick brown ');
        expect(deleteSpy).not.toHaveBeenCalled();
        expect(component.MarkdownContent).toContain('The fox');

        // Empty selection: cuts whole block
        activeSelection = '';
        const updatedSeg = component.DocumentSegments.find((s) => s.RawMarkdown.includes('The fox'));
        expect(updatedSeg).toBeDefined();
        component.OnDocsSegmentContextMenu(
          new MouseEvent('contextmenu', { clientX: 12, clientY: 24 }),
          updatedSeg!,
        );
        component.OnDocsContextMenuCommand({
          Type: 'clipboard',
          Action: 'cut',
          SegmentID: updatedSeg!.SegmentID,
        });

        expect(writeTextSpy).toHaveBeenCalledWith('The fox');
        expect(deleteSpy).toHaveBeenCalledTimes(1);
        expect(component.MarkdownContent).not.toContain('The fox');

        component.ngOnDestroy();
      } finally {
        window.getSelection = prevGetSelection;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: prevClipboard,
        });
        collabService.ngOnDestroy();
      }
    });
  });

  describe('[R3-P1-2] Delegated Artifact Owner Check', () => {
    it('resolves MJ: Artifacts.UserID via RunView with UUIDsEqual when Source is Delegate so the real owner can edit bare mj-lock sections and toggle heading locks', async () => {
      const collabService = new DocumentCollaborationService();
      const ownerLower = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      const ownerUpper = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
      const artifactId = '11111111-2222-4333-8444-555555555555';

      const { provider, getArtifactOwnerQueryCount, setArtifactOwnerId } = buildDocViewerProvider({
        currentUserId: ownerLower,
        artifactId,
        artifactOwnerId: ownerUpper,
        permissionSource: 'Delegate',
        canRead: true,
        canEdit: true,
        canShare: false,
      });

      const component = createMarkdownViewer(collabService);
      try {
        component.Provider = provider;
        component.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
          ID: 'ver-delegate-owner-1',
          ArtifactID: artifactId,
          VersionNumber: 1,
          Name: 'Delegated Owned Doc',
          Content: [
            '<!-- mj-lock: owner-only -->',
            '## Protected Heading',
            '',
            'Confidential owner-only paragraph',
            '<!-- /mj-lock -->',
            '',
            '## Open Heading',
            '',
            'General paragraph',
          ].join('\n'),
        });
        component.readonly = false;
        component.ngOnInit();
        await flushMicrotasks();

        expect(getArtifactOwnerQueryCount()).toBe(1);

        const lockedHeading = component.DocumentSegments.find((s) => s.HeadingText === 'Protected Heading');
        const lockedBody = component.DocumentSegments.find((s) =>
          s.RawMarkdown.includes('Confidential owner-only paragraph'),
        );
        const openHeading = component.DocumentSegments.find((s) => s.HeadingText === 'Open Heading');
        expect(lockedHeading).toBeDefined();
        expect(lockedBody).toBeDefined();
        expect(openHeading).toBeDefined();

        // <!-- mj-lock: owner-only --> without user= relies on artifact owner resolution; delegated owner must be allowed to edit it
        expect(component.CanEditSegment(lockedHeading!)).toBe(true);
        expect(component.CanEditSegment(lockedBody!)).toBe(true);

        // Context menu must expose enabled toggle-heading-lock for delegated owner
        component.OnDocsSegmentContextMenu(
          new MouseEvent('contextmenu', { clientX: 16, clientY: 32 }),
          openHeading!,
        );
        const lockMenuItem = component.ContextMenuItems.find((item) => item.ID === 'toggle-heading-lock');
        expect(lockMenuItem).toBeDefined();
        if (lockMenuItem && lockMenuItem.Kind === 'action') {
          expect(lockMenuItem.Disabled).toBe(false);
        }

        // ToggleHeadingLock must lock the open heading
        component.ToggleHeadingLock(openHeading!);
        expect(component.MarkdownContent).toContain('<!-- mj-lock: owner-only');
        expect(component.StatusBannerMessage).toContain('Locked section "Open Heading"');

        // When permissions change and the artifact is owned by someone else, owner privileges must be revoked
        const otherOwnerId = '99999999-8888-4777-8666-555555555555';
        setArtifactOwnerId(otherOwnerId);
        await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
          ArtifactID: artifactId,
        });
        await flushMicrotasks();

        expect(getArtifactOwnerQueryCount()).toBe(2);
        expect(component.CanEditSegment(lockedBody!)).toBe(false);

        component.ngOnDestroy();
      } finally {
        collabService.ngOnDestroy();
      }
    });

    it('denies heading lock toggle and bare mj-lock editing to a delegated non-owner editor', async () => {
      const collabService = new DocumentCollaborationService();
      const nonOwnerUserId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
      const realOwnerId = '99999999-8888-4777-8666-555555555555';
      const artifactId = '22222222-3333-4444-8555-666666666666';

      const { provider, getArtifactOwnerQueryCount } = buildDocViewerProvider({
        currentUserId: nonOwnerUserId,
        artifactId,
        artifactOwnerId: realOwnerId,
        permissionSource: 'Delegate',
        canRead: true,
        canEdit: true,
        canShare: true,
      });

      const component = createMarkdownViewer(collabService);
      try {
        component.Provider = provider;
        const initialContent = [
          '<!-- mj-lock: owner-only -->',
          '## Locked By Owner',
          '',
          'Owner-only secret text',
          '<!-- /mj-lock -->',
          '',
          '## Editable Heading',
          '',
          'Normal text',
        ].join('\n');
        component.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
          ID: 'ver-delegate-nonowner-1',
          ArtifactID: artifactId,
          VersionNumber: 1,
          Name: 'Delegated Non-Owner Doc',
          Content: initialContent,
        });
        component.readonly = false;
        component.ngOnInit();
        await flushMicrotasks();

        expect(getArtifactOwnerQueryCount()).toBe(1);

        const lockedBody = component.DocumentSegments.find((s) =>
          s.RawMarkdown.includes('Owner-only secret text'),
        );
        const editableHeading = component.DocumentSegments.find(
          (s) => s.HeadingText === 'Editable Heading',
        );
        expect(lockedBody).toBeDefined();
        expect(editableHeading).toBeDefined();

        expect(component.CanEditSegment(lockedBody!)).toBe(false);
        expect(component.CanEditSegment(editableHeading!)).toBe(true);

        component.OnDocsSegmentContextMenu(
          new MouseEvent('contextmenu', { clientX: 16, clientY: 32 }),
          editableHeading!,
        );
        const nonOwnerLockItem = component.ContextMenuItems.find(
          (item) => item.ID === 'toggle-heading-lock',
        );
        expect(nonOwnerLockItem).toBeDefined();
        if (nonOwnerLockItem && nonOwnerLockItem.Kind === 'action') {
          expect(nonOwnerLockItem.Disabled).toBe(true);
        }

        component.ToggleHeadingLock(editableHeading!);
        expect(component.MarkdownContent).toBe(initialContent);
        expect(component.StatusBannerMessage).toBe('Only the artifact owner can toggle section locks.');

        component.ngOnDestroy();
      } finally {
        collabService.ngOnDestroy();
      }
    });

    it('surfaces FrozenBlocksInDocument, enforces PreVerifiedFrozenSnapshots fail-closed verification, and respects locks in bulk Refreeze/SwitchToLive', async () => {
      const collabService = new DocumentCollaborationService();
      const ownerId = '11111111-1111-4111-8111-111111111111';
      const editorId = '22222222-2222-4222-8222-222222222222';
      const artifactId = '33333333-3333-4333-8333-333333333333';

      const { provider } = buildDocViewerProvider({
        currentUserId: editorId,
        artifactId,
        artifactOwnerId: ownerId,
        permissionSource: 'ArtifactPermission',
        canRead: true,
        canEdit: true,
        canShare: false,
      });

      const component = createMarkdownViewer(collabService);
      try {
        component.Provider = provider;
        const lockedFrozenBlock = [
          ':::mj-block',
          JSON.stringify({
            BlockID: 'blk-locked',
            Kind: 'EntityView',
            Mode: 'Frozen',
            Title: 'Locked Revenue Block',
            Query: { EntityName: 'Invoices' },
            FrozenSnapshot: {
              FrozenAt: '2026-11-15T10:00:00.000Z',
              FrozenByUserID: ownerId,
              FrozenByUserName: 'Owner',
              SecurityWarningAcknowledged: true,
              Columns: [{ Name: 'ID', DisplayName: 'ID' }],
              Rows: [{ ID: 'inv-1' }],
            },
          }),
          ':::',
        ].join('\n');
        const unlockedFrozenBlock = [
          ':::mj-block',
          JSON.stringify({
            BlockID: 'blk-open',
            Kind: 'EntityView',
            Mode: 'Frozen',
            Title: 'Open Revenue Block',
            Query: { EntityName: 'Orders' },
            FrozenSnapshot: {
              FrozenAt: '2026-11-15T10:00:00.000Z',
              FrozenByUserID: ownerId,
              FrozenByUserName: 'Owner',
              SecurityWarningAcknowledged: true,
              Columns: [{ Name: 'ID', DisplayName: 'ID' }],
              Rows: [{ ID: 'ord-1' }],
            },
          }),
          ':::',
        ].join('\n');

        component.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
          ID: '44444444-4444-4444-8444-444444444444',
          ArtifactID: artifactId,
          VersionNumber: 1,
          Name: 'Governance Frozen Doc',
          Content: [
            '<!-- mj-lock: owner-only -->',
            '## Locked Section',
            lockedFrozenBlock,
            '<!-- /mj-lock -->',
            '',
            '## Open Section',
            unlockedFrozenBlock,
          ].join('\n'),
        });
        component.readonly = false;
        component.ngOnInit();
        await flushMicrotasks();

        expect(component.FrozenBlocksInDocument.map((b) => b.BlockID)).toEqual(['blk-locked', 'blk-open']);

        const lockedBlockSpec = component.FrozenBlocksInDocument[0];
        const openBlockSpec = component.FrozenBlocksInDocument[1];

        // Server pre-verified map: Verified=true shows provenance; Verified=false fails closed even with snapshot data
        component.PreVerifiedFrozenSnapshots = {
          'blk-locked': {
            Verified: true,
            FrozenByUserName: 'Guest Share Server Verified User',
            FrozenAt: '2026-11-15T10:00:00.000Z',
          },
          'blk-open': {
            Verified: false,
            FrozenByUserName: 'Tampered Author',
          },
        };
        expect(component.IsSnapshotVerified(lockedBlockSpec)).toBe(true);
        expect(component.GetBlockPreVerifiedSnapshot(lockedBlockSpec)?.FrozenByUserName).toBe(
          'Guest Share Server Verified User',
        );
        expect(component.IsSnapshotVerified(openBlockSpec)).toBe(false);

        const freezeSpy = vi
          .spyOn(collabService, 'FreezeLiveBlockOnServer')
          .mockResolvedValue({
            Success: true,
            UpdatedSpec: {
              ...openBlockSpec,
              FrozenSnapshot: {
                ...openBlockSpec.FrozenSnapshot!,
                FrozenAt: '2026-11-15T11:00:00.000Z',
              },
            },
          });

        await component.RefreezeAllFrozenBlocks();
        expect(freezeSpy).toHaveBeenCalledTimes(1);
        expect(freezeSpy.mock.calls[0]?.[0].BlockID).toBe('blk-open');
        expect(component.StatusBannerMessage).toBe('Re-froze 1 block(s); 1 locked block(s) skipped.');

        // Bulk Switch All to Live skips locked block and converts only unlocked block
        component.SwitchAllFrozenBlocksToLive();
        expect(component.FrozenBlocksInDocument.map((b) => b.BlockID)).toEqual(['blk-locked']);
        expect(component.StatusBannerMessage).toBe('Switched 1 block(s) to Live mode; 1 locked block(s) skipped.');

        component.ngOnDestroy();
      } finally {
        collabService.ngOnDestroy();
      }
    });

    it('parses YAML frontmatter header metadata safely and computes EstimatedReadingMinutes', () => {
      const md = [
        '---',
        'title: "Q4 Enterprise Roadmap"',
        'subtitle: "Executive Summary & Delivery Milestones"',
        'author: "Amith Nair"',
        'date: "2026-11-17"',
        'category: "Strategy"',
        'tags: [roadmap, enterprise, ai]',
        'accent: "#4f46e5"',
        '---',
        '',
        '# Section 1',
        'word '.repeat(410),
      ].join('\n');

      const parsed = ParseMarkdownFrontmatterHeader(md);
      expect(parsed).toEqual({
        Title: 'Q4 Enterprise Roadmap',
        Subtitle: 'Executive Summary & Delivery Milestones',
        Author: 'Amith Nair',
        Date: '2026-11-17',
        Category: 'Strategy',
        Tags: ['roadmap', 'enterprise', 'ai'],
        Accent: '#4f46e5',
      });

      // Unsafe CSS accent is ignored
      const badAccent = ParseMarkdownFrontmatterHeader('---\ntitle: Safe\naccent: url(https://evil)\n---\nBody');
      expect(badAccent?.Title).toBe('Safe');
      expect(badAccent?.Accent).toBeUndefined();

      const collabService = new DocumentCollaborationService();
      const injector = Injector.create({
        providers: [
          { provide: ChangeDetectorRef, useValue: { detectChanges: () => {}, markForCheck: () => {} } },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: DocumentImportExportService, useValue: { ParseDocumentHtml: () => '' } },
          { provide: MJNotificationService, useValue: null },
        ],
      });
      const viewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
      viewer.MarkdownContent = md;
      (viewer as unknown as { refreshParsedStructure: () => void }).refreshParsedStructure();
      expect(viewer.FrontmatterHeader?.Title).toBe('Q4 Enterprise Roadmap');
      expect(viewer.EstimatedReadingMinutes).toBeGreaterThanOrEqual(2);
      viewer.ngOnDestroy();
      collabService.ngOnDestroy();
    });
  });
});
