import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormsModule } from '@angular/forms';
import {
  EntityFieldInfo,
  EntityInfo,
  EntityUserPermissionInfo,
  IMetadataProvider,
  RunView,
  RunViewParams,
  UserInfo,
} from '@memberjunction/core';
import { ArtifactPermissionEngine, ResolvedArtifactPermissions } from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { capture, query, queryAll, renderComponentFixture, text } from '@memberjunction/ng-test-utils';
import { MJRecordDocsListComponent } from './mj-record-docs-list.component';

const ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_ID = '55555555-5555-4555-8555-555555555551';

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

function makeProvider(canUpdate: boolean): IMetadataProvider {
  const perms = new EntityUserPermissionInfo();
  perms.CanRead = true;
  perms.CanUpdate = canUpdate;
  perms.CanCreate = canUpdate;
  const pk = { Name: 'ID', IsPrimaryKey: true } as EntityFieldInfo;
  const entity = {
    ID: ENTITY_ID,
    Name: 'MJ: Companies',
    PrimaryKeys: [pk],
    FirstPrimaryKey: pk,
    GetUserPermisions: vi.fn(() => perms),
  } as Pick<EntityInfo, 'ID' | 'Name' | 'PrimaryKeys' | 'FirstPrimaryKey' | 'GetUserPermisions'> as EntityInfo;

  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(async (params: RunViewParams) => {
      if (params.EntityName === 'MJ: Record Artifacts') {
        return {
          Success: true,
          Results: [
            {
              ID: 'link-1',
              EntityID: ENTITY_ID,
              RecordID: RECORD_ID,
              ArtifactID: ARTIFACT_ID,
              PinnedArtifactVersionID: null,
              Role: 'Brief',
              Sequence: 1,
              ContextDescription: '### Primary **account** brief',
              __mj_UpdatedAt: '2026-11-26T12:00:00Z',
            },
          ],
          RowCount: 1,
          TotalRowCount: 1,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      }
      return {
        Success: true,
        Results: [
          {
            ID: ARTIFACT_ID,
            Name: 'Acme Strategy Brief',
            Description: 'Executive Summary',
            Type: 'Markdown Document',
            __mj_UpdatedAt: '2026-11-26T12:00:00Z',
          },
        ],
        RowCount: 1,
        TotalRowCount: 1,
        ExecutionTime: 1,
        ErrorMessage: '',
      };
    }),
  } as Pick<RunView, 'RunView'> as RunView);

  const permMap = new Map<string, ResolvedArtifactPermissions>([
    [
      ARTIFACT_ID,
      {
        ArtifactID: ARTIFACT_ID,
        CanRead: true,
        CanEdit: canUpdate,
        CanDelete: false,
        CanShare: canUpdate,
        Source: 'Delegate',
        Reason: 'Delegated from MJ: Companies',
      },
    ],
  ]);
  vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissionsBatch').mockResolvedValue(permMap);

  return {
    ProviderType: 'Network',
    Entities: [entity],
    EntityByID: () => entity,
    EntityByName: () => entity,
  } as Pick<IMetadataProvider, 'ProviderType' | 'Entities' | 'EntityByID' | 'EntityByName'> as IMetadataProvider;
}

describe('MJRecordDocsListComponent DOM contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders linked doc cards with stripped markdown previews and emits ArtifactOpened & SynthesizeSlidesRequested', async () => {
    const provider = makeProvider(true);
    const fixture = renderComponentFixture(MJRecordDocsListComponent, {
      imports: [FormsModule, MJButtonDirective],
      declarations: [MJRecordDocsListComponent],
      inputs: {
        Provider: provider,
        EntityName: 'MJ: Companies',
        RecordID: RECORD_ID,
        CurrentUser: makeUser(),
        AllowCreate: true,
        AllowSynthesizeSlides: true,
        OpenInSlideover: false,
      },
    });
    const opened = capture(fixture.componentInstance.ArtifactOpened);
    const synth = capture(fixture.componentInstance.SynthesizeSlidesRequested);

    await fixture.componentInstance.Refresh();
    fixture.detectChanges();

    const cards = queryAll(fixture, '.mj-record-docs__card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Acme Strategy Brief');
    expect(text(fixture, '.mj-record-docs__card-excerpt')).toBe('Primary account brief');

    fixture.componentInstance.OnOpenItem(fixture.componentInstance.FilteredItems[0]);
    fixture.detectChanges();
    expect(opened).toHaveLength(1);
    expect(opened[0].ArtifactID).toBe(ARTIFACT_ID);

    const synthBtn = query(fixture, '[data-testid="record-docs-synthesize-slides-btn"]') as HTMLButtonElement | null;
    expect(synthBtn).not.toBeNull();
    synthBtn?.click();
    expect(synth).toHaveLength(1);
  });

  it('hides create, promote, and synthesize actions when viewer is read-only', async () => {
    const provider = makeProvider(false);
    const fixture = renderComponentFixture(MJRecordDocsListComponent, {
      imports: [FormsModule, MJButtonDirective],
      declarations: [MJRecordDocsListComponent],
      inputs: {
        Provider: provider,
        EntityName: 'MJ: Companies',
        RecordID: RECORD_ID,
        CurrentUser: makeUser(),
        AllowCreate: true,
        AllowSynthesizeSlides: true,
      },
    });

    await fixture.componentInstance.Refresh();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="record-docs-readonly-badge"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="record-docs-create-btn"]')).toBeNull();
    expect(query(fixture, '[data-testid="record-docs-promote-note-btn"]')).toBeNull();
    expect(query(fixture, '[data-testid="record-docs-synthesize-slides-btn"]')).toBeNull();
  });

  it('exposes ArtifactCreated and NotePromoted outputs and updates role filter state', async () => {
    const provider = makeProvider(true);
    const fixture = renderComponentFixture(MJRecordDocsListComponent, {
      imports: [FormsModule, MJButtonDirective],
      declarations: [MJRecordDocsListComponent],
      inputs: {
        Provider: provider,
        EntityName: 'MJ: Companies',
        RecordID: RECORD_ID,
        CurrentUser: makeUser(),
        AllowedRoles: ['Brief', 'Spec'],
      },
    });
    const created = capture(fixture.componentInstance.ArtifactCreated);
    const promoted = capture(fixture.componentInstance.NotePromoted);

    await fixture.componentInstance.Refresh();
    fixture.detectChanges();

    fixture.componentInstance.OnSelectRoleFilter('Brief');
    fixture.detectChanges();
    expect(fixture.componentInstance.SelectedRoleFilter).toBe('Brief');
    expect(fixture.componentInstance.FilteredItems).toHaveLength(1);
    expect(created).toHaveLength(0);
    expect(promoted).toHaveLength(0);
  });
});
