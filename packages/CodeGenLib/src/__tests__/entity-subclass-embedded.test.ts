/**
 * EntitySubClassGeneratorBase — embedded-record emission.
 *
 * CodeGen turns `EntityField.EmbeddedRecord` plus the row's RelatedEntityID / Name /
 * AllowsNull into `{Field}_Object` / `{Field}_EnsureObject()` on the generated class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {},
    EntityFieldInfo: class {},
    EntityRelationshipInfo: class {},
    EntityFieldValueListType: { None: 'None', List: 'List', ListOrUserEntry: 'ListOrUserEntry' },
    EntityInfo: class {},
    Metadata: class {
        EntityByID(id: string) {
            const byId: Record<string, { ID: string; Name: string; ClassName: string; SchemaName: string }> = {
                'rel-orders': { ID: id, Name: 'MJ_BizApps_Orders: Order Headers', ClassName: 'mjBizAppsOrdersOrderHeader', SchemaName: '__mj_BizAppsOrders' },
                'rel-users': { ID: id, Name: 'Users', ClassName: 'User', SchemaName: '__mj' },
                'rel-address': { ID: id, Name: 'MJ_BizApps_Common: Addresses', ClassName: 'mjBizAppsCommonAddress', SchemaName: '__mj_BizAppsCommon' },
                'rel-person': { ID: id, Name: 'MJ_BizApps_Common: People', ClassName: 'mjBizAppsCommonPerson', SchemaName: '__mj_BizAppsCommon' },
                'rel-journal': { ID: id, Name: 'MJ_BizApps_Accounting: Journals', ClassName: 'mjBizAppsAccountingJournal', SchemaName: '__mj_BizAppsAccounting' },
                'rel-unknown': { ID: id, Name: 'Unknown: Things', ClassName: 'UnknownThing', SchemaName: '__mj_BizAppsUnknown' },
                'rel-noschema': { ID: id, Name: 'No Schema', ClassName: 'NoSchema', SchemaName: '' },
                'rel-dup-common': { ID: id, Name: 'Dup From Common', ClassName: 'DupPeer', SchemaName: '__mj_BizAppsCommon' },
                'rel-dup-acct': { ID: id, Name: 'Dup From Accounting', ClassName: 'DupPeer', SchemaName: '__mj_BizAppsAccounting' },
            };
            return byId[id];
        }
        EntityByName(name: string) {
            const all = [
                { ID: 'rel-address', Name: 'MJ_BizApps_Common: Addresses', ClassName: 'mjBizAppsCommonAddress', SchemaName: '__mj_BizAppsCommon' },
                { ID: 'rel-person', Name: 'MJ_BizApps_Common: People', ClassName: 'mjBizAppsCommonPerson', SchemaName: '__mj_BizAppsCommon' },
                { ID: 'rel-journal', Name: 'MJ_BizApps_Accounting: Journals', ClassName: 'mjBizAppsAccountingJournal', SchemaName: '__mj_BizAppsAccounting' },
            ];
            return all.find((e) => e.Name === name);
        }
    },
    TypeScriptTypeFromSQLType: vi.fn(() => 'string'),
}));

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        default: {
            ...actual,
            existsSync: vi.fn().mockReturnValue(true),
            writeFileSync: vi.fn(),
        },
    };
});

vi.mock('mssql', () => ({ default: {} }));
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn(), logWarning: vi.fn() }));
vi.mock('../Database/manage-metadata', () => ({
    ValidatorResult: class {},
    ManageMetadataBase: class { static generatedValidators: unknown[] = []; },
}));
/**
 * Mirrors a publisher Open App (`bizapps-orders`): string entityPackageName + includeSchemas
 * for THIS schema, entityImportPackages for sibling apps. The previous CodeGen path used
 * resolveEntityPackageName(string) for every peer and self-imported Address from
 * `@mj-biz-apps/orders-entities`.
 */
vi.mock('../Config/config', () => ({
    mj_core_schema: '__mj',
    configInfo: {
        entityPackageName: '@mj-biz-apps/orders-entities',
        entityImportPackages: {
            '__mj_BizAppsCommon': '@mj-biz-apps/common-entities',
            '__mj_BizAppsAccounting': '@mj-biz-apps/accounting-entities',
        },
        mjCoreSchema: '__mj',
    },
    resolveEntityPackageName: () => '@mj-biz-apps/orders-entities',
    resolveEntityImportPackage: (related: string, owning: string) => {
        const r = (related ?? '').toLowerCase();
        const o = (owning ?? '').toLowerCase();
        if (r === '__mj') return '@memberjunction/core-entities';
        if (r === o) return '@mj-biz-apps/orders-entities';
        const map: Record<string, string> = {
            '__mj_bizappscommon': '@mj-biz-apps/common-entities',
            '__mj_bizappsaccounting': '@mj-biz-apps/accounting-entities',
        };
        const pkg = map[r];
        if (!pkg) {
            throw new Error(
                `[CodeGen] entity import: cannot import entity classes from schema '${related}' while generating '${owning}'`,
            );
        }
        return pkg;
    },
}));
vi.mock('./sql_logging', () => ({ SQLLogging: class {} }));
vi.mock('../Misc/util', () => ({
    makeDir: vi.fn(),
    sortBySequenceAndCreatedAt: vi.fn((items: unknown[]) => [...items]),
}));

import fs from 'fs';
import { EntitySubClassGeneratorBase, type PeerClassImport } from '../Misc/entity_subclasses_codegen';
import { logError } from '../Misc/status_logging';
import type { EntityInfo, EntityFieldInfo, EntityRelationshipInfo } from '@memberjunction/core';

function makeField(overrides: Record<string, unknown> = {}): EntityFieldInfo {
    return {
        Name: 'OrderID',
        AllowsNull: true,
        RelatedEntityID: 'rel-orders',
        EmbeddedRecord: JSON.stringify({}),
        ...overrides,
    } as unknown as EntityFieldInfo;
}

function makeEntity(fields: EntityFieldInfo[], overrides: Record<string, unknown> = {}): EntityInfo {
    return {
        Name: 'Deals',
        Fields: fields,
        ClassName: 'Deal',
        SchemaName: '__mj_BizAppsOrders',
        RelatedEntities: [],
        PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
        ...overrides,
    } as unknown as EntityInfo;
}

function makeCollection(overrides: Record<string, unknown> = {}): EntityRelationshipInfo {
    return {
        RelatedEntity: 'MJ_BizApps_Common: People',
        RelatedEntityJoinField: 'OrderHeaderID',
        RelatedEntityClassName: 'mjBizAppsCommonPerson',
        RelatedEntityID: 'rel-person',
        Type: 'One To Many',
        RelatedRecordCollection: JSON.stringify({ Name: 'People' }),
        ...overrides,
    } as unknown as EntityRelationshipInfo;
}

beforeEach(() => {
    vi.mocked(logError).mockClear();
});

describe('GenerateEmbeddedRecords — opt-in', () => {
    it('emits nothing when no field has EmbeddedRecord set', () => {
        expect(EntitySubClassGeneratorBase.GenerateEmbeddedRecords(makeEntity([]))).toBe('');
    });

    it('emits nothing when EmbeddedRecord is whitespace', () => {
        const entity = makeEntity([makeField({ EmbeddedRecord: '   ' })]);
        expect(EntitySubClassGeneratorBase.GenerateEmbeddedRecords(entity)).toBe('');
    });
});

describe('GenerateEmbeddedRecords — emission', () => {
    it('emits OrderID_Object and OrderID_EnsureObject for an opted-in FK', () => {
        const out = EntitySubClassGeneratorBase.GenerateEmbeddedRecords(makeEntity([makeField()]));
        expect(out).toContain('DeclareEmbeddedRecord<mjBizAppsOrdersOrderHeaderEntity>');
        expect(out).toContain('ForeignKeyField: \'OrderID\'');
        expect(out).toContain('RelatedEntity: \'MJ_BizApps_Orders: Order Headers\'');
        expect(out).toContain('get OrderID_Object()');
        expect(out).toContain('OrderID_EnsureObject()');
        expect(out).toContain('mjBizAppsOrdersOrderHeaderEntity | null');
    });

    it('types a required FK getter as non-null', () => {
        const out = EntitySubClassGeneratorBase.GenerateEmbeddedRecords(
            makeEntity([makeField({ AllowsNull: false })]),
        );
        expect(out).toContain('get OrderID_Object(): mjBizAppsOrdersOrderHeaderEntity');
        expect(out).not.toContain('get OrderID_Object(): mjBizAppsOrdersOrderHeaderEntity | null');
    });

    it('emits getters from CodeName when it differs from Name', () => {
        const out = EntitySubClassGeneratorBase.GenerateEmbeddedRecords(
            makeEntity([makeField({ CodeName: 'OrderID_' })]),
        );
        expect(out).toContain('get OrderID__Object()');
        expect(out).toContain('OrderID__EnsureObject()');
        expect(out).toContain('__emb_OrderID_');
        expect(out).toContain("ForeignKeyField: 'OrderID'");
    });

    it('accepts a space-named field when CodeName is a valid identifier', () => {
        const out = EntitySubClassGeneratorBase.GenerateEmbeddedRecords(
            makeEntity([makeField({ Name: 'Order ID', CodeName: 'OrderID' })]),
        );
        expect(out).toContain('get OrderID_Object()');
        expect(out).toContain("ForeignKeyField: 'Order ID'");
        expect(logError).not.toHaveBeenCalled();
    });

    it('emits OnClear and LoadNested when set', () => {
        const out = EntitySubClassGeneratorBase.GenerateEmbeddedRecords(
            makeEntity([makeField({ EmbeddedRecord: JSON.stringify({ OnClear: 'delete', LoadNested: 'related' }) })]),
        );
        expect(out).toContain("OnClear: 'delete'");
        expect(out).toContain("LoadNested: 'related'");
    });
});

describe('GenerateEmbeddedRecords — invalid metadata is skipped', () => {
    it('skips malformed JSON', () => {
        const out = EntitySubClassGeneratorBase.GenerateEmbeddedRecords(
            makeEntity([makeField({ EmbeddedRecord: '{not-json' })]),
        );
        expect(out).toBe('');
        expect(logError).toHaveBeenCalled();
    });

    it('skips an unknown OnClear', () => {
        const out = EntitySubClassGeneratorBase.GenerateEmbeddedRecords(
            makeEntity([makeField({ EmbeddedRecord: JSON.stringify({ OnClear: 'explode' }) })]),
        );
        expect(out).toBe('');
        expect(logError).toHaveBeenCalled();
    });

    it('skips a field with no RelatedEntityID', () => {
        const out = EntitySubClassGeneratorBase.GenerateEmbeddedRecords(
            makeEntity([makeField({ RelatedEntityID: null })]),
        );
        expect(out).toBe('');
        expect(logError).toHaveBeenCalled();
    });
});

describe('CollectPeerClassImports — Orders Address use case (the production failure)', () => {
    const addressField = (name: string) =>
        makeField({
            Name: name,
            RelatedEntityID: 'rel-address',
            EmbeddedRecord: JSON.stringify({ OnClear: 'orphan' }),
        });

    const orderHeader = (extra: Record<string, unknown> = {}) =>
        makeEntity([addressField('BillToAddressID'), addressField('ShipToAddressID')], {
            Name: 'MJ_BizApps_Orders: Order Headers',
            ClassName: 'mjBizAppsOrdersOrderHeader',
            SchemaName: '__mj_BizAppsOrders',
            ...extra,
        });

    it('imports Address once from @mj-biz-apps/common-entities, never from orders-entities', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            orderHeader(),
            new Set(['mjBizAppsOrdersOrderHeaderEntity']),
        );
        expect(peers).toEqual([
            { className: 'mjBizAppsCommonAddressEntity', packageName: '@mj-biz-apps/common-entities' },
        ]);
        const statements = EntitySubClassGeneratorBase.FormatPeerImportStatements(peers);
        expect(statements).toEqual([
            "import { mjBizAppsCommonAddressEntity } from '@mj-biz-apps/common-entities';\n",
        ]);
        expect(statements.join('')).not.toContain('@mj-biz-apps/orders-entities');
    });

    it('does not import Address when that class is already being generated in this file', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            orderHeader(),
            new Set(['mjBizAppsOrdersOrderHeaderEntity', 'mjBizAppsCommonAddressEntity']),
        );
        expect(peers).toEqual([]);
    });

    it('throws when the foreign schema is unmapped — the previous silent self-import path', () => {
        expect(() =>
            EntitySubClassGeneratorBase.CollectPeerClassImports(
                makeEntity([makeField({ Name: 'ThingID', RelatedEntityID: 'rel-unknown' })]),
                new Set(['DealEntity']),
            ),
        ).toThrow(/entity import: cannot import entity classes from schema '__mj_BizAppsUnknown'/);
    });

    it('throws when the owning entity has no SchemaName', () => {
        expect(() =>
            EntitySubClassGeneratorBase.CollectPeerClassImports(
                makeEntity([addressField('BillToAddressID')], { SchemaName: '' }),
                new Set(['DealEntity']),
            ),
        ).toThrow(/has no SchemaName/);
    });
});

describe('CollectPeerClassImports — core, local skip, collections, grouping', () => {
    it('imports a core-schema peer from @memberjunction/core-entities', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            makeEntity([makeField({ Name: 'UserID', RelatedEntityID: 'rel-users' })]),
            new Set(['DealEntity']),
        );
        expect(peers).toEqual([{ className: 'UserEntity', packageName: '@memberjunction/core-entities' }]);
        expect(EntitySubClassGeneratorBase.FormatPeerImportStatements(peers).join('')).not.toContain('mj_generatedentities');
        expect(EntitySubClassGeneratorBase.FormatPeerImportStatements(peers).join('')).not.toContain('@mj-biz-apps/orders-entities');
    });

    it('does not import a same-file peer (Orders Order Header embed of another Orders class)', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            makeEntity([makeField()]),
            new Set(['DealEntity', 'mjBizAppsOrdersOrderHeaderEntity']),
        );
        expect(peers).toEqual([]);
    });

    it('same-schema peer not in this file imports from this emit\'s package (not a self-import of a foreign schema)', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            makeEntity([makeField()]),
            new Set(['DealEntity']),
        );
        expect(peers).toEqual([
            { className: 'mjBizAppsOrdersOrderHeaderEntity', packageName: '@mj-biz-apps/orders-entities' },
        ]);
    });

    it('collects a related-record collection peer from a foreign schema', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            makeEntity([], { RelatedEntities: [makeCollection()] }),
            new Set(['DealEntity']),
        );
        expect(peers).toEqual([
            { className: 'mjBizAppsCommonPersonEntity', packageName: '@mj-biz-apps/common-entities' },
        ]);
    });

    it('skips a collection whose class is already in this file', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            makeEntity([], { RelatedEntities: [makeCollection()] }),
            new Set(['DealEntity', 'mjBizAppsCommonPersonEntity']),
        );
        expect(peers).toEqual([]);
    });

    it('does not import a collection that falls back to BaseEntity (no RelatedEntityClassName)', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            makeEntity([], {
                RelatedEntities: [makeCollection({ RelatedEntityClassName: '' })],
            }),
            new Set(['DealEntity']),
        );
        expect(peers).toEqual([]);
    });

    it('resolves a collection peer via EntityByName when RelatedEntityID is missing', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            makeEntity([], {
                RelatedEntities: [makeCollection({ RelatedEntityID: null })],
            }),
            new Set(['DealEntity']),
        );
        expect(peers).toEqual([
            { className: 'mjBizAppsCommonPersonEntity', packageName: '@mj-biz-apps/common-entities' },
        ]);
    });

    it('throws when the related entity has no SchemaName', () => {
        expect(() =>
            EntitySubClassGeneratorBase.CollectPeerClassImports(
                makeEntity([makeField({ Name: 'XID', RelatedEntityID: 'rel-noschema' })]),
                new Set(['DealEntity']),
            ),
        ).toThrow(/has no SchemaName/);
    });

    it('throws when the same class name resolves to two different packages', () => {
        expect(() =>
            EntitySubClassGeneratorBase.CollectPeerClassImports(
                makeEntity([
                    makeField({ Name: 'A', RelatedEntityID: 'rel-dup-common' }),
                    makeField({ Name: 'B', RelatedEntityID: 'rel-dup-acct' }),
                ]),
                new Set(['DealEntity']),
            ),
        ).toThrow(/resolved to both/);
    });

    it('skips a collection whose RelatedRecordCollection JSON is invalid', () => {
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(
            makeEntity([], {
                RelatedEntities: [makeCollection({ RelatedRecordCollection: '{not-json' })],
            }),
            new Set(['DealEntity']),
        );
        expect(peers).toEqual([]);
        expect(logError).toHaveBeenCalled();
    });

    it('groups embeds + collections from the same package onto one import line, core-entities first', () => {
        const entity = makeEntity(
            [
                makeField({ Name: 'UserID', RelatedEntityID: 'rel-users' }),
                makeField({ Name: 'BillToAddressID', RelatedEntityID: 'rel-address' }),
                makeField({ Name: 'JournalID', RelatedEntityID: 'rel-journal' }),
            ],
            { RelatedEntities: [makeCollection()] },
        );
        const peers = EntitySubClassGeneratorBase.CollectPeerClassImports(entity, new Set(['DealEntity']));
        const statements = EntitySubClassGeneratorBase.FormatPeerImportStatements(peers);
        expect(statements[0]).toBe("import { UserEntity } from '@memberjunction/core-entities';\n");
        expect(statements).toContain(
            "import { mjBizAppsAccountingJournalEntity } from '@mj-biz-apps/accounting-entities';\n",
        );
        expect(statements).toContain(
            "import { mjBizAppsCommonAddressEntity, mjBizAppsCommonPersonEntity } from '@mj-biz-apps/common-entities';\n",
        );
        expect(statements).toHaveLength(3);
    });
});

describe('FormatPeerImportStatements', () => {
    it('de-duplicates class names within a package and sorts them', () => {
        const imports: PeerClassImport[] = [
            { className: 'BEntity', packageName: '@pkg/a' },
            { className: 'AEntity', packageName: '@pkg/a' },
            { className: 'BEntity', packageName: '@pkg/a' },
        ];
        expect(EntitySubClassGeneratorBase.FormatPeerImportStatements(imports)).toEqual([
            "import { AEntity, BEntity } from '@pkg/a';\n",
        ]);
    });

    it('returns no statements for an empty list', () => {
        expect(EntitySubClassGeneratorBase.FormatPeerImportStatements([])).toEqual([]);
    });

    it('emits @memberjunction/core-entities first even when it is not alphabetically first', () => {
        const statements = EntitySubClassGeneratorBase.FormatPeerImportStatements([
            { className: 'ZEntity', packageName: '@zzz/z' },
            { className: 'UserEntity', packageName: '@memberjunction/core-entities' },
            { className: 'AEntity', packageName: '@aaa/a' },
        ]);
        expect(statements[0]).toBe("import { UserEntity } from '@memberjunction/core-entities';\n");
        expect(statements[1]).toBe("import { AEntity } from '@aaa/a';\n");
        expect(statements[2]).toBe("import { ZEntity } from '@zzz/z';\n");
    });
});

describe('generateAllEntitySubClasses — Orders Address use case', () => {
    function orderHeaderEntity(): Record<string, unknown> {
        const pk = {
            Name: 'ID',
            CodeName: 'ID',
            Type: 'uniqueidentifier',
            SQLFullType: 'uniqueidentifier',
            AllowsNull: false,
            ReadOnly: false,
            IsPrimaryKey: true,
            AutoIncrement: false,
            IsVirtual: false,
            AllowUpdateAPI: true,
            ValueListType: '',
            ValueListTypeEnum: 0,
            EntityFieldValues: [],
            Status: 'Active',
            NeedsQuotes: true,
        };
        const address = (name: string) => ({
            Name: name,
            CodeName: name,
            Type: 'uniqueidentifier',
            SQLFullType: 'uniqueidentifier',
            AllowsNull: true,
            ReadOnly: false,
            IsPrimaryKey: false,
            AutoIncrement: false,
            IsVirtual: false,
            AllowUpdateAPI: true,
            ValueListType: '',
            ValueListTypeEnum: 0,
            EntityFieldValues: [],
            Status: 'Active',
            NeedsQuotes: true,
            RelatedEntityID: 'rel-address',
            EmbeddedRecord: JSON.stringify({ OnClear: 'orphan' }),
        });
        return {
            Name: 'MJ_BizApps_Orders: Order Headers',
            ClassName: 'mjBizAppsOrdersOrderHeader',
            SchemaName: '__mj_BizAppsOrders',
            PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
            Fields: [pk, address('BillToAddressID'), address('ShipToAddressID')],
            RelatedEntities: [],
            EntityObjectSubclassName: '',
            EntityObjectSubclassImport: '',
            ExternalDataSourceID: null,
            AllowDeleteAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            CascadeDeletes: false,
            IsChildType: false,
            Status: 'Active',
            BaseTable: 'OrderHeader',
            BaseView: 'vwOrderHeaders',
            Description: '',
        };
    }

    it('emits a grouped common-entities import, not a self-import of orders-entities', async () => {
        const writeMock = vi.mocked(fs.writeFileSync);
        writeMock.mockClear();
        const generator = new EntitySubClassGeneratorBase();
        const ok = await generator.generateAllEntitySubClasses(
            {} as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[0],
            [orderHeaderEntity()] as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[1],
            '/out',
            true,
        );
        expect(ok).toBe(true);
        const call = writeMock.mock.calls.find((c) => String(c[0]).endsWith('entity_subclasses.ts'));
        expect(call).toBeTruthy();
        const content = String(call![1]);
        expect(content).toContain("import { mjBizAppsCommonAddressEntity } from '@mj-biz-apps/common-entities';");
        expect(content).not.toMatch(
            /import \{[^}]*mjBizAppsCommonAddressEntity[^}]*\} from '@mj-biz-apps\/orders-entities'/,
        );
        expect(content).toContain('DeclareEmbeddedRecord<mjBizAppsCommonAddressEntity>');
        expect(content).toContain('BillToAddressID_Object');
        expect(content).toContain('ShipToAddressID_Object');
    });

    it('returns false (fails CodeGen) when a foreign embed schema is unmapped', async () => {
        const generator = new EntitySubClassGeneratorBase();
        const entity = orderHeaderEntity();
        (entity.Fields as Array<Record<string, unknown>>)[1].RelatedEntityID = 'rel-unknown';
        const ok = await generator.generateAllEntitySubClasses(
            {} as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[0],
            [entity] as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[1],
            '/out',
            true,
        );
        expect(ok).toBe(false);
        expect(logError).toHaveBeenCalled();
        const logged = vi.mocked(logError).mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toMatch(/entity import: cannot import entity classes from schema '__mj_BizAppsUnknown'/);
    });

    it('groups Address from two owners in the same file onto one import line', async () => {
        const writeMock = vi.mocked(fs.writeFileSync);
        writeMock.mockClear();
        const second = {
            ...orderHeaderEntity(),
            Name: 'MJ_BizApps_Orders: Shipments',
            ClassName: 'mjBizAppsOrdersShipment',
            BaseTable: 'Shipment',
            BaseView: 'vwShipments',
        };
        const generator = new EntitySubClassGeneratorBase();
        const ok = await generator.generateAllEntitySubClasses(
            {} as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[0],
            [orderHeaderEntity(), second] as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[1],
            '/out',
            true,
        );
        expect(ok).toBe(true);
        const content = String(writeMock.mock.calls.find((c) => String(c[0]).endsWith('entity_subclasses.ts'))![1]);
        const matches = content.match(/import \{ mjBizAppsCommonAddressEntity \} from '@mj-biz-apps\/common-entities';/g) || [];
        expect(matches.length).toBe(1);
    });

    it('core-like file: same-schema collection already in localClassNames emits no peer import', async () => {
        const writeMock = vi.mocked(fs.writeFileSync);
        writeMock.mockClear();
        const pk = {
            Name: 'ID',
            CodeName: 'ID',
            Type: 'uniqueidentifier',
            SQLFullType: 'uniqueidentifier',
            AllowsNull: false,
            ReadOnly: false,
            IsPrimaryKey: true,
            AutoIncrement: false,
            IsVirtual: false,
            AllowUpdateAPI: true,
            ValueListType: '',
            ValueListTypeEnum: 0,
            EntityFieldValues: [],
            Status: 'Active',
            NeedsQuotes: true,
        };
        const action = {
            Name: 'Actions',
            ClassName: 'Action',
            SchemaName: '__mj',
            PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
            Fields: [pk],
            RelatedEntities: [
                {
                    RelatedEntity: 'Action Params',
                    RelatedEntityJoinField: 'ActionID',
                    RelatedEntityClassName: 'ActionParam',
                    RelatedEntityID: 'rel-orders',
                    Type: 'One To Many',
                    RelatedRecordCollection: JSON.stringify({ Name: 'Params' }),
                },
            ],
            EntityObjectSubclassName: '',
            EntityObjectSubclassImport: '',
            ExternalDataSourceID: null,
            AllowDeleteAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            CascadeDeletes: false,
            IsChildType: false,
            Status: 'Active',
            BaseTable: 'Action',
            BaseView: 'vwActions',
            Description: '',
        };
        const param = {
            ...action,
            Name: 'Action Params',
            ClassName: 'ActionParam',
            BaseTable: 'ActionParam',
            BaseView: 'vwActionParams',
            RelatedEntities: [],
        };
        const generator = new EntitySubClassGeneratorBase();
        const ok = await generator.generateAllEntitySubClasses(
            {} as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[0],
            [action, param] as Parameters<EntitySubClassGeneratorBase['generateAllEntitySubClasses']>[1],
            '/out',
            true,
        );
        expect(ok).toBe(true);
        const content = String(writeMock.mock.calls.find((c) => String(c[0]).endsWith('entity_subclasses.ts'))![1]);
        expect(content).toContain('DeclareRelatedRecords<ActionParamEntity>');
        expect(content).not.toMatch(/import \{[^}]*ActionParamEntity[^}]*\} from /);
    });
});
