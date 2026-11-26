import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CompositeKey, IMetadataProvider, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import {
  ArtifactPermissionEngine,
  MJArtifactVersionEntity,
  ResolvedArtifactPermissions,
} from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { capture, query, renderComponentFixture } from '@memberjunction/ng-test-utils';
import {
  EmbeddedDocWorkingStatePayload,
  MJEmbeddedDocPanelComponent,
} from './mj-embedded-doc-panel.component';
import { DocumentCollaborationService } from '../../services/document-collaboration.service';

const ARTIFACT_A = '11111111-1111-4111-8111-111111111111';
const ARTIFACT_B = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

@Component({
  standalone: true,
  selector: 'mj-markdown-artifact-viewer',
  template:
    '<div data-testid="markdown-viewer-stub" [attr.data-compact]="CompactMode" [attr.data-readonly]="readonly">{{ artifactVersion?.Content }}</div>',
})
class MarkdownArtifactViewerStub {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() artifactVersion: MJArtifactVersionEntity | null = null;
  @Input() readonly = true;
  @Input() CompactMode = false;
  @Input() CollaborationWsUrl: string | null = null;
  @Output() DraftContentChanged = new EventEmitter<string>();
  @Output() ContentCommitted = new EventEmitter<string>();
  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();
}

function createUser(): UserInfo {
  return new UserInfo(undefined, {
    ID: USER_ID,
    Name: 'Elena Editor',
    Email: 'elena@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
  });
}

function stubVersion(artifactId: string, versionNumber: number, content: string): MJArtifactVersionEntity {
  return Object.assign(Object.create(null) as MJArtifactVersionEntity, {
    ID: `ver-${artifactId}-${versionNumber}`,
    ArtifactID: artifactId,
    VersionNumber: versionNumber,
    Name: 'Deal Brief',
    Content: content,
    ContentMode: 'Text',
  });
}

function createMockHarness(perms: ResolvedArtifactPermissions) {
  let savedVersionCounter = 1;
  const savedVersions: Array<{ ArtifactID: string; VersionNumber: number; Content: string }> = [];

  const provider = {
    GetEntityObject: vi.fn(async () => {
      const entity = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
        ID: '',
        ArtifactID: '',
        VersionNumber: 0,
        Name: '',
        Content: '',
        ContentMode: 'Text',
        UserID: '',
        NewRecord: vi.fn(),
        Save: vi.fn(async () => {
          savedVersionCounter++;
          entity.ID = `saved-ver-${savedVersionCounter}`;
          savedVersions.push({
            ArtifactID: entity.ArtifactID,
            VersionNumber: entity.VersionNumber,
            Content: entity.Content ?? '',
          });
          return true;
        }),
      });
      return entity;
    }),
  } as Pick<IMetadataProvider, 'GetEntityObject'> as IMetadataProvider;

  vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue(perms);
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(async (params: RunViewParams) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [{ ID: ARTIFACT_A, Name: 'Deal Architecture Brief' }],
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
        const filterText = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
        const artId = filterText.includes(ARTIFACT_B) ? ARTIFACT_B : ARTIFACT_A;
        return {
          Success: true,
          Results: [stubVersion(artId, 1, '# Deal Architecture\n\nInitial draft')],
          RowCount: 1,
          TotalRowCount: 1,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      }
      return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
    }),
  } as Pick<RunView, 'RunView'> as RunView);

  const collabStub = {
    CommitInlineEditOnServer: vi.fn(async () => ({ HandledByServer: false, Success: false })),
  };

  return { provider, savedVersions, collabStub };
}

describe('MJEmbeddedDocPanelComponent (DOM)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes CompactMode=true in compact mode and CompactMode=false in full mode, and emits OpenFullStudioRequested', async () => {
    const { provider, collabStub } = createMockHarness({
      ArtifactID: ARTIFACT_A,
      CanRead: true,
      CanEdit: true,
      CanDelete: false,
      CanShare: true,
      Source: 'Delegate',
      Reason: 'Entity Read+Update',
    });

    const fixture = renderComponentFixture(MJEmbeddedDocPanelComponent, {
      imports: [MarkdownArtifactViewerStub, MJButtonDirective],
      declarations: [MJEmbeddedDocPanelComponent],
      providers: [{ provide: DocumentCollaborationService, useValue: collabStub }],
      inputs: {
        Provider: provider,
        ArtifactID: ARTIFACT_A,
        CurrentUser: createUser(),
        Mode: 'compact',
      },
    });
    await fixture.componentInstance.LoadArtifact();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="markdown-viewer-stub"]')?.getAttribute('data-compact')).toBe('true');
    expect(query(fixture, '[data-testid="markdown-viewer-stub"]')?.getAttribute('data-readonly')).toBe('false');
    expect(query(fixture, '[data-testid="embedded-doc-save-version-btn"]')).not.toBeNull();

    const studioEvents = capture(fixture.componentInstance.OpenFullStudioRequested);
    (query(fixture, '[data-testid="embedded-doc-open-studio-btn"]') as HTMLButtonElement).click();
    expect(studioEvents).toEqual([ARTIFACT_A]);

    fixture.componentInstance.Mode = 'full';
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="markdown-viewer-stub"]')?.getAttribute('data-compact')).toBe('false');
  });

  it('enforces >= 1000ms autosave debounce floor and cancels pending timer on explicit Save Version and ngOnDestroy', async () => {
    vi.useFakeTimers();
    const { provider, savedVersions, collabStub } = createMockHarness({
      ArtifactID: ARTIFACT_A,
      CanRead: true,
      CanEdit: true,
      CanDelete: false,
      CanShare: true,
      Source: 'Delegate',
      Reason: 'Entity Read+Update',
    });

    const autosavedPayloads: EmbeddedDocWorkingStatePayload[] = [];
    const autosaveHandler = vi.fn(async (payload: EmbeddedDocWorkingStatePayload) => {
      autosavedPayloads.push(payload);
    });

    const fixture = renderComponentFixture(MJEmbeddedDocPanelComponent, {
      imports: [MarkdownArtifactViewerStub, MJButtonDirective],
      declarations: [MJEmbeddedDocPanelComponent],
      providers: [{ provide: DocumentCollaborationService, useValue: collabStub }],
      inputs: {
        Provider: provider,
        ArtifactID: ARTIFACT_A,
        CurrentUser: createUser(),
        Mode: 'compact',
        AutosaveDebounceMs: 250, // below floor -> clamped to 1000ms
        AutosaveHandler: autosaveHandler,
      },
    });
    await fixture.componentInstance.LoadArtifact();
    fixture.detectChanges();

    expect(fixture.componentInstance.EffectiveAutosaveDebounceMs).toBe(
      MJEmbeddedDocPanelComponent.MIN_AUTOSAVE_DEBOUNCE_MS,
    );

    // 1. Trigger draft edit and verify debounce floor (>= 1000ms)
    fixture.componentInstance.OnDraftContentChanged('# Updated Draft 1');
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(true);

    await vi.advanceTimersByTimeAsync(999);
    expect(autosaveHandler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(autosaveHandler).toHaveBeenCalledTimes(1);
    expect(autosavedPayloads[0].Content).toBe('# Updated Draft 1');

    // 2. Trigger another edit then click Save Version BEFORE debounce expires -> must cancel pending autosave
    const versionSavedEvents = capture(fixture.componentInstance.VersionSaved);
    fixture.componentInstance.OnDraftContentChanged('# Explicit Version 2 Content');
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(true);

    await fixture.componentInstance.OnSaveVersion();
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(false);
    expect(versionSavedEvents).toHaveLength(1);
    expect(versionSavedEvents[0].VersionNumber).toBe(2);
    expect(savedVersions[0].Content).toBe('# Explicit Version 2 Content');

    // Advancing past debounce window must NOT fire the cancelled autosave
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosaveHandler).toHaveBeenCalledTimes(1);

    // 3. Trigger edit and destroy component -> pending timer must be cancelled cleanly
    fixture.componentInstance.OnDraftContentChanged('# Unsaved before destroy');
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(true);
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosaveHandler).toHaveBeenCalledTimes(1);
  });

  it('hides Save Version button and blocks edits for read-only delegated users (Goldfish §1)', async () => {
    const { provider, savedVersions, collabStub } = createMockHarness({
      ArtifactID: ARTIFACT_A,
      CanRead: true,
      CanEdit: false,
      CanDelete: false,
      CanShare: false,
      Source: 'Delegate',
      Reason: 'Entity Read-only fallback',
    });

    const fixture = renderComponentFixture(MJEmbeddedDocPanelComponent, {
      imports: [MarkdownArtifactViewerStub, MJButtonDirective],
      declarations: [MJEmbeddedDocPanelComponent],
      providers: [{ provide: DocumentCollaborationService, useValue: collabStub }],
      inputs: {
        Provider: provider,
        ArtifactID: ARTIFACT_A,
        CurrentUser: createUser(),
        Mode: 'compact',
      },
    });
    await fixture.componentInstance.LoadArtifact();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="embedded-doc-readonly-badge"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="embedded-doc-save-version-btn"]')).toBeNull();
    expect(query(fixture, '[data-testid="markdown-viewer-stub"]')?.getAttribute('data-readonly')).toBe('true');

    // Programmatic draft edit / save version must remain no-ops
    fixture.componentInstance.OnDraftContentChanged('# Attempted mutation');
    expect(fixture.componentInstance.HasPendingAutosaveTimer).toBe(false);
    await fixture.componentInstance.OnSaveVersion();
    expect(savedVersions).toHaveLength(0);

    // Open Full Studio remains available even in read-only mode
    expect(query(fixture, '[data-testid="embedded-doc-open-studio-btn"]')).not.toBeNull();
  });
});
