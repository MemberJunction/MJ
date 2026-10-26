import { describe, it, expect } from 'vitest';
import {
    EntityInfo,
    IMetadataProvider,
    IRunViewProvider,
    UserInfo,
    ValidationResult,
} from '@memberjunction/core';
import { SQLParser } from '@memberjunction/sql-parser';
import { GetDialect } from '@memberjunction/sql-dialect';
import { MJEntityAlternateBaseViewEntityServer } from '../custom/MJEntityAlternateBaseViewEntityServer.server';
import { ExtractEntityMetadataFromSQL } from '../custom/query-extraction/resolve';
import { SyncEntities } from '../custom/query-extraction/sync';

const ENTITY_MEMBERS_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ORDERS_ID = '22222222-2222-4222-8222-222222222222';
const ABV_ACTIVE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ABV_LAPSED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ABV_NEW_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function createFixtureEntities(): { members: EntityInfo; orders: EntityInfo } {
    const members = new EntityInfo({
        ID: ENTITY_MEMBERS_ID,
        Name: 'Members',
        SchemaName: 'crm',
        BaseTable: 'Member',
        BaseView: 'vwMembers',
        Fields: [
            { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f2', Name: 'Status', Type: 'nvarchar', IsPrimaryKey: false },
            { ID: 'f3', Name: 'Email', Type: 'nvarchar', IsPrimaryKey: false },
        ],
        EntityAlternateBaseViews: [
            {
                ID: ABV_ACTIVE_ID,
                EntityID: ENTITY_MEMBERS_ID,
                Name: 'Active Members',
                DisplayName: 'Active Members',
                ViewName: 'vwActiveMembers',
                SchemaName: null,
                Description: 'Members with Status = Active',
                Status: 'Active',
                CachePolicy: 'Default',
                Sequence: 1,
                ParentID: null,
            },
            {
                ID: ABV_LAPSED_ID,
                EntityID: ENTITY_MEMBERS_ID,
                Name: 'Lapsed Members',
                DisplayName: 'Lapsed Members',
                ViewName: 'vwLapsedMembers',
                SchemaName: null,
                Description: 'Members with Status = Lapsed',
                Status: 'Active',
                CachePolicy: 'Default',
                Sequence: 2,
                ParentID: null,
            },
        ],
    });

    const orders = new EntityInfo({
        ID: ENTITY_ORDERS_ID,
        Name: 'Orders',
        SchemaName: 'crm',
        BaseTable: 'Order',
        BaseView: 'vwOrders',
        Fields: [
            { ID: 'o1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        ],
        EntityAlternateBaseViews: [],
    });

    return { members, orders };
}

interface FakeAbvShape {
    ID: string;
    EntityID: string;
    Name: string;
    ViewName: string;
    SchemaName: string | null;
    ParentID: string | null;
    ProviderToUse: { Entities: EntityInfo[] };
    Validate(): ValidationResult;
    tryAutoPopulateParentIDFromAST(viewDefinitionSQL: string): void;
}

function createFakeAbvServer(
    entities: EntityInfo[],
    props: Partial<Omit<FakeAbvShape, 'ProviderToUse' | 'Validate' | 'tryAutoPopulateParentIDFromAST'>>
): FakeAbvShape {
    const instance = Object.create(MJEntityAlternateBaseViewEntityServer.prototype) as FakeAbvShape;
    Object.defineProperties(instance, {
        ID: { value: props.ID ?? ABV_NEW_ID, writable: true, configurable: true },
        EntityID: { value: props.EntityID ?? ENTITY_MEMBERS_ID, writable: true, configurable: true },
        Name: { value: props.Name ?? 'Active Members With Dues', writable: true, configurable: true },
        ViewName: { value: props.ViewName ?? 'vwActiveMembersWithDues', writable: true, configurable: true },
        SchemaName: { value: props.SchemaName ?? null, writable: true, configurable: true },
        ParentID: { value: props.ParentID ?? null, writable: true, configurable: true },
        ProviderToUse: { value: { Entities: entities }, writable: true, configurable: true },
    });
    // Stub Fields array and HasCompanions so BaseEntity.Validate runs cleanly
    Object.defineProperty(instance, 'Fields', { value: [], configurable: true });
    Object.defineProperty(instance, 'HasCompanions', { value: false, configurable: true });
    return instance;
}

describe('MJEntityAlternateBaseViewEntityServer validation & AST inference', () => {
    it('accepts a valid alternate base view registration', () => {
        const { members, orders } = createFixtureEntities();
        const abv = createFakeAbvServer([members, orders], {});
        const result = abv.Validate();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('rejects Name containing | or :', () => {
        const { members, orders } = createFixtureEntities();
        const abvPipe = createFakeAbvServer([members, orders], { Name: 'Active|Members' });
        const resPipe = abvPipe.Validate();
        expect(resPipe.Success).toBe(false);
        expect(resPipe.Errors.some(e => e.Source === 'Name')).toBe(true);

        const abvColon = createFakeAbvServer([members, orders], { Name: 'abv:Active' });
        const resColon = abvColon.Validate();
        expect(resColon.Success).toBe(false);
        expect(resColon.Errors.some(e => e.Source === 'Name')).toBe(true);
    });

    it('rejects invalid SQL identifiers in ViewName and SchemaName', () => {
        const { members, orders } = createFixtureEntities();
        const abv = createFakeAbvServer([members, orders], {
            ViewName: 'crm.vwBadView',
            SchemaName: '[bad schema]',
        });
        const result = abv.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.some(e => e.Source === 'ViewName')).toBe(true);
        expect(result.Errors.some(e => e.Source === 'SchemaName')).toBe(true);
    });

    it('rejects ViewName colliding with another entity BaseView or BaseTable or existing AlternateBaseView', () => {
        const { members, orders } = createFixtureEntities();

        // Collides with Orders.BaseView ('vwOrders' in 'crm')
        const collideBaseView = createFakeAbvServer([members, orders], {
            ViewName: 'vwOrders',
        });
        const res1 = collideBaseView.Validate();
        expect(res1.Success).toBe(false);
        expect(res1.Errors.some(e => e.Message.includes('Orders'))).toBe(true);

        // Collides with existing ABV on Members ('vwActiveMembers')
        const collideExistingAbv = createFakeAbvServer([members, orders], {
            EntityID: ENTITY_ORDERS_ID,
            Name: 'Active Orders Alias',
            ViewName: 'vwActiveMembers',
        });
        const res2 = collideExistingAbv.Validate();
        expect(res2.Success).toBe(false);
        expect(res2.Errors.some(e => e.Message.includes('Active Members'))).toBe(true);
    });

    it('validates ParentID: rejects self-reference and cross-entity parent, accepts same-entity parent', () => {
        const { members, orders } = createFixtureEntities();

        // Self-reference
        const selfRef = createFakeAbvServer([members, orders], {
            ID: ABV_NEW_ID,
            ParentID: ABV_NEW_ID,
        });
        const resSelf = selfRef.Validate();
        expect(resSelf.Success).toBe(false);
        expect(resSelf.Errors.some(e => e.Source === 'ParentID')).toBe(true);

        // Cross-entity parent (Orders ABV referencing Members ABV)
        const crossEntity = createFakeAbvServer([members, orders], {
            EntityID: ENTITY_ORDERS_ID,
            ParentID: ABV_ACTIVE_ID,
        });
        const resCross = crossEntity.Validate();
        expect(resCross.Success).toBe(false);
        expect(resCross.Errors.some(e => e.Source === 'ParentID' && e.Message.includes('Members'))).toBe(true);

        // Valid same-entity parent
        const validParent = createFakeAbvServer([members, orders], {
            EntityID: ENTITY_MEMBERS_ID,
            ParentID: ABV_ACTIVE_ID,
        });
        const resValid = validParent.Validate();
        expect(resValid.Success).toBe(true);
    });

    it('auto-populates ParentID from SQL view definition AST when referencing a single sibling alternate base view', () => {
        const { members, orders } = createFixtureEntities();
        const derived = createFakeAbvServer([members, orders], {});
        expect(derived.ParentID).toBeNull();
        derived.TryAutoPopulateParentIDFromAST(
            'CREATE VIEW [crm].[vwActiveMembersWithDues] AS SELECT m.* FROM [crm].[vwActiveMembers] m WHERE m.Email IS NOT NULL'
        );
        expect(derived.ParentID).toBe(ABV_ACTIVE_ID);
    });
});

describe('Query extraction & SyncEntities with Alternate Base Views', () => {
    it('ExtractEntityMetadataFromSQL identifies both canonical BaseView and AlternateBaseView references', () => {
        const { members, orders } = createFixtureEntities();
        const sql = `
            SELECT a.ID, a.Email, m.Status
            FROM [crm].[vwActiveMembers] a
            INNER JOIN [crm].[vwMembers] m ON m.ID = a.ID
        `;
        const tableRefs = SQLParser.ExtractTableRefs(sql, GetDialect('sqlserver'));
        const extracted = ExtractEntityMetadataFromSQL(sql, tableRefs, {
            Entities: [members, orders],
        });

        expect(extracted).toHaveLength(2);
        const abvEntry = extracted.find(e => e.AlternateBaseViewID === ABV_ACTIVE_ID);
        const canonicalEntry = extracted.find(e => e.AlternateBaseViewID === null);
        expect(abvEntry).toBeDefined();
        expect(abvEntry?.AlternateBaseViewName).toBe('Active Members');
        expect(abvEntry?.BaseView).toBe('vwActiveMembers');
        expect(canonicalEntry).toBeDefined();
        expect(canonicalEntry?.BaseView).toBe('vwMembers');
    });

    it('SyncEntities keys on (EntityID, AlternateBaseViewID) and persists both rows when a query joins both', async () => {
        const { members, orders } = createFixtureEntities();
        const savedRows: Array<{ QueryID: string; EntityID: string; AlternateBaseViewID: string | null }> = [];

        const fakeMetadataProvider = {
            Entities: [members, orders],
            GetEntityObject: async () => {
                const record = {
                    QueryID: '',
                    EntityID: '',
                    AlternateBaseViewID: null as string | null,
                    DetectionMethod: 'AI',
                    AutoDetectConfidenceScore: 1.0,
                    Save: async () => {
                        savedRows.push({
                            QueryID: record.QueryID,
                            EntityID: record.EntityID,
                            AlternateBaseViewID: record.AlternateBaseViewID,
                        });
                        return true;
                    },
                };
                return record;
            },
        } as unknown as IMetadataProvider;

        const fakeRunViewProvider = {
            RunView: async () => ({ Success: true, Results: [] }),
        } as unknown as IRunViewProvider;

        const fakeUser = { ID: 'u1' } as unknown as UserInfo;

        await SyncEntities(
            'query-1',
            [
                {
                    name: 'Members',
                    SchemaName: 'crm',
                    BaseView: 'vwActiveMembers',
                    Fields: [{ name: 'ID', type: 'uniqueidentifier', isPrimaryKey: true }],
                    AlternateBaseViewID: ABV_ACTIVE_ID,
                    AlternateBaseViewName: 'Active Members',
                },
                {
                    name: 'Members',
                    SchemaName: 'crm',
                    BaseView: 'vwMembers',
                    Fields: [{ name: 'ID', type: 'uniqueidentifier', isPrimaryKey: true }],
                    AlternateBaseViewID: null,
                    AlternateBaseViewName: null,
                },
            ],
            fakeUser,
            fakeMetadataProvider,
            fakeRunViewProvider,
            true
        );

        expect(savedRows).toHaveLength(2);
        expect(savedRows.some(r => r.EntityID === ENTITY_MEMBERS_ID && r.AlternateBaseViewID === ABV_ACTIVE_ID)).toBe(true);
        expect(savedRows.some(r => r.EntityID === ENTITY_MEMBERS_ID && r.AlternateBaseViewID === null)).toBe(true);
    });
});
