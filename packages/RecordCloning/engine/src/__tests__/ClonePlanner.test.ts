import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    EntityInfo,
    EntityFieldInfo,
    EntityRelationshipInfo,
    IMetadataProvider,
    UserInfo,
} from '@memberjunction/core';
import { ClonePlanner } from '../ClonePlanner';
import { RecordCloneRequest } from '@memberjunction/record-cloning-base';
import { GrantedCloneAuthorizations } from './helpers/cloneAuthorizations';

// Mock RunView before tests execute
const mockRunViewInstance = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        RunView = mockRunViewInstance;
        static FromMetadataProvider = () => new MockRunView();
    }
    return {
        ...actual,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

describe('ClonePlanner', () => {
    const standardUser: UserInfo = {
        ID: 'user-standard',
        Name: 'Standard User',
        Email: 'user@test.com',
        Type: 'User',
    } as UserInfo;

    const ownerUser: UserInfo = {
        ID: 'user-owner',
        Name: 'Owner User',
        Email: 'owner@test.com',
        Type: 'Owner',
    } as UserInfo;

    const parentEntity: Partial<EntityInfo> = {
        ID: 'ent-parent-id',
        Name: 'ParentEntity',
        BaseView: 'vwParentEntities',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-children',
                Name: 'Children',
                EntityID: 'ent-parent-id',
                RelatedEntityID: 'ent-child-id',
                RelatedEntity: 'ChildEntity',
                RelatedEntityJoinField: 'ParentID',
                Type: 'One To Many',
                RelatedRecordCollection: JSON.stringify({ Name: 'Children' }),
            } as EntityRelationshipInfo,
        ],
        GetUserPermisions: (u: UserInfo) => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
        CloneConfiguration: {
            Enabled: true,
            MaxDepth: 3,
            MaxRecords: 100,
        },
    };

    const childEntity: Partial<EntityInfo> = {
        ID: 'ent-child-id',
        Name: 'ChildEntity',
        BaseView: 'vwChildEntities',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ParentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-parent-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        GetUserPermisions: (u: UserInfo) => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
        CloneConfiguration: {
            Enabled: true,
        },
    };

    const entitiesList: EntityInfo[] = [parentEntity as EntityInfo, childEntity as EntityInfo];

    const mockProvider: IMetadataProvider = {
        Authorizations: GrantedCloneAuthorizations(),
        Entities: entitiesList,
        EntityByName: (name: string) => entitiesList.find((e) => e.Name.toLowerCase() === name.toLowerCase()) ?? null,
        EntityByID: (id: string) => entitiesList.find((e) => e.ID === id) ?? null,
    } as IMetadataProvider;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('leaves out fields the user may not read or create under field-level security', async () => {
        const secured = {
            ...parentEntity,
            Name: 'SecuredEntity',
            RelatedEntities: [],
            Fields: [...(parentEntity.Fields ?? []), { Name: 'Salary', IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo],
            EnableFieldLevelSecurity: true,
            GetDeniedReadFields: () => new Set(['salary']),
            GetDeniedCreateFields: () => new Set<string>(),
        } as unknown as EntityInfo;
        const provider = { ...mockProvider, Entities: [secured], EntityByName: (n: string) => (n === 'SecuredEntity' ? secured : null) } as IMetadataProvider;
        mockRunViewInstance.mockResolvedValue({ Success: true, Results: [{ ID: 'sec-1', Name: 'Row', Salary: 90000 }] });

        const plan = await new ClonePlanner({ Provider: provider }).Plan({ EntityName: 'SecuredEntity', SourceRecordKey: { ID: 'sec-1' } }, standardUser);

        const salary = plan.Nodes[0].FieldChanges.filter((c) => c.Field === 'Salary');
        expect(salary.map((c) => c.Kind)).toEqual(['DeniedRead']);
        expect(JSON.stringify(salary)).not.toContain('90000');
    });

    it('avoids names already taken, so a repeat clone does not collide at save', async () => {
        const noChildren = { ...parentEntity, RelatedEntities: [] } as EntityInfo;
        const provider = { ...mockProvider, Entities: [noChildren], EntityByName: (n: string) => (n === 'ParentEntity' ? noChildren : null) } as IMetadataProvider;
        mockRunViewInstance.mockImplementation(async (params: { Fields?: string[]; ExtraFilter?: string }) => {
            if (params.Fields?.[0] === 'Name') {
                // The name lookup: an earlier clone already took the first candidate.
                expect(params.ExtraFilter).toContain("Name LIKE 'Original Parent - Clone%'");
                return { Success: true, Results: [{ Name: 'original parent - clone' }] };
            }
            return { Success: true, Results: [{ ID: 'parent-1', Name: 'Original Parent' }] };
        });

        const plan = await new ClonePlanner({ Provider: provider }).Plan(
            { EntityName: 'ParentEntity', SourceRecordKey: { ID: 'parent-1' }, Options: { NamingTemplate: '{Name} - Clone' } },
            standardUser
        );

        const rename = plan.Nodes[0].FieldChanges.find((c) => c.Field === 'Name' && c.Kind === 'Rename');
        expect(rename?.NewValue).toBe('Original Parent - Clone (2)');
        mockRunViewInstance.mockReset();
    });

    it('blocks a plan whose clone configuration is invalid, and only warns about unknown relationship keys', async () => {
        const bad = { ...parentEntity, RelatedEntities: [], CloneConfiguration: { Enabled: true, MaxDepth: 1.5, Relationships: { 'No Such Entity': { Policy: 'Deep' } } } } as unknown as EntityInfo;
        const provider = { ...mockProvider, Entities: [bad], EntityByName: (n: string) => (n === 'ParentEntity' ? bad : null) } as IMetadataProvider;
        mockRunViewInstance.mockResolvedValue({ Success: true, Results: [{ ID: 'parent-1', Name: 'Original Parent' }] });

        const plan = await new ClonePlanner({ Provider: provider }).Plan({ EntityName: 'ParentEntity', SourceRecordKey: { ID: 'parent-1' } }, standardUser);

        const invalid = plan.Warnings.filter((w) => w.Code === 'CONFIG_INVALID');
        expect(invalid.map((w) => [w.Field, w.Severity])).toEqual([
            ['MaxDepth', 'Error'],
            ['Relationships[No Such Entity]', 'Warning'],
        ]);
        expect(plan.Blocked).toBe(true);
        mockRunViewInstance.mockReset();
    });

    it('computes valid clone plan with pre-minted target keys and stable hash', async () => {
        const planner = new ClonePlanner({ Provider: mockProvider });

        mockRunViewInstance
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'parent-1', Name: 'Original Parent' }],
            })
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'child-1', Name: 'Original Child', ParentID: 'parent-1' }],
            });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
            Options: {
                NamingTemplate: '{Name} - Clone',
            },
        };

        const plan = await planner.Plan(request, standardUser);

        expect(plan.Blocked).toBe(false);
        expect(plan.RootEntityName).toBe('ParentEntity');
        expect(plan.RootSourceKey).toContain('parent-1');
        expect(plan.RootTargetKey).toBeDefined();
        expect(plan.Nodes.length).toBe(2);
        expect(plan.PlanHash).toBeDefined();
        expect(plan.PlanHash.length).toBe(64); // SHA-256 hex string

        // Verify root node
        const rootNode = plan.Nodes.find((n) => n.Depth === 0);
        expect(rootNode).toBeDefined();
        expect(rootNode?.TargetKey).toBe(plan.RootTargetKey);
        expect(rootNode?.FieldChanges.some((fc) => fc.Field === 'Name' && fc.NewValue === 'Original Parent - Clone')).toBe(true);

        // Verify child node
        const childNode = plan.Nodes.find((n) => n.Depth === 1);
        expect(childNode).toBeDefined();
        expect(childNode?.EntityName).toBe('ChildEntity');
        expect(childNode?.TargetKey).toBeDefined();
        expect(childNode?.TargetKey).not.toBe('child-1');
    });

    it('blocks plan with CAP_EXCEEDED when node count exceeds MaxRecords', async () => {
        const planner = new ClonePlanner({ Provider: mockProvider });

        mockRunViewInstance
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'parent-1', Name: 'Parent' }],
            })
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'child-1', Name: 'Child', ParentID: 'parent-1' }],
            });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
            Options: {
                MaxRecords: 1, // Only allow 1 record, but graph has 2
            },
        };

        const plan = await planner.Plan(request, standardUser);
        expect(plan.Blocked).toBe(true);
        expect(plan.Warnings.some((w) => w.Code === 'CAP_EXCEEDED')).toBe(true);
    });

    it('blocks plan with REQUIRED_USER_TYPE_MISMATCH when user type is insufficient', async () => {
        const restrictedParent: EntityInfo = {
            ...parentEntity,
            CloneConfiguration: {
                Enabled: true,
                RequiredUserType: 'Owner',
            },
        } as EntityInfo;

        const provider: IMetadataProvider = {
            Authorizations: GrantedCloneAuthorizations(),
            ...mockProvider,
            Entities: [restrictedParent, childEntity as EntityInfo],
            EntityByName: (name: string) => (name === 'ParentEntity' ? restrictedParent : childEntity as EntityInfo),
        } as IMetadataProvider;

        const planner = new ClonePlanner({ Provider: provider });

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'ParentEntity') {
                return { Success: true, Results: [{ ID: 'parent-1', Name: 'Parent' }] };
            }
            return { Success: true, Results: [] };
        });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
        };

        const plan = await planner.Plan(request, standardUser);
        expect(plan.Blocked).toBe(true);
        expect(plan.Warnings.some((w) => w.Code === 'REQUIRED_USER_TYPE_MISMATCH')).toBe(true);

        // Should succeed when user is Owner
        const ownerPlan = await planner.Plan(request, ownerUser);
        expect(ownerPlan.Blocked).toBe(false);
    });

    it('blocks plan with NO_CREATE_PERMISSION when user lacks permission on child node', async () => {
        const unauthorizedChild: EntityInfo = {
            ...childEntity,
            GetUserPermisions: () => ({
                CanCreate: false,
                CanRead: true,
                CanUpdate: false,
                CanDelete: false,
            }),
        } as EntityInfo;

        const provider: IMetadataProvider = {
            Authorizations: GrantedCloneAuthorizations(),
            ...mockProvider,
            Entities: [parentEntity as EntityInfo, unauthorizedChild],
            EntityByName: (name: string) => (name === 'ChildEntity' ? unauthorizedChild : parentEntity as EntityInfo),
        } as IMetadataProvider;

        const planner = new ClonePlanner({ Provider: provider });

        mockRunViewInstance
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'parent-1', Name: 'Parent' }],
            })
            .mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'child-1', Name: 'Child', ParentID: 'parent-1' }],
            });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
        };

        const plan = await planner.Plan(request, standardUser);
        expect(plan.Blocked).toBe(true);
        expect(plan.Warnings.some((w) => w.Code === 'NO_CREATE_PERMISSION')).toBe(true);
    });

    describe('authorization (plan §9)', () => {
        const withAuths = (auths: ReturnType<typeof GrantedCloneAuthorizations>): IMetadataProvider =>
            ({ ...mockProvider, Authorizations: auths }) as IMetadataProvider;
        const request: RecordCloneRequest = { EntityName: 'ParentEntity', SourceRecordKey: { ID: 'parent-1' } };
        const mockTwoRows = () =>
            mockRunViewInstance
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'parent-1', Name: 'Parent' }] })
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'child-1', Name: 'Child', ParentID: 'parent-1' }] });

        it('blocks the plan with FORBIDDEN when the user lacks the clone authorization', async () => {
            const plan = await new ClonePlanner({ Provider: withAuths(GrantedCloneAuthorizations(false)) }).Plan(request, standardUser);
            expect(plan.Blocked).toBe(true);
            const forbidden = plan.Warnings.find((w) => w.Code === 'FORBIDDEN');
            expect(forbidden?.Message).toContain("'Clone Records in Custom Schemas'");
        });

        it('fails closed when the authorization metadata is missing', async () => {
            const plan = await new ClonePlanner({ Provider: withAuths([]) }).Plan(request, standardUser);
            expect(plan.Blocked).toBe(true);
            expect(plan.Warnings.some((w) => w.Code === 'FORBIDDEN')).toBe(true);
        });

        it('checks each created child against its own per-entity leaf authorization', async () => {
            const auths = [
                ...GrantedCloneAuthorizations(),
                { ID: 'auth-leaf-child', Name: 'Clone Records: ChildEntity', ParentID: null, IsActive: true, UserCanExecute: () => false },
            ] as unknown as ReturnType<typeof GrantedCloneAuthorizations>;
            mockTwoRows();
            const plan = await new ClonePlanner({ Provider: withAuths(auths) }).Plan(request, standardUser);

            expect(plan.Blocked).toBe(true);
            const forbidden = plan.Warnings.filter((w) => w.Code === 'FORBIDDEN');
            expect(forbidden).toHaveLength(1);
            expect(forbidden[0].NodeKey).toBeDefined();
            expect(forbidden[0].Message).toContain("'Clone Records: ChildEntity'");
            expect(plan.Nodes.find((n) => n.EntityName === 'ChildEntity')?.Action).toBe('Blocked');
        });

        it('fires Entity Actions by default, and ignores a request to suppress them from a Clone Records holder', async () => {
            // Fire Hooks is a sibling of Clone Records, so holding Clone Records (and every node under it) doesn't grant it.
            const underCloneRecords = new Set(['Clone Records', 'Clone Records in Platform Schema', 'Clone Records in Custom Schemas']);
            const auths = GrantedCloneAuthorizations(false).map((a) =>
                underCloneRecords.has(a.Name) ? ({ ...a, UserCanExecute: () => true } as typeof a) : a
            );
            mockTwoRows();
            const plan = await new ClonePlanner({ Provider: withAuths(auths) }).Plan(
                { ...request, Options: { EntityActions: 'suppress' } },
                standardUser
            );
            expect(plan.EffectiveOptions.EntityActions).toBe('fire');
            expect(plan.Warnings.some((w) => w.Code === 'HOOKS_FORBIDDEN')).toBe(true);
            expect(plan.Blocked).toBe(false);
        });

        it('ignores widening options unless the user holds Override Scope', async () => {
            const onlySchema = GrantedCloneAuthorizations(false).map((a) =>
                a.Name === 'Clone Records in Custom Schemas' ? ({ ...a, UserCanExecute: () => true } as typeof a) : a
            );
            mockTwoRows();
            const plan = await new ClonePlanner({ Provider: withAuths(onlySchema) }).Plan(
                { ...request, Options: { MaxDepth: 9, SoftLinks: 'include' } },
                standardUser
            );
            expect(plan.EffectiveOptions).toMatchObject({ MaxDepth: 3, SoftLinks: 'skip' });
            expect(plan.Warnings.filter((w) => w.Code === 'SCOPE_OVERRIDE_FORBIDDEN').map((w) => w.Field)).toEqual(['MaxDepth', 'SoftLinks']);

            mockTwoRows();
            const granted = await new ClonePlanner({ Provider: withAuths(GrantedCloneAuthorizations()) }).Plan(
                { ...request, Options: { MaxDepth: 9 } },
                standardUser
            );
            expect(granted.EffectiveOptions.MaxDepth).toBe(9);
            expect(granted.Overrides).toEqual(['MaxDepth']);
        });

        it('drops a Deep edge override from a user without Override Scope', async () => {
            const onlySchema = GrantedCloneAuthorizations(false).map((a) =>
                a.Name === 'Clone Records in Custom Schemas' ? ({ ...a, UserCanExecute: () => true } as typeof a) : a
            );
            mockTwoRows();
            const plan = await new ClonePlanner({ Provider: withAuths(onlySchema) }).Plan(
                { ...request, EdgeOverrides: [{ RelationshipID: 'rel-children', Policy: 'Deep' }, { RelationshipID: 'rel-other', Policy: 'Skip' }] },
                standardUser
            );
            const forbidden = plan.Warnings.filter((w) => w.Code === 'SCOPE_OVERRIDE_FORBIDDEN' && w.Field === 'EdgeOverrides');
            expect(forbidden).toHaveLength(1);
        });

        it("applies a configured preset's wider options for a user without Override Scope", async () => {
            const onlySchema = GrantedCloneAuthorizations(false).map((a) =>
                a.Name === 'Clone Records in Custom Schemas' ? ({ ...a, UserCanExecute: () => true } as typeof a) : a
            );
            const withPreset = { ...parentEntity, CloneConfiguration: { Enabled: true, MaxDepth: 3, MaxRecords: 100, Presets: [{ Key: 'full', Label: 'Full', Options: { MaxDepth: 5, SoftLinks: 'include' } }] } } as EntityInfo;
            const provider = { ...withAuths(onlySchema), EntityByName: (n: string) => (n === 'ParentEntity' ? withPreset : (childEntity as EntityInfo)) } as IMetadataProvider;
            mockTwoRows();
            const plan = await new ClonePlanner({ Provider: provider }).Plan({ ...request, Options: { Preset: 'full' } }, standardUser);
            expect(plan.EffectiveOptions).toMatchObject({ MaxDepth: 5, SoftLinks: 'include' });
            expect(plan.Warnings.some((w) => w.Code === 'SCOPE_OVERRIDE_FORBIDDEN')).toBe(false);
        });

        it('does not let a Clone Records holder pass Override Scope through the hierarchy', async () => {
            const cloneRecordsOnly = GrantedCloneAuthorizations(false).map((a) =>
                a.Name === 'Clone Records' ? ({ ...a, UserCanExecute: () => true } as typeof a) : a
            );
            mockTwoRows();
            const plan = await new ClonePlanner({ Provider: withAuths(cloneRecordsOnly) }).Plan({ ...request, Options: { MaxDepth: 9 } }, standardUser);
            expect(plan.EffectiveOptions.MaxDepth).toBe(3);
            expect(plan.Warnings.some((w) => w.Code === 'SCOPE_OVERRIDE_FORBIDDEN')).toBe(true);
        });

        it('refuses a root whose clone configuration is not enabled', async () => {
            const disabledParent = { ...parentEntity, CloneConfiguration: { MaxDepth: 3 } } as EntityInfo;
            const provider = {
                ...mockProvider,
                EntityByName: (name: string) => (name === 'ParentEntity' ? disabledParent : (childEntity as EntityInfo)),
            } as IMetadataProvider;
            const plan = await new ClonePlanner({ Provider: provider }).Plan(request, standardUser);
            expect(plan.Blocked).toBe(true);
            expect(plan.Warnings.find((w) => w.Code === 'NOT_CLONEABLE')?.Message).toContain('Configuration.Clone.Enabled');
        });
    });

    it('skips server-generated children with warning', async () => {
        const parentWithHook: EntityInfo = {
            ...parentEntity,
            CloneConfiguration: {
                Enabled: true,
                Hooks: {
                    ServerGeneratedChildren: ['ChildEntity'],
                },
            },
        } as EntityInfo;

        const provider: IMetadataProvider = {
            Authorizations: GrantedCloneAuthorizations(),
            ...mockProvider,
            Entities: [parentWithHook, childEntity as EntityInfo],
            EntityByName: (name: string) => (name === 'ParentEntity' ? parentWithHook : childEntity as EntityInfo),
        } as IMetadataProvider;

        const planner = new ClonePlanner({ Provider: provider });

        mockRunViewInstance.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: 'parent-1', Name: 'Parent' }],
        });

        const request: RecordCloneRequest = {
            EntityName: 'ParentEntity',
            SourceRecordKey: { ID: 'parent-1' },
        };

        const plan = await planner.Plan(request, standardUser);
        expect(plan.Nodes.length).toBe(1); // Child was skipped
        expect(plan.Warnings.some((w) => w.Code === 'SERVER_GENERATED_CHILD_SKIPPED')).toBe(true);
    });

    describe('composite primary keys', () => {
        const junction: Partial<EntityInfo> = {
            ID: 'ent-junction-id',
            Name: 'ParentTags',
            BaseView: 'vwParentTags',
            TrackRecordChanges: true,
            AllowCreateAPI: true,
            PrimaryKeys: [
                { Name: 'ParentID', Type: 'uniqueidentifier' } as EntityFieldInfo,
                { Name: 'TagID', Type: 'uniqueidentifier' } as EntityFieldInfo,
            ],
            FirstPrimaryKey: { Name: 'ParentID' } as EntityFieldInfo,
            Fields: [
                { Name: 'ParentID', IsPrimaryKey: true, Type: 'uniqueidentifier', RelatedEntityID: 'ent-parent-id', RelatedEntity: 'ParentEntity', IsSPParameter: () => true } as unknown as EntityFieldInfo,
                { Name: 'TagID', IsPrimaryKey: true, Type: 'uniqueidentifier', RelatedEntityID: 'ent-tag-id', RelatedEntity: 'Tags', IsSPParameter: () => true } as unknown as EntityFieldInfo,
            ],
            RelatedEntities: [],
            GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
            CloneConfiguration: { Enabled: true },
        };
        const parentWithTags = {
            ...parentEntity,
            Fields: [
                { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
                { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            ],
            PrimaryKeys: [{ Name: 'ID', Type: 'uniqueidentifier' } as EntityFieldInfo],
            RelatedEntities: [
                {
                    ID: 'rel-tags',
                    Name: 'Tags',
                    EntityID: 'ent-parent-id',
                    RelatedEntityID: 'ent-junction-id',
                    RelatedEntity: 'ParentTags',
                    RelatedEntityJoinField: 'ParentID',
                    Type: 'One To Many',
                } as EntityRelationshipInfo,
            ],
            CloneConfiguration: { Enabled: true, Relationships: { ParentTags: { Policy: 'Deep' } } },
        } as EntityInfo;
        const list = [parentWithTags, junction as EntityInfo];
        const provider = {
            ...mockProvider,
            Entities: list,
            EntityByName: (n: string) => list.find((e) => e.Name.toLowerCase() === n.toLowerCase()) ?? null,
            EntityByID: (id: string) => list.find((e) => e.ID === id) ?? null,
        } as IMetadataProvider;

        it("gives a junction row a key with the cloned parent's new ID and the other column kept", async () => {
            mockRunViewInstance
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'parent-1', Name: 'Parent' }] })
                .mockResolvedValue({ Success: true, Results: [{ ParentID: 'parent-1', TagID: 'tag-9' }] });

            const plan = await new ClonePlanner({ Provider: provider }).Plan(
                { EntityName: 'ParentEntity', SourceRecordKey: { ID: 'parent-1' } },
                standardUser
            );

            const root = plan.Nodes.find((n) => n.EntityName === 'ParentEntity')!;
            const tag = plan.Nodes.find((n) => n.EntityName === 'ParentTags');
            expect(tag).toBeDefined();
            expect(tag!.Action).toBe('Create');
            expect(tag!.TargetKey).toBe(`ParentID|${root.TargetKey}||TagID|tag-9`);
            expect(plan.Warnings.some((w) => w.Code === 'TARGET_KEY_UNCHANGED')).toBe(false);
        });

        it('mints a key for an IS-A subtype cloned on its own (parent not in the clone)', async () => {
            const subtype = {
                ...(childEntity as EntityInfo),
                Name: 'SubtypeEntity',
                ID: 'ent-subtype-id',
                PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
                Fields: [
                    { Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', RelatedEntityID: 'ent-parent-id', RelatedEntity: 'ParentEntity', IsSPParameter: () => true } as unknown as EntityFieldInfo,
                    { Name: 'Name', IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
                ],
                RelatedEntities: [],
                CloneConfiguration: { Enabled: true },
            } as unknown as EntityInfo;
            const subtypeProvider = { ...provider, EntityByName: (n: string) => (n === 'SubtypeEntity' ? subtype : null) } as IMetadataProvider;
            mockRunViewInstance.mockResolvedValue({ Success: true, Results: [{ ID: 'sub-1', Name: 'Sub' }] });

            const plan = await new ClonePlanner({ Provider: subtypeProvider }).Plan(
                { EntityName: 'SubtypeEntity', SourceRecordKey: { ID: 'sub-1' } },
                standardUser
            );

            expect(plan.Warnings.some((w) => w.Code === 'TARGET_KEY_UNCHANGED')).toBe(false);
            const root = plan.Nodes.find((n) => n.EntityName === 'SubtypeEntity')!;
            expect(root.TargetKey).toMatch(/^[0-9a-f-]{36}$/i);
            expect(root.TargetKey).not.toBe('sub-1');
        });

        it('blocks a composite-key root whose key would not change', async () => {
            const junctionRootProvider = { ...provider, EntityByName: (n: string) => (n === 'ParentTags' ? (junction as EntityInfo) : null) } as IMetadataProvider;
            mockRunViewInstance.mockResolvedValue({ Success: true, Results: [{ ParentID: 'parent-1', TagID: 'tag-9' }] });

            const plan = await new ClonePlanner({ Provider: junctionRootProvider }).Plan(
                { EntityName: 'ParentTags', SourceRecordKey: { KeyValuePairs: [{ FieldName: 'ParentID', Value: 'parent-1' }, { FieldName: 'TagID', Value: 'tag-9' }] } },
                standardUser
            );

            expect(plan.Blocked).toBe(true);
            expect(plan.Warnings.find((w) => w.Code === 'TARGET_KEY_UNCHANGED')?.Message).toContain('ParentID, TagID');
        });
    });
});
