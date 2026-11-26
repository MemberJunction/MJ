import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { CompositeKey, IMetadataProvider, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { capture, query, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJEmbeddedDocPanelComponent } from './mj-embedded-doc-panel.component';
import { DocumentCollaborationService } from '../../services/document-collaboration.service';

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

function setupMocks(canEdit: boolean) {
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
    Content: '# Initial',
    ContentMode: 'Text',
  });
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(async (params: RunViewParams) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [{ ID: ARTIFACT_ID, Name: 'Account Brief' }],
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
    }),
  } as Pick<RunView, 'RunView'> as RunView);

  const collabStub = {
    CommitInlineEditOnServer: vi.fn(async () => ({ HandledByServer: false, Success: false })),
  };

  const provider = {
    ProviderType: 'Network',
    GetEntityObject: vi.fn(async () =>
      Object.assign(Object.create(null) as MJArtifactVersionEntity, {
        ID: 'ver-2',
        ArtifactID: ARTIFACT_ID,
        VersionNumber: 2,
        Name: 'Account Brief',
        Content: '',
        ContentMode: 'Text',
        UserID: USER_ID,
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
      })
    ),
  } as Pick<IMetadataProvider, 'ProviderType' | 'GetEntityObject'> as IMetadataProvider;

  return { provider, collabStub };
}

describe('MJEmbeddedDocPanelComponent DOM contract', () => {
  afterEach(() => {
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
});
