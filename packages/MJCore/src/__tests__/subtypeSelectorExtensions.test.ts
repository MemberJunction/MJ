import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '../generic/entityInfo';
import { EntitySubtypeDriverBase } from '../generic/entitySubtypeDriver';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { EntityTransactionScope } from '../generic/entityTransactionScope';
import { EntityDeleteOptions, EntitySaveOptions, IEntityDataProvider } from '../generic/interfaces';
import { CompositeKey } from '../generic/compositeKey';
import { TransactionGroupBase, TransactionItem, TransactionResult } from '../generic/transactionGroup';

const ROLE_ID = 'role-admin-001';

function makeField(
    entityId: string,
    entityName: string,
    name: string,
    seq: number,
    opts: {
        type?: string;
        isPk?: boolean;
        allowsNull?: boolean;
        relatedEntityId?: string;
        relatedEntity?: string;
    } = {}
): Record<string, unknown> {
    return {
        ID: `f-${entityId}-${name}`,
        EntityID: entityId,
        Name: name,
        CodeName: name,
        DisplayName: name,
        Type: opts.type ?? 'nvarchar',
        Length: 255,
        IsPrimaryKey: opts.isPk ?? false,
        IsSoftPrimaryKey: false,
        IsSoftForeignKey: false,
        AllowsNull: opts.allowsNull ?? !(opts.isPk ?? false),
        AutoIncrement: false,
        IsVirtual: false,
        IsNameField: name === 'Name',
        AllowUpdateAPI: !(opts.isPk ?? false),
        IncludeInGeneratedForm: !(opts.isPk ?? false),
        ValueListType: 'None',
        Sequence: seq,
        Status: 'Active',
        Entity: entityName,
        RelatedEntityID: opts.relatedEntityId ?? null,
        RelatedEntity: opts.relatedEntity ?? null,
        RelatedEntityFieldName: opts.relatedEntity ? 'ID' : null,
        EntityFieldValues: [],
        EntityFieldPermissions: [],
    };
}

function makeEntityData(
    id: string,
    name: string,
    parentId: string | null,
    fields: Record<string, unknown>[],
    subtypeSelector: Record<string, unknown> | null = null
): Record<string, unknown> {
    return {
        ID: id,
        Name: name,
        BaseTable: name.replace(/\s+/g, ''),
        BaseView: `vw${name.replace(/\s+/g, '')}`,
        SchemaName: '__mj',
        VirtualEntity: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        IncludeInAPI: true,
        TrackRecordChanges: true,
        CascadeDeletes: false,
        AllowMultipleSubtypes: false,
        ParentID: parentId,
        Status: 'Active',
        SubtypeSelector: subtypeSelector ? JSON.stringify(subtypeSelector) : null,
        EntityFields: fields,
        EntityPermissions: [
            {
                ID: `perm-${id}`,
                EntityID: id,
                RoleID: ROLE_ID,
                RoleName: 'Admin',
                CanCreate: true,
                CanRead: true,
                CanUpdate: true,
                CanDelete: true,
            },
        ],
        EntityRelationships: [],
        EntitySettings: [],
    };
}

interface StoredRow {
    entityName: string;
    data: Record<string, unknown>;
}

interface OperationLogEntry {
    op: 'begin_tx' | 'commit_tx' | 'rollback_tx' | 'save' | 'delete';
    entityName?: string;
    isNew?: boolean;
    id?: string;
}

class InMemoryTransactionalTestProvider {
    public Entities: EntityInfo[] = [];
    public CurrentUser: UserInfo;
    public SupportsEntityTransactions = true;
    public Operations: OperationLogEntry[] = [];
    public FailSaveOnEntity: string | null = null;
    public FailDeleteOnEntity: string | null = null;

    private _tables = new Map<string, Map<string, Record<string, unknown>>>();
    private _txSnapshots: Array<Map<string, Map<string, Record<string, unknown>>>> = [];

    constructor(entities: EntityInfo[], user: UserInfo) {
        this.Entities = entities;
        this.CurrentUser = user;
        for (const e of entities) {
            this._tables.set(e.Name.toLowerCase(), new Map());
        }
    }

    public EntityByName(name: string): EntityInfo | undefined {
        return this.Entities.find(e => e.Name.trim().toLowerCase() === name.trim().toLowerCase());
    }

    public SeedRow(entityName: string, row: Record<string, unknown>): void {
        const key = entityName.toLowerCase();
        if (!this._tables.has(key)) {
            this._tables.set(key, new Map());
        }
        this._tables.get(key)!.set(String(row['ID']).toLowerCase(), { ...row });
    }

    public HasRow(entityName: string, id: string): boolean {
        return this._tables.get(entityName.toLowerCase())?.has(id.toLowerCase()) ?? false;
    }

    public GetRow(entityName: string, id: string): Record<string, unknown> | undefined {
        const found = this._tables.get(entityName.toLowerCase())?.get(id.toLowerCase());
        return found ? { ...found } : undefined;
    }

    public AllRows(entityName: string): StoredRow[] {
        const map = this._tables.get(entityName.toLowerCase());
        if (!map) return [];
        return Array.from(map.values()).map(d => ({ entityName, data: { ...d } }));
    }

    public async GetEntityObject<T extends BaseEntity = BaseEntity>(name: string, user?: UserInfo): Promise<T> {
        const info = this.EntityByName(name);
        if (!info) {
            throw new Error(`Unknown entity '${name}'`);
        }
        const instance = new BaseEntity(info, this as unknown as IEntityDataProvider) as T;
        instance.ContextCurrentUser = user ?? this.CurrentUser;
        await instance.InitializeParentEntity();
        instance.NewRecord();
        return instance;
    }

    public async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        this.Operations.push({ op: 'begin_tx' });
        const cloned = new Map<string, Map<string, Record<string, unknown>>>();
        for (const [tName, rows] of this._tables.entries()) {
            const copyRows = new Map<string, Record<string, unknown>>();
            for (const [id, data] of rows.entries()) {
                copyRows.set(id, { ...data });
            }
            cloned.set(tName, copyRows);
        }
        this._txSnapshots.push(cloned);
        const depthAtOpen = this._txSnapshots.length;

        return {
            IsNested: depthAtOpen > 1,
            Commit: async () => {
                this.Operations.push({ op: 'commit_tx' });
                if (this._txSnapshots.length === depthAtOpen) {
                    this._txSnapshots.pop();
                }
            },
            Rollback: async () => {
                this.Operations.push({ op: 'rollback_tx' });
                if (this._txSnapshots.length >= depthAtOpen) {
                    const snap = this._txSnapshots[depthAtOpen - 1];
                    this._txSnapshots.length = depthAtOpen - 1;
                    this._tables = snap;
                }
            },
        } as unknown as EntityTransactionScope;
    }

    public async Load(
        entity: BaseEntity,
        compositeKey: CompositeKey,
        _relationshipsToLoad: string[] | null,
        _user: UserInfo
    ): Promise<Record<string, unknown> | null> {
        const id = String(compositeKey.Values()).toLowerCase();
        // Merge ancestor columns + own columns so IS-A view loads hydrate full chain
        let merged: Record<string, unknown> | null = null;
        const chain: EntityInfo[] = [];
        let cur: EntityInfo | null = entity.EntityInfo;
        while (cur) {
            chain.unshift(cur);
            cur = cur.ParentEntityInfo;
        }
        const ownRow = this._tables.get(entity.EntityInfo.Name.toLowerCase())?.get(id);
        if (!ownRow) {
            return null;
        }
        merged = {};
        for (const levelInfo of chain) {
            const r = this._tables.get(levelInfo.Name.toLowerCase())?.get(id);
            if (r) {
                Object.assign(merged, r);
            }
        }
        return merged;
    }

    public async Save(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntitySaveOptions
    ): Promise<Record<string, unknown> | null> {
        const entityName = entity.EntityInfo.Name;
        if (this.FailSaveOnEntity && entityName.toLowerCase() === this.FailSaveOnEntity.toLowerCase()) {
            throw new Error(`Simulated DB write failure on '${entityName}'`);
        }
        const id = String(entity.Get('ID'));
        const isNew = !entity.IsSaved;
        if (entity.TransactionGroup) {
            const txOwnData: Record<string, string | number | boolean | null> = {};
            for (const f of entity.EntityInfo.Fields) {
                if (!f.IsVirtual) {
                    txOwnData[f.Name] = entity.Get(f.Name) as string | number | boolean | null;
                }
            }
            entity.TransactionGroup.AddTransaction(
                new TransactionItem(
                    entity,
                    isNew ? 'Create' : 'Update',
                    `SAVE ${entityName}`,
                    txOwnData,
                    null,
                    (_res, success) => {
                        if (success) {
                            const tableKey = entityName.toLowerCase();
                            if (!this._tables.has(tableKey)) {
                                this._tables.set(tableKey, new Map());
                            }
                            this._tables.get(tableKey)!.set(id.toLowerCase(), txOwnData);
                        }
                    }
                )
            );
            return {};
        }
        this.Operations.push({ op: 'save', entityName, isNew, id });

        const ownData: Record<string, unknown> = {};
        for (const f of entity.EntityInfo.Fields) {
            if (!f.IsVirtual) {
                ownData[f.Name] = entity.Get(f.Name);
            }
        }
        const tableKey = entityName.toLowerCase();
        if (!this._tables.has(tableKey)) {
            this._tables.set(tableKey, new Map());
        }
        this._tables.get(tableKey)!.set(id.toLowerCase(), ownData);

        // Return merged view-like data including parent fields
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

    public async Delete(
        entity: BaseEntity,
        _options: EntityDeleteOptions,
        _user: UserInfo
    ): Promise<boolean> {
        const entityName = entity.EntityInfo.Name;
        if (this.FailDeleteOnEntity && entityName.toLowerCase() === this.FailDeleteOnEntity.toLowerCase()) {
            return false;
        }
        const id = String(entity.Get('ID'));
        this.Operations.push({ op: 'delete', entityName, id });
        this._tables.get(entityName.toLowerCase())?.delete(id.toLowerCase());
        return true;
    }

    public async FindISAChildEntity(
        parentEntityInfo: EntityInfo,
        pkValue: string,
        _contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string } | null> {
        const id = pkValue.toLowerCase();
        for (const child of parentEntityInfo.ChildEntities) {
            if (this._tables.get(child.Name.toLowerCase())?.has(id)) {
                return { ChildEntityName: child.Name };
            }
        }
        return null;
    }
}

// Custom driver base class for testing Driver.BaseClass resolution
abstract class TestCommentFamilyDriver extends EntitySubtypeDriverBase {
    public abstract CustomFamilyAction(entity: BaseEntity): string;
}

describe('Generic Type Extensions via SubtypeSelector (AutoEnsureOnSave, OnSubtypeChange, Validation, Driver, UIDriver)', () => {
    let mockUser: UserInfo;
    let provider: InMemoryTransactionalTestProvider;
    let entities: EntityInfo[];

    // IDs for type rows
    const CONV_TYPE_CHAT_ID = '11111111-1111-4111-8111-111111111111';
    const CONV_TYPE_COMMENT_ID = '22222222-2222-4222-8222-222222222222';
    const COMMENT_TYPE_PLAIN_ID = '33333333-3333-4333-8333-333333333333';
    const COMMENT_TYPE_SUGGESTION_ID = '44444444-4444-4444-8444-444444444444';
    const COMMENT_TYPE_FLAG_ID = '55555555-5555-4555-8555-555555555555';

    const PROD_TYPE_PLAIN_ID = '66666666-6666-4666-8666-666666666666';
    const PROD_TYPE_EVENT_ID = '77777777-7777-4777-8777-777777777777';
    const PROD_TYPE_PUBLICATION_ID = '88888888-8888-4888-8888-888888888888';

    beforeEach(() => {
        BaseEntity.ClearSubtypeLookupCache();

        mockUser = new UserInfo(null, {
            ID: 'user-ext-001',
            Name: 'Extension Tester',
            Email: 'tester@example.com',
            FirstName: 'Extension',
            LastName: 'Tester',
            IsActive: true,
            UserRoles: [{ UserID: 'user-ext-001', RoleID: ROLE_ID, RoleName: 'Admin' }],
        });

        // 1. 3-level hierarchy: TestConversations -> TestComments -> (TestFieldSuggestions | TestQualityFlags)
        const convTypesRaw = makeEntityData('ent-conv-types', 'TestConversationTypes', null, [
            makeField('ent-conv-types', 'TestConversationTypes', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
            makeField('ent-conv-types', 'TestConversationTypes', 'Name', 2, { allowsNull: false }),
            makeField('ent-conv-types', 'TestConversationTypes', 'ExtensionEntity', 3, { allowsNull: true }),
            makeField('ent-conv-types', 'TestConversationTypes', 'DriverClass', 4, { allowsNull: true }),
        ]);

        const convRaw = makeEntityData(
            'ent-convs',
            'TestConversations',
            null,
            [
                makeField('ent-convs', 'TestConversations', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
                makeField('ent-convs', 'TestConversations', 'Name', 2, { allowsNull: true }),
                makeField('ent-convs', 'TestConversations', 'TypeID', 3, {
                    type: 'uniqueidentifier',
                    allowsNull: false,
                    relatedEntityId: 'ent-conv-types',
                    relatedEntity: 'TestConversationTypes',
                }),
            ],
            {
                Path: 'TypeID.ExtensionEntity',
                AutoEnsureOnSave: true,
                OnSubtypeChange: 'Refuse',
                Driver: { Path: 'TypeID.DriverClass', BaseClass: 'EntitySubtypeDriverBase' },
            }
        );

        const commentTypesRaw = makeEntityData('ent-comment-types', 'TestCommentTypes', null, [
            makeField('ent-comment-types', 'TestCommentTypes', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
            makeField('ent-comment-types', 'TestCommentTypes', 'Name', 2, { allowsNull: false }),
            makeField('ent-comment-types', 'TestCommentTypes', 'ExtensionEntity', 3, { allowsNull: true }),
            makeField('ent-comment-types', 'TestCommentTypes', 'DriverClass', 4, { allowsNull: true }),
            makeField('ent-comment-types', 'TestCommentTypes', 'UIDriverClass', 5, { allowsNull: true }),
        ]);

        const commentsRaw = makeEntityData(
            'ent-comments',
            'TestComments',
            'ent-convs',
            [
                makeField('ent-comments', 'TestComments', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
                makeField('ent-comments', 'TestComments', 'CommentTypeID', 2, {
                    type: 'uniqueidentifier',
                    allowsNull: false,
                    relatedEntityId: 'ent-comment-types',
                    relatedEntity: 'TestCommentTypes',
                }),
            ],
            {
                Path: 'CommentTypeID.ExtensionEntity',
                AutoEnsureOnSave: true,
                OnSubtypeChange: 'Refuse',
                Driver: { Path: 'CommentTypeID.DriverClass', BaseClass: 'TestCommentFamilyDriver' },
                UIDriver: { Path: 'CommentTypeID.UIDriverClass' },
            }
        );

        const suggestionsRaw = makeEntityData('ent-suggestions', 'TestFieldSuggestions', 'ent-comments', [
            makeField('ent-suggestions', 'TestFieldSuggestions', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
            makeField('ent-suggestions', 'TestFieldSuggestions', 'SuggestedValue', 2, { allowsNull: true }),
            makeField('ent-suggestions', 'TestFieldSuggestions', 'Source', 3, { allowsNull: false }),
        ]);

        const flagsRaw = makeEntityData('ent-flags', 'TestQualityFlags', 'ent-comments', [
            makeField('ent-flags', 'TestQualityFlags', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
            makeField('ent-flags', 'TestQualityFlags', 'Severity', 2, { allowsNull: true }),
        ]);

        // 2. Replaceable product + multi-hop OrderLine hierarchy:
        //    TestProductTypes (ProductExtensionEntity, OrderLineExtensionEntity)
        //    TestProducts -> (TestEventProducts | TestPublications)
        //    TestOrderLines -> (TestEventOrderLines)
        const prodTypesRaw = makeEntityData('ent-prod-types', 'TestProductTypes', null, [
            makeField('ent-prod-types', 'TestProductTypes', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
            makeField('ent-prod-types', 'TestProductTypes', 'Name', 2, { allowsNull: false }),
            makeField('ent-prod-types', 'TestProductTypes', 'ProductExtensionEntity', 3, { allowsNull: true }),
            makeField('ent-prod-types', 'TestProductTypes', 'OrderLineExtensionEntity', 4, { allowsNull: true }),
        ]);

        const prodsRaw = makeEntityData(
            'ent-prods',
            'TestProducts',
            null,
            [
                makeField('ent-prods', 'TestProducts', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
                makeField('ent-prods', 'TestProducts', 'Name', 2, { allowsNull: false }),
                makeField('ent-prods', 'TestProducts', 'ProductTypeID', 3, {
                    type: 'uniqueidentifier',
                    allowsNull: false,
                    relatedEntityId: 'ent-prod-types',
                    relatedEntity: 'TestProductTypes',
                }),
            ],
            {
                Path: 'ProductTypeID.ProductExtensionEntity',
                AutoEnsureOnSave: true,
                OnSubtypeChange: 'Replace',
                FoldIntoForm: true,
            }
        );

        const eventProdsRaw = makeEntityData('ent-event-prods', 'TestEventProducts', 'ent-prods', [
            makeField('ent-event-prods', 'TestEventProducts', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
            makeField('ent-event-prods', 'TestEventProducts', 'Venue', 2, { allowsNull: true }),
        ]);

        const pubProdsRaw = makeEntityData('ent-pub-prods', 'TestPublications', 'ent-prods', [
            makeField('ent-pub-prods', 'TestPublications', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
            makeField('ent-pub-prods', 'TestPublications', 'ISBN', 2, { allowsNull: true }),
        ]);

        const orderLinesRaw = makeEntityData(
            'ent-order-lines',
            'TestOrderLines',
            null,
            [
                makeField('ent-order-lines', 'TestOrderLines', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
                makeField('ent-order-lines', 'TestOrderLines', 'ProductID', 2, {
                    type: 'uniqueidentifier',
                    allowsNull: false,
                    relatedEntityId: 'ent-prods',
                    relatedEntity: 'TestProducts',
                }),
            ],
            {
                Path: 'ProductID.ProductTypeID.OrderLineExtensionEntity',
                AutoEnsureOnSave: true,
            }
        );

        const eventOrderLinesRaw = makeEntityData('ent-event-order-lines', 'TestEventOrderLines', 'ent-order-lines', [
            makeField('ent-event-order-lines', 'TestEventOrderLines', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
            makeField('ent-event-order-lines', 'TestEventOrderLines', 'SeatCode', 2, { allowsNull: true }),
        ]);

        const unrelatedRaw = makeEntityData('ent-unrelated', 'TestStandaloneEntity', null, [
            makeField('ent-unrelated', 'TestStandaloneEntity', 'ID', 1, { type: 'uniqueidentifier', isPk: true }),
        ]);

        entities = [
            convTypesRaw,
            convRaw,
            commentTypesRaw,
            commentsRaw,
            suggestionsRaw,
            flagsRaw,
            prodTypesRaw,
            prodsRaw,
            eventProdsRaw,
            pubProdsRaw,
            orderLinesRaw,
            eventOrderLinesRaw,
            unrelatedRaw,
        ].map(r => new EntityInfo(r));

        provider = new InMemoryTransactionalTestProvider(entities, mockUser);
        Metadata.Provider = provider as unknown as ProviderBase;
        BaseEntity.Provider = provider as unknown as IEntityDataProvider;

        // Seed type tables
        provider.SeedRow('TestConversationTypes', {
            ID: CONV_TYPE_CHAT_ID,
            Name: 'Chat',
            ExtensionEntity: null,
            DriverClass: null,
        });
        provider.SeedRow('TestConversationTypes', {
            ID: CONV_TYPE_COMMENT_ID,
            Name: 'Comment',
            ExtensionEntity: 'TestComments',
            DriverClass: 'TestCommentConvDriver',
        });

        provider.SeedRow('TestCommentTypes', {
            ID: COMMENT_TYPE_PLAIN_ID,
            Name: 'Comment',
            ExtensionEntity: null,
            DriverClass: null,
            UIDriverClass: null,
        });
        provider.SeedRow('TestCommentTypes', {
            ID: COMMENT_TYPE_SUGGESTION_ID,
            Name: 'Field Suggestion',
            ExtensionEntity: 'TestFieldSuggestions',
            DriverClass: 'TestSuggestionDriver',
            UIDriverClass: 'TestSuggestionCardComponent',
        });
        provider.SeedRow('TestCommentTypes', {
            ID: COMMENT_TYPE_FLAG_ID,
            Name: 'Quality Flag',
            ExtensionEntity: 'TestQualityFlags',
            DriverClass: 'TestFlagDriver',
            UIDriverClass: 'TestFlagCardComponent',
        });

        provider.SeedRow('TestProductTypes', {
            ID: PROD_TYPE_PLAIN_ID,
            Name: 'Merchandise',
            ProductExtensionEntity: null,
            OrderLineExtensionEntity: null,
        });
        provider.SeedRow('TestProductTypes', {
            ID: PROD_TYPE_EVENT_ID,
            Name: 'Event',
            ProductExtensionEntity: 'TestEventProducts',
            OrderLineExtensionEntity: 'TestEventOrderLines',
        });
        provider.SeedRow('TestProductTypes', {
            ID: PROD_TYPE_PUBLICATION_ID,
            Name: 'Publication',
            ProductExtensionEntity: 'TestPublications',
            OrderLineExtensionEntity: null,
        });
    });

    afterEach(() => {
        const cf = MJGlobal.Instance.ClassFactory as unknown as {
            _registrations: Array<{ BaseClass: unknown; Key: string | null }>;
            _registrationCache: Map<string, unknown>;
        };
        cf._registrations = cf._registrations.filter(
            r => r.BaseClass !== EntitySubtypeDriverBase && r.BaseClass !== TestCommentFamilyDriver
        );
        cf._registrationCache.clear();
        BaseEntity.ClearSubtypeLookupCache();
        Metadata.Provider = null as unknown as ProviderBase;
        BaseEntity.Provider = null as unknown as IEntityDataProvider;
    });

    // ─── 1. AutoEnsureOnSave ─────────────────────────────────────────────────

    describe('AutoEnsureOnSave', () => {
        it('automatically creates and persists the resolved child row in one transaction on Save()', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Tech Summit 2026');
            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);

            expect(product.ISAChild).toBeNull();

            const saved = await product.Save();
            expect(saved).toBe(true);
            expect(product.ISAChild).not.toBeNull();
            expect(product.ISAChild!.EntityInfo.Name).toBe('TestEventProducts');
            expect(product.ISAChild!.IsSaved).toBe(true);

            const id = String(product.Get('ID'));
            expect(provider.HasRow('TestProducts', id)).toBe(true);
            expect(provider.HasRow('TestEventProducts', id)).toBe(true);

            // Verify single outer transaction wrapped both inserts
            const txOps = provider.Operations.filter(o => o.op === 'begin_tx' || o.op === 'commit_tx' || o.op === 'save');
            expect(txOps.map(o => `${o.op}${o.entityName ? ':' + o.entityName : ''}`)).toEqual([
                'begin_tx',
                'save:TestProducts',
                'save:TestEventProducts',
                'commit_tx',
            ]);
        });

        it('does not create a child row when the selected type has no ExtensionEntity', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Logo Mug');
            product.Set('ProductTypeID', PROD_TYPE_PLAIN_ID);

            const saved = await product.Save();
            expect(saved).toBe(true);
            expect(product.ISAChild).toBeNull();
            expect(provider.AllRows('TestEventProducts')).toHaveLength(0);
            expect(provider.AllRows('TestPublications')).toHaveLength(0);
        });

        it('leaves existing behavior unchanged when AutoEnsureOnSave is false or omitted', async () => {
            const prodInfo = provider.EntityByName('TestProducts')!;
            prodInfo.SubtypeSelector = JSON.stringify({ Path: 'ProductTypeID.ProductExtensionEntity' });

            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Manual Event');
            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);

            const saved = await product.Save();
            expect(saved).toBe(true);
            expect(product.ISAChild).toBeNull();
            expect(provider.HasRow('TestEventProducts', String(product.Get('ID')))).toBe(false);
        });

        it('chains multi-hop SubtypeSelector (OrderLine -> Product -> ProductType) on Save()', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Conference Pass');
            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);
            expect(await product.Save()).toBe(true);

            const orderLine = await provider.GetEntityObject('TestOrderLines');
            orderLine.Set('ProductID', product.Get('ID'));
            expect(orderLine.ISAChild).toBeNull();

            expect(await orderLine.Save()).toBe(true);
            expect(orderLine.ISAChild?.EntityInfo.Name).toBe('TestEventOrderLines');
            expect(provider.HasRow('TestEventOrderLines', String(orderLine.Get('ID')))).toBe(true);
        });

        it('saves a 3-level IS-A chain (Conversation -> Comment -> QualityFlag) atomically when initiated on branch', async () => {
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('Name', 'Anchor thread');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);

            expect(comment.ISAChild).toBeNull();
            provider.Operations = [];

            const saved = await comment.Save();
            expect(saved).toBe(true);
            expect(comment.ISAChild?.EntityInfo.Name).toBe('TestQualityFlags');

            const id = String(comment.Get('ID'));
            expect(provider.HasRow('TestConversations', id)).toBe(true);
            expect(provider.HasRow('TestComments', id)).toBe(true);
            expect(provider.HasRow('TestQualityFlags', id)).toBe(true);
        });

        it('surfaces validation failure from auto-ensured leaf onto parent LatestResult and rolls back', async () => {
            // TestFieldSuggestions.Source is NOT NULL; leaving it unset must fail and populate comment.LatestResult
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_SUGGESTION_ID);

            const saved = await comment.Save();
            expect(saved).toBe(false);
            expect(comment.LatestResult).not.toBeNull();
            expect(comment.LatestResult?.Success).toBe(false);
            expect(comment.LatestResult?.Errors.some(e => e.Source === 'Source')).toBe(true);

            const id = String(comment.Get('ID'));
            expect(provider.HasRow('TestConversations', id)).toBe(false);
            expect(provider.HasRow('TestComments', id)).toBe(false);
            expect(provider.HasRow('TestFieldSuggestions', id)).toBe(false);
        });
    });

    // ─── 2. OnSubtypeChange: 'Refuse' ────────────────────────────────────────

    describe("OnSubtypeChange: 'Refuse'", () => {
        it('refuses changing a saved record between two types with different extension entities', async () => {
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await comment.Save()).toBe(true);
            const id = String(comment.Get('ID'));

            provider.Operations = [];
            comment.Set('CommentTypeID', COMMENT_TYPE_SUGGESTION_ID);
            const secondSave = await comment.Save();

            expect(secondSave).toBe(false);
            expect(comment.LatestResult?.Message).toMatch(
                /Cannot change subtype of saved 'TestComments' record from 'TestQualityFlags' to 'TestFieldSuggestions' \(OnSubtypeChange is 'Refuse'\)/
            );
            expect(provider.Operations).toHaveLength(0);
            expect(provider.HasRow('TestQualityFlags', id)).toBe(true);
            expect(provider.HasRow('TestFieldSuggestions', id)).toBe(false);
        });

        it('refuses changing a saved record from an extension type to a non-extension type', async () => {
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await comment.Save()).toBe(true);

            comment.Set('CommentTypeID', COMMENT_TYPE_PLAIN_ID);
            const saved = await comment.Save();

            expect(saved).toBe(false);
            expect(comment.LatestResult?.Message).toMatch(/to no extension entity \(OnSubtypeChange is 'Refuse'\)/);
            expect(provider.HasRow('TestQualityFlags', String(comment.Get('ID')))).toBe(true);
        });

        it('discovers persisted child from DB before checking policy even when record was not child-linked yet', async () => {
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await comment.Save()).toBe(true);
            const id = String(comment.Get('ID'));

            // Load a fresh TestComments instance and simulate unlinked child before save
            const reloaded = await provider.GetEntityObject('TestComments');
            expect(await reloaded.InnerLoad(CompositeKey.FromID(id))).toBe(true);
            (reloaded as unknown as { _childEntity: BaseEntity | null })._childEntity = null;
            (reloaded as unknown as { _childEntityDiscoveryDone: boolean })._childEntityDiscoveryDone = false;

            reloaded.Set('CommentTypeID', COMMENT_TYPE_SUGGESTION_ID);
            const saved = await reloaded.Save();
            expect(saved).toBe(false);
            expect(reloaded.LatestResult?.Message).toMatch(/OnSubtypeChange is 'Refuse'/);
        });

        it('always allows promoting a saved record from no extension to an extension entity', async () => {
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_PLAIN_ID);
            expect(await comment.Save()).toBe(true);
            const id = String(comment.Get('ID'));
            expect(comment.ISAChild).toBeNull();

            // Promote plain comment -> Quality Flag
            comment.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await comment.Save()).toBe(true);
            expect(comment.ISAChild?.EntityInfo.Name).toBe('TestQualityFlags');
            expect(provider.HasRow('TestQualityFlags', id)).toBe(true);
        });
    });

    // ─── 3. OnSubtypeChange: 'Replace' ───────────────────────────────────────

    describe("OnSubtypeChange: 'Replace'", () => {
        it('deletes the old child row and creates the new child row atomically in one transaction', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Hybrid Item');
            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);
            expect(await product.Save()).toBe(true);
            const id = String(product.Get('ID'));
            expect(provider.HasRow('TestEventProducts', id)).toBe(true);

            provider.Operations = [];
            product.Set('ProductTypeID', PROD_TYPE_PUBLICATION_ID);
            const replaced = await product.Save();

            expect(replaced).toBe(true);
            expect(product.ISAChild?.EntityInfo.Name).toBe('TestPublications');
            expect(provider.HasRow('TestProducts', id)).toBe(true);
            expect(provider.HasRow('TestEventProducts', id)).toBe(false);
            expect(provider.HasRow('TestPublications', id)).toBe(true);

            // Verify outer transaction wrapped delete(oldChild) + save(parent) + save(newChild)
            const ops = provider.Operations;
            expect(ops[0].op).toBe('begin_tx');
            expect(ops.some(o => o.op === 'delete' && o.entityName === 'TestEventProducts' && o.id === id)).toBe(true);
            expect(ops.some(o => o.op === 'save' && o.entityName === 'TestProducts' && o.isNew === false)).toBe(true);
            expect(ops.some(o => o.op === 'save' && o.entityName === 'TestPublications' && o.isNew === true)).toBe(true);
            expect(ops[ops.length - 1].op).toBe('commit_tx');
        });

        it('deletes the old child row and preserves the parent when switching to a type with no extension', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Event Turned Merch');
            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);
            expect(await product.Save()).toBe(true);
            const id = String(product.Get('ID'));

            product.Set('ProductTypeID', PROD_TYPE_PLAIN_ID);
            expect(await product.Save()).toBe(true);

            expect(product.ISAChild).toBeNull();
            expect(provider.HasRow('TestProducts', id)).toBe(true);
            expect(provider.HasRow('TestEventProducts', id)).toBe(false);
        });

        it('rolls back old child deletion and restores in-memory child link when new child save fails', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Rollback Item');
            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);
            expect(await product.Save()).toBe(true);
            const id = String(product.Get('ID'));
            const originalChild = product.ISAChild;

            provider.FailSaveOnEntity = 'TestPublications';
            product.Set('ProductTypeID', PROD_TYPE_PUBLICATION_ID);
            const replaced = await product.Save();

            expect(replaced).toBe(false);
            expect(product.ISAChild).toBe(originalChild);
            expect(product.ISAChild?.EntityInfo.Name).toBe('TestEventProducts');
            expect(provider.HasRow('TestEventProducts', id)).toBe(true);
            expect(provider.HasRow('TestPublications', id)).toBe(false);
            expect(provider.GetRow('TestProducts', id)?.['ProductTypeID']).toBe(PROD_TYPE_EVENT_ID);
        });

        it('rolls back cleanly when deleting the old child fails', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Locked Event');
            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);
            expect(await product.Save()).toBe(true);
            const id = String(product.Get('ID'));

            provider.FailDeleteOnEntity = 'TestEventProducts';
            product.Set('ProductTypeID', PROD_TYPE_PUBLICATION_ID);
            const replaced = await product.Save();

            expect(replaced).toBe(false);
            expect(product.ISAChild?.EntityInfo.Name).toBe('TestEventProducts');
            expect(provider.HasRow('TestEventProducts', id)).toBe(true);
            expect(provider.HasRow('TestPublications', id)).toBe(false);
        });
    });

    // ─── 4. ReconcileISAChild (unsaved prospective form folding) ─────────────

    describe('ReconcileISAChild for unsaved records', () => {
        it('attaches, swaps, and detaches unsaved prospective child entities as type changes before first save', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Draft Product');

            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);
            const firstChild = await product.ReconcileISAChild();
            expect(firstChild?.EntityInfo.Name).toBe('TestEventProducts');
            expect(product.ISAChild).toBe(firstChild);

            // Switch to Publication before first save
            product.Set('ProductTypeID', PROD_TYPE_PUBLICATION_ID);
            const secondChild = await product.ReconcileISAChild();
            expect(secondChild?.EntityInfo.Name).toBe('TestPublications');
            expect(product.ISAChild).toBe(secondChild);

            // Switch to plain Merchandise (no extension) before first save
            product.Set('ProductTypeID', PROD_TYPE_PLAIN_ID);
            const thirdChild = await product.ReconcileISAChild();
            expect(thirdChild).toBeNull();
            expect(product.ISAChild).toBeNull();
        });

        it('does not detach an already-saved child entity (leaves saved transitions to Save() policy)', async () => {
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await comment.Save()).toBe(true);

            const savedFlagChild = comment.ISAChild;
            comment.Set('CommentTypeID', COMMENT_TYPE_PLAIN_ID);
            const reconciled = await comment.ReconcileISAChild();
            expect(reconciled).toBe(savedFlagChild);
            expect(comment.ISAChild).toBe(savedFlagChild);
        });
    });

    // ─── 5. Type-Row Save Validation ─────────────────────────────────────────

    describe('Type-row ExtensionEntity validation', () => {
        it('accepts null, empty string, and valid declared IS-A child entity names (case-insensitive)', async () => {
            const typeRow = await provider.GetEntityObject('TestConversationTypes');
            typeRow.Set('Name', 'Custom No Extension');
            typeRow.Set('ExtensionEntity', null);
            expect(typeRow.Validate().Success).toBe(true);
            expect(await typeRow.Save()).toBe(true);

            typeRow.Set('ExtensionEntity', '  testcomments  ');
            expect(typeRow.Validate().Success).toBe(true);
            expect(await typeRow.Save()).toBe(true);
        });

        it('rejects saving a type row naming a non-existent or unrelated entity', async () => {
            const typeRow = await provider.GetEntityObject('TestConversationTypes');
            typeRow.Set('Name', 'Bad Type');
            typeRow.Set('ExtensionEntity', 'TestStandaloneEntity');

            const valResult = typeRow.Validate();
            expect(valResult.Success).toBe(false);
            expect(valResult.Errors).toHaveLength(1);
            expect(valResult.Errors[0].Source).toBe('ExtensionEntity');
            expect(valResult.Errors[0].Message).toMatch(
                /'TestStandaloneEntity' is not a declared IS-A child entity of 'TestConversations'/
            );

            const saved = await typeRow.Save();
            expect(saved).toBe(false);
            expect(typeRow.LatestResult?.Errors[0]?.Source).toBe('ExtensionEntity');
        });

        it('validates multi-hop and multi-column type tables independently per parent entity', async () => {
            const prodType = await provider.GetEntityObject('TestProductTypes');
            prodType.Set('Name', 'Cross-Wired Type');
            // TestEventOrderLines is a child of TestOrderLines, NOT TestProducts!
            prodType.Set('ProductExtensionEntity', 'TestEventOrderLines');
            prodType.Set('OrderLineExtensionEntity', 'TestEventProducts');

            const valResult = prodType.Validate();
            expect(valResult.Success).toBe(false);
            expect(valResult.Errors).toHaveLength(2);
            expect(valResult.Errors.map(e => e.Source).sort()).toEqual([
                'OrderLineExtensionEntity',
                'ProductExtensionEntity',
            ]);

            // Fix both columns to point to their respective parents' declared children
            prodType.Set('ProductExtensionEntity', 'TestEventProducts');
            prodType.Set('OrderLineExtensionEntity', 'TestEventOrderLines');
            expect(prodType.Validate().Success).toBe(true);
            expect(await prodType.Save()).toBe(true);
        });
    });

    // ─── 6. SubtypeSelector.Driver & UIDriver ────────────────────────────────

    describe('Driver & UIDriver resolution, caching, and lifecycle hooks', () => {
        it('resolves custom family BaseClass drivers, caches singletons per type, and exposes family methods', async () => {
            const calls: string[] = [];

            class MockSuggestionDriver extends TestCommentFamilyDriver {
                public CustomFamilyAction(entity: BaseEntity): string {
                    return `accepted:${String(entity.Get('ID'))}`;
                }

                public override Validate(entity: BaseEntity, result: ValidationResult): void {
                    calls.push(`Validate:${entity.EntityInfo.Name}`);
                    const leaf = entity.ISAChild;
                    if (leaf && leaf.Get('SuggestedValue') === 'FORBIDDEN') {
                        result.Errors.push(
                            new ValidationErrorInfo(
                                'SuggestedValue',
                                'SuggestedValue may not be FORBIDDEN',
                                'FORBIDDEN',
                                ValidationErrorType.Failure
                            )
                        );
                        result.Success = false;
                    }
                }

                public override BeforeSave(_entity: BaseEntity, isNew: boolean): void {
                    calls.push(`BeforeSave:isNew=${isNew}`);
                }

                public override AfterSave(_entity: BaseEntity, isNew: boolean): void {
                    calls.push(`AfterSave:isNew=${isNew}`);
                }

                public override OnFieldChanged(_entity: BaseEntity, fieldName: string, newVal: unknown, oldVal: unknown): void {
                    calls.push(`OnFieldChanged:${fieldName}:${String(oldVal)}->${String(newVal)}`);
                }
            }

            MJGlobal.Instance.ClassFactory.Register(
                TestCommentFamilyDriver,
                MockSuggestionDriver,
                'TestSuggestionDriver'
            );

            const suggestion = await provider.GetEntityObject('TestFieldSuggestions');
            suggestion.Set('TypeID', CONV_TYPE_COMMENT_ID);
            suggestion.Set('CommentTypeID', COMMENT_TYPE_SUGGESTION_ID);
            suggestion.Set('Source', 'LLM');
            suggestion.Set('SuggestedValue', '2026-12-15');

            const commentBranch = suggestion.ISAParent!;
            const resolvedDriver1 = await commentBranch.ResolveSubtypeDriver<TestCommentFamilyDriver>();
            const resolvedDriver2 = commentBranch.ResolveSubtypeDriverSync<TestCommentFamilyDriver>();
            expect(resolvedDriver1).toBeInstanceOf(MockSuggestionDriver);
            expect(resolvedDriver2).toBe(resolvedDriver1);
            expect(resolvedDriver1!.CustomFamilyAction(commentBranch)).toBe(`accepted:${String(commentBranch.Get('ID'))}`);

            // UIDriver resolution (async & sync)
            expect(await commentBranch.ResolveSubtypeUIDriverName()).toBe('TestSuggestionCardComponent');
            expect(commentBranch.ResolveSubtypeUIDriverNameSync()).toBe('TestSuggestionCardComponent');

            // OnFieldChanged fires when parent/branch/root field is modified after driver is cached
            calls.length = 0;
            suggestion.Set('Name', 'Updated Thread Title');
            expect(calls).toContain('OnFieldChanged:Name:null->Updated Thread Title');

            // Save runs Validate, BeforeSave(isNew=true), AfterSave(isNew=true)
            calls.length = 0;
            expect(await suggestion.Save()).toBe(true);
            expect(calls).toEqual([
                'Validate:TestComments',
                'BeforeSave:isNew=true',
                'AfterSave:isNew=true',
            ]);

            // Update runs with isNew=false
            calls.length = 0;
            commentBranch.Set('CommentTypeID', COMMENT_TYPE_SUGGESTION_ID); // unchanged
            suggestion.Set('Name', 'Second Title'); // routes to root Conversation; dirty commentBranch too to save TestComments
            expect(await commentBranch.Save({ IgnoreDirtyState: true } as EntitySaveOptions)).toBe(true);
            expect(calls).toEqual([
                'OnFieldChanged:Name:Updated Thread Title->Second Title',
                'Validate:TestComments',
                'BeforeSave:isNew=false',
                'AfterSave:isNew=false',
            ]);

            // Driver validation failure blocks save
            const badSuggestion = await provider.GetEntityObject('TestFieldSuggestions');
            badSuggestion.Set('TypeID', CONV_TYPE_COMMENT_ID);
            badSuggestion.Set('CommentTypeID', COMMENT_TYPE_SUGGESTION_ID);
            badSuggestion.Set('Source', 'LLM');
            badSuggestion.Set('SuggestedValue', 'FORBIDDEN');
            expect(await badSuggestion.Save()).toBe(false);
            expect(badSuggestion.LatestResult?.Message).toMatch(/FORBIDDEN/);
        });

        it('aborts and rolls back transaction when BeforeSave returns false or an error string or AfterSave throws', async () => {
            let mode: 'false' | 'message' | 'after_throw' = 'false';

            class GuardDriver extends TestCommentFamilyDriver {
                public CustomFamilyAction(): string {
                    return 'guard';
                }

                public override BeforeSave(): boolean | string | void {
                    if (mode === 'false') return false;
                    if (mode === 'message') return 'Custom driver rejection message';
                }

                public override AfterSave(): void {
                    if (mode === 'after_throw') {
                        throw new Error('AfterSave side-effect failed');
                    }
                }
            }

            MJGlobal.Instance.ClassFactory.Register(TestCommentFamilyDriver, GuardDriver, 'TestFlagDriver');

            const flag1 = await provider.GetEntityObject('TestQualityFlags');
            flag1.Set('TypeID', CONV_TYPE_COMMENT_ID);
            flag1.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await flag1.Save()).toBe(false);
            expect(flag1.LatestResult?.Message).toMatch(/Save rejected by subtype driver/);
            expect(provider.HasRow('TestConversations', String(flag1.Get('ID')))).toBe(false);

            mode = 'message';
            const flag2 = await provider.GetEntityObject('TestQualityFlags');
            flag2.Set('TypeID', CONV_TYPE_COMMENT_ID);
            flag2.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await flag2.Save()).toBe(false);
            expect(flag2.LatestResult?.Message).toMatch(/Custom driver rejection message/);
            expect(provider.HasRow('TestConversations', String(flag2.Get('ID')))).toBe(false);

            mode = 'after_throw';
            const flag3 = await provider.GetEntityObject('TestQualityFlags');
            flag3.Set('TypeID', CONV_TYPE_COMMENT_ID);
            flag3.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await flag3.Save()).toBe(false);
            expect(flag3.LatestResult?.Message).toMatch(/AfterSave side-effect failed/);
            expect(provider.HasRow('TestConversations', String(flag3.Get('ID')))).toBe(false);
            expect(provider.HasRow('TestComments', String(flag3.Get('ID')))).toBe(false);
            expect(flag3.IsSaved).toBe(false);
        });

        it('succeeds cleanly without error when DriverClass is unregistered (e.g. server-only driver on client)', async () => {
            // TestCommentConvDriver is named on CONV_TYPE_COMMENT_ID, and NOT registered in ClassFactory
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_PLAIN_ID);

            expect(await comment.ISAParent!.ResolveSubtypeDriver()).toBeNull();
            expect(await comment.Save()).toBe(true);
        });

        it('preserves virtual view columns on root and branch entities when loading downward across a 3-level IS-A chain', async () => {
            // Add virtual joined view fields (like Conversation.Type and Comment.CommentType) to the metadata
            const convEntity = provider.EntityByName('TestConversations')!;
            const commentEntity = provider.EntityByName('TestComments')!;
            convEntity.Fields.push(
                new (convEntity.Fields[0].constructor as new (data: Record<string, unknown>) => typeof convEntity.Fields[0])({
                    ...makeField('ent-convs', 'TestConversations', 'Type', 99),
                    IsVirtual: true,
                    AllowUpdateAPI: false,
                })
            );
            commentEntity.Fields.push(
                new (commentEntity.Fields[0].constructor as new (data: Record<string, unknown>) => typeof commentEntity.Fields[0])({
                    ...makeField('ent-comments', 'TestComments', 'CommentType', 99),
                    IsVirtual: true,
                    AllowUpdateAPI: false,
                })
            );

            // Save a 3-level record (Conversation -> Comment -> FieldSuggestion)
            const suggestion = await provider.GetEntityObject('TestFieldSuggestions');
            suggestion.Set('Name', '3-level virtual column check');
            suggestion.Set('TypeID', CONV_TYPE_COMMENT_ID);
            suggestion.Set('CommentTypeID', COMMENT_TYPE_SUGGESTION_ID);
            suggestion.Set('Source', 'LLM');
            suggestion.Set('SuggestedValue', 'Proposed');
            expect(await suggestion.Save()).toBe(true);
            const id = String(suggestion.Get('ID'));

            // Simulate real SQL views: each view only exposes its OWN virtual FK-joined columns,
            // while child views join ancestor physical base tables (omitting ancestor virtual columns).
            const originalLoad = provider.Load.bind(provider);
            vi.spyOn(provider, 'Load').mockImplementation(async (entity, ck, rels, u) => {
                const row = await originalLoad(entity, ck, rels, u);
                if (!row) return null;
                if (entity.EntityInfo.Name === 'TestConversations') {
                    return { ...row, Type: 'Comment' };
                }
                if (entity.EntityInfo.Name === 'TestComments') {
                    return { ...row, CommentType: 'Field Suggestion' };
                }
                // TestFieldSuggestions joins base tables Conversation + Comment (no virtual Type or CommentType)
                return row;
            });

            const loadedConv = await provider.GetEntityObject('TestConversations');
            expect(await loadedConv.InnerLoad(CompositeKey.FromID(id))).toBe(true);

            // Downward child discovery must attach both Comment and FieldSuggestion WITHOUT wiping virtual columns
            expect(loadedConv.ISAChild?.EntityInfo.Name).toBe('TestComments');
            expect(loadedConv.ISAChild?.ISAChild?.EntityInfo.Name).toBe('TestFieldSuggestions');
            expect(loadedConv.Get('Type')).toBe('Comment');
            expect(loadedConv.ISAChild?.Get('CommentType')).toBe('Field Suggestion');
        });
    });

    // ─── 7. Review Hardening: SaveOptions reuse, concurrent IS-A ops, sync async-driver guard, TransactionGroup AfterSave, lean tx scope ──

    describe('Review hardening guarantees', () => {
        it('enforces AutoEnsureOnSave and OnSubtypeChange across sequential and concurrent reuse of a shared EntitySaveOptions', async () => {
            const sharedOpts = new EntitySaveOptions();

            const prod1 = await provider.GetEntityObject('TestProducts');
            prod1.Set('Name', 'Event One');
            prod1.Set('ProductTypeID', PROD_TYPE_EVENT_ID);

            const prod2 = await provider.GetEntityObject('TestProducts');
            prod2.Set('Name', 'Event Two');
            prod2.Set('ProductTypeID', PROD_TYPE_EVENT_ID);

            // Concurrent saves sharing the exact same EntitySaveOptions instance
            const [saved1, saved2] = await Promise.all([prod1.Save(sharedOpts), prod2.Save(sharedOpts)]);
            expect(saved1).toBe(true);
            expect(saved2).toBe(true);
            expect(prod1.ISAChild?.EntityInfo.Name).toBe('TestEventProducts');
            expect(prod2.ISAChild?.EntityInfo.Name).toBe('TestEventProducts');
            expect(provider.HasRow('TestEventProducts', String(prod1.Get('ID')))).toBe(true);
            expect(provider.HasRow('TestEventProducts', String(prod2.Get('ID')))).toBe(true);

            // Sequential saves sharing the exact same EntitySaveOptions instance must still enforce OnSubtypeChange: 'Refuse'
            const comment = await provider.GetEntityObject('TestComments');
            comment.Set('TypeID', CONV_TYPE_COMMENT_ID);
            comment.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            expect(await comment.Save(sharedOpts)).toBe(true);
            expect(comment.ISAChild?.EntityInfo.Name).toBe('TestQualityFlags');

            comment.Set('CommentTypeID', COMMENT_TYPE_SUGGESTION_ID);
            expect(await comment.Save(sharedOpts)).toBe(false);
            expect(comment.LatestResult?.Message).toMatch(/OnSubtypeChange is 'Refuse'/);
        });

        it('serializes concurrent EnsureISAChild() and ReconcileISAChild() calls on the same parent without creating duplicate child instances', async () => {
            const product = await provider.GetEntityObject('TestProducts');
            product.Set('Name', 'Concurrent Folding');
            product.Set('ProductTypeID', PROD_TYPE_EVENT_ID);

            let eventProductInstantiations = 0;
            const origGetEntityObject = provider.GetEntityObject.bind(provider);
            vi.spyOn(provider, 'GetEntityObject').mockImplementation(async (entityName, contextUser) => {
                if (entityName === 'TestEventProducts') {
                    eventProductInstantiations++;
                    await Promise.resolve();
                }
                return origGetEntityObject(entityName, contextUser);
            });

            const [c1, c2, c3] = await Promise.all([
                product.EnsureISAChild(),
                product.ReconcileISAChild(),
                product.EnsureISAChild(),
            ]);

            expect(c1).not.toBeNull();
            expect(c1).toBe(c2);
            expect(c2).toBe(c3);
            expect(product.ISAChild).toBe(c1);
            expect(eventProductInstantiations).toBe(1);
        });

        it('fails closed during synchronous Validate() when a SubtypeSelector.Driver returns an async Promise', async () => {
            class AsyncOnlyValidateDriver extends TestCommentFamilyDriver {
                public CustomFamilyAction(): string {
                    return 'async-only';
                }

                public override async Validate(_entity: BaseEntity, _result: ValidationResult): Promise<void> {
                    await Promise.resolve();
                }
            }

            MJGlobal.Instance.ClassFactory.Register(
                TestCommentFamilyDriver,
                AsyncOnlyValidateDriver,
                'TestFlagDriver'
            );

            const flag = await provider.GetEntityObject('TestQualityFlags');
            flag.Set('TypeID', CONV_TYPE_COMMENT_ID);
            flag.Set('CommentTypeID', COMMENT_TYPE_FLAG_ID);
            const commentBranch = flag.ISAParent!;

            // Prime cached driver so synchronous Validate() sees it
            await commentBranch.ResolveSubtypeDriver();

            const syncResult = commentBranch.Validate();
            expect(syncResult.Success).toBe(false);
            expect(syncResult.Errors.some(e => /requires asynchronous validation/i.test(e.Message))).toBe(true);

            // Async ValidateAsync() succeeds cleanly
            const asyncResult = await commentBranch.ValidateAsync();
            expect(asyncResult.Success).toBe(true);
        });

        it('skips BeginEntityTransaction on standalone entities whose selected subtype has neither an extension entity nor a DriverClass', async () => {
            const chatConv = await provider.GetEntityObject('TestConversations');
            chatConv.Set('Name', 'Regular Chat');
            chatConv.Set('TypeID', CONV_TYPE_CHAT_ID);

            provider.Operations = [];
            expect(await chatConv.Save()).toBe(true);
            expect(provider.Operations.filter(o => o.op === 'begin_tx')).toHaveLength(0);
            expect(provider.Operations.map(o => `${o.op}:${o.entityName ?? ''}`)).toEqual([
                'save:TestConversations',
            ]);
        });

        it('runs SubtypeSelector.Driver AfterSave inside open TransactionGroup before CommitGroupTransaction and rolls back if AfterSave throws', async () => {
            const events: string[] = [];
            let throwInAfterSave = false;

            class TestInMemoryTransactionGroup extends TransactionGroupBase {
                private _txScope: EntityTransactionScope | null = null;

                protected override async BeginGroupTransaction(): Promise<void> {
                    this._txScope = await provider.BeginEntityTransaction();
                    events.push('tx:begin');
                }

                protected override async HandleSubmit(): Promise<TransactionResult[]> {
                    events.push('tx:execute');
                    return this.PendingTransactions.map(
                        t => new TransactionResult(t, { ...(t.Vars as Record<string, string | number | boolean | null>) }, true)
                    );
                }

                protected override async CommitGroupTransaction(): Promise<void> {
                    if (this._txScope) {
                        await this._txScope.Commit();
                        this._txScope = null;
                    }
                    events.push('tx:commit');
                }

                protected override async RollbackGroupTransaction(): Promise<void> {
                    if (this._txScope) {
                        await this._txScope.Rollback();
                        this._txScope = null;
                    }
                    events.push('tx:rollback');
                }
            }

            class TxGroupDriver extends EntitySubtypeDriverBase {
                public override async AfterSave(_entity: BaseEntity, isNew: boolean): Promise<void> {
                    events.push(`driver:AfterSave:isNew=${isNew}`);
                    if (throwInAfterSave) {
                        throw new Error('Transactional AfterSave failure');
                    }
                }
            }

            // Seed a standalone ConversationType with DriverClass only (no IS-A child) so TransactionGroup saves cleanly
            const CONV_TYPE_DRIVER_ONLY_ID = '99999999-9999-4999-8999-999999999999';
            provider.SeedRow('TestConversationTypes', {
                ID: CONV_TYPE_DRIVER_ONLY_ID,
                Name: 'Driven Chat',
                ExtensionEntity: null,
                DriverClass: 'TxGroupDriver',
            });
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeDriverBase, TxGroupDriver, 'TxGroupDriver');

            // 1. Happy path: AfterSave runs after execute and BEFORE tx:commit
            const group1 = new TestInMemoryTransactionGroup();
            const conv1 = await provider.GetEntityObject('TestConversations');
            conv1.Set('Name', 'Grouped Driven Conv');
            conv1.Set('TypeID', CONV_TYPE_DRIVER_ONLY_ID);
            conv1.TransactionGroup = group1;
            expect(await conv1.Save()).toBe(true);
            expect(await group1.Submit()).toBe(true);
            expect(events).toEqual([
                'tx:begin',
                'tx:execute',
                'driver:AfterSave:isNew=true',
                'tx:commit',
            ]);

            // 2. Throw path: AfterSave failure rolls back group transaction and Submit() returns false
            events.length = 0;
            throwInAfterSave = true;
            const group2 = new TestInMemoryTransactionGroup();
            const conv2 = await provider.GetEntityObject('TestConversations');
            conv2.Set('Name', 'Rollback Grouped Conv');
            conv2.Set('TypeID', CONV_TYPE_DRIVER_ONLY_ID);
            conv2.TransactionGroup = group2;
            expect(await conv2.Save()).toBe(true);
            expect(await group2.Submit()).toBe(false);
            expect(events).toEqual([
                'tx:begin',
                'tx:execute',
                'driver:AfterSave:isNew=true',
                'tx:rollback',
            ]);
            expect(provider.HasRow('TestConversations', String(conv2.Get('ID')))).toBe(false);
        });
    });
});
