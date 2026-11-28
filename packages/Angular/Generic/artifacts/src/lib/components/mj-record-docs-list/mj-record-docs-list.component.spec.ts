import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import {
  EntityFieldInfo,
  EntityInfo,
  EntityUserPermissionInfo,
  IMetadataProvider,
  RunView,
  RunViewParams,
  UserInfo,
} from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  ArtifactPermissionEngine,
  ResolvedArtifactPermissions,
} from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { capture, query, queryAll, renderComponentFixture, text } from '@memberjunction/ng-test-utils';
import {
  MJRecordDocsListComponent,
  StripMarkdownPreviewText,
} from './mj-record-docs-list.component';
import { MJArtifactSlideoverService } from '../../services/mj-artifact-slideover.service';

const ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';
const EDITOR_USER_ID = '33333333-3333-4333-8333-333333333333';
const READER_USER_ID = '44444444-4444-4444-8444-444444444444';
const ARTIFACT_1 = '55555555-5555-4555-8555-555555555551';
const ARTIFACT_2 = '55555555-5555-4555-8555-555555555552';
const ARTIFACT_HIDDEN = '55555555-5555-4555-8555-555555555553';
const MARKDOWN_TYPE_ID = '66666666-6666-4666-8666-666666666666';

function createUser(id: string, name: string): UserInfo {
  return new UserInfo(undefined, {
    ID: id,
    Name: name,
    Email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    IsActive: true,
    Type: 'User',
    UserRoles: [],
  });
}

function createPerms(canRead: boolean, canUpdate: boolean): EntityUserPermissionInfo {
  const perms = new EntityUserPermissionInfo();
  perms.CanRead = canRead;
  perms.CanUpdate = canUpdate;
  perms.CanCreate = canUpdate;
  perms.CanDelete = false;
  return perms;
}

function createMockEntity(canRead: boolean, canUpdate: boolean): EntityInfo {
  const pk = { Name: 'ID', IsPrimaryKey: true } as EntityFieldInfo;
  return {
    ID: ENTITY_ID,
    Name: 'MJ: Companies',
    PrimaryKeys: [pk],
    FirstPrimaryKey: pk,
    GetUserPermisions: vi.fn(() => createPerms(canRead, canUpdate)),
  } as Pick<EntityInfo, 'ID' | 'Name' | 'PrimaryKeys' | 'FirstPrimaryKey' | 'GetUserPermisions'> as EntityInfo;
}

interface MockSeedLink {
  ID: string;
  EntityID: string;
  RecordID: string;
  ArtifactID: string;
  PinnedArtifactVersionID: string | null;
  Role: string;
  Sequence: number;
  ContextDescription: string | null;
  __mj_UpdatedAt: string;
}

interface MockSeedHeader {
  ID: string;
  Name: string;
  Description: string | null;
  Type: string;
  __mj_UpdatedAt: string;
}

function buildProviderHarness(options: {
  CanReadHost: boolean;
  CanUpdateHost: boolean;
  Links: MockSeedLink[];
  Headers: MockSeedHeader[];
  PermissionsByArtifactId: Map<string, ResolvedArtifactPermissions>;
}) {
  const entityInfo = createMockEntity(options.CanReadHost, options.CanUpdateHost);
  const runViewCalls: RunViewParams[] = [];

  const getEntityObjectSpy = vi.fn(async (entityName: string) => {
    let savedId = '';
    const record: Record<string, string | number | boolean | null | ReturnType<typeof vi.fn>> = {
      ID: '',
      NewRecord: vi.fn(),
      Save: vi.fn(async () => {
        savedId =
          entityName === 'MJ: Artifacts'
            ? '99999999-9999-4999-8999-999999999901'
            : entityName === 'MJ: Artifact Versions'
              ? '99999999-9999-4999-8999-999999999902'
              : '99999999-9999-4999-8999-999999999903';
        record['ID'] = savedId;
        return true;
      }),
      Delete: vi.fn(async () => true),
    };
    return record;
  });

  const provider = {
    Entities: [entityInfo],
    EntityByName: vi.fn((name: string) =>
      name.trim().toLowerCase() === 'mj: companies' ? entityInfo : undefined,
    ),
    EntityByID: vi.fn((id: string) => (id.toLowerCase() === ENTITY_ID.toLowerCase() ? entityInfo : undefined)),
    GetEntityObject: getEntityObjectSpy,
  } as Pick<IMetadataProvider, 'Entities' | 'EntityByName' | 'EntityByID' | 'GetEntityObject'> as IMetadataProvider;

  vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockReturnValue(undefined);
  vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissionsBatch').mockResolvedValue(
    options.PermissionsByArtifactId,
  );
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(async (params: RunViewParams) => {
      runViewCalls.push(params);
      if (params.EntityName === 'MJ: Record Artifacts') {
        return {
          Success: true,
          Results: options.Links,
          RowCount: options.Links.length,
          TotalRowCount: options.Links.length,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      }
      if (params.EntityName === 'MJ: Artifacts') {
        const filter = (typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '').toLowerCase();
        const matched = options.Headers.filter((h) => filter.includes(h.ID.toLowerCase()));
        return {
          Success: true,
          Results: matched,
          RowCount: matched.length,
          TotalRowCount: matched.length,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      }
      if (params.EntityName === 'MJ: Artifact Types') {
        return {
          Success: true,
          Results: [{ ID: MARKDOWN_TYPE_ID, Name: 'Markdown Document' }],
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

  return { provider, runViewCalls, getEntityObjectSpy };
}

describe('MJRecordDocsListComponent (DOM)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('StripMarkdownPreviewText removes raw Markdown syntax cleanly', () => {
    const raw = '### Q4 Executive Brief\n\n- **Revenue**: `+$4.2M` [details](https://example.com)';
    const plain = StripMarkdownPreviewText(raw);
    expect(plain).not.toContain('###');
    expect(plain).not.toContain('**');
    expect(plain).not.toContain('`');
    expect(plain).toContain('Q4 Executive Brief');
    expect(plain).toContain('Revenue');
  });

  it('hides create, promote, and synthesize-slides actions for read-only delegated users and filters unreadable artifacts', async () => {
    const reader = createUser(READER_USER_ID, 'Marcus Reader');
    const permsMap = new Map<string, ResolvedArtifactPermissions>([
      [
        ARTIFACT_1,
        {
          ArtifactID: ARTIFACT_1,
          CanRead: true,
          CanEdit: false,
          CanDelete: false,
          CanShare: false,
          Source: 'Delegate',
          Reason: 'Entity Read-only fallback',
        },
      ],
      [
        ARTIFACT_HIDDEN,
        {
          ArtifactID: ARTIFACT_HIDDEN,
          CanRead: false,
          CanEdit: false,
          CanDelete: false,
          CanShare: false,
          Source: 'Denied',
          Reason: 'Hidden by RLS',
        },
      ],
    ]);

    const { provider, runViewCalls, getEntityObjectSpy } = buildProviderHarness({
      CanReadHost: true,
      CanUpdateHost: false,
      Links: [
        {
          ID: 'link-1',
          EntityID: ENTITY_ID,
          RecordID: RECORD_ID,
          ArtifactID: ARTIFACT_1,
          PinnedArtifactVersionID: null,
          Role: 'Brief',
          Sequence: 1,
          ContextDescription: '### Executive **Brief** summary',
          __mj_UpdatedAt: '2026-11-26T12:00:00Z',
        },
        {
          ID: 'link-hidden',
          EntityID: ENTITY_ID,
          RecordID: RECORD_ID,
          ArtifactID: ARTIFACT_HIDDEN,
          PinnedArtifactVersionID: null,
          Role: 'General',
          Sequence: 2,
          ContextDescription: 'Secret doc',
          __mj_UpdatedAt: '2026-11-26T12:00:00Z',
        },
      ],
      Headers: [
        {
          ID: ARTIFACT_1,
          Name: 'Acme Strategy Brief',
          Description: 'Brief description',
          Type: 'Markdown Document',
          __mj_UpdatedAt: '2026-11-26T12:00:00Z',
        },
        {
          ID: ARTIFACT_HIDDEN,
          Name: 'Hidden Doc',
          Description: 'Should not display',
          Type: 'Markdown Document',
          __mj_UpdatedAt: '2026-11-26T12:00:00Z',
        },
      ],
      PermissionsByArtifactId: permsMap,
    });

    const fixture = renderComponentFixture(MJRecordDocsListComponent, {
      imports: [FormsModule, MJButtonDirective],
      declarations: [MJRecordDocsListComponent],
      inputs: {
        Provider: provider,
        EntityName: 'MJ: Companies',
        RecordID: RECORD_ID,
        CurrentUser: reader,
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

    const cards = queryAll(fixture, '.mj-record-docs__card');
    expect(cards).toHaveLength(1);
    expect(text(fixture, '.mj-record-docs__card-excerpt')).toBe('Executive Brief summary');
    expect(query(fixture, '[data-testid="record-doc-item-readonly"]')).not.toBeNull();

    // Verify batched ResultType:'simple' queries with ZERO N+1 GetEntityObject calls during read
    expect(getEntityObjectSpy).not.toHaveBeenCalled();
    expect(runViewCalls.every((c) => c.ResultType === 'simple')).toBe(true);

    // Programmatic promotion must also fail closed for read-only users
    const denied = await fixture.componentInstance.PromoteQuickNote('Should Fail', 'Body');
    expect(denied.Success).toBe(false);
    expect(denied.ErrorCode).toBe('PERMISSION_DENIED');
  });

  it('chunks Artifact header RunView IN-clauses at <= 200 IDs for large linked sets', async () => {
    const editor = createUser(EDITOR_USER_ID, 'Elena Editor');
    const links: MockSeedLink[] = [];
    const headers: MockSeedHeader[] = [];
    const permsMap = new Map<string, ResolvedArtifactPermissions>();

    for (let i = 1; i <= 250; i++) {
      const id = `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`;
      links.push({
        ID: `link-${i}`,
        EntityID: ENTITY_ID,
        RecordID: RECORD_ID,
        ArtifactID: id,
        PinnedArtifactVersionID: null,
        Role: 'General',
        Sequence: i,
        ContextDescription: null,
        __mj_UpdatedAt: '2026-11-26T12:00:00Z',
      });
      headers.push({
        ID: id,
        Name: `Document ${i}`,
        Description: `Description ${i}`,
        Type: 'Markdown Document',
        __mj_UpdatedAt: '2026-11-26T12:00:00Z',
      });
      permsMap.set(id, {
        ArtifactID: id,
        CanRead: true,
        CanEdit: true,
        CanDelete: false,
        CanShare: true,
        Source: 'Delegate',
        Reason: 'Entity Read+Update',
      });
    }

    const { provider, runViewCalls, getEntityObjectSpy } = buildProviderHarness({
      CanReadHost: true,
      CanUpdateHost: true,
      Links: links,
      Headers: headers,
      PermissionsByArtifactId: permsMap,
    });

    vi.spyOn(MJRecordDocsListComponent.prototype, 'ngOnInit').mockImplementation(() => undefined);
    const fixture = renderComponentFixture(MJRecordDocsListComponent, {
      imports: [FormsModule, MJButtonDirective],
      declarations: [MJRecordDocsListComponent],
      inputs: {
        Provider: provider,
        EntityName: 'MJ: Companies',
        RecordID: RECORD_ID,
        CurrentUser: editor,
      },
    });
    runViewCalls.length = 0;
    await fixture.componentInstance.Refresh();
    fixture.detectChanges();

    const artifactHeaderQueries = runViewCalls.filter((c) => c.EntityName === 'MJ: Artifacts');
    expect(artifactHeaderQueries).toHaveLength(2); // 200 + 50
    for (const q of artifactHeaderQueries) {
      const filterText = typeof q.ExtraFilter === 'string' ? q.ExtraFilter : '';
      const quotedIds = filterText.match(/'[^']+'/g) ?? [];
      expect(quotedIds.length).toBeLessThanOrEqual(MJRecordDocsListComponent.MAX_IN_CLAUSE_CHUNK_SIZE);
    }
    expect(fixture.componentInstance.Items).toHaveLength(250);
    expect(getEntityObjectSpy).not.toHaveBeenCalled();
  });

  it('promotes a quick note via PromoteNoteToArtifact, emits SynthesizeSlidesRequested with zero LLM spend, and opens slideover', async () => {
    const editor = createUser(EDITOR_USER_ID, 'Elena Editor');
    const permsMap = new Map<string, ResolvedArtifactPermissions>([
      [
        ARTIFACT_2,
        {
          ArtifactID: ARTIFACT_2,
          CanRead: true,
          CanEdit: true,
          CanDelete: false,
          CanShare: true,
          Source: 'Delegate',
          Reason: 'Entity Read+Update',
        },
      ],
    ]);

    const { provider } = buildProviderHarness({
      CanReadHost: true,
      CanUpdateHost: true,
      Links: [
        {
          ID: 'link-2',
          EntityID: ENTITY_ID,
          RecordID: RECORD_ID,
          ArtifactID: ARTIFACT_2,
          PinnedArtifactVersionID: null,
          Role: 'Proposal',
          Sequence: 1,
          ContextDescription: 'Technical integration proposal',
          __mj_UpdatedAt: '2026-11-26T12:00:00Z',
        },
      ],
      Headers: [
        {
          ID: ARTIFACT_2,
          Name: 'Integration Proposal',
          Description: 'Details',
          Type: 'Markdown Document',
          __mj_UpdatedAt: '2026-11-26T12:00:00Z',
        },
      ],
      PermissionsByArtifactId: permsMap,
    });

    const fixture = renderComponentFixture(MJRecordDocsListComponent, {
      imports: [FormsModule, MJButtonDirective],
      declarations: [MJRecordDocsListComponent],
      inputs: {
        Provider: provider,
        EntityName: 'MJ: Companies',
        RecordID: RECORD_ID,
        CurrentUser: editor,
        AllowedRoles: ['Brief', 'Proposal'],
        AllowCreate: true,
        AllowSynthesizeSlides: true,
        OpenInSlideover: true,
      },
    });
    await fixture.componentInstance.Refresh();
    fixture.detectChanges();

    const openedEvents = capture(fixture.componentInstance.ArtifactOpened);
    const promotedEvents = capture(fixture.componentInstance.NotePromoted);
    const synthEvents = capture(fixture.componentInstance.SynthesizeSlidesRequested);
    const slideover = TestBed.inject(MJArtifactSlideoverService);

    // Click document item -> emits ArtifactOpened & opens slideover
    (query(fixture, '.mj-record-docs__card-trigger') as HTMLButtonElement).click();
    expect(openedEvents).toHaveLength(1);
    expect(openedEvents[0].ArtifactID).toBe(ARTIFACT_2);
    expect(slideover.IsOpen).toBe(true);
    expect(slideover.CurrentRequest?.ArtifactID).toBe(ARTIFACT_2);

    // Synthesize Slides button -> deterministic event emission, zero LLM spend
    const synthBtn = query(fixture, '[data-testid="record-docs-synthesize-slides-btn"]') as HTMLButtonElement;
    expect(synthBtn).not.toBeNull();
    synthBtn.click();
    expect(synthEvents).toHaveLength(1);
    expect(synthEvents[0].SourceArtifactIDs).toEqual([ARTIFACT_2]);

    // Promote Note via PromoteNoteToArtifact
    const promoteRes = await fixture.componentInstance.PromoteQuickNote(
      'Executive Call Summary',
      '# Notes\n\nConfirmed timeline.',
      'Brief',
    );
    expect(promoteRes.Success).toBe(true);
    expect(promotedEvents).toHaveLength(1);
    expect(promotedEvents[0].ArtifactID).toBe('99999999-9999-4999-8999-999999999901');
  });
});
