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
            if (id === 'rel-orders') {
                return { ID: id, Name: 'MJ_BizApps_Orders: Order Headers', ClassName: 'mjBizAppsOrdersOrderHeader', SchemaName: '__mj_BizAppsOrders' };
            }
            if (id === 'rel-users') {
                return { ID: id, Name: 'Users', ClassName: 'User', SchemaName: '__mj' };
            }
            return undefined;
        }
    },
    TypeScriptTypeFromSQLType: vi.fn(() => 'string'),
}));

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return { ...actual, default: { ...actual, existsSync: vi.fn().mockReturnValue(true) } };
});

vi.mock('mssql', () => ({ default: {} }));
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));
vi.mock('../Database/manage-metadata', () => ({
    ValidatorResult: class {},
    ManageMetadataBase: class { static generatedValidators: unknown[] = []; },
}));
vi.mock('../Config/config', () => ({
    mj_core_schema: '__mj',
    configInfo: {},
    resolveEntityPackageName: (schema: string) =>
        schema === '__mj_BizAppsOrders' ? '@mj-biz-apps/orders-entities' : 'mj_generatedentities',
}));
vi.mock('./sql_logging', () => ({ SQLLogging: class {} }));
vi.mock('../Misc/util', () => ({
    makeDir: vi.fn(),
    sortBySequenceAndCreatedAt: vi.fn((items: unknown[]) => [...items]),
}));

import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';
import { logError } from '../Misc/status_logging';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';

function makeField(overrides: Record<string, unknown> = {}): EntityFieldInfo {
    return {
        Name: 'OrderID',
        AllowsNull: true,
        RelatedEntityID: 'rel-orders',
        EmbeddedRecord: JSON.stringify({}),
        ...overrides,
    } as unknown as EntityFieldInfo;
}

function makeEntity(fields: EntityFieldInfo[]): EntityInfo {
    return { Name: 'Deals', Fields: fields, ClassName: 'Deal' } as unknown as EntityInfo;
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

describe('CollectEmbeddedImports', () => {
    it('imports a peer that is not in the current generated file', () => {
        const imports = EntitySubClassGeneratorBase.CollectEmbeddedImports(
            makeEntity([makeField()]),
            new Set(['DealEntity']),
        );
        expect(imports.some(s => s.includes('@mj-biz-apps/orders-entities'))).toBe(true);
        expect(imports.some(s => s.includes('mjBizAppsOrdersOrderHeaderEntity'))).toBe(true);
    });

    it('does not import a peer already being generated in this file', () => {
        const imports = EntitySubClassGeneratorBase.CollectEmbeddedImports(
            makeEntity([makeField()]),
            new Set(['mjBizAppsOrdersOrderHeaderEntity']),
        );
        expect(imports).toEqual([]);
    });

    it('imports a core-schema peer from @memberjunction/core-entities', () => {
        const imports = EntitySubClassGeneratorBase.CollectEmbeddedImports(
            makeEntity([makeField({ Name: 'UserID', RelatedEntityID: 'rel-users' })]),
            new Set(['DealEntity']),
        );
        expect(imports.some(s => s.includes("@memberjunction/core-entities"))).toBe(true);
        expect(imports.some(s => s.includes('UserEntity'))).toBe(true);
        expect(imports.some(s => s.includes('mj_generatedentities'))).toBe(false);
    });
});
