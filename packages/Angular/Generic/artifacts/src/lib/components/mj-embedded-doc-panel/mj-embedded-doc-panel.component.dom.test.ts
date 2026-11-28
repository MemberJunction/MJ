import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { CompositeKey, IMetadataProvider, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { ComposerModule } from '@memberjunction/ng-composer';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { capture, query, renderComponentFixture } from '@memberjunction/ng-test-utils';
import {
  EmbeddedDocWorkingStatePayload,
  MJEmbeddedDocPanelComponent,
} from './mj-embedded-doc-panel.component';
import { MarkdownArtifactViewerComponent } from '../plugins/markdown-artifact-viewer.component';
import { MjContextMenuComponent } from '../context-menu/mj-context-menu.component';
import { ArtifactAgentPresenceBarComponent } from '../presence/artifact-agent-presence-bar.component';
import { ArtifactAgentRegionIndicatorComponent } from '../presence/artifact-agent-region-indicator.component';
import { ArtifactCommandPaletteComponent } from '../plugins/artifact-command-palette.component';
import { DocumentCollaborationService } from '../../services/document-collaboration.service';
import { DocumentImportExportService } from '../../services/document-import-export.service';

const ARTIFACT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';

@Component({
  standalone: true,
  selector: 'mj-markdown-artifact-viewer',
  template:
    '<div data-testid="embedded-md-stub" [attr.data-compact]="CompactMode" [attr.data-readonly]="readonly">{{ artifactVersion?.Content }}</div>',
})
class EmbeddedMarkdownStub {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() artifactVersion: MJArtifactVersionEntity | null = null;
  @Input() readonly = true;
  @Input() CompactMode = false;
  @Input() CollaborationWsUrl: string | null = null;
  @Output() DraftContentChanged = new EventEmitter<string>();
  @Output() ContentCommitted = new EventEmitter<string>();
  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();
}

@Component({
  standalone: true,
  selector: 'mj-markdown',
  template: '<div class="stub-mj-markdown">{{ Data ?? data }}</div>',
})
class StubMarkdownPreviewComponent {
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
  template: '<div class="stub-ole-plugin"></div>',
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

function makeUser(): UserInfo {
  return new UserInfo(undefined, {
    ID: USER_ID,
    Name: 'Elena Editor',
    Email: 'elena@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
  });
}

function setupMocks(canEdit: boolean, initialContent = '# Initial') {
  const user = makeUser();
  const savedVersions: Array<{ ArtifactID: string; VersionNumber: number; Content: string }> = [];

  vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
    ArtifactID: ARTIFACT_ID,
    CanRead: true,
    CanEdit: canEdit,
    CanDelete: false,
    CanShare: canEdit,
    Source: 'Delegate',
    Reason: 'Delegated from host record',
  });
  const versionObj = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
    ID: 'ver-1',
    ArtifactID: ARTIFACT_ID,
    VersionNumber: 1,
    Name: 'Account Brief',
    Content: initialContent,
    ContentMode: 'Text',
  });
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(async (params: RunViewParams) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [{ ID: ARTIFACT_ID, Name: 'Account Brief', UserID: USER_ID }],
          RowCount: 1,
          TotalRowCount: 1,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      }
      if (params.EntityName === 'MJ: Artifact Versions') {
        if (params.ResultType === 'simple') {
          return {
            Success: true,
            Results: [{ ID: 'ver-1', VersionNumber: 1 }],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return {
          Success: true,
          Results: [versionObj],
          RowCount: 1,
          TotalRowCount: 1,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      }
      return {
        Success: true,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 1,
        ErrorMessage: '',
      };
    }),
  } as Pick<RunView, 'RunView'> as RunView);

  const collabStub = {
    CommitInlineEditOnServer: vi.fn(async () => ({ HandledByServer: false, Success: false })),
  };

  const provider = {
    CurrentUser: user,
    Entities: [],
    EntityByName: () => undefined,
    ProviderType: 'Network',
    GetEntityObject: vi.fn(async () => {
      const rec = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
        ID: 'ver-2',
        ArtifactID: ARTIFACT_ID,
        VersionNumber: 2,
        Name: 'Account Brief',
        Content: '',
        ContentMode: 'Text',
        UserID: USER_ID,
        NewRecord: vi.fn(),
        Save: vi.fn(async () => {
          savedVersions.push({
            ArtifactID: rec.ArtifactID,
            VersionNumber: rec.VersionNumber,
            Content: rec.Content ?? '',
          });
          return true;
        }),
      });
      return rec;
    }),
  } as Pick<IMetadataProvider, 'CurrentUser' | 'Entities' | 'EntityByName' | 'ProviderType' | 'GetEntityObject'> as IMetadataProvider;

  return { provider, collabStub, savedVersions, user };
}

describe('MJEmbeddedDocPanelComponent DOM contract', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders compact mode chrome, enables Save Version for editors, and emits OpenFullStudioRequested', async () => {
    const { provider, collabStub } = setupMocks(true);
    const fixture = renderComponentFixture(MJEmbeddedDocPanelComponent, {
      imports: [EmbeddedMarkdownStub, MJButtonDirective],
      declarations: [MJEmbeddedDocPanelComponent],
      providers: [{ provide: DocumentCollaborationService, useValue: collabStub }],
      inputs: {
        Provider: provider,
        ArtifactID: ARTIFACT_ID,
        CurrentUser: makeUser(),
        Mode: 'compact',
      },
    });
    const studioEvents = capture(fixture.componentInstance.OpenFullStudioRequested);
    const versionEvents = capture(fixture.componentInstance.VersionSaved);

    await fixture.componentInstance.LoadArtifact();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="embedded-md-stub"]')?.getAttribute('data-compact')).toBe('true');
    expect(query(fixture, '[data-testid="embedded-doc-save-version-btn"]')).not.toBeNull();

    const expandBtn = query(fixture, '[data-testid="embedded-doc-open-studio-btn"]') as HTMLButtonElement | null;
    expect(expandBtn).not.toBeNull();
    expandBtn?.click();
    expect(studioEvents).toEqual([ARTIFACT_ID]);
    expect(versionEvents).toHaveLength(0);
  });

  it('hides Save Version and renders read-only indicator when CanEdit is false', async () => {
    const { provider, collabStub } = setupMocks(false);
    const fixture = renderComponentFixture(MJEmbeddedDocPanelComponent, {
      imports: [EmbeddedMarkdownStub, MJButtonDirective],
      declarations: [MJEmbeddedDocPanelComponent],
      providers: [{ provide: DocumentCollaborationService, useValue: collabStub }],
      inputs: {
        Provider: provider,
        ArtifactID: ARTIFACT_ID,
        CurrentUser: makeUser(),
        Mode: 'full',
      },
    });

    await fixture.componentInstance.LoadArtifact();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="embedded-doc-readonly-badge"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="embedded-doc-save-version-btn"]')).toBeNull();
    const viewer = query(fixture, '[data-testid="embedded-md-stub"]');
    expect(viewer?.getAttribute('data-readonly')).toBe('true');
    expect(viewer?.getAttribute('data-compact')).toBe('false');
  });

  it('forwards OpenEntityRecord output when an embedded record link is activated', async () => {
    const { provider, collabStub } = setupMocks(true);
    const fixture = renderComponentFixture(MJEmbeddedDocPanelComponent, {
      imports: [EmbeddedMarkdownStub, MJButtonDirective],
      declarations: [MJEmbeddedDocPanelComponent],
      providers: [{ provide: DocumentCollaborationService, useValue: collabStub }],
      inputs: {
        Provider: provider,
        ArtifactID: ARTIFACT_ID,
        CurrentUser: makeUser(),
        Mode: 'compact',
      },
    });
    const entityEvents = capture(fixture.componentInstance.OpenEntityRecord);

    await fixture.componentInstance.LoadArtifact();
    fixture.detectChanges();

    const key = CompositeKey.FromID(ARTIFACT_ID); // first-pk-ok: MJ: Artifacts core entity ID in test
    const viewerStub = fixture.debugElement.query(By.directive(EmbeddedMarkdownStub))
      .componentInstance as EmbeddedMarkdownStub;
    viewerStub.OpenEntityRecord.emit({ entityName: 'MJ: Companies', compositeKey: key });
    expect(entityEvents).toHaveLength(1);
    expect(entityEvents[0].entityName).toBe('MJ: Companies');
  });

  it('mounts the real MarkdownArtifactViewerComponent, emits DraftContentChanged on live contenteditable input, enables Save Version, fires debounced WorkingStateAutosaved, and flushes DOM edits on OnSaveVersion', async () => {
    const initialMd = '# Deal Strategy\n\nInitial executive summary paragraph.';
    const { provider, savedVersions, user } = setupMocks(true, initialMd);

    const autosavePayloads: EmbeddedDocWorkingStatePayload[] = [];
    const autosaveHandler = vi.fn(async (payload: EmbeddedDocWorkingStatePayload) => {
      autosavePayloads.push(payload);
    });

    const fixture = renderComponentFixture(MJEmbeddedDocPanelComponent, {
      imports: [
        CommonModule,
        FormsModule,
        ComposerModule,
        MJButtonDirective,
        StubMarkdownPreviewComponent,
        StubArtifactTypePluginViewerComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [
        MJEmbeddedDocPanelComponent,
        MarkdownArtifactViewerComponent,
        MjContextMenuComponent,
      ],
      providers: [DocumentCollaborationService, DocumentImportExportService],
      inputs: {
        Provider: provider,
        ArtifactID: ARTIFACT_ID,
        CurrentUser: user,
        Mode: 'compact',
        AutosaveDebounceMs: 1000,
        AutosaveHandler: autosaveHandler,
      },
    });

    const autosavedEvents = capture(fixture.componentInstance.WorkingStateAutosaved);
    const versionEvents = capture(fixture.componentInstance.VersionSaved);

    await fixture.componentInstance.LoadArtifact();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 15));
    fixture.detectChanges();

    const realViewer = fixture.componentInstance.MarkdownViewer;
    expect(realViewer).toBeInstanceOf(MarkdownArtifactViewerComponent);
    expect(realViewer?.CanUserEdit).toBe(true);
    expect(realViewer?.ViewMode).toBe('edit');

    const saveBtn = query(fixture, '[data-testid="embedded-doc-save-version-btn"]') as HTMLButtonElement | null;
    expect(saveBtn).not.toBeNull();
    expect(fixture.componentInstance.HasPendingChanges).toBe(false);
    expect(saveBtn?.disabled).toBe(true);

    vi.useFakeTimers();

    // 1. Live typing inside focused contenteditable paragraph WITHOUT blur
    const editableParagraph = query(fixture, '[data-testid^="editable-paragraph-"]') as HTMLElement | null;
    expect(editableParagraph).not.toBeNull();
    editableParagraph!.textContent = 'Updated live draft text before blur.';
    editableParagraph!.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.HasPendingChanges).toBe(true);
    expect(fixture.componentInstance.AutosaveStatus).toBe('pending');
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(true);
    expect(saveBtn?.disabled).toBe(false);

    // Debounce floor >= 1000ms before WorkingStateAutosaved fires
    await vi.advanceTimersByTimeAsync(999);
    expect(autosaveHandler).not.toHaveBeenCalled();
    expect(autosavedEvents).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
    expect(autosaveHandler).toHaveBeenCalledTimes(1);
    expect(autosavedEvents).toHaveLength(1);
    expect(autosavedEvents[0].Content).toContain('Updated live draft text before blur.');
    expect(autosavePayloads[0].Content).toContain('Updated live draft text before blur.');
    expect(fixture.componentInstance.AutosaveStatus).toBe('saved');
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(false);

    // 2. Further uncommitted DOM edit WITHOUT blur, then Save Version must flush DOM text first
    const updatedParagraph = query(fixture, '[data-testid^="editable-paragraph-"]') as HTMLElement | null;
    expect(updatedParagraph).not.toBeNull();
    updatedParagraph!.textContent = 'Final uncommitted DOM edit saved on click.';
    updatedParagraph!.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const flushSpy = vi.spyOn(realViewer!, 'FlushPendingEdits');
    await fixture.componentInstance.OnSaveVersion();
    fixture.detectChanges();

    expect(flushSpy).toHaveBeenCalledTimes(1);
    expect(versionEvents).toHaveLength(1);
    expect(versionEvents[0].VersionNumber).toBe(2);
    expect(savedVersions).toHaveLength(1);
    expect(savedVersions[0].Content).toContain('Final uncommitted DOM edit saved on click.');
    expect(fixture.componentInstance.HasPendingChanges).toBe(false);
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(false);
    expect(saveBtn?.disabled).toBe(true);

    // Advancing timers must not fire a re-armed autosave after Save Version
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosaveHandler).toHaveBeenCalledTimes(1);
  });

  it('emits DraftContentChanged from OnEditableBlockDomDirty on code-block input and ignores remote Yjs updates', async () => {
    const codeMd = '# Code Spec\n\n```ts\nconst version = 1;\n```';
    const { provider, savedVersions, user } = setupMocks(true, codeMd);

    const autosaveHandler = vi.fn(async () => undefined);
    const fixture = renderComponentFixture(MJEmbeddedDocPanelComponent, {
      imports: [
        CommonModule,
        FormsModule,
        ComposerModule,
        MJButtonDirective,
        StubMarkdownPreviewComponent,
        StubArtifactTypePluginViewerComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [
        MJEmbeddedDocPanelComponent,
        MarkdownArtifactViewerComponent,
        MjContextMenuComponent,
      ],
      providers: [DocumentCollaborationService, DocumentImportExportService],
      inputs: {
        Provider: provider,
        ArtifactID: ARTIFACT_ID,
        CurrentUser: user,
        Mode: 'compact',
        AutosaveDebounceMs: 1000,
        AutosaveHandler: autosaveHandler,
      },
    });

    await fixture.componentInstance.LoadArtifact();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 15));
    fixture.detectChanges();

    const realViewer = fixture.componentInstance.MarkdownViewer;
    expect(realViewer).toBeInstanceOf(MarkdownArtifactViewerComponent);

    // Remote Yjs update (fromYjs = true) must NOT trigger local DraftContentChanged or pending autosave
    realViewer!.OnMarkdownChanged('# Code Spec\n\n```ts\nconst version = 2;\n```', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.HasPendingChanges).toBe(false);
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(false);

    vi.useFakeTimers();

    // Local code-block DOM edit uses OnEditableBlockDomDirty -> emits DraftContentChanged
    const codeEl = query(fixture, '[data-testid^="editable-code-body-"]') as HTMLElement | null;
    expect(codeEl).not.toBeNull();
    codeEl!.textContent = 'const version = 3;';
    codeEl!.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.HasPendingChanges).toBe(true);
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(true);

    await fixture.componentInstance.OnSaveVersion();
    fixture.detectChanges();
    expect(savedVersions).toHaveLength(1);
    expect(savedVersions[0].Content).toContain('const version = 3;');
  });
});
