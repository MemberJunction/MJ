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
});
