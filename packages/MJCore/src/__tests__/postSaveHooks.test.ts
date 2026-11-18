import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClearAllDataHooks, PostSaveHook, RegisterDataHook } from '../generic/dataHooks';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { EntitySaveOptions, IEntityDataProvider, ProviderConfigDataBase } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';

class SavableTestMetadataProvider extends TestMetadataProvider {
    private _rows = new Map<string, Map<string, Record<string, unknown>>>();

    public override async GetEntityObject<T extends BaseEntity = BaseEntity>(
        entityName: string,
        contextUser?: UserInfo
    ): Promise<T> {
        const info = this.EntityByName(entityName);
        if (!info) {
            throw new Error(`Unknown entity '${entityName}'`);
        }
        const instance = new BaseEntity(info, this as unknown as IEntityDataProvider) as T;
        if (contextUser) {
            instance.ContextCurrentUser = contextUser;
        }
        await instance.InitializeParentEntity();
        return instance;
    }

    public async Save(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntitySaveOptions
    ): Promise<Record<string, unknown> | null> {
        const entityName = entity.EntityInfo.Name;
        const id = String(entity.Get('ID'));
        const ownData: Record<string, unknown> = {};
        for (const f of entity.EntityInfo.Fields) {
            if (!f.IsVirtual) {
                ownData[f.Name] = entity.Get(f.Name);
            }
        }
        const tableKey = entityName.toLowerCase();
        if (!this._rows.has(tableKey)) {
            this._rows.set(tableKey, new Map());
        }
        this._rows.get(tableKey)!.set(id.toLowerCase(), ownData);

        const merged: Record<string, unknown> = {};
        let p: BaseEntity | null = entity.ISAParent;
        const ancestors: BaseEntity[] = [];
        while (p) {
            ancestors.unshift(p);
            p = p.ISAParent;
        }
        for (const anc of ancestors) {
            Object.assign(merged, anc.GetAll());
        }
        Object.assign(merged, ownData);
        return merged;
    }

    public async FindISAChildEntity(): Promise<{ ChildEntityName: string } | null> {
        return null;
    }
}

const TEST_ROLE_ID = 'role-postsave-1';
const PARENT_ENTITY_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ENTITY_ID = '22222222-2222-4222-8222-222222222222';

const MOCK_METADATA = {
    Applications: [],
    Entities: [
        {
            ID: PARENT_ENTITY_ID,
            Name: 'Tasks',
            SchemaName: 'dbo',
            BaseView: 'vwTasks',
            BaseTable: 'Task',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            Configuration: JSON.stringify({
                Comments: {
                    Enabled: true,
                    AllowedCommentTypes: ['COMMENT', 'FIELD_SUGGESTION'],
                },
            }),
            EntityFields: [
                { ID: 'f-t-1', EntityID: PARENT_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, AllowsNull: false },
                { ID: 'f-t-2', EntityID: PARENT_ENTITY_ID, Name: 'Title', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2, AllowsNull: false, AllowUpdateAPI: true },
                { ID: 'f-t-3', EntityID: PARENT_ENTITY_ID, Name: 'DueAt', Type: 'datetimeoffset', IsPrimaryKey: false, Sequence: 3, AllowsNull: true, AllowUpdateAPI: true },
            ],
            EntityPermissions: [
                { EntityID: PARENT_ENTITY_ID, RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
        {
            ID: CHILD_ENTITY_ID,
            Name: 'GitHubIssueTasks',
            ParentID: PARENT_ENTITY_ID,
            SchemaName: 'dbo',
            BaseView: 'vwGitHubIssueTasks',
            BaseTable: 'GitHubIssueTask',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            EntityFields: [
                { ID: 'f-gh-1', EntityID: CHILD_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, AllowsNull: false },
                { ID: 'f-gh-2', EntityID: CHILD_ENTITY_ID, Name: 'IssueNumber', Type: 'int', IsPrimaryKey: false, Sequence: 2, AllowsNull: false, AllowUpdateAPI: true },
                { ID: 'f-gh-3', EntityID: CHILD_ENTITY_ID, Name: 'Title', Type: 'nvarchar', IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: true, Sequence: 3, AllowsNull: false },
                { ID: 'f-gh-4', EntityID: CHILD_ENTITY_ID, Name: 'DueAt', Type: 'datetimeoffset', IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: true, Sequence: 4, AllowsNull: true },
            ],
            EntityPermissions: [
                { EntityID: CHILD_ENTITY_ID, RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
    ],
    get EntityFields() {
        return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []);
    },
    get EntityPermissions() {
        return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []);
    },
    EntityFieldValues: [],
    EntityRelationships: [],
    EntitySettings: [],
    ApplicationEntities: [],
    ApplicationSettings: [],
    Roles: [{ ID: TEST_ROLE_ID, Name: 'Developer' }],
    RowLevelSecurityFilters: [],
    AuditLogTypes: [],
    Authorizations: [],
    AuthorizationRoles: [],
    QueryCategories: [],
    Queries: [],
    QueryFields: [],
    QueryPermissions: [],
    QueryEntities: [],
    QueryParameters: [],
    EntityDocumentTypes: [],
    Libraries: [],
    ExplorerNavigationItems: [],
};

function makeUser(id = 'user-1'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = 'Test User';
    u.Email = 'test@example.com';
    u.IsActive = true;
    const role = new UserRoleInfo({ UserID: id, RoleID: TEST_ROLE_ID, Role: 'Developer' });
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [role];
    return u;
}

describe('PostSaveHook & EntityInfo.IsCommentTypeAllowed', () => {
    let provider: SavableTestMetadataProvider;
    let user: UserInfo;

    beforeEach(async () => {
        ClearAllDataHooks();
        provider = new SavableTestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(MOCK_METADATA);
        const config = new ProviderConfigDataBase({}, '__mj', [], [], true);
        await provider.Config(config);
        user = makeUser();
    });

    afterEach(() => {
        ClearAllDataHooks();
    });

    it('evaluates EntityInfo.IsCommentTypeAllowed with opt-in default for specialized comment types', () => {
        const tasksInfo = provider.EntityByName('Tasks')!;
        expect(tasksInfo.IsCommentTypeAllowed('COMMENT')).toBe(true);
        expect(tasksInfo.IsCommentTypeAllowed('FIELD_SUGGESTION', 'Field Suggestion')).toBe(true);
        expect(tasksInfo.IsCommentTypeAllowed('UNKNOWN_CUSTOM')).toBe(false);

        const defaultEntity = new EntityInfo({
            ID: '33333333-3333-4333-8333-333333333333',
            Name: 'DefaultEntity',
        });
        expect(defaultEntity.IsCommentTypeAllowed('COMMENT')).toBe(true);
        expect(defaultEntity.IsCommentTypeAllowed('Comment')).toBe(true);
        expect(defaultEntity.IsCommentTypeAllowed('FIELD_SUGGESTION', 'Field Suggestion')).toBe(false);

        const wildcardEntity = new EntityInfo({
            ID: '44444444-4444-4444-8444-444444444444',
            Name: 'WildcardEntity',
            Configuration: JSON.stringify({
                Comments: { Enabled: true, AllowedCommentTypes: ['*'] },
            }),
        });
        expect(wildcardEntity.IsCommentTypeAllowed('FIELD_SUGGESTION')).toBe(true);
        expect(wildcardEntity.IsCommentTypeAllowed('CUSTOM_REVIEW')).toBe(true);

        const disabledEntity = new EntityInfo({
            ID: '55555555-5555-4555-8555-555555555555',
            Name: 'DisabledCommentsEntity',
            Configuration: JSON.stringify({
                Comments: { Enabled: false, AllowedCommentTypes: ['*'] },
            }),
        });
        expect(disabledEntity.IsCommentTypeAllowed('COMMENT')).toBe(false);
        expect(disabledEntity.IsCommentTypeAllowed('FIELD_SUGGESTION')).toBe(false);
    });

    it('invokes PostSave hooks with changedFieldNames and create/update saveSubType', async () => {
        const calls: Array<{
            entityName: string;
            changed: ReadonlyArray<string>;
            subType: 'create' | 'update';
        }> = [];

        const hook: PostSaveHook = async (entity, _ctxUser, changedFieldNames, saveSubType) => {
            calls.push({
                entityName: entity.EntityInfo.Name,
                changed: [...changedFieldNames],
                subType: saveSubType,
            });
        };
        RegisterDataHook('PostSave', hook);

        const task = await provider.GetEntityObject<BaseEntity>('Tasks', user);
        task.NewRecord();
        task.Set('Title', 'Initial title');
        const created = await task.Save();
        expect(created).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].entityName).toBe('Tasks');
        expect(calls[0].subType).toBe('create');
        expect(calls[0].changed).toContain('Title');

        calls.length = 0;
        task.Set('DueAt', new Date('2026-12-15T00:00:00Z'));
        const updated = await task.Save();
        expect(updated).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].subType).toBe('update');
        expect(calls[0].changed).toEqual(['DueAt']);
    });

    it('propagates parent-owned dirty fields across IS-A chain PostSave hooks even when child-own fields are clean', async () => {
        const calls: Array<{ entityName: string; changed: ReadonlyArray<string>; subType: string }> = [];
        RegisterDataHook('PostSave', ((entity: BaseEntity, _u: UserInfo | undefined, changed: ReadonlyArray<string>, subType: 'create' | 'update') => {
            calls.push({ entityName: entity.EntityInfo.Name, changed: [...changed], subType });
        }) satisfies PostSaveHook);

        const issueTask = await provider.GetEntityObject<BaseEntity>('GitHubIssueTasks', user);
        issueTask.NewRecord();
        issueTask.Set('Title', 'Fix login race');
        issueTask.Set('IssueNumber', 42);
        expect(await issueTask.Save()).toBe(true);

        calls.length = 0;
        // Modify ONLY parent-owned DueAt on the IS-A child and save the child!
        issueTask.Set('DueAt', new Date('2026-12-20T00:00:00Z'));
        expect(await issueTask.Save()).toBe(true);

        expect(calls).toEqual([
            { entityName: 'Tasks', changed: ['DueAt'], subType: 'update' },
            { entityName: 'GitHubIssueTasks', changed: ['DueAt'], subType: 'update' },
        ]);
    });

    it('isolates errors thrown inside a PostSave hook without failing the already-committed Save()', async () => {
        const secondHookSpy = vi.fn();
        RegisterDataHook('PostSave', (() => {
            throw new Error('post-save observer boom');
        }) satisfies PostSaveHook);
        RegisterDataHook('PostSave', secondHookSpy);

        const task = await provider.GetEntityObject<BaseEntity>('Tasks', user);
        task.NewRecord();
        task.Set('Title', 'Resilient save');
        const saved = await task.Save();

        expect(saved).toBe(true);
        expect(secondHookSpy).toHaveBeenCalledOnce();
    });
});
