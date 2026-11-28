import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComposerModule } from '@memberjunction/ng-composer';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EntityInfo,
  type IMetadataProvider,
  type IRunViewProvider,
  type RunViewParams,
  type RunViewResult,
  type UserInfo,
} from '@memberjunction/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { ArtifactPermissionEngine, DocumentLiveBlockEngine, UserInfoEngine, type MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJ_EMBEDDED_ARTIFACT_ANCESTORS, MJ_MAX_EMBED_DEPTH } from '../artifact-type-plugin-viewer.component';
import { MarkdownArtifactViewerComponent } from './markdown-artifact-viewer.component';
import { MjContextMenuComponent } from '../context-menu/mj-context-menu.component';
import { ArtifactAgentPresenceBarComponent } from '../presence/artifact-agent-presence-bar.component';
import { ArtifactCommandPaletteComponent } from './artifact-command-palette.component';
import { ArtifactAgentRegionIndicatorComponent } from '../presence/artifact-agent-region-indicator.component';
import { DocumentCollaborationService } from '../../services/document-collaboration.service';
import { DocumentImportExportService } from '../../services/document-import-export.service';

@Component({
  standalone: true,
  selector: 'mj-markdown',
  template: `<div class="stub-mj-markdown">{{ Data ?? data }}</div>`,
})
class StubMarkdownComponent {
  @Input() Data: string | null = null;
  @Input() data: string | null = null;
  @Input() EnableCollapsibleHeadings = false;
  @Input() EnableLineNumbers = false;
  @Input() EnableHighlight = false;
  @Input() EnableSmartypants = false;
  @Input() EnableHtml = false;
  @Input() EnableCodeCopy = false;
  @Input() EnableHeadingIds = false;
}

@Component({
  standalone: true,
  selector: 'mj-artifact-type-plugin-viewer',
  template: `<div class="stub-ole-plugin" [attr.data-readonly]="readonly">{{ ArtifactTypeName || artifactTypeName }}</div>`,
})
class StubArtifactTypePluginViewerComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() artifactVersion!: MJArtifactVersionEntity;
  @Input() artifactTypeName = '';
  @Input() ArtifactTypeName = '';
  @Input() AncestorArtifactIDs?: ReadonlySet<string>;
  @Input() contentType?: string;
  @Input() driverClass?: string;
  @Input() height?: string;
  @Input() readonly = false;
  @Input() cssClass?: string;
  @Output() ContentCommitted = new EventEmitter<string>();
}

const INITIAL_DOC_CONTENT = [
  '# Q4 Strategy Document',
  '',
  'Initial narrative paragraph.',
  '',
  '## Live Metrics Section',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-live-1",',
  '  "Kind": "EntityView",',
  '  "Mode": "Live",',
  '  "Title": "Active Projects",',
  '  "EntityName": "MJ: Projects"',
  '}',
  ':::',
  '',
  '## Architecture Whiteboard',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-wb-1",',
  '  "Kind": "Artifact",',
  '  "Mode": "Live",',
  '  "Title": "System Diagram",',
  '  "ArtifactID": "wb-inline-1",',
  '  "ArtifactType": "Whiteboard",',
  '  "EmbedMode": "Inline"',
  '}',
  ':::',
].join('\n');

interface MockDocsProviderOptions {
  currentUserId?: string;
  artifactOwnerId?: string;
  permissionGrants?: Array<{ ID: string; UserID: string; CanRead: boolean; CanEdit: boolean; CanShare: boolean }>;
  failSaves?: boolean;
}

interface MockDocsEntityRecord {
  ID: string;
  LatestResult: { Message: string };
  NewRecord: () => void;
  Load: (id: string) => Promise<boolean>;
  Delete: () => Promise<boolean>;
  Save: () => Promise<boolean>;
  ArtifactID?: string;
  VersionNumber?: number;
  Name?: string;
  Content?: string;
  UserID?: string;
  Role?: string;
  CanRead?: boolean;
  CanEdit?: boolean;
  CanShare?: boolean;
}

type MockDocsMetadataAndRunViewProvider = IMetadataProvider & IRunViewProvider;

function createDocsMockProvider(opts: MockDocsProviderOptions = {}) {
  const currentUserId = opts.currentUserId ?? '11111111-1111-4111-8111-111111111111';
  const artifactOwnerId = opts.artifactOwnerId ?? currentUserId;
  const permissionGrants = [...(opts.permissionGrants ?? [])];
  let seq = 0;

  const savedEntities: Array<{ entityName: string; record: MockDocsEntityRecord }> = [];
  const deletedPermissionIds: string[] = [];
  const childVersionsByArtifact = new Map<string, Array<{ ID: string; ArtifactID: string; VersionNumber: number; Name: string; Content: string }>>([
    [
      'wb-inline-1',
      [
        {
          ID: 'ver-wb-inline-1-1',
          ArtifactID: 'wb-inline-1',
          VersionNumber: 1,
          Name: 'System Diagram',
          Content: '{"version":1,"activePageId":"page-1","pages":[{"id":"page-1","name":"Page 1","items":[]}]}',
        },
      ],
    ],
  ]);

  const user = {
    ID: currentUserId,
    Name: 'Alex Author',
    Email: 'alex@memberjunction.org',
    IsActive: true,
  } as Partial<UserInfo> as UserInfo;

  const entities: EntityInfo[] = [
    new EntityInfo({
      ID: 'ent-artifacts',
      Name: 'MJ: Artifacts',
      DisplayName: 'Artifacts',
      SchemaName: '__mj',
      BaseTable: 'Artifact',
      Icon: 'fa-solid fa-cube',
      FieldLevelSecurityApplies: false,
      Fields: [
        { Name: 'ID', DisplayName: 'ID', IsPrimaryKey: true, DefaultInView: true, Type: 'uniqueidentifier' },
        { Name: 'Name', DisplayName: 'Name', IsNameField: true, DefaultInView: true, Type: 'nvarchar' },
      ],
    }),
    new EntityInfo({
      ID: 'ent-projects',
      Name: 'MJ: Projects',
      DisplayName: 'Projects',
      SchemaName: '__mj',
      BaseTable: 'Project',
      Icon: 'fa-solid fa-diagram-project',
      FieldLevelSecurityApplies: false,
      Fields: [
        { Name: 'ID', DisplayName: 'ID', IsPrimaryKey: true, DefaultInView: true, Type: 'uniqueidentifier' },
        { Name: 'Name', DisplayName: 'Name', IsNameField: true, DefaultInView: true, Type: 'nvarchar' },
      ],
    }),
    new EntityInfo({
      ID: 'ent-conversations',
      Name: 'MJ: Conversations',
      DisplayName: 'Conversations',
      SchemaName: '__mj',
      BaseTable: 'Conversation',
      Icon: 'fa-solid fa-comments',
      FieldLevelSecurityApplies: false,
      Fields: [
        { Name: 'ID', DisplayName: 'ID', IsPrimaryKey: true, DefaultInView: true, Type: 'uniqueidentifier' },
        { Name: 'Name', DisplayName: 'Name', IsNameField: true, DefaultInView: true, Type: 'nvarchar' },
        {
          Name: 'Type',
          DisplayName: 'Type',
          DefaultInView: true,
          Type: 'uniqueidentifier',
          RelatedEntity: 'MJ: Artifact Types',
          RelatedEntityFieldName: 'ID',
        },
      ],
    }),
    new EntityInfo({
      ID: 'ent-ai-models',
      Name: 'MJ: AI Models',
      DisplayName: 'AI Models',
      SchemaName: '__mj',
      BaseTable: 'AIModel',
      Icon: 'fa-solid fa-microchip',
      FieldLevelSecurityApplies: false,
      Fields: [
        { Name: 'ID', DisplayName: 'ID', IsPrimaryKey: true, DefaultInView: true, Type: 'uniqueidentifier' },
      ],
    }),
  ];
  for (const entity of entities) {
    entity.GetUserPermisions = () => ({
      ID: `perm-${entity.ID}`,
      Entity: entity,
      User: user,
      CanRead: true,
      CanCreate: false,
      CanUpdate: false,
      CanDelete: false,
    });
  }

  const okResult = <T>(results: T[], totalRowCount = results.length): RunViewResult<T> => ({
    Success: true,
    Results: results,
    RowCount: results.length,
    TotalRowCount: totalRowCount,
    ExecutionTime: 0,
    ErrorMessage: '',
  });

  const provider = {
    CurrentUser: user,
    Entities: entities,
    EntityByName: (name: string) => entities.find((e) => e.Name === name),
    RunView: async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
      const extraFilter = String(params.ExtraFilter ?? '');
      if (params.EntityName === 'MJ: Artifacts') {
        const matchedId = /ID\s*=\s*'([^']+)'/i.exec(extraFilter)?.[1] ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        return okResult([{ ID: matchedId, UserID: artifactOwnerId, EnvironmentID: 'env-doc-1' }]) as RunViewResult<T>;
      }
      if (params.EntityName === 'MJ: Artifact Permissions') {
        return okResult(permissionGrants) as RunViewResult<T>;
      }
      if (params.EntityName === 'MJ: Artifact Types') {
        return okResult([{ ID: 'type-wb-1', Name: 'Whiteboard' }]) as RunViewResult<T>;
      }
      if (params.EntityName === 'MJ: Artifact Versions') {
        if (extraFilter.includes('wb-inline-1')) {
          const list = childVersionsByArtifact.get('wb-inline-1') ?? [];
          const sorted = [...list].sort((a, b) => b.VersionNumber - a.VersionNumber);
          return okResult(sorted.slice(0, 1), sorted.length) as RunViewResult<T>;
        }
        return okResult([{ ID: 'ver-doc-1', VersionNumber: 1 }]) as RunViewResult<T>;
      }
      if (
        params.EntityName === 'MJ: Projects' ||
        (params.EntityName === 'MJ: Conversations' && !extraFilter.includes('LinkedRecordID'))
      ) {
        return okResult([
          { ID: 'rec-1', Name: 'Project Alpha', Type: 'rec-type-1' },
          { ID: 'rec-2', Name: 'Project Beta', Type: 'rec-type-2' },
        ]) as RunViewResult<T>;
      }
      if (params.EntityName === 'MJ: Users') {
        return okResult([
          user,
          { ID: '33333333-3333-4333-8333-333333333333', Name: 'Jane Reviewer', Email: 'jane@example.com' },
        ]) as RunViewResult<T>;
      }
      return okResult([]) as RunViewResult<T>;
    },
    GetEntityObject: async (entityName: string) => {
      const generatedId = `66666666-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
      const rec: MockDocsEntityRecord = {
        ID: generatedId,
        LatestResult: { Message: 'Mock persistence failure' },
        NewRecord: () => undefined,
        Load: async (id: string) => {
          rec.ID = id;
          return true;
        },
        Delete: async () => {
          if (opts.failSaves) return false;
          deletedPermissionIds.push(String(rec.ID));
          return true;
        },
        Save: async () => {
          if (opts.failSaves) return false;
          savedEntities.push({ entityName, record: { ...rec } });
          if (entityName === 'MJ: Artifact Versions' && rec.ArtifactID === 'wb-inline-1') {
            const list = childVersionsByArtifact.get('wb-inline-1') ?? [];
            list.push({
              ID: String(rec.ID),
              ArtifactID: 'wb-inline-1',
              VersionNumber: Number(rec.VersionNumber),
              Name: String(rec.Name ?? 'System Diagram'),
              Content: String(rec.Content ?? ''),
            });
            childVersionsByArtifact.set('wb-inline-1', list);
          }
          return true;
        },
      };
      return rec;
    },
  } as Partial<MockDocsMetadataAndRunViewProvider> as MockDocsMetadataAndRunViewProvider;

  return { provider, savedEntities, deletedPermissionIds };
}

describe('MarkdownArtifactViewerComponent (DOM)', () => {
  beforeEach(() => {
    process.env.MJ_FROZEN_BLOCK_HMAC_SECRET =
      'test-docs-dom-frozen-hmac-secret-at-least-32-bytes!!';
  });
  async function renderDocsViewer(
    content = INITIAL_DOC_CONTENT,
    readonly = false,
    providerOverride?: IMetadataProvider | null,
  ) {
    const mock = providerOverride === undefined ? createDocsMockProvider().provider : providerOverride;
    const f = renderComponentFixture(MarkdownArtifactViewerComponent, {
      imports: [
        CommonModule,
        FormsModule,
        ComposerModule,
        StubMarkdownComponent,
        StubArtifactTypePluginViewerComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [MarkdownArtifactViewerComponent, MjContextMenuComponent],
      providers: [DocumentCollaborationService, DocumentImportExportService],
      inputs: {
        Provider: mock,
        artifactVersion: {
          ID: 'ver-doc-1',
          ArtifactID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          VersionNumber: 1,
          Name: 'Q4 Strategy Document',
          Content: content,
        } as Partial<MJArtifactVersionEntity> as MJArtifactVersionEntity,
        readonly,
      },
    });
    await f.whenStable();
    await new Promise((r) => setTimeout(r, 15));
    f.detectChanges();
    return f;
  }

  it('defaults HasEditPermission and CanUserShareArtifact to false when permissions are unresolved (B3)', async () => {
    const fNoProvider = await renderDocsViewer('# Protected Doc', false, null);
    expect(fNoProvider.componentInstance.HasEditPermission).toBe(false);
    expect(fNoProvider.componentInstance.CanUserShareArtifact).toBe(false);
    expect(fNoProvider.componentInstance.CanUserEdit).toBe(false);
    expect((fNoProvider.nativeElement as HTMLElement).querySelector('[data-testid="open-permissions-modal-btn"]')).toBeNull();
  });

  it('gates Share button strictly on CanShare when user has CanEdit=true and CanShare=false (B3)', async () => {
    const editorMock = createDocsMockProvider({
      currentUserId: '22222222-2222-4222-8222-222222222222',
      artifactOwnerId: '99999999-9999-4999-8999-999999999999',
      permissionGrants: [
        {
          ID: 'perm-editor-1',
          UserID: '22222222-2222-4222-8222-222222222222',
          CanRead: true,
          CanEdit: true,
          CanShare: false,
        },
      ],
    });
    const fEditor = await renderDocsViewer('# Editor Doc', false, editorMock.provider);
    expect(fEditor.componentInstance.HasEditPermission).toBe(true);
    expect(fEditor.componentInstance.CanUserShareArtifact).toBe(false);
    expect((fEditor.nativeElement as HTMLElement).querySelector('[data-testid="open-permissions-modal-btn"]')).toBeNull();
  });

  it('renders workspace toolbar, TOC outline rail, live MJ block, and inline OLE Artifact block', async () => {
    const f = await renderDocsViewer();
    const root = f.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="mj-docs-toolbar"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="docs-outline-rail"]')).not.toBeNull();

    expect(f.componentInstance.OutlineItems.length).toBe(5);
    expect(f.componentInstance.WordStats.LiveBlocks).toBe(1);
    expect(f.componentInstance.WordStats.EmbeddedArtifacts).toBe(1);

    expect(root.querySelector('[data-testid="live-mj-block-blk-live-1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="ole-artifact-block-blk-wb-1"]')).not.toBeNull();
  });

  it('opens Slash Command Menu (/), creates and saves real delegated Whiteboard entities before inserting :::mj-block (A6)', async () => {
    const mock = createDocsMockProvider();
    const f = await renderDocsViewer('# Simple Doc', false, mock.provider);
    f.componentInstance.SetViewMode('edit');
    f.detectChanges();

    f.componentInstance.ToggleSlashMenu();
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="slash-command-menu"]')).not.toBeNull();

    const wbCmd = f.componentInstance.FilteredSlashCommands.find((c) => c.Command === '/whiteboard')!;
    expect(wbCmd).toBeDefined();

    f.componentInstance.ExecuteSlashCommand(wbCmd);
    f.detectChanges();
    expect(f.componentInstance.NewBlockArtifactID).toBe('');
    expect(root.querySelector('[data-testid="insert-block-modal"]')).not.toBeNull();

    await f.componentInstance.ConfirmBlockInsertModal();
    f.detectChanges();

    const createdArt = mock.savedEntities.find((e) => e.entityName === 'MJ: Artifacts');
    const createdVer = mock.savedEntities.find((e) => e.entityName === 'MJ: Artifact Versions');
    expect(createdArt).toBeDefined();
    expect(createdVer).toBeDefined();
    expect(String(createdVer?.record.Content)).toBe(
      '{"version":1,"activePageId":"page-1","pages":[{"id":"page-1","name":"Page 1","items":[]}]}',
    );
    expect(f.componentInstance.MarkdownContent).toContain(`"ArtifactID": "${String(createdArt?.record.ID)}"`);
    expect(f.componentInstance.MarkdownContent).toContain('"ArtifactType": "Whiteboard"');
    expect(f.componentInstance.WordStats.EmbeddedArtifacts).toBe(1);
  });

  it('enforces O5 Security Warning confirmation modal before freezing a live MJ block and blocks freeze when execution fails (A2)', async () => {
    const f = await renderDocsViewer();
    const root = f.nativeElement as HTMLElement;

    const liveSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-live-1')!;
    expect(liveSeg.Descriptor?.Mode).toBe('Live');

    f.componentInstance.PromptFreezeBlock(liveSeg.Descriptor!);
    f.detectChanges();

    const modal = root.querySelector('[data-testid="freeze-warning-modal"]');
    expect(modal).not.toBeNull();

    const confirmBtn = root.querySelector<HTMLButtonElement>('[data-testid="confirm-freeze-btn"]')!;
    expect(confirmBtn.disabled).toBe(true);

    f.componentInstance.SetFreezeWarningAcknowledged(true);
    f.detectChanges();
    expect(confirmBtn.disabled).toBe(false);

    await f.componentInstance.ConfirmFreezeBlock();
    f.detectChanges();

    const afterSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-live-1')!;
    expect(afterSeg.Descriptor?.Mode).toBe('Frozen');
    expect(afterSeg.Descriptor?.FrozenSnapshot?.SecurityWarningAcknowledged).toBe(true);
  });

  it('loads embedded ArtifactVersion via RunView, tracks latest when unpinned, and advances VersionID when pinned only after Save() succeeds (A6)', async () => {
    const mock = createDocsMockProvider();
    const f = await renderDocsViewer(INITIAL_DOC_CONTENT, false, mock.provider);
    const wbSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-wb-1')!;

    expect(f.componentInstance.IsInlineEditingBlock('blk-wb-1')).toBe(false);
    f.componentInstance.ToggleInlineArtifactEdit(wbSeg.Descriptor!);
    f.detectChanges();
    expect(f.componentInstance.IsInlineEditingBlock('blk-wb-1')).toBe(true);

    // 1. Unpinned: OnEmbeddedArtifactContentCommitted queries MAX(VersionNumber)=1, saves v2, keeps VersionID undefined
    await f.componentInstance.OnEmbeddedArtifactContentCommitted(
      wbSeg.Descriptor!,
      JSON.stringify({ version: 1, activePageId: 'page-1', pages: [{ id: 'page-1', name: 'Updated', items: [] }] }),
    );
    f.detectChanges();

    const unpinnedSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-wb-1')!;
    expect(unpinnedSeg.Descriptor?.VersionID).toBeUndefined();
    const loadedV2 = f.componentInstance.GetEmbeddedArtifactVersion(unpinnedSeg.Descriptor!);
    expect(loadedV2?.VersionNumber).toBe(2);

    // 2. Pin to v2, then commit another inline edit -> saves v3 and advances VersionID to real saved entity ID
    f.componentInstance.TogglePinArtifactVersion(unpinnedSeg.Descriptor!);
    f.detectChanges();
    const pinnedSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-wb-1')!;
    expect(pinnedSeg.Descriptor?.VersionID).toBe(loadedV2?.ID);

    await f.componentInstance.OnEmbeddedArtifactContentCommitted(
      pinnedSeg.Descriptor!,
      JSON.stringify({ version: 1, activePageId: 'page-1', pages: [{ id: 'page-1', name: 'Updated v3', items: [] }] }),
    );
    f.detectChanges();

    const updatedWbSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-wb-1')!;
    expect(updatedWbSeg.Descriptor?.VersionID).not.toBe(loadedV2?.ID);
    expect(f.componentInstance.GetEmbeddedArtifactVersion(updatedWbSeg.Descriptor!)?.VersionNumber).toBe(3);
  });

  it('renders in-place WYSIWYG editable blocks in Edit mode (headings, paragraphs, task lists, tables) without a top raw textarea', async () => {
    const richDoc = [
      '# Interactive Heading',
      '',
      'Editable prose paragraph.',
      '',
      '- [ ] First task item',
      '- [x] Completed task item',
      '',
      '| Metric | Target |',
      '| --- | --- |',
      '| Latency | 25ms |',
    ].join('\n');

    const f = await renderDocsViewer(richDoc, false);
    const root = f.nativeElement as HTMLElement;

    expect(f.componentInstance.ViewMode).toBe('edit');
    f.componentInstance.SetViewMode('preview');
    f.detectChanges();
    expect(f.componentInstance.ViewMode).toBe('preview');
    f.componentInstance.SetViewMode('edit');
    f.detectChanges();
    expect(f.componentInstance.ViewMode).toBe('edit');
    expect(root.querySelector('[data-testid="docs-editor-textarea"]')).toBeNull();

    const headingSeg = f.componentInstance.DocumentSegments[0];
    const headingEl = root.querySelector<HTMLElement>(`[data-testid="editable-heading-${headingSeg.SegmentID}"]`);
    expect(headingEl).not.toBeNull();
    expect(headingEl?.getAttribute('contenteditable')).toBe('true');

    const listSeg = f.componentInstance.DocumentSegments.find((s) => s.BlockKind === 'list')!;
    const firstCheckbox = root.querySelector<HTMLInputElement>(
      `[data-testid="task-checkbox-${listSeg.SegmentID}-0"]`,
    )!;
    expect(firstCheckbox).not.toBeNull();
    expect(firstCheckbox.checked).toBe(false);

    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new Event('change'));
    f.detectChanges();
    expect(f.componentInstance.MarkdownContent).toContain('- [x] First task item');

    const tableSeg = f.componentInstance.DocumentSegments.find((s) => s.BlockKind === 'table')!;
    f.componentInstance.AddTableRow(tableSeg);
    f.detectChanges();
    const updatedTableSeg = f.componentInstance.DocumentSegments.find((s) => s.BlockKind === 'table')!;
    expect(f.componentInstance.GetParsedTable(updatedTableSeg).Rows).toHaveLength(2);
  });

  it('switches cleanly to Suggest Mode without canned callouts, protects against non-matching AcceptSuggestion conflicts (B5), and persists only real User comments (A1)', async () => {
    const mock = createDocsMockProvider();
    const f = await renderDocsViewer(INITIAL_DOC_CONTENT, false, mock.provider);
    const root = f.nativeElement as HTMLElement;

    // 1. OpenSuggestionModalForSegment switches to 'suggest' mode without injecting canned [!TIP] text
    const firstSeg = f.componentInstance.DocumentSegments[0];
    f.componentInstance.OpenSuggestionModalForSegment(firstSeg);
    f.detectChanges();
    expect(f.componentInstance.ViewMode).toBe('suggest');
    expect(f.componentInstance.PendingSuggestionsCount).toBe(0);
    expect(f.componentInstance.MarkdownContent).not.toContain('Suggested refinement for this section.');

    // 2. Non-matching suggestion conflict safety: must NOT overwrite the whole document with ProposedMarkdown!
    const staleSug = f.componentInstance.CreateOrUpdatePendingSuggestion(
      'deleted-block-999',
      'Paragraph text that no longer exists anywhere in the document.',
      'Replacement snippet only.',
      'Stale suggestion',
    );
    const markdownBeforeConflict = f.componentInstance.MarkdownContent;
    f.componentInstance.AcceptSuggestion(staleSug);
    f.detectChanges();
    expect(f.componentInstance.MarkdownContent).toBe(markdownBeforeConflict);
    expect(staleSug.Status).toBe('Pending');
    expect(f.componentInstance.StatusBannerMessage).toContain('Conflict');
    f.componentInstance.RejectSuggestion(staleSug);

    // 3. Matching suggestion applies cleanly to the target segment
    const validSug = f.componentInstance.CreateOrUpdatePendingSuggestion(
      firstSeg.SegmentID,
      firstSeg.RawMarkdown,
      '# Q4 Strategy Document — Approved',
      'Title update',
    );
    f.componentInstance.AcceptSuggestion(validSug);
    f.detectChanges();
    expect(f.componentInstance.MarkdownContent).toContain('# Q4 Strategy Document — Approved');
    expect(f.componentInstance.MarkdownContent).toContain('Initial narrative paragraph.');

    // 4. PostAnchoredComment with @DocsAgent mention persists ONLY the real User comment (zero fake Agent reply or doc mutation)
    f.componentInstance.OpenAnchorCommentForSegment(firstSeg);
    f.componentInstance.NewCommentAgentMode = 'suggest';
    f.componentInstance.NewCommentText = 'Please tighten this heading @DocsAgent';
    await f.componentInstance.PostAnchoredComment();
    f.detectChanges();

    expect(root.querySelector('[data-testid="docs-comments-drawer"]')).not.toBeNull();
    expect(f.componentInstance.AnchoredThreads).toHaveLength(1);
    const newThread = f.componentInstance.AnchoredThreads[0];
    expect(newThread.Messages).toHaveLength(1);
    expect(newThread.Messages[0].Role).toBe('User');
    expect(f.componentInstance.MarkdownContent).not.toContain('Updated by @DocsAgent');
    const savedDetails = mock.savedEntities.filter((e) => e.entityName === 'MJ: Conversation Details');
    expect(savedDetails).toHaveLength(1);
    expect(savedDetails[0].record.Role).toBe('User');

    // 5. Switch to Version Diff mode
    f.componentInstance.SetViewMode('diff');
    f.detectChanges();
    expect(root.querySelector('[data-testid="docs-diff-view"]')).not.toBeNull();
    expect(f.componentInstance.CurrentDiff.AddedLines).toBeGreaterThan(0);
  });

  it('supports Insert Live View dialog with searchable Entity Combobox and returns [] when md.Entities is empty (A2)', async () => {
    const f = await renderDocsViewer('# Live View Doc', false);
    const root = f.nativeElement as HTMLElement;

    const viewCmd = f.componentInstance.FilteredSlashCommands.find((c) => c.Command === '/entity-view')!;
    expect(viewCmd.Label).toBe('Live View');

    f.componentInstance.ExecuteSlashCommand(viewCmd);
    f.detectChanges();

    expect(f.componentInstance.GetInsertModalTitle()).toBe('Insert Live View');
    expect(root.querySelector('[data-testid="new-block-entity-input"]')).not.toBeNull();

    f.componentInstance.OnEntitySearchInput('AI Models');
    f.detectChanges();
    expect(f.componentInstance.ShowEntityPickerDropdown).toBe(true);
    expect(f.componentInstance.FilteredEntityPickerOptions.length).toBeGreaterThanOrEqual(1);

    const aiModelsOpt = f.componentInstance.FilteredEntityPickerOptions.find((e) => e.Name === 'MJ: AI Models')!;
    expect(aiModelsOpt).toBeDefined();

    f.componentInstance.SelectEntityOption(aiModelsOpt);
    f.detectChanges();
    expect(f.componentInstance.NewBlockEntityName).toBe('MJ: AI Models');
    expect(f.componentInstance.NewBlockLabel).toBe('AI Models — Default View');

    f.componentInstance.AvailableEntityViews = [
      { ID: 'view-active-models', Name: 'Active Production Models', Description: 'IsActive = 1' },
    ];
    f.componentInstance.SetBlockViewSelectionMode('saved');
    f.detectChanges();
    expect(f.componentInstance.NewBlockViewID).toBe('view-active-models');
    expect(f.componentInstance.NewBlockViewName).toBe('Active Production Models');
    expect(f.componentInstance.NewBlockLabel).toBe('AI Models — Active Production Models');

    await f.componentInstance.ConfirmBlockInsertModal();
    f.detectChanges();

    expect(f.componentInstance.MarkdownContent).toContain('"EntityName": "MJ: AI Models"');
    expect(f.componentInstance.MarkdownContent).toContain('"ViewID": "view-active-models"');
    expect(f.componentInstance.MarkdownContent).toContain('"ViewName": "Active Production Models"');
  });

  it('supports Progressive Disclosure ribbon, reconfiguring existing Views, collapsible blocks/headings, bounded pagination, clickable PK/FK links, and Share modal', async () => {
    const mock = createDocsMockProvider();
    const f = await renderDocsViewer(INITIAL_DOC_CONTENT, false, mock.provider);
    const comp = f.componentInstance;

    // 1. Progressive Disclosure
    expect(comp.ShowFormattingRibbon).toBe(false);
    comp.ToggleFormattingRibbon();
    expect(comp.ShowFormattingRibbon).toBe(true);

    expect(comp.ShowMoreToolsMenu).toBe(false);
    comp.ToggleMoreToolsMenu();
    expect(comp.ShowMoreToolsMenu).toBe(true);
    comp.CloseMoreToolsMenu();
    expect(comp.ShowMoreToolsMenu).toBe(false);

    // 2. Re-configuring an existing EntityView block in place
    const liveBlockSeg = comp.DocumentSegments.find((s) => s.Descriptor?.BlockID === 'blk-live-1')!;
    expect(liveBlockSeg).toBeDefined();

    comp.OpenConfigureBlockModal(liveBlockSeg.Descriptor!);
    f.detectChanges();
    expect(comp.EditingBlockID).toBe('blk-live-1');
    expect(comp.GetInsertModalTitle()).toBe('Configure Live View');
    expect(comp.GetInsertConfirmButtonLabel()).toBe('Update View');

    comp.NewBlockEntityName = 'MJ: Conversations';
    comp.NewBlockViewSelectionMode = 'saved';
    comp.NewBlockViewID = 'view-conv-open';
    comp.NewBlockViewName = 'Open Discussions';
    comp.NewBlockLabel = 'Conversations — Open Discussions';
    comp.NewBlockPageSize = 25;
    comp.NewBlockDefaultCollapsed = true;
    await comp.ConfirmBlockInsertModal();
    await new Promise((r) => setTimeout(r, 15));
    f.detectChanges();

    const updatedSeg = comp.DocumentSegments.find((s) => s.Descriptor?.BlockID === 'blk-live-1')!;
    expect(updatedSeg.Descriptor?.EntityName).toBe('MJ: Conversations');
    expect(updatedSeg.Descriptor?.ViewID).toBe('view-conv-open');
    expect(updatedSeg.Descriptor?.ViewName).toBe('Open Discussions');
    expect(updatedSeg.Descriptor?.PageSize).toBe(25);
    expect(updatedSeg.Descriptor?.Collapsed).toBe(true);

    // 3. Two-layer block collapse
    expect(comp.IsBlockCollapsed(updatedSeg.Descriptor!)).toBe(true);
    comp.ToggleBlockCollapsed(updatedSeg.Descriptor!);
    expect(comp.IsBlockCollapsed(updatedSeg.Descriptor!)).toBe(false);

    // 4. Heading collapse
    const headingSeg = comp.DocumentSegments.find((s) => s.BlockKind === 'heading')!;
    expect(comp.IsHeadingCollapsed(headingSeg)).toBe(false);
    expect(comp.GetCollapsedChildCount(headingSeg)).toBeGreaterThan(0);
    comp.ToggleHeadingCollapse(headingSeg);
    expect(comp.IsHeadingCollapsed(headingSeg)).toBe(true);
    const secondSeg = comp.DocumentSegments[1];
    expect(comp.IsSegmentHiddenByCollapsedHeading(secondSeg)).toBe(true);
    comp.ToggleHeadingCollapse(headingSeg);
    expect(comp.IsSegmentHiddenByCollapsedHeading(secondSeg)).toBe(false);

    // 5. Bounded pagination & clickable PK/FK record links from real ExecuteBlock results
    comp.SetBlockPageSize(updatedSeg.Descriptor!, 1);
    const execResult = comp.GetBlockExecutionResult(updatedSeg.Descriptor!);
    const page1Rows = comp.GetPaginatedBlockRows(updatedSeg.Descriptor!, execResult.Rows);
    expect(page1Rows).toHaveLength(1);
    expect(comp.GetBlockTotalPages(updatedSeg.Descriptor!, execResult.Rows.length)).toBe(2);

    comp.ChangeBlockPage(updatedSeg.Descriptor!, 1, execResult.Rows.length);
    expect(comp.GetBlockPageNumber(updatedSeg.Descriptor!)).toBe(2);

    const emittedRecords: Array<{ entityName: string; keyStr: string }> = [];
    comp.OpenEntityRecord.subscribe((evt) => {
      emittedRecords.push({ entityName: evt.entityName, keyStr: evt.compositeKey.ToConcatenatedString() });
    });

    const nameCol = execResult.Columns.find((c) => c.Name === 'Name')!;
    const fkCol = execResult.Columns.find((c) => c.Name === 'Type')!;
    expect(comp.IsCellRecordLink(nameCol, execResult.Rows[0])).toBe(true);
    expect(comp.IsCellRecordLink(fkCol, execResult.Rows[0])).toBe(true);

    comp.OnBlockRecordCellClick(updatedSeg.Descriptor!, nameCol, execResult.Rows[0]);
    comp.OnBlockRecordCellClick(updatedSeg.Descriptor!, fkCol, execResult.Rows[0]);
    expect(emittedRecords).toHaveLength(2);
    expect(emittedRecords[0].entityName).toBe('MJ: Conversations');
    expect(emittedRecords[1].entityName).toBe('MJ: Artifact Types');

    // 6. Share & Permissions modal persists real MJArtifactPermissionEntity and deletes on revoke
    comp.OpenPermissionsModal();
    await new Promise((r) => setTimeout(r, 15));
    expect(comp.ShowPermissionsModal).toBe(true);
    comp.SelectedPermissionUserID = '33333333-3333-4333-8333-333333333333';
    comp.SelectedPermissionLevel = 'Edit';
    await comp.GrantArtifactPermission();
    const granted = comp.ArtifactPermissionEntries.find((e) => e.UserID === '33333333-3333-4333-8333-333333333333');
    expect(granted).toBeDefined();
    expect(granted?.CanEdit).toBe(true);

    await comp.RevokeArtifactPermission(granted!);
    expect(mock.deletedPermissionIds).toContain(granted!.ID);
    expect(comp.ArtifactPermissionEntries.some((e) => e.UserID === '33333333-3333-4333-8333-333333333333')).toBe(false);
    comp.ClosePermissionsModal();
    expect(comp.ShowPermissionsModal).toBe(false);

    // 7. Suggest Mode: word-level redline, per-word hunk accept/reject, and commit on Save Version
    comp.SetViewMode('edit');
    const initialParagraphSeg = comp.DocumentSegments.find((s) => s.Kind === 'markdown' && s.BlockKind === 'paragraph')!;
    expect(initialParagraphSeg).toBeDefined();
    comp.ApplyInPlaceSegmentChange(
      initialParagraphSeg,
      'This paragraph introduces the strategic vision and quarterly milestones.',
      'Baseline paragraph',
    );
    comp.SetViewMode('suggest');
    const paragraphSeg = comp.DocumentSegments.find((s) => s.Kind === 'markdown' && s.BlockKind === 'paragraph')!;
    expect(paragraphSeg).toBeDefined();

    comp.ApplyInPlaceSegmentChange(
      paragraphSeg,
      'This paragraph introduces the long-term vision and annual milestones.',
      'Word-level suggestion',
    );
    f.detectChanges();

    expect(comp.PendingSuggestionsCount).toBe(1);
    expect(comp.HasUnsavedChanges).toBe(true);

    const activeSug = comp.GetSuggestionsForBlock(paragraphSeg.SegmentID)[0];
    expect(activeSug).toBeDefined();
    const wordDiff = comp.GetSuggestionWordDiff(activeSug);
    expect(wordDiff.Hunks).toHaveLength(2);

    comp.AcceptSuggestionHunk(activeSug, wordDiff.Hunks[0]);
    f.detectChanges();
    const updatedParagraphSeg = comp.DocumentSegments.find((s) => s.Kind === 'markdown' && s.BlockKind === 'paragraph')!;
    expect(updatedParagraphSeg.RawMarkdown).toBe('This paragraph introduces the long-term vision and quarterly milestones.');
    expect(comp.PendingSuggestionsCount).toBe(1);

    await comp.OnSaveDocumentVersion();
    expect(comp.PendingSuggestionsCount).toBe(0);
    expect(comp.MarkdownContent).toContain('This paragraph introduces the long-term vision and annual milestones.');

    // 8. Read-only mode hides Write, Suggest, Format, Insert, and Save Version buttons
    f.componentRef.setInput('readonly', true);
    f.detectChanges();
    const roRoot = f.nativeElement as HTMLElement;
    expect(comp.ViewMode).toBe('preview');
    expect(roRoot.querySelector('[data-testid="mode-edit-btn"]')).toBeNull();
    expect(roRoot.querySelector('[data-testid="mode-suggest-btn"]')).toBeNull();
    expect(roRoot.querySelector('[data-testid="save-doc-version-btn"]')).toBeNull();
  });

  it('renders Unverified Snapshot warning without attribution when SnapshotContentHash is missing/tampered (Blocker 3) and wires dispatchAgentCommentMention modes', async () => {
    const unverifiedFrozenDoc = [
      '# Governance Report',
      '',
      ':::mj-block',
      JSON.stringify({
        BlockID: 'blk-tampered-1',
        Kind: 'EntityView',
        Mode: 'Frozen',
        EntityName: 'MJ: Projects',
        FrozenSnapshot: {
          FrozenAt: '2026-11-10T12:00:00.000Z',
          FrozenByUserID: 'u-spoofed',
          FrozenByUserName: 'Spoofed CFO',
          Columns: [{ Name: 'Name', DisplayName: 'Name' }],
          Rows: [{ Name: 'Tampered Row' }],
          TotalRowCount: 1,
          SecurityWarningAcknowledged: true,
        },
      }),
      ':::',
    ].join('\n');

    const mock = createDocsMockProvider();
    const f = await renderDocsViewer(unverifiedFrozenDoc, false, mock.provider);
    const root = f.nativeElement as HTMLElement;
    const comp = f.componentInstance;

    const warningBanner = root.querySelector('[data-testid="unverified-snapshot-banner"]');
    expect(warningBanner).not.toBeNull();
    expect(warningBanner?.textContent).toContain('Unverified Snapshot — signature missing or invalid');
    expect(warningBanner?.textContent).not.toContain('Spoofed CFO');
    expect(root.querySelector('[data-testid="frozen-provenance-banner"]')).toBeNull();

    // Verify DispatchAgentCommentMention modes ('comment' | 'suggest' | 'edit')
    const firstSeg = comp.DocumentSegments[0];
    comp.OpenAnchorCommentForSegment(firstSeg);
    comp.NewCommentAgentMode = 'comment';
    comp.NewCommentText = 'What do you think @Assistant?';
    await comp.PostAnchoredComment();
    const thread = comp.AnchoredThreads[0];

    comp.DispatchAgentCommentMention(thread, 'Assistant', {
      replyMessage: 'Looks well structured.',
      proposedMarkdown: '# Should Not Apply In Comment Mode',
    });
    expect(thread.Messages).toHaveLength(2);
    expect(comp.PendingSuggestionsCount).toBe(0);
    expect(comp.MarkdownContent).toContain('# Governance Report');

    thread.AgentMode = 'suggest';
    comp.DispatchAgentCommentMention(thread, 'Assistant', {
      replyMessage: 'Here is a suggested title.',
      proposedMarkdown: '# Governance Report — Q4',
      rationale: 'Add quarter',
    });
    expect(comp.PendingSuggestionsCount).toBe(1);
    expect(comp.MarkdownContent).toContain('# Governance Report');

    thread.AgentMode = 'edit';
    comp.DispatchAgentCommentMention(thread, 'Assistant', {
      replyMessage: 'Applied title update.',
      proposedMarkdown: '# Governance Report — Final',
    });
    expect(comp.MarkdownContent).toContain('# Governance Report — Final');
  });

  it('renders WYSIWYG <strong>/<em> inside contenteditable surfaces and round-trips DOM bold/italic elements cleanly', async () => {
    const mock = createDocsMockProvider();
    const f = await renderDocsViewer(
      '# Demo Doc\n\n- Collaborative real-time editing\n\nPlain paragraph text',
      false,
      mock.provider,
    );
    const root = f.nativeElement as HTMLElement;
    const comp = f.componentInstance;

    const listSeg = comp.DocumentSegments[1];
    expect(listSeg.BlockKind).toBe('list');
    const listEl = root.querySelector<HTMLElement>(`[data-testid="list-item-text-${listSeg.SegmentID}-0"]`);
    expect(listEl).not.toBeNull();

    // Select 'ative' in 'Collaborative' via visible DOM snapshot and apply Bold + Italic
    comp.OnListItemFocus(listSeg, 0);
    comp.CaptureSelectionSnapshot({
      segmentId: listSeg.SegmentID,
      listItemIndex: 0,
      start: 8,
      end: 13,
    });
    comp.InsertFormattingSnippet('**', '**');
    f.detectChanges();

    const updatedListSeg = comp.DocumentSegments[1];
    const updatedListEl = root.querySelector<HTMLElement>(
      `[data-testid="list-item-text-${updatedListSeg.SegmentID}-0"]`,
    );
    expect(updatedListEl).not.toBeNull();
    expect(updatedListEl?.querySelector('strong')?.textContent).toBe('ative');
    expect(updatedListEl?.textContent).toBe('Collaborative real-time editing');

    // Simulate native browser <em> / <b> DOM nodes created inside contenteditable and verify ExtractMarkdownFromEditableElement round-trips them
    const syntheticEditable = document.createElement('div');
    syntheticEditable.innerHTML = 'Hello <b>bold</b> and <em>italic</em> and <code>snippet</code>';
    expect(comp.ExtractMarkdownFromEditableElement(syntheticEditable)).toBe(
      'Hello **bold** and *italic* and `snippet`',
    );
  });

  it('uses progressive disclosure toolbar defaults, supports pinning actions and Blocks chip, and resets cleanly via DOM clicks', async () => {
    const store = new Map<string, string>();
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation((key: string) => store.get(key));
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    });

    try {
      const mock = createDocsMockProvider();
      const f = await renderDocsViewer('# Calm Toolbar\n\nSimple starter doc.', false, mock.provider);
      const root = f.nativeElement as HTMLElement;
      const comp = f.componentInstance;

      const leftBar = root.querySelector('.mj-docs-toolbar__left')!;
      const rightBar = root.querySelector('.mj-docs-toolbar__right')!;
      const moreMenu = root.querySelector<HTMLElement>('[data-testid="docs-more-tools-menu"]')!;

      // Calm Option A default toolbar buttons (format & comments pinned; outline & insert-block stay inside More / Cmd+K)
      expect(leftBar.querySelector('[data-testid="mode-preview-btn"]')).not.toBeNull();
      expect(leftBar.querySelector('[data-testid="mode-edit-btn"]')).not.toBeNull();
      expect(leftBar.querySelector('[data-testid="toggle-outline-btn"]')).toBeNull();
      expect(leftBar.querySelector('[data-testid="toggle-format-ribbon-btn"]')).not.toBeNull();
      expect(leftBar.querySelector('[data-testid="open-slash-menu-btn"]')).toBeNull();
      expect(rightBar.querySelector('[data-testid="toggle-comments-btn"]')).not.toBeNull();
      expect(rightBar.querySelector('[data-testid="docs-cmdk-btn"]')).not.toBeNull();
      expect(rightBar.querySelector('[data-testid="save-doc-version-btn"]')).not.toBeNull();
      expect(rightBar.querySelector('[data-testid="toggle-more-tools-btn"]')).not.toBeNull();

      // Unpinned quick-add-section-btn is inside hidden More menu, not on leftBar
      expect(moreMenu.hasAttribute('hidden')).toBe(true);
      expect(leftBar.querySelector('[data-testid="quick-add-section-btn"]')).toBeNull();
      expect(moreMenu.querySelector('[data-testid="quick-add-section-btn"]')).not.toBeNull();

      // Open More menu and click pin for add-section -> moves quick-add-section-btn onto leftBar
      root.querySelector<HTMLButtonElement>('[data-testid="toggle-more-tools-btn"]')!.click();
      f.detectChanges();
      expect(moreMenu.hasAttribute('hidden')).toBe(false);

      root.querySelector<HTMLButtonElement>('[data-testid="menu-pin-add-section"]')!.click();
      f.detectChanges();
      expect(leftBar.querySelector('[data-testid="quick-add-section-btn"]')).not.toBeNull();
      expect(moreMenu.querySelector('[data-testid="menu-quick-add-section-btn"]')).not.toBeNull();

      // Switching to Block Studio while blocks-mode is unpinned reveals active-style-chip-blocks; clicking it returns to simple
      comp.SetEditingStyle('blocks');
      f.detectChanges();
      const blocksChip = leftBar.querySelector<HTMLButtonElement>('[data-testid="active-style-chip-blocks"]');
      expect(blocksChip).not.toBeNull();
      blocksChip!.click();
      f.detectChanges();
      expect(comp.EditingStyle).toBe('simple');
      expect(leftBar.querySelector('[data-testid="active-style-chip-blocks"]')).toBeNull();

      // Clicking Reset resets pins back to calm defaults
      const resetBtn = moreMenu.querySelector<HTMLButtonElement>('[data-testid="reset-toolbar-pins-btn"]')!;
      expect(resetBtn).not.toBeNull();
      resetBtn.click();
      f.detectChanges();
      expect(leftBar.querySelector('[data-testid="quick-add-section-btn"]')).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('rejects non-UUID embedded artifact short-IDs (e.g. "D") before executing SQL RunView and displays a clean error message', async () => {
    const mock = createDocsMockProvider();
    mock.provider.Entities.length = 0;
    const runViewSpy = vi.spyOn(mock.provider, 'RunView').mockImplementation(async () => ({
      Success: true,
      Results: [],
      RowCount: 0,
      TotalRowCount: 0,
      ExecutionTime: 0,
      ErrorMessage: '',
    }));

    const brokenDoc = [
      '# Silk Road History',
      '',
      ':::mj-block',
      JSON.stringify(
        {
          BlockID: 'mj-artifact-bad-id',
          Kind: 'Artifact',
          Mode: 'Live',
          Title: 'Silk Road Trade Analysis',
          ArtifactID: 'D',
          ArtifactType: 'Excel Spreadsheet',
          EmbedMode: 'Inline',
          VersionID: null,
        },
        null,
        2,
      ),
      ':::',
    ].join('\n');

    const f = await renderDocsViewer(brokenDoc, true, mock.provider);
    await new Promise((r) => setTimeout(r, 20));
    f.detectChanges();

    const embeddedVersionCalls = runViewSpy.mock.calls.filter(
      (call) =>
        call[0]?.EntityName === 'MJ: Artifact Versions' &&
        String(call[0]?.ExtraFilter ?? '').includes("'D'"),
    );
    expect(embeddedVersionCalls).toHaveLength(0);
    const errMsg = f.componentInstance.GetEmbeddedArtifactError({
      BlockID: 'mj-artifact-bad-id',
      Kind: 'Artifact',
      Mode: 'Live',
      ArtifactID: 'D',
      VersionID: null,
    });
    expect(errMsg).toContain('not a valid artifact UUID');
  });

  it('wraps selected prose text in Bold via right-click context menu and closes the menu', async () => {
    const f = await renderDocsViewer('# Title\n\nInitial narrative paragraph.');
    const comp = f.componentInstance;
    comp.SetViewMode('edit');
    f.detectChanges();

    const paraSeg = comp.DocumentSegments.find((s) => s.Kind === 'markdown' && s.RawMarkdown.includes('Initial narrative'));
    expect(paraSeg).toBeTruthy();
    const segId = paraSeg!.SegmentID;

    comp.CaptureSelectionSnapshot({
      segmentId: segId,
      start: 8,
      end: 17,
    });

    const paraEl = f.nativeElement.querySelector(
      `[data-testid="editable-paragraph-${segId}"]`,
    ) as HTMLElement | null;
    expect(paraEl).toBeTruthy();

    const ctxEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 220,
    });
    paraEl!.dispatchEvent(ctxEvent);
    f.detectChanges();

    expect(ctxEvent.defaultPrevented).toBe(true);
    expect(f.nativeElement.querySelector('[data-testid="mj-context-menu-root"]')).toBeTruthy();

    const formatSubmenuBtn = f.nativeElement.querySelector(
      '[data-testid="mj-context-menu-item-format-text"]',
    ) as HTMLButtonElement | null;
    expect(formatSubmenuBtn).toBeTruthy();
    formatSubmenuBtn!.click();
    f.detectChanges();

    const boldBtn = f.nativeElement.querySelector(
      '[data-testid="mj-context-menu-item-format-bold"]',
    ) as HTMLButtonElement | null;
    expect(boldBtn).toBeTruthy();
    boldBtn!.click();
    f.detectChanges();

    expect(comp.MarkdownContent).toContain('Initial **narrative** paragraph.');
    expect(f.nativeElement.querySelector('[data-testid="mj-context-menu-root"]')).toBeNull();
  });

  it('executes table context menu actions: insert row below, align center, delete row, and copy as CSV', async () => {
    const writeTextMock = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
        readText: vi.fn(async () => ''),
      },
      configurable: true,
    });

    const f = await renderDocsViewer('# Metrics\n\n| Metric | Value |\n| --- | --- |\n| ARR | 100 |\n| NRR | 120 |');
    const comp = f.componentInstance;
    comp.SetViewMode('edit');
    f.detectChanges();

    const tableSeg = comp.DocumentSegments.find((s) => s.Kind === 'markdown' && s.RawMarkdown.includes('| Metric |'));
    expect(tableSeg).toBeTruthy();
    const segId = tableSeg!.SegmentID;

    // 1. Insert Row Below on row 0, col 1
    const cell01 = f.nativeElement.querySelector(
      `[data-testid="table-cell-${segId}-0-1"]`,
    ) as HTMLElement | null;
    expect(cell01).toBeTruthy();
    cell01!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 120 }));
    f.detectChanges();

    const insertBelowBtn = f.nativeElement.querySelector(
      '[data-testid="mj-context-menu-item-table-insert-row-below"]',
    ) as HTMLButtonElement | null;
    expect(insertBelowBtn).toBeTruthy();
    insertBelowBtn!.click();
    f.detectChanges();

    const updatedAfterInsert = comp.DocumentSegments.find((s) => s.SegmentID === segId)!;
    expect(comp.GetParsedTable(updatedAfterInsert).Rows.length).toBe(3);

    // 2. Align Column Center (:---:)
    const cellAfterInsert = f.nativeElement.querySelector(
      `[data-testid="table-cell-${segId}-0-1"]`,
    ) as HTMLElement | null;
    cellAfterInsert!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 120 }));
    f.detectChanges();

    const alignMenuBtn = f.nativeElement.querySelector(
      '[data-testid="mj-context-menu-item-table-align-col"]',
    ) as HTMLButtonElement | null;
    expect(alignMenuBtn).toBeTruthy();
    alignMenuBtn!.click();
    f.detectChanges();

    const alignCenterBtn = f.nativeElement.querySelector(
      '[data-testid="mj-context-menu-item-table-align-center"]',
    ) as HTMLButtonElement | null;
    expect(alignCenterBtn).toBeTruthy();
    alignCenterBtn!.click();
    f.detectChanges();

    expect(comp.MarkdownContent).toContain(':---:');
    const alignedCell = f.nativeElement.querySelector(
      `[data-testid="table-cell-${segId}-0-1"]`,
    ) as HTMLElement | null;
    expect(alignedCell?.style.textAlign).toBe('center');

    // 3. Delete inserted row (row 1)
    const insertedRowCell = f.nativeElement.querySelector(
      `[data-testid="table-cell-${segId}-1-1"]`,
    ) as HTMLElement | null;
    expect(insertedRowCell).toBeTruthy();
    insertedRowCell!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 160 }));
    f.detectChanges();

    const deleteRowBtn = f.nativeElement.querySelector(
      '[data-testid="mj-context-menu-item-table-delete-row"]',
    ) as HTMLButtonElement | null;
    expect(deleteRowBtn).toBeTruthy();
    deleteRowBtn!.click();
    f.detectChanges();

    const updatedAfterDelete = comp.DocumentSegments.find((s) => s.SegmentID === segId)!;
    expect(comp.GetParsedTable(updatedAfterDelete).Rows.length).toBe(2);

    // 4. Copy Table As CSV
    const cellForCsv = f.nativeElement.querySelector(
      `[data-testid="table-cell-${segId}-0-0"]`,
    ) as HTMLElement | null;
    cellForCsv!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 120 }));
    f.detectChanges();

    const copyAsBtn = f.nativeElement.querySelector(
      '[data-testid="mj-context-menu-item-table-copy-as"]',
    ) as HTMLButtonElement | null;
    expect(copyAsBtn).toBeTruthy();
    copyAsBtn!.click();
    f.detectChanges();

    const copyCsvBtn = f.nativeElement.querySelector(
      '[data-testid="mj-context-menu-item-table-copy-csv"]',
    ) as HTMLButtonElement | null;
    expect(copyCsvBtn).toBeTruthy();
    copyCsvBtn!.click();
    f.detectChanges();

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedCsv = writeTextMock.mock.calls[0]?.[0] ?? '';
    expect(copiedCsv).toContain('Metric,Value');
    expect(copiedCsv).toContain('ARR,100');
    expect(copiedCsv).toContain('NRR,120');
  });

  it('bypasses custom context menu on Shift+Right-Click so native browser menu is preserved', async () => {
    const f = await renderDocsViewer('# Title\n\nShift right click paragraph.');
    const comp = f.componentInstance;
    comp.SetViewMode('edit');
    f.detectChanges();

    const paraSeg = comp.DocumentSegments.find((s) => s.Kind === 'markdown' && s.RawMarkdown.includes('Shift right click'));
    expect(paraSeg).toBeTruthy();
    const paraEl = f.nativeElement.querySelector(
      `[data-testid="editable-paragraph-${paraSeg!.SegmentID}"]`,
    ) as HTMLElement | null;
    expect(paraEl).toBeTruthy();

    const shiftCtx = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      clientX: 100,
      clientY: 100,
    });
    paraEl!.dispatchEvent(shiftCtx);
    f.detectChanges();

    expect(shiftCtx.defaultPrevented).toBe(false);
    expect(f.nativeElement.querySelector('[data-testid="mj-context-menu-root"]')).toBeNull();
  });

  it('respects defaultPrevented from an embedded OLE whiteboard plugin without opening the Docs context menu', async () => {
    const wbArtifactId = '22222222-2222-4222-8222-222222222222';
    const docWithUuidWb = [
      '# Architecture Doc',
      '',
      ':::mj-block',
      '{',
      '  "BlockID": "blk-wb-bypass",',
      '  "Kind": "Artifact",',
      '  "Mode": "Live",',
      '  "Title": "System Diagram",',
      `  "ArtifactID": "${wbArtifactId}",`,
      '  "ArtifactType": "Whiteboard",',
      '  "EmbedMode": "Inline"',
      '}',
      ':::',
    ].join('\n');

    const mock = createDocsMockProvider();
    const baseRunView = mock.provider.RunView.bind(mock.provider);
    vi.spyOn(mock.provider, 'RunView').mockImplementation(async (params, contextUser) => {
      if (params.EntityName === 'MJ: Artifact Versions' && String(params.ExtraFilter ?? '').includes(wbArtifactId)) {
        return {
          Success: true,
          Results: [
            {
              ID: '33333333-3333-4333-8333-333333333333',
              ArtifactID: wbArtifactId,
              VersionNumber: 1,
              Name: 'System Diagram',
              Content: '{"version":1,"activePageId":"page-1","pages":[{"id":"page-1","name":"Page 1","items":[]}]}',
            },
          ],
          RowCount: 1,
          TotalRowCount: 1,
          ExecutionTime: 0,
          ErrorMessage: '',
        };
      }
      return baseRunView(params, contextUser);
    });

    const f = await renderDocsViewer(docWithUuidWb, false, mock.provider);
    const comp = f.componentInstance;
    comp.SetViewMode('edit');
    f.detectChanges();

    const wbSeg = comp.DocumentSegments.find((s) => s.SegmentID === 'blk-wb-bypass');
    expect(wbSeg?.Descriptor).toBeTruthy();
    comp.ToggleInlineArtifactEdit(wbSeg!.Descriptor!);
    await f.whenStable();
    await new Promise((r) => setTimeout(r, 20));
    f.detectChanges();

    const oleChild = f.nativeElement.querySelector(
      '[data-testid="ole-artifact-block-blk-wb-bypass"] .stub-ole-plugin',
    ) as HTMLElement | null;
    expect(oleChild).toBeTruthy();

    oleChild!.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    const childEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 200,
    });
    oleChild!.dispatchEvent(childEvent);
    f.detectChanges();

    expect(childEvent.defaultPrevented).toBe(true);
    expect(f.nativeElement.querySelector('[data-testid="mj-context-menu-root"]')).toBeNull();
  });

  it('performs partial cuts on formatted text ("Hello **world**") without deleting the block or corrupting markers, and preserves heading prefixes on sub-element paste/cut', async () => {
    const f = await renderDocsViewer('Hello **world**\n\n## Alpha Beta');
    const comp = f.componentInstance;
    const rootEl = f.nativeElement as HTMLElement;
    comp.SetViewMode('edit');
    f.detectChanges();

    const paraSeg = comp.DocumentSegments.find((s) => s.BlockKind === 'paragraph')!;
    expect(paraSeg).toBeTruthy();

    comp.CaptureSelectionSnapshot({
      segmentId: paraSeg.SegmentID,
      start: 6,
      end: 11,
    });
    const paraEl = rootEl.querySelector<HTMLElement>(
      `[data-testid="editable-paragraph-${paraSeg.SegmentID}"]`,
    )!;
    paraEl.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }),
    );
    f.detectChanges();

    comp.OnDocsContextMenuCommand({
      Type: 'clipboard',
      Action: 'cut',
      SegmentID: paraSeg.SegmentID,
    });
    f.detectChanges();
    expect(comp.DocumentSegments.length).toBe(2);
    expect(comp.MarkdownContent).toContain('Hello');
    expect(comp.MarkdownContent).not.toContain('**world**');
    expect(comp.MarkdownContent).not.toContain('****');

    // Cross-boundary cut on formatted inline tokens
    comp.OnMarkdownChanged('Hello **world**\n\n## Alpha Beta');
    f.detectChanges();
    const paraSeg2 = comp.DocumentSegments.find((s) => s.BlockKind === 'paragraph')!;
    comp.CaptureSelectionSnapshot({
      segmentId: paraSeg2.SegmentID,
      start: 3,
      end: 8,
    });
    const paraEl2 = rootEl.querySelector<HTMLElement>(
      `[data-testid="editable-paragraph-${paraSeg2.SegmentID}"]`,
    )!;
    paraEl2.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }),
    );
    f.detectChanges();
    comp.OnDocsContextMenuCommand({
      Type: 'clipboard',
      Action: 'cut',
      SegmentID: paraSeg2.SegmentID,
    });
    f.detectChanges();
    expect(comp.MarkdownContent).toContain('Hel**rld**');

    // Heading sub-element paste preserves leading '## '
    let resolveClipboard: ((value: string) => void) | undefined;
    const origClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              resolveClipboard = resolve;
            }),
        ),
      },
    });
    try {
      const headingSeg = comp.DocumentSegments.find((s) => s.BlockKind === 'heading')!;
      comp.CaptureSelectionSnapshot({
        segmentId: headingSeg.SegmentID,
        start: 0,
        end: 5,
      });
      const headingEl = rootEl.querySelector<HTMLElement>(
        `[data-testid="editable-heading-${headingSeg.SegmentID}"]`,
      )!;
      headingEl.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }),
      );
      f.detectChanges();

      comp.PasteIntoDocsSegment(headingSeg);
      expect(resolveClipboard).toBeDefined();
      resolveClipboard!('Gamma');
      await new Promise((r) => setTimeout(r, 10));
      f.detectChanges();
      expect(comp.MarkdownContent).toContain('## Gamma Beta');
      expect(comp.MarkdownContent).not.toContain('Gamma##');

      // Destroyed guard after async readText resolves
      comp.PasteIntoDocsSegment(comp.DocumentSegments[0]);
      f.destroy();
      resolveClipboard!('ShouldNotApply');
      await new Promise((r) => setTimeout(r, 10));
      expect(comp.MarkdownContent).not.toContain('ShouldNotApply');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: origClipboard });
    }
  });

  it('prevents owner-lock bypass by CanShare collaborators', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const coEditorId = '22222222-2222-4222-8222-222222222222';
    const collabMock = createDocsMockProvider({
      currentUserId: coEditorId,
      artifactOwnerId: ownerId,
      permissionGrants: [
        {
          ID: 'perm-co-share',
          UserID: coEditorId,
          CanRead: true,
          CanEdit: true,
          CanShare: true,
        },
      ],
    });
    const lockedDoc = `<!-- mj-lock:${ownerId} -->\n## Locked Section\n\nProtected body\n\n## Open Section\n\nEditable body`;
    const fCollab = await renderDocsViewer(lockedDoc, false, collabMock.provider);
    const collabComp = fCollab.componentInstance;
    collabComp.SetViewMode('edit');
    fCollab.detectChanges();

    const lockedHeading = collabComp.DocumentSegments[0];
    const lockedBody = collabComp.DocumentSegments[1];
    expect(collabComp.CanEditSegment(lockedHeading)).toBe(false);
    expect(collabComp.CanEditSegment(lockedBody)).toBe(false);

    const beforeMd = collabComp.MarkdownContent;
    collabComp.ToggleHeadingLock(lockedHeading);
    collabComp.MoveSegment(lockedBody, 1);
    collabComp.DeleteSegment(lockedBody);
    collabComp.InsertParagraphAboveSegment(lockedBody);
    collabComp.DuplicateSegment(lockedBody);
    fCollab.detectChanges();
    expect(collabComp.MarkdownContent).toBe(beforeMd);
  });

  it('routes Suggest-mode block mutations to tracked suggestions without direct Markdown mutation', async () => {
    const fSuggest = await renderDocsViewer('First paragraph\n\nSecond paragraph');
    const sugComp = fSuggest.componentInstance;
    sugComp.SetViewMode('suggest');
    fSuggest.detectChanges();

    const initialSuggestMd = sugComp.MarkdownContent;
    const firstSeg = sugComp.DocumentSegments[0];
    sugComp.MoveSegment(firstSeg, 1);
    sugComp.InsertParagraphAboveSegment(firstSeg);
    sugComp.DuplicateSegment(firstSeg);
    sugComp.DeleteSegment(sugComp.DocumentSegments[1]);
    fSuggest.detectChanges();

    expect(sugComp.MarkdownContent).toBe(initialSuggestMd);
    expect(sugComp.Suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('enforces window.open URL protocol allowlist, expands collapsed headings on anchor scroll, and orders modal footers with Primary LEFT / Cancel RIGHT', async () => {
    const f = await renderDocsViewer('# Intro\n\nHidden details\n\n## Next');
    const comp = f.componentInstance;
    const origOpen = window.open;
    const openSpy = vi.fn();
    window.open = openSpy;
    try {
      comp.OnDocsContextMenuCommand({ Type: 'preview-open-link', Url: 'javascript:alert(1)' });
      comp.OnDocsContextMenuCommand({ Type: 'preview-open-link', Url: 'java\tscript:alert(1)' });
      comp.OnDocsContextMenuCommand({ Type: 'preview-open-link', Url: 'data:text/html,<script>' });
      expect(openSpy).not.toHaveBeenCalled();

      comp.OnDocsContextMenuCommand({ Type: 'preview-open-link', Url: 'https://memberjunction.org' });
      comp.OnDocsContextMenuCommand({ Type: 'preview-open-link', Url: 'mailto:docs@memberjunction.org' });
      comp.OnDocsContextMenuCommand({ Type: 'preview-open-link', Url: '#intro' });
      expect(openSpy).toHaveBeenCalledTimes(3);
    } finally {
      window.open = origOpen;
    }

    // Collapsed heading auto-expansion on FocusSegmentByAnchorKey
    const introHeading = comp.DocumentSegments[0];
    const hiddenChild = comp.DocumentSegments[1];
    comp.ToggleHeadingCollapse(introHeading);
    f.detectChanges();
    expect(comp.IsHeadingCollapsed(introHeading)).toBe(true);
    expect(comp.IsSegmentHiddenByCollapsedHeading(hiddenChild)).toBe(true);

    const rootEl = f.nativeElement as HTMLElement;
    const scrolledIds: string[] = [];
    const childEl = rootEl.querySelector<HTMLElement>(
      `[data-segment-id="${hiddenChild.SegmentID}"]`,
    );
    if (childEl) {
      childEl.scrollIntoView = () => {
        scrolledIds.push(hiddenChild.SegmentID);
      };
    }
    comp.FocusSegmentByAnchorKey(hiddenChild.SegmentID);
    f.detectChanges();
    expect(comp.IsHeadingCollapsed(introHeading)).toBe(false);
    expect(comp.IsSegmentHiddenByCollapsedHeading(hiddenChild)).toBe(false);

    // Modal footer order: Primary LEFT, Cancel RIGHT
    comp.PromptFreezeBlock({ BlockID: 'blk-freeze-1', Kind: 'SavedQuery', Mode: 'Live', Title: 'Sales Query' });
    f.detectChanges();
    const freezeFooterBtns = Array.from(
      rootEl.querySelectorAll<HTMLButtonElement>('[data-testid="freeze-warning-modal"] .mj-docs-modal__footer button'),
    );
    expect(freezeFooterBtns.length).toBeGreaterThanOrEqual(2);
    expect(freezeFooterBtns[0].textContent).toContain('Freeze');
    expect(freezeFooterBtns[freezeFooterBtns.length - 1].textContent).toContain('Cancel');
  });

  it('P0-20: flushes unblurred contenteditable edits on HasUnsavedChanges, SetViewMode, Export, and Save', async () => {
    const f = await renderDocsViewer('# Title\n\nOriginal body.');
    const comp = f.componentInstance;
    const root = f.nativeElement as HTMLElement;
    const paraSeg = comp.DocumentSegments.find((s) => s.BlockKind === 'paragraph')!;
    const paraEl = root.querySelector<HTMLElement>(`[data-testid="editable-paragraph-${paraSeg.SegmentID}"]`)!;
    expect(paraEl).not.toBeNull();

    paraEl.textContent = 'Edited without blur';
    paraEl.dispatchEvent(new Event('input', { bubbles: true }));
    f.detectChanges();
    expect(comp.HasUnsavedChanges).toBe(true);

    // Switch to preview without firing blur -> pending DOM edit is flushed into MarkdownContent & PascalCase mj-markdown Data!
    comp.SetViewMode('preview');
    f.detectChanges();
    expect(comp.MarkdownContent).toContain('Edited without blur');
    const mdStubs = Array.from(root.querySelectorAll('.stub-mj-markdown')).map((el) => el.textContent ?? '');
    expect(mdStubs.join('\n')).toContain('Edited without blur');
  });

  it('blocks circular and depth>3 embedded artifacts via MJ_EMBEDDED_ARTIFACT_ANCESTORS', async () => {
    const selfUuid = 'aaaaaaaa-1111-4111-8111-111111111111';
    const ancestorUuid = 'bbbbbbbb-2222-4222-8222-222222222222';
    const mock = createDocsMockProvider().provider;
    const f = renderComponentFixture(MarkdownArtifactViewerComponent, {
      imports: [
        CommonModule,
        FormsModule,
        ComposerModule,
        StubMarkdownComponent,
        StubArtifactTypePluginViewerComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [MarkdownArtifactViewerComponent, MjContextMenuComponent],
      providers: [
        DocumentCollaborationService,
        DocumentImportExportService,
        { provide: MJ_EMBEDDED_ARTIFACT_ANCESTORS, useValue: new Set([ancestorUuid]) },
      ],
      inputs: {
        Provider: mock,
        artifactVersion: {
          ID: 'ver-circ-1',
          ArtifactID: selfUuid,
          VersionNumber: 1,
          Content: `:::mj-block\n{"BlockID":"blk-self","Kind":"Artifact","Mode":"Live","Title":"Self","ArtifactID":"${selfUuid}"}\n:::\n\n:::mj-block\n{"BlockID":"blk-anc","Kind":"Artifact","Mode":"Live","Title":"Ancestor","ArtifactID":"${ancestorUuid}"}\n:::`,
        } as Partial<MJArtifactVersionEntity> as MJArtifactVersionEntity,
        readonly: false,
      },
    });
    const comp = f.componentInstance;
    await vi.waitFor(() => {
      expect(comp.CanUserEdit).toBe(true);
      expect(comp.GetEmbeddedArtifactError({ BlockID: 'blk-self', Kind: 'Artifact', Mode: 'Live', ArtifactID: selfUuid })).toContain('Circular');
      expect(comp.GetEmbeddedArtifactError({ BlockID: 'blk-anc', Kind: 'Artifact', Mode: 'Live', ArtifactID: ancestorUuid })).toContain('Circular');
    });

    // Depth >= MJ_MAX_EMBED_DEPTH blocks new embeds in ConfirmBlockInsertModal
    expect(MJ_MAX_EMBED_DEPTH).toBe(3);
    comp.PendingBlockInsertType = 'Artifact';
    comp.PendingBlockIsWhiteboard = false;
    comp.NewBlockArtifactID = ancestorUuid;
    await comp.ConfirmBlockInsertModal();
    // Self/ancestor embed leaves the modal open and does not mutate document markdown
    expect(comp.PendingBlockInsertType).toBe('Artifact');
    expect(comp.MarkdownContent).not.toContain('cccccccc-3333');
  });

  it('closes all Docs lock bypasses across source mode, heading/list/code controls, suggestions, restore, import, and Backspace merge', async () => {
    const lockedDoc = [
      '<!-- mj-lock: owner-only -->',
      '## Locked Section',
      '',
      'Protected body text.',
      '',
      '- [ ] Locked task',
      '',
      '```ts',
      'const safe = true;',
      '```',
      '',
      '## Open Section',
      '',
      'Unlocked paragraph.',
    ].join('\n');

    const { provider } = createDocsMockProvider({
      currentUserId: '33333333-3333-4333-8333-333333333333',
      artifactOwnerId: '11111111-1111-4111-8111-111111111111',
      permissionGrants: [
        { ID: 'perm-1', UserID: '33333333-3333-4333-8333-333333333333', CanRead: true, CanEdit: true, CanShare: true },
      ],
    });
    const f = await renderDocsViewer(lockedDoc, false, provider);
    const comp = f.componentInstance;
    await vi.waitFor(() => expect(comp.CanUserEdit).toBe(true));

    expect(comp.HasUneditableLockedSegments).toBe(true);
    const lockedHeading = comp.DocumentSegments[0];
    const lockedPara = comp.DocumentSegments[1];
    const lockedList = comp.DocumentSegments[2];
    const lockedCode = comp.DocumentSegments[3];
    const openHeading = comp.DocumentSegments[4];
    const openPara = comp.DocumentSegments[5];

    expect(comp.CanEditSegment(lockedHeading)).toBe(false);
    expect(comp.CanEditSegment(openPara)).toBe(true);

    // 1. Source markdown modification of locked block rejected
    comp.OnSourceMarkdownChanged('# Tampered\n\nNo locks');
    expect(comp.MarkdownContent).toContain('Locked Section');

    // 2. CycleHeadingLevel, AddListItem, UpdateCodeBlockLanguage on locked segments rejected
    comp.CycleHeadingLevel(lockedHeading);
    comp.AddListItem(lockedList);
    comp.UpdateCodeBlockLanguage(lockedCode, 'js\n```\n<injected>');
    expect(comp.MarkdownContent).toContain('## Locked Section');
    expect(comp.MarkdownContent).not.toContain('<injected>');

    // Sanitization of code block language on editable code block still strips backticks/newlines
    comp.OnMarkdownChanged(`${comp.MarkdownContent}\n\n\`\`\`python\nprint(1)\n\`\`\``);
    const editableCode = comp.DocumentSegments[comp.DocumentSegments.length - 1];
    comp.UpdateCodeBlockLanguage(editableCode, 'ruby`\n```\n# evil');
    expect(editableCode.RawMarkdown || comp.MarkdownContent).not.toContain('# evil');

    // 3. Backspace at start of Unlocked paragraph immediately following Locked code block cannot merge into locked block
    comp.SetViewMode('edit');
    const mockOpenEl: Partial<HTMLTextAreaElement> = {
      textContent: 'Unlocked paragraph.',
      selectionStart: 0,
      selectionEnd: 0,
      focus: () => {},
      contains: () => false,
    };
    let prevented = false;
    comp.OnEditableBlockKeydown(openHeading, {
      key: 'Backspace',
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      target: mockOpenEl as HTMLTextAreaElement as HTMLElement,
      preventDefault: () => {
        prevented = true;
      },
    } as Partial<KeyboardEvent> as KeyboardEvent);
    expect(prevented).toBe(true);
    expect(comp.MarkdownContent).toContain('const safe = true;');

    // 4. Suggestion targeting locked block cannot be accepted/rejected/committed
    const lockedSug = comp.CreateOrUpdatePendingSuggestion(
      lockedPara.SegmentID,
      lockedPara.RawMarkdown,
      'Hijacked body text.',
      'Attempted bypass',
    );
    expect(comp.CanEditSuggestionTarget(lockedSug)).toBe(false);
    comp.AcceptSuggestion(lockedSug);
    expect(lockedSug.Status).toBe('Pending');
    expect(comp.MarkdownContent).toContain('Protected body text.');

    // 5. RestoreComparisonBase cannot wipe locked section
    comp.SavedVersionSnapshots = [{ VersionNumber: 0, Content: 'No locks here', Timestamp: 'now' }];
    comp.DiffBaseLabel = 'v0';
    comp.RestoreComparisonBase();
    expect(comp.MarkdownContent).toContain('Locked Section');

    // 6. PromptFreezeBlock on locked block blocked
    comp.PromptFreezeBlock({ BlockID: lockedCode.SegmentID, Kind: 'SavedQuery', Mode: 'Live', Title: 'Test' });
    // Segment mismatch check when block is actually inside a lock
    lockedHeading.Descriptor = { BlockID: 'blk-in-lock', Kind: 'SavedQuery', Mode: 'Live', Title: 'Locked Block' };
    expect(comp.IsSegmentLocked(lockedHeading)).toBe(true);
    expect(comp.CanEditSegment(lockedHeading)).toBe(false);
  });

  it('escapes and unescapes pipes cleanly in tables and supports NW-1 Live-vs-Frozen Drift Governance', async () => {
    const md = [
      '| Expr | Result |',
      '| --- | --- |',
      '| A \\| B | Pass |',
      '',
      ':::mj-block',
      JSON.stringify({
        BlockID: 'blk-drift-1',
        Kind: 'EntityView',
        Mode: 'Frozen',
        Title: 'Revenue Table',
        EntityName: 'MJ: Artifacts',
        FrozenSnapshot: {
          FrozenAt: '2026-11-10T00:00:00Z',
          FrozenByUserID: '11111111-1111-4111-8111-111111111111',
          FrozenByUserName: 'Alex Author',
          Columns: [
            { Name: 'ID', DisplayName: 'ID', DataType: 'string', IsPrimaryKey: true },
            { Name: 'Name', DisplayName: 'Name', DataType: 'string' },
          ],
          Rows: [{ ID: 'row-old', Name: 'Old Artifact' }],
          TotalRowCount: 1,
        },
      }),
      ':::',
    ].join('\n');

    const execSpy = vi.spyOn(DocumentLiveBlockEngine.Instance, 'ExecuteBlock').mockResolvedValue({
      BlockID: 'blk-drift-1',
      Kind: 'EntityView',
      Mode: 'Live',
      Success: true,
      Columns: [
        { Name: 'ID', DisplayName: 'ID', Type: 'string', IsPrimaryKey: true },
        { Name: 'Name', DisplayName: 'Name', Type: 'string' },
      ],
      Rows: [{ ID: 'row-new', Name: 'New Artifact' }],
      TotalRowCount: 1,
    });

    try {
      const f = await renderDocsViewer(md);
      const comp = f.componentInstance;
      await vi.waitFor(() => expect(comp.CanUserEdit).toBe(true));
      const tableSeg = comp.DocumentSegments.find((s) => s.BlockKind === 'table')!;
      const parsed = comp.GetParsedTable(tableSeg);
      expect(parsed.Rows[0]).toEqual(['A | B', 'Pass']);

      const editedCell = document.createElement('td');
      editedCell.textContent = 'X | Y';
      comp.UpdateTableBodyCell(tableSeg, 0, 1, {
        target: editedCell,
      } as Partial<Event> as Event);
      expect(comp.MarkdownContent).toContain('A \\| B');
      expect(comp.MarkdownContent).toContain('X \\| Y');

      const frozenSeg = comp.DocumentSegments.find((s) => s.Kind === 'mj-block' && s.Descriptor?.BlockID === 'blk-drift-1')!;
      expect(frozenSeg).toBeDefined();
      await comp.CompareFrozenBlockWithLive(frozenSeg.Descriptor!);
      f.detectChanges();

      const drift = comp.GetFrozenDriftComparison('blk-drift-1');
      expect(drift).toBeDefined();
      expect(drift?.AddedRows).toBe(1);
      expect(drift?.RemovedRows).toBe(1);
      const panel = (f.nativeElement as HTMLElement).querySelector('[data-testid="frozen-drift-panel-blk-drift-1"]');
      expect(panel).not.toBeNull();
      expect(panel?.textContent).toContain('+1 new rows');
      expect(panel?.textContent).toContain('-1 removed');
    } finally {
      execSpy.mockRestore();
    }
  });

  it('NW-3 & Socket Save Hold: supports comment thread replies, positional SegmentID reconciliation, IsSavingVersion hold, and RoomResetConflict recovery', async () => {
    const f = await renderDocsViewer('First paragraph\n\nSecond paragraph');
    const comp = f.componentInstance;
    comp.SetViewMode('edit');

    // 1. Thread Reply persistence (ReplyToAnchoredThread)
    const thread = {
      ConversationID: '77777777-7777-4777-8777-777777777777',
      AnchorKey: comp.DocumentSegments[0].SegmentID,
      AnchorLabel: 'First paragraph',
      QuotedText: 'First paragraph',
      Status: 'Open' as const,
      AgentMode: 'comment' as const,
      CreatedAt: '2026-11-15T00:00:00Z',
      Messages: [
        {
          DetailID: 'd-1',
          UserName: 'Alex Author',
          Role: 'User' as const,
          Message: 'Initial comment',
          CreatedAt: '2026-11-15T00:00:00Z',
          Mentions: [],
        },
      ],
    };
    comp.AnchoredThreads = [thread];
    comp.SetThreadReplyDraft(thread.ConversationID, 'Looks good to ship!');
    await comp.ReplyToAnchoredThread(thread);
    expect(thread.Messages).toHaveLength(2);
    expect(thread.Messages[1].Message).toBe('Looks good to ship!');
    expect(comp.GetThreadReplyDraft(thread.ConversationID)).toBe('');

    // 2. Positional SegmentID reconciliation when a block is inserted above a pending suggestion
    const secondSeg = comp.DocumentSegments[1];
    const sug = comp.CreateOrUpdatePendingSuggestion(
      secondSeg.SegmentID,
      'Second paragraph',
      'Second paragraph revised',
      'Clarity edit',
    );
    expect(sug.BlockID).toBe(secondSeg.SegmentID);
    comp.OnMarkdownChanged('New intro paragraph\n\nFirst paragraph\n\nSecond paragraph');
    const newSecond = comp.DocumentSegments.find((s) => s.RawMarkdown === 'Second paragraph')!;
    expect(sug.BlockID).toBe(newSecond.SegmentID);
    expect(sug.BlockID).not.toBe(secondSeg.SegmentID);

    // 3. Yjs shared suggestions map sync + RoomResetConflict$ banner recovery
    const internalSession = Reflect.get(comp, 'session') as {
      Transport?: string;
      RequestSaveVersion: (thumb?: string | null) => boolean;
      versionSaved$?: { next: (evt: { versionNumber: number; savedByUserId?: string }) => void };
      roomResetConflict$?: { next: (draft: { ArtifactID: string; BaseBeforeReset: string; LocalDraft: string; ResetBaseline: string; CapturedAt: string } | null) => void };
      SetSharedSuggestionRaw: (id: string, json: string) => void;
    };
    expect(internalSession).toBeDefined();

    // Sync another peer's suggestion through Yjs suggestions map
    internalSession.SetSharedSuggestionRaw(
      'remote-sug-1',
      JSON.stringify({
        SuggestionID: 'remote-sug-1',
        BlockID: 'seg-0',
        AuthorName: 'Jane Reviewer',
        CreatedAt: '2026-11-15T01:00:00Z',
        OriginalMarkdown: 'New intro paragraph',
        ProposedMarkdown: 'Updated intro paragraph',
        Rationale: 'Remote peer',
        Status: 'Pending',
      }),
    );
    expect(comp.Suggestions.some((s) => s.SuggestionID === 'remote-sug-1')).toBe(true);

    // Trigger socket save -> IsSavingVersion holds true until VersionSaved$ emits
    vi.spyOn(internalSession, 'RequestSaveVersion').mockReturnValue(true);
    await comp.OnSaveDocumentVersion();
    expect(comp.IsSavingVersion).toBe(true);
    Reflect.get(internalSession, 'versionSaved$')?.next({ versionNumber: 9, savedByUserId: '11111111-1111-4111-8111-111111111111' });
    expect(comp.IsSavingVersion).toBe(false);
    expect(comp.SavedVersionSnapshots.some((s) => s.VersionNumber === 9)).toBe(true);

    // RoomResetConflict$ renders recovery banner and dismisses/applies cleanly
    const conflictDraft = {
      ArtifactID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      BaseBeforeReset: 'Old base',
      LocalDraft: 'Unsent local edits kept',
      ResetBaseline: 'Server baseline',
      CapturedAt: '2026-11-15T02:00:00Z',
    };
    Reflect.set(internalSession, 'pendingResetConflictDraft', conflictDraft);
    Reflect.get(internalSession, 'roomResetConflict$')?.next(conflictDraft);
    f.detectChanges();

    const banner = (f.nativeElement as HTMLElement).querySelector('[data-testid="docs-reset-conflict-banner"]');
    expect(banner).not.toBeNull();
    const applyBtn = (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="apply-reset-conflict-btn"]');
    applyBtn?.click();
    f.detectChanges();
    expect(comp.MarkdownContent).toBe('Unsent local edits kept');
    expect(comp.PendingResetConflictDraft).toBeNull();
  });

  it('isolates logged-in guest snapshot mode (P0-P3-4): never connects Yjs, refreshes live data, or renders Access Revoked', async () => {
    const hasBackendSpy = vi.spyOn(DocumentCollaborationService.prototype, 'HasCollaborationBackend').mockReturnValue(true);
    const verifyServerSpy = vi.spyOn(DocumentCollaborationService.prototype, 'VerifyFrozenSnapshotOnServer');
    const resolvePermSpy = vi.spyOn(DocumentCollaborationService.prototype, 'ResolvePermissionsFromServer');
    const mock = createDocsMockProvider().provider;

    const fExplicit = renderComponentFixture(MarkdownArtifactViewerComponent, {
      imports: [
        CommonModule,
        FormsModule,
        ComposerModule,
        StubMarkdownComponent,
        StubArtifactTypePluginViewerComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [MarkdownArtifactViewerComponent, MjContextMenuComponent],
      providers: [DocumentCollaborationService, DocumentImportExportService],
      inputs: {
        Provider: mock,
        GuestSnapshotMode: true,
        artifactVersion: {
          ID: 'ver-guest-doc-1',
          ArtifactID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          VersionNumber: 1,
          Name: 'Guest Frozen Doc',
          Content: INITIAL_DOC_CONTENT,
        } as Partial<MJArtifactVersionEntity> as MJArtifactVersionEntity,
        readonly: false,
      },
    });
    await fExplicit.whenStable();
    await new Promise((r) => setTimeout(r, 15));
    fExplicit.detectChanges();

    expect(fExplicit.componentInstance.AccessRevoked).toBe(false);
    expect(fExplicit.componentInstance.CanUserEdit).toBe(false);
    expect((fExplicit.nativeElement as HTMLElement).textContent ?? '').not.toContain('Access Revoked');
    expect(verifyServerSpy).not.toHaveBeenCalled();
    expect(resolvePermSpy).not.toHaveBeenCalled();
    expect(hasBackendSpy).not.toHaveBeenCalled();
  });

  it('auto-detects guest snapshot mode when ArtifactID is empty and PreVerifiedFrozenSnapshots !== null (P0-P3-4)', async () => {
    const hasBackendSpy = vi.spyOn(DocumentCollaborationService.prototype, 'HasCollaborationBackend').mockReturnValue(true);
    const verifyServerSpy = vi.spyOn(DocumentCollaborationService.prototype, 'VerifyFrozenSnapshotOnServer');
    const resolvePermSpy = vi.spyOn(DocumentCollaborationService.prototype, 'ResolvePermissionsFromServer');
    const mock = createDocsMockProvider().provider;

    // Auto-detected guest snapshot when ArtifactID is empty and PreVerifiedFrozenSnapshots !== null
    const fAuto = renderComponentFixture(MarkdownArtifactViewerComponent, {
      imports: [
        CommonModule,
        FormsModule,
        ComposerModule,
        StubMarkdownComponent,
        StubArtifactTypePluginViewerComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [MarkdownArtifactViewerComponent, MjContextMenuComponent],
      providers: [DocumentCollaborationService, DocumentImportExportService],
      inputs: {
        Provider: mock,
        PreVerifiedFrozenSnapshots: {},
        artifactVersion: {
          ID: 'ver-guest-doc-2',
          ArtifactID: '',
          VersionNumber: 1,
          Name: 'Guest Auto Snapshot',
          Content: '# Public Snapshot\n\nFrozen narrative.',
        } as Partial<MJArtifactVersionEntity> as MJArtifactVersionEntity,
        readonly: true,
      },
    });
    await fAuto.whenStable();
    await new Promise((r) => setTimeout(r, 15));
    fAuto.detectChanges();
    expect(fAuto.componentInstance.AccessRevoked).toBe(false);
    expect(verifyServerSpy).not.toHaveBeenCalled();
    expect(resolvePermSpy).not.toHaveBeenCalled();
    expect(hasBackendSpy).not.toHaveBeenCalled();
  });

  it('preserves pre-init ViewMode/NavigationAnchor across async init (NW-6) and resolves heading fallback suggestions (NW-3)', async () => {
    const mock = createDocsMockProvider().provider;
    const f = renderComponentFixture(MarkdownArtifactViewerComponent, {
      imports: [
        CommonModule,
        FormsModule,
        ComposerModule,
        StubMarkdownComponent,
        StubArtifactTypePluginViewerComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [MarkdownArtifactViewerComponent, MjContextMenuComponent],
      providers: [DocumentCollaborationService, DocumentImportExportService],
      inputs: {
        Provider: mock,
        ViewMode: 'diff',
        NavigationAnchor: { Heading: 'Live Metrics Section', HighlightMs: 1200 },
        artifactVersion: {
          ID: 'ver-nw6-doc-1',
          ArtifactID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          VersionNumber: 1,
          Name: 'NW6 Doc',
          Content: '# Intro\n\nOpening text.\n\n## Live Metrics Section\n\nTargeted paragraph.',
        } as Partial<MJArtifactVersionEntity> as MJArtifactVersionEntity,
        readonly: false,
      },
    });
    await f.whenStable();
    await new Promise((r) => setTimeout(r, 20));
    f.detectChanges();

    expect(f.componentInstance.ViewMode).toBe('diff');
    expect(f.componentInstance.SelectedAnchorKey).not.toBe('doc-root');

    // NW-3 heading + OriginalMarkdown fallback suggestion when BlockID is omitted
    const headingSeg = f.componentInstance.DocumentSegments.find((s) =>
      s.RawMarkdown.includes('Live Metrics Section'),
    );
    expect(headingSeg).toBeDefined();
    f.componentInstance.AcceptSuggestion({
      SuggestionID: 'sug-heading-fallback-1',
      BlockID: '',
      Heading: 'Live Metrics Section',
      AuthorName: 'DocAgent',
      CreatedAt: '2026-11-15T12:00:00Z',
      OriginalMarkdown: 'Targeted paragraph.',
      ProposedMarkdown: 'Targeted paragraph updated.',
      Rationale: 'Heading fallback test',
      Status: 'Pending',
    });
    expect(f.componentInstance.MarkdownContent).toContain('Targeted paragraph updated.');
  });

  it('renders readable vs unreadable durable doc-link chips, round-trips editable chips, and exports stored labels as plain text', async () => {
    const readableId = '11111111-1111-4111-8111-111111111111';
    const unreadableId = '22222222-2222-4222-8222-222222222222';
    const readableToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Pricing Policy', { ID: readableId });
    const unreadableToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Executive Memo', { ID: unreadableId });
    const content = `See ${readableToken} and ${unreadableToken}.`;

    const permSpy = vi
      .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissionsBatch')
      .mockImplementation(async (_provider, artifactIds) => {
        const map = new Map();
        for (const artifactId of artifactIds) {
          const isHostDoc = artifactId !== readableId && artifactId !== unreadableId;
          map.set(artifactId, {
            ArtifactID: artifactId,
            CanRead: isHostDoc || artifactId === readableId,
            CanEdit: isHostDoc,
            CanDelete: isHostDoc,
            CanShare: isHostDoc,
            Source: isHostDoc ? 'Owner' : artifactId === readableId ? 'ArtifactPermission' : 'Denied',
            Reason: isHostDoc ? 'Owner' : artifactId === readableId ? 'Shared' : 'Denied',
          });
        }
        return map;
      });

    try {
      const f = await renderDocsViewer(content, false);
      const comp = f.componentInstance;
      comp.SetViewMode('preview');
      // Trigger access checks for both tokens and let them settle.
      comp.RenderPreviewMarkdown(content);
      await new Promise((r) => setTimeout(r, 20));
      f.detectChanges();

      const previewMd = comp.RenderPreviewMarkdown(content);
      const linkBatchCalls = permSpy.mock.calls.filter(
        (c) => c[1].includes(readableId) || c[1].includes(unreadableId),
      );
      expect(linkBatchCalls).toHaveLength(1);
      expect(linkBatchCalls[0][1]).toEqual([readableId, unreadableId]);
      expect(previewMd).toContain('#mj-doc-link-readable/');
      expect(previewMd).toContain('#mj-doc-link-unreadable/');
      expect(previewMd).toContain('[Pricing Policy](');
      expect(previewMd).toContain('[Executive Memo](');
      expect(previewMd).toContain("You don't have access");

      // Clicking readable preview link emits OpenEntityRecord; clicking unreadable preview link does nothing.
      const opened: Array<{ entityName: string; id: string }> = [];
      comp.OpenEntityRecord.subscribe((evt) => {
        opened.push({ entityName: evt.entityName, id: String(evt.compositeKey.GetValueByFieldName('ID') ?? '') });
      });

      const readableHrefMatch = /\((#mj-doc-link-readable\/[^\s)]+)/.exec(previewMd);
      const unreadableHrefMatch = /\((#mj-doc-link-unreadable\/[^\s)]+)/.exec(previewMd);
      expect(readableHrefMatch).not.toBeNull();
      expect(unreadableHrefMatch).not.toBeNull();

      const previewReadableAnchor = document.createElement('a');
      previewReadableAnchor.setAttribute('href', readableHrefMatch![1]);
      const previewUnreadableAnchor = document.createElement('a');
      previewUnreadableAnchor.setAttribute('href', unreadableHrefMatch![1]);

      comp.OnDocRecordLinkClick({ target: previewUnreadableAnchor, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Event);
      expect(opened).toHaveLength(0);

      comp.OnDocRecordLinkClick({ target: previewReadableAnchor, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Event);
      expect(opened).toEqual([{ entityName: 'MJ: Artifacts', id: readableId }]);

      // Real Angular-rendered Edit mode DOM ([innerHTML]="RenderInlineEditableSafeHtml(...)") preserves
      // data-doc-link-* attributes and contenteditable="false" through Angular binding and round-trips losslessly.
      comp.SetViewMode('edit');
      f.detectChanges();
      const renderedEditableBlock = (f.nativeElement as HTMLElement).querySelector('.mj-docs-editable-paragraph') as HTMLElement | null;
      expect(renderedEditableBlock).not.toBeNull();
      const renderedChips = Array.from(
        renderedEditableBlock!.querySelectorAll('[data-doc-record-link="true"]'),
      ) as HTMLElement[];
      expect(renderedChips.length).toBe(2);
      expect(renderedChips[0].getAttribute('data-doc-link-access')).toBe('readable');
      expect(renderedChips[0].getAttribute('contenteditable')).toBe('false');
      expect(renderedChips[0].getAttribute('data-doc-link-raw')).toBe(readableToken);
      expect(renderedChips[1].getAttribute('data-doc-link-access')).toBe('unreadable');
      expect(renderedChips[1].getAttribute('data-doc-link-raw')).toBe(unreadableToken);
      expect(comp.ExtractMarkdownFromEditableElement(renderedEditableBlock!)).toBe(content);

      // Clicking the real Angular-rendered readable Edit chip emits OpenEntityRecord; unreadable chip does not.
      comp.OnDocRecordLinkClick({ target: renderedChips[1], preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Event);
      expect(opened).toHaveLength(1);
      comp.OnDocRecordLinkClick({ target: renderedChips[0], preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Event);
      expect(opened).toHaveLength(2);

      // Markdown export and PDF export emit stored plain-text labels; Source mode retains raw tokens.
      const importExport = f.debugElement.injector.get(DocumentImportExportService);
      const mdDownload = vi.spyOn(importExport, 'DownloadMarkdownFile').mockImplementation(() => undefined);
      const pdfExport = vi.spyOn(importExport, 'ExportPrintablePdf').mockImplementation(() => undefined);

      comp.OnExportMarkdown();
      expect(mdDownload).toHaveBeenCalledWith('See Pricing Policy and Executive Memo.', expect.any(String));

      await comp.ExportPDF();
      expect(pdfExport).toHaveBeenCalledWith(
        expect.stringContaining('See Pricing Policy and Executive Memo.'),
        expect.any(String),
        'portrait',
        expect.objectContaining({ ExportMode: 'clean' }),
      );
      expect(pdfExport.mock.calls[0][0]).not.toContain('"_mode":"mention"');
      expect(comp.MarkdownContent).toBe(content);
    } finally {
      permSpy.mockRestore();
    }
  });

  it('opens [[ autocomplete as the current user in edit and suggest modes and inserts a durable record-link token on selection', async () => {
    const targetId = '33333333-3333-4333-8333-333333333333';
    const privateId = '44444444-4444-4444-8444-444444444444';
    const baseMock = createDocsMockProvider();
    const currentUser = baseMock.provider.CurrentUser;
    const originalRunView = baseMock.provider.RunView;
    const artifactSearchUsers: Array<UserInfo | undefined> = [];
    const customProvider = {
      ...baseMock.provider,
      RunView: async (params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> => {
        if (params.EntityName === 'MJ: Artifacts' && String(params.ExtraFilter ?? '').includes('LIKE')) {
          artifactSearchUsers.push(contextUser);
          // Simulates server read hook: privateId is NOT readable by currentUser.
          return {
            Success: true,
            Results: [
              { ID: targetId, Name: 'Discount Rules', Description: null, Type: 'Markdown Document' },
            ],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 0,
            ErrorMessage: '',
            UserViewRunID: '',
          };
        }
        return originalRunView(params, contextUser);
      },
    } as unknown as IMetadataProvider;

    const f = await renderDocsViewer('Initial paragraph.', false, customProvider);
    const comp = f.componentInstance;
    comp.SetViewMode('edit');
    f.detectChanges();

    const paraSeg = comp.DocumentSegments.find((s) => s.Kind === 'markdown');
    expect(paraSeg).toBeDefined();

    // Simulate typing "See [[Disc" in Edit mode
    const fakeEl = document.createElement('div');
    fakeEl.textContent = 'See [[Disc';
    comp.OnEditableBlockInput(paraSeg!, { target: fakeEl } as unknown as Event);
    await new Promise((r) => setTimeout(r, 20));
    f.detectChanges();

    expect(comp.ShowDocLinkMenu).toBe(true);
    expect(artifactSearchUsers).toEqual([currentUser]);
    expect(comp.DocLinkSuggestions.map((s) => s.id)).toEqual([targetId]);
    expect(comp.DocLinkSuggestions.some((s) => s.id === privateId)).toBe(false);

    // Selecting inserts ConversationUtility.CreateRecordLink token in Edit mode
    comp.OnDocLinkSuggestionSelected(comp.DocLinkSuggestions[0]);
    const expectedToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Discount Rules', { ID: targetId });
    expect(comp.ShowDocLinkMenu).toBe(false);
    expect(comp.MarkdownContent).toContain(`See ${expectedToken}`);

    // Suggest mode also opens [[ autocomplete and creates a pending suggestion with the token
    comp.SetViewMode('suggest');
    f.detectChanges();
    const suggestSeg = comp.DocumentSegments.find((s) => s.Kind === 'markdown')!;
    const suggestEl = document.createElement('div');
    suggestEl.textContent = 'Also [[Disc';
    comp.OnEditableBlockInput(suggestSeg, { target: suggestEl } as unknown as Event);
    await new Promise((r) => setTimeout(r, 20));
    f.detectChanges();
    expect(comp.ShowDocLinkMenu).toBe(true);
    comp.OnDocLinkSuggestionSelected(comp.DocLinkSuggestions[0]);
    expect(comp.Suggestions.some((s) => s.ProposedMarkdown.includes(expectedToken))).toBe(true);
  });

  it('batches all non-artifact doc-link access checks across a document into one RunViews call (one query per entity)', async () => {
    const acct1 = 'aaaa1111-1111-4111-8111-111111111111';
    const acct2 = 'bbbb2222-2222-4222-8222-222222222222';
    const acct3 = 'cccc3333-3333-4333-8333-333333333333';
    const content = [
      `Accounts: ${ConversationUtility.CreateRecordLink('Accounts', 'Acme', { ID: acct1 })}, ${ConversationUtility.CreateRecordLink('Accounts', 'Beta', { ID: acct2 })}, ${ConversationUtility.CreateRecordLink('Accounts', 'Gamma', { ID: acct3 })}.`,
      '',
      `Orders: ${ConversationUtility.CreateRecordLink('Order Lines', 'Order 7 Line 2', { OrderID: '7', LineNumber: 2 })} and ${ConversationUtility.CreateRecordLink('Order Lines', 'Order 9 Line 1', { OrderID: '9', LineNumber: 1 })}.`,
    ].join('\n');

    const baseMock = createDocsMockProvider();
    const originalEntityByName = baseMock.provider.EntityByName.bind(baseMock.provider);
    const originalRunView = baseMock.provider.RunView.bind(baseMock.provider);
    const nonArtifactSingleQueries: RunViewParams[] = [];
    const nonArtifactBatchQueries: RunViewParams[][] = [];

    const accountsPk = { Name: 'ID', NeedsQuotes: true };
    const orderLinesPks = [
      { Name: 'OrderID', NeedsQuotes: true },
      { Name: 'LineNumber', NeedsQuotes: false },
    ];
    const extraEntities: Record<string, unknown> = {
      Accounts: {
        ID: 'ent-accounts',
        Name: 'Accounts',
        PrimaryKeys: [accountsPk],
        FirstPrimaryKey: accountsPk,
        GetUserPermisions: () => ({ CanRead: true }),
      },
      'Order Lines': {
        ID: 'ent-order-lines',
        Name: 'Order Lines',
        PrimaryKeys: orderLinesPks,
        FirstPrimaryKey: orderLinesPks[0],
        GetUserPermisions: () => ({ CanRead: true }),
      },
    };

    const customProvider = {
      ...baseMock.provider,
      EntityByName: (name: string) => extraEntities[name] ?? originalEntityByName(name),
      RunView: async (params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> => {
        if (params.EntityName === 'Accounts' || params.EntityName === 'Order Lines') {
          nonArtifactSingleQueries.push(params);
        }
        return originalRunView(params, contextUser);
      },
      RunViews: async (paramsList: RunViewParams[]): Promise<RunViewResult[]> => {
        if (paramsList.some((p) => p.EntityName === 'Accounts' || p.EntityName === 'Order Lines')) {
          nonArtifactBatchQueries.push(paramsList);
        }
        return paramsList.map((p) => {
          if (p.EntityName === 'Accounts') {
            return { Success: true, Results: [{ ID: acct1 }, { ID: acct3 }], RowCount: 2, TotalRowCount: 2, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
          }
          if (p.EntityName === 'Order Lines') {
            return { Success: true, Results: [{ OrderID: '7', LineNumber: 2 }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
          }
          return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
        });
      },
    } as unknown as IMetadataProvider;

    const f = await renderDocsViewer(content, true, customProvider);
    const comp = f.componentInstance;
    comp.SetViewMode('preview');
    comp.RenderPreviewMarkdown(content);
    await new Promise((r) => setTimeout(r, 20));
    f.detectChanges();

    // 5 distinct chips across 2 entities must execute as ONE RunViews call with 2 entity queries (0 per-chip RunView calls).
    expect(nonArtifactSingleQueries).toHaveLength(0);
    expect(nonArtifactBatchQueries).toHaveLength(1);
    expect(nonArtifactBatchQueries[0]).toHaveLength(2);
    expect(nonArtifactBatchQueries[0].map((p) => p.EntityName)).toEqual(['Accounts', 'Order Lines']);
    expect(nonArtifactBatchQueries[0][0].Fields).toEqual(['ID']);
    expect(nonArtifactBatchQueries[0][1].Fields).toEqual(['OrderID', 'LineNumber']);

    const rendered = comp.RenderPreviewMarkdown(content);
    expect(rendered).toContain('#mj-doc-link-readable/');
    expect(rendered).toContain('#mj-doc-link-unreadable/');
    expect(rendered).toContain('"Open Acme"');
    expect(rendered).toContain('"Open Gamma"');
    expect(rendered).toContain('"Open Order 7 Line 2"');
    expect(rendered).toContain('[Beta](#mj-doc-link-unreadable/');
    expect(rendered).toContain('[Order 9 Line 1](#mj-doc-link-unreadable/');
  });

  it('supports Design Presets, Paginated Sheet View, live stats cycling, and Export & Preflight Studio', async () => {
    const content = [
      '# Q4 Product Review',
      '',
      'Quarterly metrics expanded cleanly across enterprise accounts.',
      '',
      '| C1 | C2 | C3 | C4 | C5 | C6 | C7 |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| 1 | 2 | 3 | 4 | 5 | 6 | 7 |',
    ].join('\n');

    const f = await renderDocsViewer(content, false);
    const comp = f.componentInstance;
    f.detectChanges();

    const root = f.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="docs-status-footer"]')).toBeTruthy();

    // Cycle stats metric: words -> chars -> charsNoSpaces
    const statsBtn = root.querySelector<HTMLButtonElement>('[data-testid="docs-stats-cycle-btn"]');
    expect(statsBtn?.textContent).toContain('words');
    statsBtn?.click();
    f.detectChanges();
    expect(statsBtn?.textContent).toContain('chars');
    statsBtn?.click();
    f.detectChanges();
    expect(statsBtn?.textContent).toContain('no spaces');

    // Open Design popover, apply Executive Memo preset, and switch to Paginated Sheet View
    comp.ToggleDesignPopover();
    f.detectChanges();
    expect(root.querySelector('[data-testid="docs-design-popover"]')).toBeTruthy();
    comp.ApplyDesignPreset('executive-memo');
    comp.UpdateDesignConfig({ Watermark: 'DRAFT', RunningHeader: 'Executive Briefing' });
    comp.SetPageLayoutMode('paginated');
    f.detectChanges();

    const pageEl = root.querySelector<HTMLElement>('[data-testid="docs-canvas-page"]');
    expect(pageEl?.getAttribute('data-doc-preset')).toBe('executive-memo');
    expect(pageEl?.classList.contains('mj-docs-page--paginated')).toBe(true);
    expect(root.querySelector('[data-testid="docs-paginated-watermark"]')?.textContent?.trim()).toBe('DRAFT');
    expect(root.querySelector('[data-testid="docs-paginated-footer"]')).toBeTruthy();

    // Open Export & Preflight dialog and verify wide portrait table warning + quick Landscape fix
    comp.OpenExportDialog('docx');
    f.detectChanges();
    expect(comp.ExportPreflightReport?.WarningCount).toBeGreaterThanOrEqual(1);
    expect(comp.ExportPreflightReport?.Issues.some((i) => i.Code === 'wide_table_portrait')).toBe(true);
    expect(root.querySelector('[data-testid="preflight-issue-wide_table_portrait"]')).toBeTruthy();

    comp.ExportDialogOrientation = 'landscape';
    comp.RefreshExportPreflight();
    f.detectChanges();
    expect(comp.ExportPreflightReport?.Issues.some((i) => i.Code === 'wide_table_portrait')).toBe(false);
  });
});
