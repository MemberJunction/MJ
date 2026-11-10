import { describe, it, expect, vi } from 'vitest';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
  ArtifactPermissionEngine,
  BaseArtifactPermissionDelegate,
  ParentArtifactPermissionDelegate,
  LoadArtifactPermissionDelegates,
} from '../custom/ArtifactPermissionDelegate';
import {
  DocumentLiveBlockEngine,
  BaseDocumentBlock,
  LoadDocumentLiveBlocks,
  type DocumentBlockSpec,
} from '../custom/DocumentLiveBlockEngine';

LoadArtifactPermissionDelegates();
LoadDocumentLiveBlocks();
DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');

function createMockUser(id: string, name = 'Test User'): UserInfo {
  const u = new UserInfo();
  u.ID = id;
  u.Name = name;
  u.Email = `${id}@example.com`;
  u.IsActive = true;
  return u;
}

describe('ArtifactPermissionEngine & ParentArtifactPermissionDelegate', () => {
  const ownerUser = createMockUser('11111111-1111-1111-1111-111111111111', 'Owner Alice');
  const editorUser = createMockUser('22222222-2222-2222-2222-222222222222', 'Editor Bob');
  const readerUser = createMockUser('33333333-3333-3333-3333-333333333333', 'Reader Carol');
  const outsiderUser = createMockUser('44444444-4444-4444-4444-444444444444', 'Outsider Eve');

  it('registers ParentArtifactPermissionDelegate for MJ: Artifacts in ClassFactory', () => {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactPermissionDelegate>(
      BaseArtifactPermissionDelegate,
      'MJ: Artifacts',
    );
    expect(instance).toBeInstanceOf(ParentArtifactPermissionDelegate);
  });

  it('grants full permissions (CanRead, CanEdit, CanDelete, CanShare) to the artifact owner', async () => {
    const provider = {
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: [
          {
            ID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            UserID: ownerUser.ID,
            DelegateEntityID: null,
            DelegateRecordID: null,
          },
        ],
      }),
    } as unknown as IMetadataProvider;

    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
      provider,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ownerUser,
    );
    expect(perms.CanRead).toBe(true);
    expect(perms.CanEdit).toBe(true);
    expect(perms.CanDelete).toBe(true);
    expect(perms.CanShare).toBe(true);
    expect(perms.Source).toBe('Owner');
  });

  it('resolves direct MJ: Artifact Permissions for Edit and Read users and denies outsiders', async () => {
    const makeProvider = (targetUserId: string): IMetadataProvider =>
      ({
        RunView: vi.fn().mockImplementation(async (params: { EntityName: string }) => {
          if (params.EntityName === 'MJ: Artifacts') {
            return {
              Success: true,
              Results: [
                {
                  ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                  UserID: ownerUser.ID,
                  DelegateEntityID: null,
                  DelegateRecordID: null,
                },
              ],
            };
          }
          if (params.EntityName === 'MJ: Artifact Permissions') {
            if (targetUserId === editorUser.ID) {
              return {
                Success: true,
                Results: [
                  {
                    ID: 'p1',
                    ArtifactID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                    UserID: editorUser.ID,
                    CanRead: true,
                    CanEdit: true,
                    CanDelete: false,
                    CanShare: false,
                  },
                ],
              };
            }
            if (targetUserId === readerUser.ID) {
              return {
                Success: true,
                Results: [
                  {
                    ID: 'p2',
                    ArtifactID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                    UserID: readerUser.ID,
                    CanRead: true,
                    CanEdit: false,
                    CanDelete: false,
                    CanShare: false,
                  },
                ],
              };
            }
            return { Success: true, Results: [] };
          }
          return { Success: true, Results: [] };
        }),
      }) as unknown as IMetadataProvider;

    const editorPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
      makeProvider(editorUser.ID),
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      editorUser,
    );
    expect(editorPerms.CanRead).toBe(true);
    expect(editorPerms.CanEdit).toBe(true);
    expect(editorPerms.Source).toBe('ArtifactPermission');

    const readerPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
      makeProvider(readerUser.ID),
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      readerUser,
    );
    expect(readerPerms.CanRead).toBe(true);
    expect(readerPerms.CanEdit).toBe(false);

    const outsiderPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
      makeProvider(outsiderUser.ID),
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      outsiderUser,
    );
    expect(outsiderPerms.CanRead).toBe(false);
    expect(outsiderPerms.CanEdit).toBe(false);
    expect(outsiderPerms.Source).toBe('Denied');
  });

  it('cascades Collection Permissions through MJ: Artifact Versions -> MJ: Collection Artifacts', async () => {
    const artId = 'c011ec71-0000-0000-0000-000000000001';
    const verId = 'c011ec71-0000-0000-0000-000000000002';
    const colId = 'c011ec71-0000-0000-0000-000000000003';

    const provider = {
      RunView: vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter: string }) => {
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [{ ID: artId, UserID: ownerUser.ID, DelegateEntityID: null, DelegateRecordID: null }],
          };
        }
        if (params.EntityName === 'MJ: Artifact Permissions') {
          return { Success: true, Results: [] };
        }
        if (params.EntityName === 'MJ: Artifact Versions') {
          expect(params.ExtraFilter).toContain(artId);
          return { Success: true, Results: [{ ID: verId }] };
        }
        if (params.EntityName === 'MJ: Collection Artifacts') {
          expect(params.ExtraFilter).toContain('ArtifactVersionID IN');
          expect(params.ExtraFilter).toContain(verId);
          return { Success: true, Results: [{ CollectionID: colId }] };
        }
        if (params.EntityName === 'MJ: Collection Permissions') {
          expect(params.ExtraFilter).toContain(colId);
          return {
            Success: true,
            Results: [{ CanRead: true, CanEdit: true, CanDelete: false, CanShare: false }],
          };
        }
        return { Success: true, Results: [] };
      }),
    } as unknown as IMetadataProvider;

    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artId, editorUser);
    expect(perms.CanRead).toBe(true);
    expect(perms.CanEdit).toBe(true);
    expect(perms.Source).toBe('CollectionPermission');
  });

  it('delegates child OLE artifact permissions to the parent host artifact via ParentArtifactPermissionDelegate', async () => {
    const childId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const parentId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const artifactEntityId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    const provider = {
      Entities: [{ ID: artifactEntityId, Name: 'MJ: Artifacts' }],
      RunView: vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter: string }) => {
        if (params.EntityName === 'MJ: Artifacts') {
          if (params.ExtraFilter.includes(childId)) {
            return {
              Success: true,
              Results: [
                {
                  ID: childId,
                  UserID: ownerUser.ID,
                  DelegateEntityID: artifactEntityId,
                  DelegateRecordID: parentId,
                },
              ],
            };
          }
          if (params.ExtraFilter.includes(parentId)) {
            return {
              Success: true,
              Results: [
                {
                  ID: parentId,
                  UserID: ownerUser.ID,
                  DelegateEntityID: null,
                  DelegateRecordID: null,
                },
              ],
            };
          }
        }
        if (params.EntityName === 'MJ: Artifact Permissions') {
          if (params.ExtraFilter.includes(parentId) && params.ExtraFilter.includes(editorUser.ID)) {
            return {
              Success: true,
              Results: [
                {
                  ID: 'perm-parent',
                  ArtifactID: parentId,
                  UserID: editorUser.ID,
                  CanRead: true,
                  CanEdit: true,
                  CanDelete: false,
                  CanShare: false,
                },
              ],
            };
          }
          return { Success: true, Results: [] };
        }
        return { Success: true, Results: [] };
      }),
    } as unknown as IMetadataProvider;

    const childPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, childId, editorUser);
    expect(childPerms.CanRead).toBe(true);
    expect(childPerms.CanEdit).toBe(true);
    expect(childPerms.Source).toBe('Delegate');
  });

  it('prevents infinite recursion when DelegateRecordID forms a cycle', async () => {
    const cycleA = 'f1111111-1111-1111-1111-111111111111';
    const cycleB = 'f2222222-2222-2222-2222-222222222222';
    const artifactEntityId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    const provider = {
      Entities: [{ ID: artifactEntityId, Name: 'MJ: Artifacts' }],
      RunView: vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter: string }) => {
        if (params.EntityName === 'MJ: Artifacts') {
          const isA = params.ExtraFilter.includes(cycleA);
          return {
            Success: true,
            Results: [
              {
                ID: isA ? cycleA : cycleB,
                UserID: ownerUser.ID,
                DelegateEntityID: artifactEntityId,
                DelegateRecordID: isA ? cycleB : cycleA,
              },
            ],
          };
        }
        return { Success: true, Results: [] };
      }),
    } as unknown as IMetadataProvider;

    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, cycleA, outsiderUser);
    expect(perms.CanRead).toBe(false);
    expect(perms.CanEdit).toBe(false);
  });

  it('emits real-time permission change events via NotifyPermissionsChanged', async () => {
    const received: Array<{ ArtifactID: string; TargetUserID?: string }> = [];
    const unsub = ArtifactPermissionEngine.Instance.OnPermissionsChanged((evt) => {
      received.push({ ArtifactID: evt.ArtifactID, TargetUserID: evt.TargetUserID });
    });

    await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
      ArtifactID: 'art-99',
      TargetUserID: editorUser.ID,
    });
    unsub();

    expect(received).toEqual([{ ArtifactID: 'art-99', TargetUserID: editorUser.ID }]);
  });
});

describe('DocumentLiveBlockEngine — RLS/FLS, IsServerSet Stripping, Freeze Warning, and Markdown Directives', () => {
  const viewerUser = createMockUser('55555555-5555-5555-5555-555555555555', 'Viewer Dan');

  it('registers all 5 block types (EntityView, SavedQuery, DashboardPart, InteractiveComponent, Artifact)', () => {
    const types = ['EntityView', 'SavedQuery', 'DashboardPart', 'InteractiveComponent', 'Artifact'] as const;
    for (const t of types) {
      const handler = DocumentLiveBlockEngine.Instance.GetBlockHandler(t);
      expect(handler).toBeTruthy();
      expect(handler).toBeInstanceOf(BaseDocumentBlock);
      expect(handler?.Kind).toBe(t);
    }
  });

  it('enforces Entity CanRead and Field-Level Security (FLS) projection on EntityView blocks', async () => {
    const mockEntityInfo = {
      ID: 'ent-emp',
      Name: 'Employees',
      DisplayNameOrName: 'Employees',
      PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true, TSType: EntityFieldTSType.String }],
      Fields: [
        { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, TSType: EntityFieldTSType.String },
        { Name: 'FullName', DisplayNameOrName: 'Full Name', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.String },
        { Name: 'Salary', DisplayNameOrName: 'Salary', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.Number },
      ] as unknown as EntityFieldInfo[],
      FieldLevelSecurityApplies: true,
      GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
      GetDeniedReadFields: vi.fn().mockReturnValue(new Set(['salary'])),
    } as unknown as EntityInfo;

    const provider = {
      Entities: [mockEntityInfo],
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: [
          { ID: 'e1', FullName: 'Jane Doe', Salary: 195000 },
          { ID: 'e2', FullName: 'John Smith', Salary: 165000 },
        ],
        TotalRowCount: 2,
      }),
    } as unknown as IMetadataProvider;

    const block: DocumentBlockSpec = {
      BlockID: 'blk-emp-1',
      Kind: 'EntityView',
      Mode: 'Live',
      EntityName: 'Employees',
      Fields: ['ID', 'FullName', 'Salary'],
    };

    const result = await DocumentLiveBlockEngine.Instance.ExecuteBlock(block, viewerUser, provider);
    expect(result.Success).toBe(true);
    expect(result.Columns.map((c) => c.Name)).toEqual(['ID', 'FullName']);
    expect(result.Columns.map((c) => c.Name)).not.toContain('Salary');
    expect(result.Rows[0]).toEqual({ ID: 'e1', FullName: 'Jane Doe' });
    expect('Salary' in result.Rows[0]).toBe(false);
  });

  it('rejects EntityView execution when the viewer lacks CanRead on the target entity', async () => {
    const restrictedEntity = {
      ID: 'ent-secret',
      Name: 'ExecutiveCompensation',
      DisplayNameOrName: 'ExecutiveCompensation',
      Fields: [],
      GetUserPermisions: vi.fn().mockReturnValue({ CanRead: false }),
    } as unknown as EntityInfo;

    const provider = {
      Entities: [restrictedEntity],
    } as unknown as IMetadataProvider;

    const block: DocumentBlockSpec = {
      BlockID: 'blk-secret',
      Kind: 'EntityView',
      Mode: 'Live',
      EntityName: 'ExecutiveCompensation',
    };

    const result = await DocumentLiveBlockEngine.Instance.ExecuteBlock(block, viewerUser, provider);
    expect(result.Success).toBe(false);
    expect(result.AccessDenied).toBe(true);
    expect(result.ErrorMessage).toContain('do not have permission to read');
  });

  it('strips SERVER_ONLY_RUN_QUERY_PARAMS and IsServerSet metadata parameters on SavedQuery blocks', async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const provider = {
      Queries: [
        {
          ID: '99999999-9999-9999-9999-999999999999',
          Name: 'Regional Sales',
          UserCanRun: vi.fn().mockReturnValue(true),
          Parameters: [
            { Name: 'Region', IsServerSet: false },
            { Name: 'TenantContextUserID', IsServerSet: true },
          ],
          Entities: [],
        },
      ],
      RunQuery: vi.fn().mockImplementation(async (params: { Parameters?: Record<string, unknown> }) => {
        capturedParams = params.Parameters;
        return {
          Success: true,
          Results: [{ Region: 'West', Revenue: 42000 }],
          RowCount: 1,
        };
      }),
    } as unknown as IMetadataProvider;

    const block: DocumentBlockSpec = {
      BlockID: 'blk-q-1',
      Kind: 'SavedQuery',
      Mode: 'Live',
      QueryID: '99999999-9999-9999-9999-999999999999',
      Parameters: {
        Region: 'West',
        TenantContextUserID: 'spoofed-tenant',
        context: { spoofed: true },
      },
    };

    const result = await DocumentLiveBlockEngine.Instance.ExecuteBlock(block, viewerUser, provider);
    expect(result.Success).toBe(true);
    expect(capturedParams).toEqual({ Region: 'West' });
    expect(result.StrippedServerSetParameters).toEqual(
      expect.arrayContaining(['TenantContextUserID', 'context']),
    );
  });

  it('enforces explicit O5 security warning acknowledgment before freezing a live block', async () => {
    const block: DocumentBlockSpec = {
      BlockID: 'blk-freeze-1',
      Kind: 'EntityView',
      Mode: 'Live',
      EntityName: 'Employees',
    };

    const res = await DocumentLiveBlockEngine.Instance.FreezeBlock(block, viewerUser, false);
    expect(res.Success).toBe(false);
    expect(res.ErrorMessage).toContain('explicit acknowledgment');
  });

  it('freezes a live block with FrozenAt, FrozenByUserID, and FrozenSnapshot, and unfreezes back to Live', async () => {
    const mockEntityInfo = {
      ID: 'ent-proj',
      Name: 'Projects',
      DisplayNameOrName: 'Projects',
      PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true, TSType: EntityFieldTSType.String }],
      Fields: [
        { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, TSType: EntityFieldTSType.String },
        { Name: 'Name', DisplayNameOrName: 'Name', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.String },
      ] as unknown as EntityFieldInfo[],
      FieldLevelSecurityApplies: false,
      GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
      GetDeniedReadFields: vi.fn().mockReturnValue(new Set()),
    } as unknown as EntityInfo;

    const provider = {
      Entities: [mockEntityInfo],
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: [{ ID: 'p1', Name: 'Project Apollo' }],
        TotalRowCount: 1,
      }),
    } as unknown as IMetadataProvider;

    const liveBlock: DocumentBlockSpec = {
      BlockID: 'blk-proj',
      Kind: 'EntityView',
      Mode: 'Live',
      EntityName: 'Projects',
    };

    const freezeRes = await DocumentLiveBlockEngine.Instance.FreezeBlock(liveBlock, viewerUser, true, provider);
    expect(freezeRes.Success).toBe(true);
    const frozen = freezeRes.UpdatedSpec!;
    expect(frozen.Mode).toBe('Frozen');
    expect(frozen.FrozenSnapshot?.FrozenByUserID).toBe(viewerUser.ID);
    expect(frozen.FrozenSnapshot?.FrozenAt).toBeTruthy();
    expect(frozen.FrozenSnapshot?.Rows).toEqual([{ ID: 'p1', Name: 'Project Apollo' }]);

    // Executing a Frozen block returns the snapshot without hitting RunView again
    const runViewSpy = (provider as unknown as { RunView: ReturnType<typeof vi.fn> }).RunView;
    const spyCallsBefore = runViewSpy.mock.calls.length;
    const frozenExec = await DocumentLiveBlockEngine.Instance.ExecuteBlock(frozen, viewerUser, provider);
    expect(runViewSpy.mock.calls.length).toBe(spyCallsBefore);
    expect(frozenExec.Mode).toBe('Frozen');
    expect(frozenExec.Rows).toEqual([{ ID: 'p1', Name: 'Project Apollo' }]);

    // Executing a Frozen block whose SecurityWarningAcknowledged is false fails closed
    const tamperedFrozen: DocumentBlockSpec = {
      ...frozen,
      FrozenSnapshot: {
        ...frozen.FrozenSnapshot!,
        SecurityWarningAcknowledged: false,
      },
    };
    const tamperedExec = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
      tamperedFrozen,
      viewerUser,
      provider,
    );
    expect(tamperedExec.Success).toBe(false);
    expect(tamperedExec.ErrorMessage).toContain('SecurityWarningAcknowledged: true');

    // Unfreezing restores Live mode
    const unfrozen = DocumentLiveBlockEngine.Instance.UnfreezeBlock(frozen);
    expect(unfrozen.Mode).toBe('Live');
    expect(unfrozen.FrozenSnapshot).toBeUndefined();
  });

  it('round-trips :::mj-block directives in Markdown losslessly', () => {
    const block: DocumentBlockSpec = {
      BlockID: 'blk-wb-100',
      Kind: 'Artifact',
      Mode: 'Live',
      ArtifactID: 'wb-uuid-1234',
      ArtifactType: 'Whiteboard',
      VersionID: 'v-2',
      Title: 'System Architecture Whiteboard',
    };

    const directive = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(block);
    const md = `# Architecture Spec\n\nIntro paragraph.\n\n${directive}\n\n## Conclusion\nAll done.`;

    const parsed = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(md);
    const blockSegs = parsed.filter((s) => s.Type === 'mj-block');
    expect(blockSegs).toHaveLength(1);
    expect(blockSegs[0].BlockSpec).toEqual(block);

    const updatedBlock: DocumentBlockSpec = {
      ...block,
      VersionID: 'v-3',
    };
    const updatedRes = DocumentLiveBlockEngine.Instance.UpdateBlockInMarkdown(md, block.BlockID, updatedBlock);
    expect(updatedRes.Found).toBe(true);
    const reparsed = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(updatedRes.Markdown);
    const reparsedBlocks = reparsed.filter((s) => s.Type === 'mj-block');
    expect(reparsedBlocks[0].BlockSpec?.VersionID).toBe('v-3');
  });

  it('B2 & C2: fails closed when delegating entity has no registered delegate and resolves multi-hop parent chains in O(depth)', async () => {
    const u = createMockUser('99999999-9999-9999-9999-999999999999', 'Delegate Tester');
    const unregisteredProvider = {
      Entities: [{ ID: 'ent-custom-unregistered', Name: 'Custom: Unregistered Host' }],
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: [
          {
            ID: 'art-delegated-missing',
            UserID: u.ID, // Even as owner, missing delegate must fail closed!
            DelegateEntityID: 'ent-custom-unregistered',
            DelegateRecordID: 'rec-123',
          },
        ],
      }),
    } as unknown as IMetadataProvider;

    const denied = await ArtifactPermissionEngine.Instance.ResolvePermissions(
      unregisteredProvider,
      'art-delegated-missing',
      u,
    );
    expect(denied.CanRead).toBe(false);
    expect(denied.CanEdit).toBe(false);
    expect(denied.CanDelete).toBe(false);
    expect(denied.CanShare).toBe(false);
    expect(denied.Source).toBe('Denied');
    expect(denied.Reason).toContain('No permission delegate is registered');

    // C2: 4-hop parent artifact chain should query each artifact once (5 total artifact lookups, NOT 4^4 = 256)
    let artifactQueryCount = 0;
    const chainRecords: Record<string, { ID: string; UserID: string; DelegateEntityID: string | null; DelegateRecordID: string | null }> = {
      'art-hop-4': { ID: 'art-hop-4', UserID: 'other', DelegateEntityID: 'ent-artifacts', DelegateRecordID: 'art-hop-3' },
      'art-hop-3': { ID: 'art-hop-3', UserID: 'other', DelegateEntityID: 'ent-artifacts', DelegateRecordID: 'art-hop-2' },
      'art-hop-2': { ID: 'art-hop-2', UserID: 'other', DelegateEntityID: 'ent-artifacts', DelegateRecordID: 'art-hop-1' },
      'art-hop-1': { ID: 'art-hop-1', UserID: 'other', DelegateEntityID: 'ent-artifacts', DelegateRecordID: 'art-root' },
      'art-root': { ID: 'art-root', UserID: u.ID, DelegateEntityID: null, DelegateRecordID: null },
    };
    const chainProvider = {
      Entities: [{ ID: 'ent-artifacts', Name: 'MJ: Artifacts' }],
      RunView: vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
        if (params.EntityName === 'MJ: Artifacts') {
          artifactQueryCount++;
          const m = /ID='([^']+)'/.exec(params.ExtraFilter ?? '');
          const rec = m ? chainRecords[m[1]] : undefined;
          return { Success: true, Results: rec ? [rec] : [] };
        }
        return { Success: true, Results: [] };
      }),
    } as unknown as IMetadataProvider;

    const chainPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(chainProvider, 'art-hop-4', u);
    expect(chainPerms.CanRead).toBe(true);
    expect(chainPerms.CanEdit).toBe(true);
    expect(artifactQueryCount).toBe(5);
  });

  it('D6 & B7: ignores :::mj-block inside code fences, keeps unterminated :::mj-block as markdown, clamps MaxRows, validates OrderBy/ExtraFilter, resolves ViewName-only, and verifies FrozenSnapshot hash', async () => {
    const viewer = createMockUser('77777777-7777-7777-7777-777777777777', 'Viewer Dan');

    // 1. Code fences and unterminated :::mj-block
    const mdWithCodeFenceAndUnterminated = [
      '# Developer Guide',
      '```markdown',
      ':::mj-block',
      '{"BlockID":"inside-code-fence","Kind":"EntityView","Mode":"Live","EntityName":"Accounts"}',
      ':::',
      '```',
      '',
      '~~~yaml',
      ':::mj-block',
      '{"BlockID":"inside-tilde-fence","Kind":"EntityView","Mode":"Live","EntityName":"Accounts"}',
      ':::',
      '~~~',
      '',
      ':::mj-block',
      '{"BlockID":"unterminated-block","Kind":"EntityView","Mode":"Live","EntityName":"Accounts"}',
      'Trailing prose without closing colons.',
    ].join('\n');

    const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(mdWithCodeFenceAndUnterminated);
    expect(segments.filter((s) => s.Type === 'mj-block')).toHaveLength(0);
    expect(segments.map((s) => s.RawText).join('\n')).toBe(mdWithCodeFenceAndUnterminated);

    // 2. EntityView MaxRows clamping, ViewName-only lookup, OrderBy & ExtraFilter FLS/SQL validation
    const mockEntity = {
      ID: 'ent-acc',
      Name: 'Accounts',
      DisplayNameOrName: 'Accounts',
      PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true, TSType: EntityFieldTSType.String }],
      Fields: [
        { Name: 'ID', DisplayNameOrName: 'ID', IsPrimaryKey: true, DefaultInView: true, TSType: EntityFieldTSType.String },
        { Name: 'Name', DisplayNameOrName: 'Name', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.String },
        { Name: 'Status', DisplayNameOrName: 'Status', IsPrimaryKey: false, DefaultInView: true, TSType: EntityFieldTSType.String },
        { Name: 'SecretRevenue', DisplayNameOrName: 'SecretRevenue', IsPrimaryKey: false, DefaultInView: false, TSType: EntityFieldTSType.Number },
      ] as unknown as EntityFieldInfo[],
      FieldLevelSecurityApplies: true,
      GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
      GetDeniedReadFields: vi.fn().mockReturnValue(new Set(['SecretRevenue'])),
    } as unknown as EntityInfo;

    const capturedRunViewCalls: Array<{ EntityName?: string; MaxRows?: number; ExtraFilter?: string; OrderBy?: string }> = [];
    const provider = {
      Entities: [mockEntity],
      RunView: vi.fn().mockImplementation(async (params: { EntityName?: string; MaxRows?: number; ExtraFilter?: string; OrderBy?: string }) => {
        capturedRunViewCalls.push(params);
        if (params.EntityName === 'MJ: User Views') {
          return {
            Success: true,
            Results: [{ ID: 'uv-active', Name: 'Active Accounts', EntityID: 'ent-acc', UserID: viewer.ID, IsShared: true }],
          };
        }
        return {
          Success: true,
          Results: [{ ID: 'a-1', Name: 'Acme', Status: 'Active' }],
          TotalRowCount: 1,
        };
      }),
    } as unknown as IMetadataProvider;

    // MaxRows: 0 clamps to 100; ViewName without EntityName resolves Accounts via MJ: User Views
    const viewNameOnlyRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
      {
        BlockID: 'blk-vn',
        Kind: 'EntityView',
        Mode: 'Live',
        ViewName: 'Active Accounts',
        MaxRows: 0,
        OrderBy: 'Name DESC',
        ExtraFilter: "Status = 'Active'",
      },
      viewer,
      provider,
    );
    expect(viewNameOnlyRes.Success).toBe(true);
    const dataCall = capturedRunViewCalls.find((c) => c.EntityName === 'Accounts');
    expect(dataCall?.MaxRows).toBe(100);

    // MaxRows: 9999 clamps to 500
    await DocumentLiveBlockEngine.Instance.ExecuteBlock(
      { BlockID: 'blk-max', Kind: 'EntityView', Mode: 'Live', EntityName: 'Accounts', MaxRows: 9999 },
      viewer,
      provider,
    );
    expect(capturedRunViewCalls[capturedRunViewCalls.length - 1].MaxRows).toBe(500);

    // OrderBy on FLS-denied field fails closed
    const deniedOrderRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
      { BlockID: 'blk-ord', Kind: 'EntityView', Mode: 'Live', EntityName: 'Accounts', OrderBy: 'SecretRevenue DESC' },
      viewer,
      provider,
    );
    expect(deniedOrderRes.Success).toBe(false);
    expect(deniedOrderRes.AccessDenied).toBe(true);

    // ExtraFilter with SQL comment, unknown column, FLS-denied column, or scalar/UDF function call fails closed
    for (const badFilter of [
      "Status = 'Active' -- comment",
      "NonExistentCol = 'x'",
      'SecretRevenue > 1000',
      "Status = 'Active'; SELECT 1",
      '__mj.fnSecret(ID) = 1',
      "REPLICATE('a', 100000000) = 'a'",
    ]) {
      const badRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
        { BlockID: 'blk-flt', Kind: 'EntityView', Mode: 'Live', EntityName: 'Accounts', ExtraFilter: badFilter },
        viewer,
        provider,
      );
      expect(badRes.Success).toBe(false);
      expect(badRes.AccessDenied).toBe(true);
    }

    // B7: Mode === 'Frozen' with missing FrozenSnapshot NEVER falls back to Live
    const missingSnapRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
      { BlockID: 'blk-frozen-missing', Kind: 'EntityView', Mode: 'Frozen', EntityName: 'Accounts' },
      viewer,
      provider,
    );
    expect(missingSnapRes.Success).toBe(false);
    expect(missingSnapRes.Mode).toBe('Frozen');

    // B7: FreezeBlock requires a >= 32-byte HMAC secret and computes HMAC-SHA256 SnapshotContentHash (including FrozenByUserName)
    DocumentLiveBlockEngine.Instance.SetSigningSecret(null);
    const prevSecret = process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
    delete process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
    await expect(
      DocumentLiveBlockEngine.Instance.FreezeBlock(
        { BlockID: 'blk-hash-no-secret', Kind: 'EntityView', Mode: 'Live', EntityName: 'Accounts' },
        viewer,
        true,
        provider,
      ),
    ).rejects.toThrow(/MJ_FROZEN_BLOCK_HMAC_SECRET/);
    if (prevSecret) process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = prevSecret;

    DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');

    // Grouping parentheses AND (...), OR (...), NOT (...), IN (...) are allowed in ExtraFilter
    const groupedFilterExec = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
      {
        BlockID: 'blk-grouped',
        Kind: 'EntityView',
        Mode: 'Live',
        EntityName: 'Accounts',
        ExtraFilter: "Status = 'Active' AND (Name = 'Acme' OR NOT (Status = 'Closed')) AND Status IN ('Active', 'Pending')",
      },
      viewer,
      provider,
    );
    expect(groupedFilterExec.Success).toBe(true);

    const frozenWrap = await DocumentLiveBlockEngine.Instance.FreezeBlock(
      { BlockID: 'blk-hash', Kind: 'EntityView', Mode: 'Live', EntityName: 'Accounts' },
      viewer,
      true,
      provider,
    );
    expect(frozenWrap.UpdatedSpec?.FrozenSnapshot?.SnapshotContentHash).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    const verifiedExec = await DocumentLiveBlockEngine.Instance.ExecuteBlock(frozenWrap.UpdatedSpec!, viewer, provider);
    expect(verifiedExec.Success).toBe(true);
    expect(verifiedExec.FrozenSnapshot?.SnapshotVerified).toBe(true);

    const mutatedRowsSpec: DocumentBlockSpec = {
      ...frozenWrap.UpdatedSpec!,
      FrozenSnapshot: {
        ...frozenWrap.UpdatedSpec!.FrozenSnapshot!,
        Rows: [{ ID: 'a-1', Name: 'Tampered Corp', Status: 'Active' }],
      },
    };
    const tamperedHashExec = await DocumentLiveBlockEngine.Instance.ExecuteBlock(mutatedRowsSpec, viewer, provider);
    expect(tamperedHashExec.Success).toBe(true);
    expect(tamperedHashExec.FrozenSnapshot?.SnapshotVerified).toBe(false);

    // Mutating FrozenByUserName (e.g. spoofing 'Jane CEO') invalidates HMAC signature
    const spoofedAuthorSpec: DocumentBlockSpec = {
      ...frozenWrap.UpdatedSpec!,
      FrozenSnapshot: {
        ...frozenWrap.UpdatedSpec!.FrozenSnapshot!,
        FrozenByUserName: 'Jane CEO',
      },
    };
    const spoofedAuthorExec = await DocumentLiveBlockEngine.Instance.ExecuteBlock(spoofedAuthorSpec, viewer, provider);
    expect(spoofedAuthorExec.FrozenSnapshot?.SnapshotVerified).toBe(false);

    // Plain SHA-256 hash without 'hmac-sha256:' prefix or missing hash is rejected
    const plainShaSpec: DocumentBlockSpec = {
      ...frozenWrap.UpdatedSpec!,
      FrozenSnapshot: {
        ...frozenWrap.UpdatedSpec!.FrozenSnapshot!,
        SnapshotContentHash: 'a'.repeat(64),
      },
    };
    const plainShaExec = await DocumentLiveBlockEngine.Instance.ExecuteBlock(plainShaSpec, viewer, provider);
    expect(plainShaExec.FrozenSnapshot?.SnapshotVerified).toBe(false);
  });
});
