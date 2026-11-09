import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityFieldInfo, EntityInfo } from '../generic/entityInfo';
import { FieldSecurityError } from '../generic/fieldSecuritySQLGate';
import { CompositeFilter } from '../generic/filters/compositeFilter';
import {
    CanonicalCompositeFilterKey,
    CompositeFilterSQLCompiler,
} from '../generic/filters/compositeFilterSQL';
import { FilterOf } from '../generic/filters/filterBuilder';
import type { CompositeFilterDescriptor } from '../generic/filters/filter.types';
import {
    ComputeTypedQuerySignature,
    DefineTypedQuery,
    GetTypedQueryDriftMode,
    ResetTypedQueryDriftWarnings,
    SetTypedQueryDriftMode,
    SetTypedQueryRowValidation,
    TypedQueryDriftError,
} from '../generic/typedQuery';
import type { IMetadataProvider, IRunQueryProvider, RunQueryResult } from '../generic/interfaces';
import type { QueryInfo } from '../generic/queryInfo';
import { UserInfo } from '../generic/securityInfo';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { BaseEntityEvent } from '../generic/interfaces';
import { LocalCacheManager } from '../generic/localCacheManager';
import * as loggingModule from '../generic/logging';

interface OrderFixtureRow {
    ID: string;
    Status: string | null;
    Total: number | null;
    Region: string | null;
    IsPriority: boolean | null;
    OrderedAt: Date | null;
    Notes: string | null;
}

function makeField(init: {
    Name: string;
    TSType: 'string' | 'number' | 'boolean' | 'Date';
    Type: string;
    AllowsNull?: boolean;
}): EntityFieldInfo {
    const f = new EntityFieldInfo({
        ID: `field-${init.Name}`,
        Name: init.Name,
        Sequence: 1,
        Type: init.Type,
        AllowsNull: init.AllowsNull ?? true,
    });
    Object.defineProperty(f, 'TSType', { value: init.TSType, configurable: true });
    return f;
}

function makeOrderEntity(): EntityInfo {
    const entity = new EntityInfo({
        ID: 'entity-orders',
        Name: 'Orders',
        BaseTable: 'Order',
        BaseView: 'vwOrders',
        SchemaName: 'sales',
    });
    const fields = [
        makeField({ Name: 'ID', TSType: 'string', Type: 'uniqueidentifier', AllowsNull: false }),
        makeField({ Name: 'Status', TSType: 'string', Type: 'nvarchar' }),
        makeField({ Name: 'Total', TSType: 'number', Type: 'decimal' }),
        makeField({ Name: 'Region', TSType: 'string', Type: 'nvarchar' }),
        makeField({ Name: 'IsPriority', TSType: 'boolean', Type: 'bit' }),
        makeField({ Name: 'OrderedAt', TSType: 'Date', Type: 'datetimeoffset' }),
        makeField({ Name: 'Notes', TSType: 'string', Type: 'nvarchar' }),
        makeField({ Name: 'InternalCost', TSType: 'number', Type: 'decimal' }),
    ];
    Object.defineProperty(entity, '_fields', { value: fields, writable: true, configurable: true });
    return entity;
}

describe('CompositeFilter.Evaluate — new & aligned operators', () => {
    it('evaluates in and notin operators (including case-insensitive string matching)', () => {
        const inFilter = new CompositeFilter({
            logic: 'and',
            filters: [{ field: 'Status', operator: 'in', value: ['Active', 'Pending'] }],
        });
        expect(inFilter.Evaluate({ '': { Status: 'active' } })).toBe(true);
        expect(inFilter.Evaluate({ '': { Status: 'Pending' } })).toBe(true);
        expect(inFilter.Evaluate({ '': { Status: 'Cancelled' } })).toBe(false);
        expect(inFilter.Evaluate({ '': { Status: null } })).toBe(false);

        const notInFilter = new CompositeFilter({
            logic: 'and',
            filters: [{ field: 'Status', operator: 'notin', value: ['Cancelled', 'Archived'] }],
        });
        expect(notInFilter.Evaluate({ '': { Status: 'Active' } })).toBe(true);
        expect(notInFilter.Evaluate({ '': { Status: 'cancelled' } })).toBe(false);
        expect(notInFilter.Evaluate({ '': { Status: null } })).toBe(false);
    });

    it('evaluates between operator inclusively for numbers, dates, and strings', () => {
        const numBetween = new CompositeFilter({
            logic: 'and',
            filters: [{ field: 'Total', operator: 'between', value: [100, 500] }],
        });
        expect(numBetween.Evaluate({ '': { Total: 100 } })).toBe(true);
        expect(numBetween.Evaluate({ '': { Total: 250 } })).toBe(true);
        expect(numBetween.Evaluate({ '': { Total: 500 } })).toBe(true);
        expect(numBetween.Evaluate({ '': { Total: 99.99 } })).toBe(false);
        expect(numBetween.Evaluate({ '': { Total: 500.01 } })).toBe(false);
        expect(numBetween.Evaluate({ '': { Total: null } })).toBe(false);

        const dateBetween = new CompositeFilter({
            logic: 'and',
            filters: [
                {
                    field: 'OrderedAt',
                    operator: 'between',
                    value: ['2026-01-01T00:00:00.000Z', '2026-06-30T23:59:59.000Z'],
                },
            ],
        });
        expect(dateBetween.Evaluate({ '': { OrderedAt: new Date('2026-03-15T12:00:00.000Z') } })).toBe(true);
        expect(dateBetween.Evaluate({ '': { OrderedAt: new Date('2025-12-31T23:59:59.000Z') } })).toBe(false);
    });

    it('treats isempty as NULL or empty string and isnull as NULL only', () => {
        const isNullFilter = new CompositeFilter({
            logic: 'and',
            filters: [{ field: 'Notes', operator: 'isnull', value: null }],
        });
        const isEmptyFilter = new CompositeFilter({
            logic: 'and',
            filters: [{ field: 'Notes', operator: 'isempty', value: null }],
        });
        const isNotEmptyFilter = new CompositeFilter({
            logic: 'and',
            filters: [{ field: 'Notes', operator: 'isnotempty', value: null }],
        });

        expect(isNullFilter.Evaluate({ '': { Notes: null } })).toBe(true);
        expect(isNullFilter.Evaluate({ '': { Notes: '' } })).toBe(false);

        expect(isEmptyFilter.Evaluate({ '': { Notes: null } })).toBe(true);
        expect(isEmptyFilter.Evaluate({ '': { Notes: '' } })).toBe(true);
        expect(isEmptyFilter.Evaluate({ '': { Notes: 'abc' } })).toBe(false);

        expect(isNotEmptyFilter.Evaluate({ '': { Notes: 'abc' } })).toBe(true);
        expect(isNotEmptyFilter.Evaluate({ '': { Notes: '' } })).toBe(false);
        expect(isNotEmptyFilter.Evaluate({ '': { Notes: null } })).toBe(false);
    });
});

describe('CompositeFilterSQLCompiler', () => {
    const entity = makeOrderEntity();
    const f = FilterOf<OrderFixtureRow>();

    it('compiles parameterized SQL Server and PostgreSQL predicates across operators', () => {
        const filter = f.And(
            f.Eq('Status', 'Active'),
            f.Gte('Total', 100),
            f.Contains('Notes', '50%_discount[1]'),
            f.In('Region', ['NA', 'EU']),
            f.Between('OrderedAt', '2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.000Z'),
            f.Or(f.Eq('IsPriority', true), f.IsNotEmpty('Notes')),
        );

        const mssqlCompiled = CompositeFilterSQLCompiler.Compile(filter, entity, {
            platform: 'sqlserver',
        });

        expect(mssqlCompiled.whereClause).toContain('[Status] = @f0');
        expect(mssqlCompiled.whereClause).toContain('[Total] >= @f1');
        expect(mssqlCompiled.whereClause).toContain('[Notes] LIKE @f2');
        expect(mssqlCompiled.whereClause).toContain('[Region] IN (@f3, @f4)');
        expect(mssqlCompiled.whereClause).toContain('[OrderedAt] BETWEEN @f5 AND @f6');
        expect(mssqlCompiled.whereClause).toContain('[IsPriority] = @f7');
        expect(mssqlCompiled.whereClause).toContain("([Notes] IS NOT NULL AND [Notes] <> '')");
        expect(mssqlCompiled.parameters).toEqual({
            f0: 'Active',
            f1: 100,
            f2: '%50[%][_]discount[[]1]%',
            f3: 'NA',
            f4: 'EU',
            f5: '2026-01-01T00:00:00.000Z',
            f6: '2026-12-31T23:59:59.000Z',
            f7: true,
        });

        const pgCompiled = CompositeFilterSQLCompiler.Compile(filter, entity, {
            platform: 'postgresql',
        });

        expect(pgCompiled.whereClause).toContain('"Status" = @f0');
        expect(pgCompiled.whereClause).toContain('"Total" >= @f1');
        expect(pgCompiled.whereClause).toContain('"Notes" LIKE @f2');
        expect(pgCompiled.whereClause).toContain('"Region" IN (@f3, @f4)');
        expect(pgCompiled.whereClause).toContain('"OrderedAt" BETWEEN @f5 AND @f6');
        expect(pgCompiled.whereClause).toContain('"IsPriority" = @f7');
        expect(pgCompiled.parameters.f7).toBe(true);
    });

    it('rejects empty in/notin arrays and enforces DefaultMaxInValues', () => {
        expect(() =>
            CompositeFilterSQLCompiler.Compile(
                { logic: 'and', filters: [{ field: 'Status', operator: 'in', value: [] }] },
                entity,
                { platform: 'sqlserver' },
            ),
        ).toThrow(/requires a non-empty array/);

        expect(() =>
            CompositeFilterSQLCompiler.Compile(
                { logic: 'and', filters: [{ field: 'Status', operator: 'notin', value: [] }] },
                entity,
                { platform: 'sqlserver' },
            ),
        ).toThrow(/requires a non-empty array/);

        const tooMany = Array.from(
            { length: CompositeFilterSQLCompiler.DefaultMaxInValues + 1 },
            (_, i) => `val-${i}`,
        );
        expect(() =>
            CompositeFilterSQLCompiler.Compile(
                { logic: 'and', filters: [{ field: 'Status', operator: 'in', value: tooMany }] },
                entity,
                { platform: 'sqlserver' },
            ),
        ).toThrow(/exceeding the maximum of 500/);
    });

    it('rejects unknown fields and field-security-denied fields', () => {
        expect(() =>
            CompositeFilterSQLCompiler.Compile(
                { logic: 'and', filters: [{ field: 'NonExistentField', operator: 'eq', value: 'x' }] },
                entity,
                { platform: 'sqlserver' },
            ),
        ).toThrow(/Unable to find field NonExistentField/);

        const securedEntity = makeOrderEntity();
        Object.defineProperty(securedEntity, 'FieldLevelSecurityApplies', {
            get: () => true,
            configurable: true,
        });
        vi.spyOn(securedEntity, 'GetDeniedReadFields').mockReturnValue(new Set(['internalcost']));
        const testUser = { ID: 'user-1', Name: 'Test User', UserRoles: [] } as unknown as UserInfo;

        expect(() =>
            CompositeFilterSQLCompiler.Compile(
                { logic: 'and', filters: [{ field: 'InternalCost', operator: 'gt', value: 0 }] },
                securedEntity,
                { platform: 'sqlserver', user: testUser },
            ),
        ).toThrow(FieldSecurityError);
    });

    it('escapes quotes and blocks SQL injection in CompileLiteral', () => {
        const sql = CompositeFilterSQLCompiler.CompileLiteral(
            {
                logic: 'and',
                filters: [
                    { field: 'Notes', operator: 'eq', value: "O'Brien'; DROP TABLE [Order]; --" },
                    { field: 'Status', operator: 'in', value: ["Active'1", 'Pending'] },
                ],
            },
            entity,
            { platform: 'sqlserver' },
        );
        expect(sql).toBe(
            "([Notes] = 'O''Brien''; DROP TABLE [Order]; --') AND ([Status] IN ('Active''1', 'Pending'))",
        );
    });

    it('preserves parity between CompositeFilter.Evaluate and CompositeFilterSQLCompiler across a shared fixture', () => {
        const fixture: OrderFixtureRow[] = [
            {
                ID: '1',
                Status: 'Active',
                Total: 150,
                Region: 'NA',
                IsPriority: true,
                OrderedAt: new Date('2026-03-10T00:00:00.000Z'),
                Notes: 'Expedite order',
            },
            {
                ID: '2',
                Status: 'Pending',
                Total: 50,
                Region: 'EU',
                IsPriority: false,
                OrderedAt: new Date('2026-01-15T00:00:00.000Z'),
                Notes: '',
            },
            {
                ID: '3',
                Status: 'Cancelled',
                Total: 500,
                Region: 'APAC',
                IsPriority: true,
                OrderedAt: new Date('2026-08-20T00:00:00.000Z'),
                Notes: null,
            },
            {
                ID: '4',
                Status: 'Active',
                Total: 300,
                Region: 'EU',
                IsPriority: false,
                OrderedAt: new Date('2026-05-01T00:00:00.000Z'),
                Notes: 'Standard delivery',
            },
        ];

        const filtersWithExpectedRowIDs: Array<{
            name: string;
            descriptor: CompositeFilterDescriptor;
            expectedIds: string[];
            expectedWherePattern: RegExp;
        }> = [
            {
                name: 'Status = Active AND Total > 100',
                descriptor: f.And(f.Eq('Status', 'Active'), f.Gt('Total', 100)),
                expectedIds: ['1', '4'],
                expectedWherePattern: /\(\[Status\] = @f0\) AND \(\[Total\] > @f1\)/,
            },
            {
                name: 'Region IN (NA, EU) AND Status <> Cancelled',
                descriptor: f.And(f.In('Region', ['NA', 'EU']), f.Neq('Status', 'Cancelled')),
                expectedIds: ['1', '2', '4'],
                expectedWherePattern: /\(\[Region\] IN \(@f0, @f1\)\) AND \(\[Status\] <> @f2\)/,
            },
            {
                name: 'Region NOT IN (APAC) AND Total BETWEEN 50 AND 300',
                descriptor: f.And(f.NotIn('Region', ['APAC']), f.Between('Total', 50, 300)),
                expectedIds: ['1', '2', '4'],
                expectedWherePattern: /\(\[Region\] NOT IN \(@f0\)\) AND \(\[Total\] BETWEEN @f1 AND @f2\)/,
            },
            {
                name: 'Notes isempty',
                descriptor: f.And(f.IsEmpty('Notes')),
                expectedIds: ['2', '3'],
                expectedWherePattern: /\(\[Notes\] IS NULL OR \[Notes\] = ''\)/,
            },
            {
                name: 'Notes isnotempty AND startswith Exp',
                descriptor: f.And(f.IsNotEmpty('Notes'), f.StartsWith('Notes', 'Exp')),
                expectedIds: ['1'],
                expectedWherePattern: /\(\[Notes\] IS NOT NULL AND \[Notes\] <> ''\) AND \(\[Notes\] LIKE @f0\)/,
            },
            {
                name: 'Notes isnull',
                descriptor: f.And(f.IsNull('Notes')),
                expectedIds: ['3'],
                expectedWherePattern: /\(\[Notes\] IS NULL\)/,
            },
            {
                name: 'Notes isnotnull AND doesnotcontain Standard',
                descriptor: f.And(f.IsNotNull('Notes'), f.DoesNotContain('Notes', 'Standard')),
                expectedIds: ['1', '2'],
                expectedWherePattern: /\(\[Notes\] IS NOT NULL\) AND \(\[Notes\] NOT LIKE @f0\)/,
            },
            {
                name: '(Region = NA AND IsPriority = true) OR (Region = EU AND Total >= 300)',
                descriptor: f.Or(
                    f.And(f.Eq('Region', 'NA'), f.Eq('IsPriority', true)),
                    f.And(f.Eq('Region', 'EU'), f.Gte('Total', 300)),
                ),
                expectedIds: ['1', '4'],
                expectedWherePattern: /\(\(\[Region\] = @f0\) AND \(\[IsPriority\] = @f1\)\) OR \(\(\[Region\] = @f2\) AND \(\[Total\] >= @f3\)\)/,
            },
        ];

        for (const testCase of filtersWithExpectedRowIDs) {
            const cf = CompositeFilter.FromDescriptor(testCase.descriptor);
            const evalIds = fixture
                .filter((row) => cf.Evaluate({ '': row as unknown as Record<string, unknown> }))
                .map((r) => r.ID);
            const compiled = CompositeFilterSQLCompiler.Compile(testCase.descriptor, entity, {
                platform: 'sqlserver',
            });
            expect(evalIds, testCase.name).toEqual(testCase.expectedIds);
            expect(compiled.whereClause, testCase.name).toMatch(testCase.expectedWherePattern);
        }
    });

    it('matches field names case-insensitively in both Evaluate() and Compile()', () => {
        const entity = makeOrderEntity();
        const descriptor: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'status', operator: 'eq', value: 'Active' }],
        };
        const cf = CompositeFilter.FromDescriptor(descriptor);
        expect(cf.Evaluate({ '': { Status: 'Active' } })).toBe(true);
        expect(cf.Evaluate({ '': { Status: 'Closed' } })).toBe(false);

        const compiled = CompositeFilterSQLCompiler.Compile(descriptor, entity, { platform: 'sqlserver' });
        expect(compiled.whereClause).toBe('([Status] = @f0)');
        expect(compiled.parameters).toEqual({ f0: 'Active' });
    });

    it('emits IS NULL / IS NOT NULL for eq/neq null on boolean fields by default and supports coerceNullBooleanToFalse', () => {
        const entity = makeOrderEntity();
        const eqNull: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'IsPriority', operator: 'eq', value: null }],
        };
        const neqNull: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'IsPriority', operator: 'neq', value: null }],
        };

        const cfEqNull = CompositeFilter.FromDescriptor(eqNull);
        expect(cfEqNull.Evaluate({ '': { IsPriority: null } })).toBe(true);
        expect(cfEqNull.Evaluate({ '': { IsPriority: false } })).toBe(false);

        const compiledDefault = CompositeFilterSQLCompiler.Compile(eqNull, entity, { platform: 'sqlserver' });
        expect(compiledDefault.whereClause).toBe('([IsPriority] IS NULL)');
        expect(compiledDefault.parameters).toEqual({});

        const compiledNeqDefault = CompositeFilterSQLCompiler.Compile(neqNull, entity, { platform: 'sqlserver' });
        expect(compiledNeqDefault.whereClause).toBe('([IsPriority] IS NOT NULL)');

        const compiledCoerced = CompositeFilterSQLCompiler.Compile(eqNull, entity, {
            platform: 'sqlserver',
            coerceNullBooleanToFalse: true,
        });
        expect(compiledCoerced.whereClause).toBe('([IsPriority] = @f0)');
        expect(compiledCoerced.parameters).toEqual({ f0: false });

        const literalDefault = CompositeFilterSQLCompiler.CompileLiteral(eqNull, entity);
        expect(literalDefault).toBe('([IsPriority] IS NULL)');

        const literalCoerced = CompositeFilterSQLCompiler.CompileLiteral(eqNull, entity, {
            coerceNullBooleanToFalse: true,
        });
        expect(literalCoerced).toBe('([IsPriority] = 0)');
    });

    it('compares ISO date strings by parsed epoch instant in eq and neq', () => {
        const eqFilter = CompositeFilter.FromDescriptor({
            logic: 'and',
            filters: [{ field: 'OrderedAt', operator: 'eq', value: '2026-01-15T12:00:00Z' }],
        });
        expect(eqFilter.Evaluate({ '': { OrderedAt: '2026-01-15T12:00:00.000Z' } })).toBe(true);
        expect(eqFilter.Evaluate({ '': { OrderedAt: '2026-01-15T07:00:00-05:00' } })).toBe(true);
        expect(eqFilter.Evaluate({ '': { OrderedAt: '2026-01-15T13:00:00Z' } })).toBe(false);
    });
});

describe('FilterOf<T>() and CanonicalCompositeFilterKey', () => {
    it('builds nested filters and produces a deterministic canonical key regardless of property key order', () => {
        const f = FilterOf<OrderFixtureRow>();
        const f1 = f.And(
            f.Eq('Status', 'Active'),
            f.In('Region', ['NA', 'EU']),
            f.Or(f.Gt('Total', 1000), f.Eq('IsPriority', true)),
        );

        const f2: CompositeFilterDescriptor = {
            filters: [
                { value: 'Active', operator: 'EQ' as 'eq', field: 'Status' },
                { value: ['NA', 'EU'], field: 'Region', operator: 'in' },
                {
                    filters: [
                        { operator: 'gt', value: 1000, field: 'Total' },
                        { field: 'IsPriority', value: true, operator: 'eq' },
                    ],
                    logic: 'OR' as 'or',
                },
            ],
            logic: 'AND' as 'and',
        };

        expect(CanonicalCompositeFilterKey(f1)).toBe(CanonicalCompositeFilterKey(f2));
    });
});

describe('BaseEngine structured Filter & Where()', () => {
    class TestOrderEngine extends BaseEngine<TestOrderEngine> {
        public static get Instance(): TestOrderEngine {
            return super.getInstance<TestOrderEngine>();
        }
        public ActiveOrders: BaseEntity[] = [];
        public async Config(): Promise<void> {
            // no-op for unit test
        }
        protected override async cloneEntityForCache(entity: BaseEntity): Promise<BaseEntity | null> {
            return entity;
        }
        public async ExposeApplyImmediateMutation(
            config: BaseEnginePropertyConfig,
            event: BaseEntityEvent,
        ): Promise<void> {
            await this.applyImmediateMutation(config, event);
        }
        public ExposeWhere<E = BaseEntity>(
            propertyName: string,
            filter: CompositeFilterDescriptor | CompositeFilter,
        ): E[] {
            return this.Where<E>(propertyName, filter);
        }
    }

    function makeMockOrderEntity(row: OrderFixtureRow): BaseEntity {
        return {
            ...row,
            EntityInfo: { Name: 'Orders', PrimaryKeys: [{ Name: 'ID', IsUniqueIdentifier: false }] },
            PrimaryKey: {
                Values: () => row.ID,
                Equals: (other: { KeyValuePairs?: Array<{ Value: unknown }> }) =>
                    other?.KeyValuePairs?.[0]?.Value === row.ID,
            },
            GetAll: () => row,
            Get: (k: string) => (row as unknown as Record<string, unknown>)[k],
        } as unknown as BaseEntity;
    }

    it('filters in-memory cached arrays with BaseEngine.Where() and updates filtered properties on entity save', async () => {
        const f = FilterOf<OrderFixtureRow>();
        const engine = TestOrderEngine.Instance;
        const e1 = makeMockOrderEntity({
            ID: '1',
            Status: 'Active',
            Total: 120,
            Region: 'NA',
            IsPriority: true,
            OrderedAt: null,
            Notes: null,
        });
        const e2 = makeMockOrderEntity({
            ID: '2',
            Status: 'Active',
            Total: 450,
            Region: 'EU',
            IsPriority: false,
            OrderedAt: null,
            Notes: null,
        });
        engine.ActiveOrders = [e1, e2];

        const config: BaseEnginePropertyConfig = {
            PropertyName: 'ActiveOrders',
            EntityName: 'Orders',
            Filter: f.And(f.Eq('Status', 'Active'), f.Gte('Total', 100)),
        };

        // Where() over cached array
        const highValue = engine.ExposeWhere<BaseEntity>('ActiveOrders', f.And(f.Gt('Total', 200)));
        expect(highValue.map((r) => r.Get('ID'))).toEqual(['2']);

        // Immediate mutation: save a new matching record -> added to ActiveOrders
        const e3 = makeMockOrderEntity({
            ID: '3',
            Status: 'Active',
            Total: 250,
            Region: 'NA',
            IsPriority: true,
            OrderedAt: null,
            Notes: null,
        });

        await engine.ExposeApplyImmediateMutation(config, {
            type: 'save',
            saveSubType: 'create',
            baseEntity: e3,
        } as BaseEntityEvent);
        expect(engine.ActiveOrders.map((r) => r.Get('ID'))).toEqual(['1', '2', '3']);

        // Immediate mutation: record '1' changes Status to 'Cancelled' -> evicted from ActiveOrders
        const e1Cancelled = makeMockOrderEntity({
            ID: '1',
            Status: 'Cancelled',
            Total: 120,
            Region: 'NA',
            IsPriority: true,
            OrderedAt: null,
            Notes: null,
        });

        await engine.ExposeApplyImmediateMutation(config, {
            type: 'save',
            saveSubType: 'update',
            baseEntity: e1Cancelled,
        } as BaseEntityEvent);
        expect(engine.ActiveOrders.map((r) => r.Get('ID'))).toEqual(['2', '3']);
    });

    it('allows CanUpsertRowIntoSlot for structured cf: fingerprints when the row satisfies the filter and avoids cache thrashing on non-matching creates', async () => {
        const entityInfo = makeOrderEntity();
        const f = FilterOf<OrderFixtureRow>();
        const filter = f.And(f.Eq('Status', 'Active'), f.Gte('Total', 100));
        const cfSegment = `cf:${CanonicalCompositeFilterKey(filter).replace(/\|/g, '\\u007c')}`;
        const fingerprint = `Orders|_|_|_|_|_|_|${cfSegment}`;

        const matchingRow: Record<string, unknown> = {
            ID: '10',
            Status: 'Active',
            Total: 250,
            Region: 'NA',
            IsPriority: true,
            OrderedAt: null,
            Notes: null,
            InternalCost: 50,
        };
        const nonMatchingRow: Record<string, unknown> = {
            ...matchingRow,
            Status: 'Cancelled',
        };

        expect(LocalCacheManager.Instance.CanUpsertRowIntoSlot(fingerprint, entityInfo, matchingRow)).toBe(true);
        expect(LocalCacheManager.Instance.CanUpsertRowIntoSlot(fingerprint, entityInfo, nonMatchingRow)).toBe(false);
        expect(
            LocalCacheManager.Instance.CanUpsertRowIntoSlot(`${fingerprint}|rls:abc`, entityInfo, matchingRow),
        ).toBe(false);

        const engine = TestOrderEngine.Instance;
        engine.ActiveOrders = [];
        const removeSpy = vi.spyOn(LocalCacheManager.Instance, 'RemoveSingleEntity').mockResolvedValue(true);
        const nonMatchingEntity = makeMockOrderEntity(nonMatchingRow as unknown as OrderFixtureRow);

        await engine.ExposeApplyImmediateMutation(
            {
                PropertyName: 'ActiveOrders',
                EntityName: 'Orders',
                Filter: filter,
                CacheLocal: true,
            },
            {
                type: 'save',
                saveSubType: 'create',
                baseEntity: nonMatchingEntity,
            } as BaseEntityEvent,
        );

        expect(removeSpy).not.toHaveBeenCalled();
        removeSpy.mockRestore();
    });

    it('maintains structured cf: slots in place in LocalCacheManager on entity save events without invalidating', async () => {
        const entityInfo = makeOrderEntity();
        const f = FilterOf<OrderFixtureRow>();
        const filter = f.And(f.Eq('Status', 'Active'), f.Gte('Total', 100));
        const cfSegment = `cf:${CanonicalCompositeFilterKey(filter).replace(/\|/g, '\\u007c')}`;
        const fingerprint = `Orders|_|_|_|_|_|_|${cfSegment}`;
        const nowISO = '2026-11-08T00:00:00.000Z';

        const matchingRow: Record<string, unknown> = {
            ID: '10',
            Status: 'Active',
            Total: 250,
            Region: 'NA',
            IsPriority: true,
            OrderedAt: null,
            Notes: null,
            InternalCost: 50,
        };
        const nonMatchingRow: Record<string, unknown> = {
            ...matchingRow,
            Status: 'Cancelled',
        };
        const key10 = new CompositeKey([{ FieldName: 'ID', Value: '10' }]);

        const applyRowChangesSpy = vi
            .spyOn(LocalCacheManager.Instance, 'ApplyRowChanges')
            .mockResolvedValue(true);
        const upsertSpy = vi
            .spyOn(LocalCacheManager.Instance, 'UpsertSingleEntity')
            .mockResolvedValue(true);
        const removeSpy = vi
            .spyOn(LocalCacheManager.Instance, 'RemoveSingleEntity')
            .mockResolvedValue(true);
        const invalidateSpy = vi
            .spyOn(LocalCacheManager.Instance, 'InvalidateRunViewResult')
            .mockResolvedValue(undefined);

        type InternalCacheHooks = {
            applyEntityChangesToSlot(
                fp: string,
                changes: Array<{
                    Type: 'save' | 'delete';
                    Key: CompositeKey;
                    Record: Record<string, unknown> | null;
                    EntityInfo: EntityInfo;
                }>,
                iso: string,
            ): Promise<void>;
            processEntityEventForFingerprint(
                evtType: 'save' | 'delete',
                fp: string,
                be: BaseEntity,
                k: CompositeKey,
                iso: string,
            ): Promise<void>;
        };
        const hooks = LocalCacheManager.Instance as unknown as InternalCacheHooks;

        // 1. Batched save of a matching record -> ApplyRowChanges with Row: matchingRow (no invalidation)
        await hooks.applyEntityChangesToSlot(
            fingerprint,
            [{ Type: 'save', Key: key10, Record: matchingRow, EntityInfo: entityInfo }],
            nowISO,
        );
        expect(applyRowChangesSpy).toHaveBeenCalledWith(
            fingerprint,
            [{ Key: key10, Row: matchingRow }],
            nowISO,
        );
        expect(invalidateSpy).not.toHaveBeenCalled();

        // 2. Batched save of a non-matching record -> ApplyRowChanges with Row: null to remove in place
        applyRowChangesSpy.mockClear();
        await hooks.applyEntityChangesToSlot(
            fingerprint,
            [{ Type: 'save', Key: key10, Record: nonMatchingRow, EntityInfo: entityInfo }],
            nowISO,
        );
        expect(applyRowChangesSpy).toHaveBeenCalledWith(
            fingerprint,
            [{ Key: key10, Row: null }],
            nowISO,
        );
        expect(invalidateSpy).not.toHaveBeenCalled();

        // 3. Single-event save of matching & non-matching records -> UpsertSingleEntity / RemoveSingleEntity
        const matchingEntity = {
            EntityInfo: entityInfo,
            GetAll: () => matchingRow,
        } as unknown as BaseEntity;
        const nonMatchingEntity = {
            EntityInfo: entityInfo,
            GetAll: () => nonMatchingRow,
        } as unknown as BaseEntity;

        await hooks.processEntityEventForFingerprint(
            'save',
            fingerprint,
            matchingEntity,
            key10,
            nowISO,
        );
        expect(upsertSpy).toHaveBeenCalledWith(fingerprint, matchingRow, key10, nowISO);
        expect(invalidateSpy).not.toHaveBeenCalled();

        await hooks.processEntityEventForFingerprint(
            'save',
            fingerprint,
            nonMatchingEntity,
            key10,
            nowISO,
        );
        expect(removeSpy).toHaveBeenCalledWith(fingerprint, key10, nowISO);
        expect(invalidateSpy).not.toHaveBeenCalled();

        applyRowChangesSpy.mockRestore();
        upsertSpy.mockRestore();
        removeSpy.mockRestore();
        invalidateSpy.mockRestore();
    });
});

describe('TypedQuery & ComputeTypedQuerySignature', () => {
    const queryId = '11111111-2222-3333-4444-555555555555';
    const baseSpec = {
        Parameters: [
            { Name: 'region', Type: 'string', IsRequired: true, DefaultValue: null },
            { Name: 'minTotal', Type: 'number', IsRequired: false, DefaultValue: '100' },
        ],
        Fields: [
            { Name: 'OrderID', SQLBaseType: 'uniqueidentifier', InAllBranchVariants: true },
            { Name: 'Total', SQLBaseType: 'decimal', InAllBranchVariants: true },
            { Name: 'DiscountCode', SQLBaseType: 'nvarchar', InAllBranchVariants: false },
        ],
    };

    beforeEach(() => {
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(false);
        ResetTypedQueryDriftWarnings();
    });

    afterEach(() => {
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(false);
        ResetTypedQueryDriftWarnings();
    });

    it('computes a deterministic sha256 signature that is insensitive to order and sensitive to structural changes', () => {
        const sig1 = ComputeTypedQuerySignature(baseSpec);
        const sig2 = ComputeTypedQuerySignature({
            Parameters: [...baseSpec.Parameters].reverse(),
            Fields: [...baseSpec.Fields].reverse(),
        });
        expect(sig1).toBe(sig2);
        expect(sig1).toMatch(/^sha256:[0-9a-f]{64}$/);

        const sigChanged = ComputeTypedQuerySignature({
            ...baseSpec,
            Fields: [
                ...baseSpec.Fields.slice(0, 2),
                { Name: 'DiscountCode', SQLBaseType: 'nvarchar', InAllBranchVariants: true },
            ],
        });
        expect(sigChanged).not.toBe(sig1);
    });

    it('executes TypedQuery.Run(), detects signature drift in warn/throw modes, and validates rows when enabled', async () => {
        const signature = ComputeTypedQuerySignature(baseSpec);

        interface OrdersByRegionParams {
            region: string;
            minTotal?: number;
        }
        interface OrdersByRegionRow {
            OrderID: string;
            Total: number;
            DiscountCode?: string | null;
        }

        const OrdersByRegion = DefineTypedQuery<OrdersByRegionParams, OrdersByRegionRow>({
            QueryID: queryId,
            Path: 'Sales/Reports/Orders By Region',
            Signature: signature,
            RowSchema: {
                safeParse(row: unknown) {
                    const r = row as Record<string, unknown>;
                    if (typeof r?.OrderID === 'string' && typeof r?.Total === 'number') {
                        return { success: true, data: r as unknown as OrdersByRegionRow };
                    }
                    return { success: false, error: { message: 'Invalid Total' } };
                },
            },
        });

        const fakeQueryInfo = {
            ID: queryId,
            Name: 'Orders By Region',
            Parameters: baseSpec.Parameters,
            Fields: baseSpec.Fields,
        } as unknown as QueryInfo;

        const runQuerySpy = vi.fn(async (): Promise<RunQueryResult> => ({
            QueryID: queryId,
            QueryName: 'Orders By Region',
            Success: true,
            Results: [{ OrderID: 'ord-1', Total: 250 }],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 5,
            ErrorMessage: '',
        }));

        const fakeProvider = {
            Queries: [fakeQueryInfo],
            RunQuery: runQuerySpy,
        } as unknown as IRunQueryProvider & IMetadataProvider;

        const res = await OrdersByRegion.Run(
            { region: 'EMEA' },
            { provider: fakeProvider, metadataProvider: fakeProvider },
        );
        expect(res.Success).toBe(true);
        expect(res.Results[0].OrderID).toBe('ord-1');
        expect(runQuerySpy).toHaveBeenCalledWith(
            expect.objectContaining({
                QueryID: queryId,
                Parameters: { region: 'EMEA' },
            }),
            undefined,
        );

        // Mutate live QueryInfo to trigger drift
        const driftedQueryInfo = {
            ...fakeQueryInfo,
            Parameters: [
                ...baseSpec.Parameters,
                { Name: 'newRequiredParam', Type: 'string', IsRequired: true, DefaultValue: null },
            ],
        } as unknown as QueryInfo;
        const driftedProvider = {
            Queries: [driftedQueryInfo],
            RunQuery: runQuerySpy,
        } as unknown as IRunQueryProvider & IMetadataProvider;

        // In 'throw' mode, drift throws TypedQueryDriftError before executing RunQuery
        SetTypedQueryDriftMode('throw');
        expect(GetTypedQueryDriftMode()).toBe('throw');
        await expect(
            OrdersByRegion.Run(
                { region: 'EMEA' },
                { provider: driftedProvider, metadataProvider: driftedProvider },
            ),
        ).rejects.toThrow(TypedQueryDriftError);

        // Row validation when enabled logs a warning on schema mismatch
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(true);
        const warnSpy = vi.spyOn(loggingModule, 'LogWarning').mockImplementation(() => {});
        const badRowProvider = {
            Queries: [fakeQueryInfo],
            RunQuery: vi.fn(async (): Promise<RunQueryResult> => ({
                QueryID: queryId,
                QueryName: 'Orders By Region',
                Success: true,
                Results: [{ OrderID: 'ord-1', Total: 'not-a-number' }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 3,
                ErrorMessage: '',
            })),
        } as unknown as IRunQueryProvider & IMetadataProvider;

        await OrdersByRegion.Run(
            { region: 'EMEA' },
            { provider: badRowProvider, metadataProvider: badRowProvider },
        );
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("TypedQuery row validation warning for 'Sales/Reports/Orders By Region'"),
        );
        warnSpy.mockRestore();
    });
});
