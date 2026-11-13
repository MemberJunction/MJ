import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { beforeEach, describe, expect, it } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MarkdownArtifactViewerComponent } from './markdown-artifact-viewer.component';
import { DocumentCollaborationService } from '../../services/document-collaboration.service';
import { DocumentImportExportService } from '../../services/document-import-export.service';

@Component({
  standalone: true,
  selector: 'mj-markdown',
  template: `<div class="stub-mj-markdown">{{ data }}</div>`,
})
class StubMarkdownComponent {
  @Input() data: string | null = null;
  @Input() enableCollapsibleHeadings = false;
  @Input() enableLineNumbers = false;
  @Input() enableSyntaxHighlight = false;
  @Input() enableSmartypants = false;
  @Input() enableHtml = false;
  @Input() enableCodeCopy = false;
  @Input() enableHeadingIds = false;
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

function createDocsMockProvider(opts: MockDocsProviderOptions = {}) {
  const currentUserId = opts.currentUserId ?? '11111111-1111-4111-8111-111111111111';
  const artifactOwnerId = opts.artifactOwnerId ?? currentUserId;
  const permissionGrants = [...(opts.permissionGrants ?? [])];
  let seq = 0;

  const savedEntities: Array<{ entityName: string; record: Record<string, unknown> }> = [];
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
  };

  const entities = [
    {
      ID: 'ent-artifacts',
      Name: 'MJ: Artifacts',
      DisplayNameOrName: 'Artifacts',
      SchemaName: '__mj',
      BaseTable: 'Artifact',
      Icon: 'fa-solid fa-cube',
      FieldLevelSecurityApplies: false,
      GetUserPermisions: () => ({ CanRead: true }),
      Fields: [
        { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
        { Name: 'Name', DisplayNameOrName: 'Name', IsNameField: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
      ],
    },
    {
      ID: 'ent-projects',
      Name: 'MJ: Projects',
      DisplayNameOrName: 'Projects',
      SchemaName: '__mj',
      BaseTable: 'Project',
      Icon: 'fa-solid fa-diagram-project',
      FieldLevelSecurityApplies: false,
      GetUserPermisions: () => ({ CanRead: true }),
      Fields: [
        { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
        { Name: 'Name', DisplayNameOrName: 'Name', IsNameField: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
      ],
    },
    {
      ID: 'ent-conversations',
      Name: 'MJ: Conversations',
      DisplayNameOrName: 'Conversations',
      SchemaName: '__mj',
      BaseTable: 'Conversation',
      Icon: 'fa-solid fa-comments',
      FieldLevelSecurityApplies: false,
      GetUserPermisions: () => ({ CanRead: true }),
      Fields: [
        { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
        { Name: 'Name', DisplayNameOrName: 'Name', IsNameField: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
        {
          Name: 'Type',
          DisplayNameOrName: 'Type',
          DefaultInView: true,
          IsBinaryFieldType: false,
          TSType: 'string',
          RelatedEntity: 'MJ: Artifact Types',
          RelatedEntityFieldName: 'ID',
        },
      ],
    },
    {
      ID: 'ent-ai-models',
      Name: 'MJ: AI Models',
      DisplayNameOrName: 'AI Models',
      SchemaName: '__mj',
      BaseTable: 'AIModel',
      Icon: 'fa-solid fa-microchip',
      FieldLevelSecurityApplies: false,
      GetUserPermisions: () => ({ CanRead: true }),
      Fields: [
        { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' },
      ],
    },
  ];

  const provider = {
    CurrentUser: user,
    Entities: entities,
    EntityByName: (name: string) => entities.find((e) => e.Name === name),
    RunView: async (params: { EntityName: string; ExtraFilter?: string }) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [{ ID: 'art-doc-1', UserID: artifactOwnerId, EnvironmentID: 'env-doc-1' }],
          TotalRowCount: 1,
        };
      }
      if (params.EntityName === 'MJ: Artifact Permissions') {
        return {
          Success: true,
          Results: permissionGrants,
          TotalRowCount: permissionGrants.length,
        };
      }
      if (params.EntityName === 'MJ: Artifact Types') {
        return {
          Success: true,
          Results: [{ ID: 'type-wb-1', Name: 'Whiteboard' }],
          TotalRowCount: 1,
        };
      }
      if (params.EntityName === 'MJ: Artifact Versions') {
        if (params.ExtraFilter?.includes('wb-inline-1')) {
          const list = childVersionsByArtifact.get('wb-inline-1') ?? [];
          const sorted = [...list].sort((a, b) => b.VersionNumber - a.VersionNumber);
          return {
            Success: true,
            Results: sorted.slice(0, 1),
            TotalRowCount: sorted.length,
          };
        }
        return {
          Success: true,
          Results: [{ ID: 'ver-doc-1', VersionNumber: 1 }],
          TotalRowCount: 1,
        };
      }
      if (
        params.EntityName === 'MJ: Projects' ||
        (params.EntityName === 'MJ: Conversations' && !params.ExtraFilter?.includes('LinkedRecordID'))
      ) {
        return {
          Success: true,
          Results: [
            { ID: 'rec-1', Name: 'Project Alpha', Type: 'rec-type-1' },
            { ID: 'rec-2', Name: 'Project Beta', Type: 'rec-type-2' },
          ],
          TotalRowCount: 2,
        };
      }
      if (params.EntityName === 'MJ: Users') {
        return {
          Success: true,
          Results: [
            user,
            { ID: 'user-colleague-1', Name: 'Jane Reviewer', Email: 'jane@example.com' },
          ],
          TotalRowCount: 2,
        };
      }
      return { Success: true, Results: [], TotalRowCount: 0 };
    },
    GetEntityObject: async (entityName: string) => {
      const generatedId = `66666666-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
      const rec: Record<string, unknown> = {
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
  } as unknown as IMetadataProvider;

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
        StubMarkdownComponent,
        StubArtifactTypePluginViewerComponent,
      ],
      declarations: [MarkdownArtifactViewerComponent],
      providers: [DocumentCollaborationService, DocumentImportExportService],
      inputs: {
        Provider: mock,
        artifactVersion: {
          ID: 'ver-doc-1',
          ArtifactID: 'art-doc-1',
          VersionNumber: 1,
          Name: 'Q4 Strategy Document',
          Content: content,
        } as unknown as MJArtifactVersionEntity,
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
    f.componentInstance.ToggleTaskListItem(listSeg, 0, { target: firstCheckbox } as unknown as Event);
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
    comp.SelectedPermissionUserID = 'user-colleague-1';
    comp.SelectedPermissionLevel = 'Edit';
    await comp.GrantArtifactPermission();
    const granted = comp.ArtifactPermissionEntries.find((e) => e.UserID === 'user-colleague-1');
    expect(granted).toBeDefined();
    expect(granted?.CanEdit).toBe(true);

    await comp.RevokeArtifactPermission(granted!);
    expect(mock.deletedPermissionIds).toContain(granted!.ID);
    expect(comp.ArtifactPermissionEntries.some((e) => e.UserID === 'user-colleague-1')).toBe(false);
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
});
