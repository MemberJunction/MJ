import { describe, expect, it, vi } from 'vitest';
import { ComputeTypedQuerySignature, type MJQueryEntityExtended } from '@memberjunction/core-entities';
import {
    FilterEligibleTypedQueries,
    GenerateTypedQueriesFileContent,
    MapSQLBaseTypeToTSType,
    ResolveTypedQuerySchema,
    ToQueryIdentifier,
    TypedQueryCodeGenQueriesFromEngine,
    TypedQueryDefinerModule,
    type TypedQueryCodeGenEntity,
    type TypedQueryCodeGenQuery,
} from '../Misc/typed_query_codegen';

const sampleEntities: TypedQueryCodeGenEntity[] = [
    {
        ID: 'ent-orders',
        Name: 'Orders',
        SchemaName: 'sales',
        ClassName: 'Order',
        CodeName: 'Orders',
        Fields: [
            { Name: 'OrderID', AllowsNull: false, Type: 'uniqueidentifier', TSType: 'string' },
            { Name: 'CustomerName', AllowsNull: false, Type: 'nvarchar', TSType: 'string' },
            { Name: 'Total', AllowsNull: false, Type: 'decimal', TSType: 'number' },
            { Name: 'DiscountCode', AllowsNull: true, Type: 'nvarchar', TSType: 'string' },
        ],
    },
    {
        ID: 'ent-users',
        Name: 'MJ: Users',
        SchemaName: '__mj',
        ClassName: 'MJUser',
        CodeName: 'MJUsers',
        Fields: [
            { Name: 'ID', AllowsNull: false, Type: 'uniqueidentifier', TSType: 'string' },
            { Name: 'Email', AllowsNull: false, Type: 'nvarchar', TSType: 'string' },
        ],
    },
];

describe('typed_query_codegen', () => {
    it('filters only Approved + Reusable queries via FilterEligibleTypedQueries', () => {
        const queries: TypedQueryCodeGenQuery[] = [
            { ID: '1', Name: 'Approved Reusable', Status: 'Approved', Reusable: true },
            { ID: '2', Name: 'Pending Reusable', Status: 'Pending', Reusable: true },
            { ID: '3', Name: 'Approved Non-Reusable', Status: 'Approved', Reusable: false },
            { ID: '4', Name: 'Rejected Reusable', Status: 'Rejected', Reusable: true },
        ];
        const eligible = FilterEligibleTypedQueries(queries);
        expect(eligible.map((q) => q.ID)).toEqual(['1']);
    });

    it('resolves query schema from SourceEntityID, CategoryPath, or fallback __mj', () => {
        const fromSourceEntity: TypedQueryCodeGenQuery = {
            ID: 'q1',
            Name: 'Order Summary',
            CategoryPath: '/Reports/',
            Fields: [{ Name: 'OrderID', SQLBaseType: 'uniqueidentifier', SourceEntityID: 'ent-orders' }],
        };
        expect(ResolveTypedQuerySchema(fromSourceEntity, sampleEntities, ['__mj', 'sales'])).toBe('sales');

        const fromCategory: TypedQueryCodeGenQuery = {
            ID: 'q2',
            Name: 'Sales Pipeline',
            CategoryPath: '/sales/Analytics/',
            Fields: [{ Name: 'Count', SQLBaseType: 'int' }],
        };
        expect(ResolveTypedQuerySchema(fromCategory, sampleEntities, ['__mj', 'sales'])).toBe('sales');

        const fallbackCore: TypedQueryCodeGenQuery = {
            ID: 'q3',
            Name: 'Active Users',
            CategoryPath: '/MJ/Demos/',
            Fields: [{ Name: 'ID', SQLBaseType: 'uniqueidentifier', SourceEntityID: 'ent-users' }],
        };
        expect(ResolveTypedQuerySchema(fallbackCore, sampleEntities, ['__mj', 'sales'])).toBe('__mj');
    });

    it('maps SQL base types to TypeScript types and converts names to PascalCase identifiers', () => {
        expect(MapSQLBaseTypeToTSType('uniqueidentifier')).toBe('string');
        expect(MapSQLBaseTypeToTSType('int')).toBe('number');
        expect(MapSQLBaseTypeToTSType('decimal(18,2)')).toBe('number');
        expect(MapSQLBaseTypeToTSType('bit')).toBe('boolean');
        expect(MapSQLBaseTypeToTSType('datetimeoffset')).toBe('Date');

        expect(ToQueryIdentifier('Orders By Region (2026)')).toBe('OrdersByRegion2026');
        expect(ToQueryIdentifier('100 Top Customers')).toBe('Q_100TopCustomers');
    });

    it('emits Params, Row, RowSchema, DefineTypedQuery, and Queries tree with JSDoc, parameter precedence, branch optionality, and nullability', () => {
        const warnings: string[] = [];
        const query: TypedQueryCodeGenQuery = {
            ID: '11111111-2222-3333-4444-555555555555',
            Name: 'Orders By Region',
            Status: 'Approved',
            Reusable: true,
            CategoryPath: '/Sales/Reports/',
            SQL: `
                {#
                 Revenue and order count by region over a date window.
                 @param {string} region ISO region code
                 @param {number} minTotal Minimum order total to include
                 @field RevenueSum Sum of order totals in USD
                #}
                SELECT
                    o.OrderID,
                    o.CustomerName,
                    o.DiscountCode,
                    SUM(o.Total) AS RevenueSum
                    {% if includeNotes %}, o.Notes {% endif %}
                FROM sales.vwOrders o
                WHERE o.Region = {{ region | sqlString }}
                  AND o.Total >= {{ minTotal | default: 100 | sqlNumber }}
                  AND o.Mystery = {{ mysteryFilter }}
            `,
            Parameters: [
                {
                    Name: 'region',
                    Type: 'string',
                    IsRequired: true,
                    DefaultValue: null,
                    DetectionMethod: 'Auto',
                },
                {
                    Name: 'minTotal',
                    Type: 'number',
                    IsRequired: false,
                    DefaultValue: '100',
                    DetectionMethod: 'Auto',
                },
                {
                    Name: 'includeNotes',
                    Type: 'boolean',
                    IsRequired: false,
                    DefaultValue: null,
                    DetectionMethod: 'Manual',
                    Description: 'Include order notes column when true',
                },
                {
                    Name: 'serverTenantID',
                    Type: 'string',
                    IsRequired: true,
                    IsServerSet: true,
                },
                {
                    Name: 'mysteryFilter',
                    Type: 'unknown',
                    IsRequired: true,
                    DefaultValue: null,
                    DetectionMethod: 'Auto',
                },
            ],
            Fields: [
                {
                    Name: 'OrderID',
                    SQLBaseType: 'uniqueidentifier',
                    SourceEntityID: 'ent-orders',
                    SourceFieldName: 'OrderID',
                    IsComputed: false,
                    InAllBranchVariants: true,
                },
                {
                    Name: 'DiscountCode',
                    SQLBaseType: 'nvarchar',
                    SourceEntityID: 'ent-orders',
                    SourceFieldName: 'DiscountCode',
                    IsComputed: false,
                    InAllBranchVariants: true,
                },
                {
                    Name: 'RevenueSum',
                    SQLBaseType: 'decimal',
                    IsComputed: true,
                    IsSummary: true,
                    InAllBranchVariants: true,
                },
                {
                    Name: 'Notes',
                    SQLBaseType: 'nvarchar',
                    IsComputed: false,
                    InAllBranchVariants: false,
                    Description: 'Order notes included only when includeNotes is true',
                },
            ],
        };

        const code = GenerateTypedQueriesFileContent([query], sampleEntities, {
            platform: 'sqlserver',
            onWarning: (w) => warnings.push(w),
        });

        // 1. Summary JSDoc from @summary
        expect(code).toContain('Revenue and order count by region over a date window.');
        // 2. Server-set parameter is excluded from caller Params
        expect(code).not.toContain('serverTenantID');
        // 3. Required parameter vs defaulted/optional parameters
        expect(code).toContain('region: string;');
        expect(code).toContain('minTotal?: number;');
        expect(code).toContain('includeNotes?: boolean;');
        // 4. Unknown parameter emits union type and records a warning
        expect(code).toContain('mysteryFilter: string | number | boolean | Date | null;');
        expect(warnings.some((w) => w.includes("parameter 'mysteryFilter' has type 'unknown'"))).toBe(true);
        // 5. Field nullability & branch-only optionality
        // OrderID inherits AllowsNull=false from Orders.OrderID
        expect(code).toContain('OrderID: string;');
        // DiscountCode inherits AllowsNull=true from Orders.DiscountCode
        expect(code).toContain('DiscountCode: string | null;');
        // RevenueSum is computed/summary -> nullable + @field JSDoc
        expect(code).toContain('/** Sum of order totals in USD */');
        expect(code).toContain('RevenueSum: number | null;');
        // Notes has InAllBranchVariants: false -> optional property `Notes?:`
        expect(code).toContain('Notes?: string | null;');
        // 6. Namespace tree
        expect(code).toContain('export const Queries = {');
        expect(code).toContain('Sales: {');
        expect(code).toContain('Reports: {');
        expect(code).toContain('OrdersByRegion,');
    });

    it('disambiguates colliding leaf query names across categories', () => {
        const q1: TypedQueryCodeGenQuery = {
            ID: 'aaaaaaaa-0000-0000-0000-000000000001',
            Name: 'Orders By Region',
            Status: 'Approved',
            Reusable: true,
            CategoryPath: '/Sales/',
            Parameters: [],
            Fields: [{ Name: 'Total', SQLBaseType: 'decimal', InAllBranchVariants: true }],
        };
        const q2: TypedQueryCodeGenQuery = {
            ID: 'aaaaaaaa-0000-0000-0000-000000000002',
            Name: 'Orders By Region',
            Status: 'Approved',
            Reusable: true,
            CategoryPath: '/Operations/',
            Parameters: [],
            Fields: [{ Name: 'Count', SQLBaseType: 'int', InAllBranchVariants: true }],
        };

        const code = GenerateTypedQueriesFileContent([q1, q2], sampleEntities, { platform: 'sqlserver' });
        expect(code).toContain('export const OperationsOrdersByRegion = DefineTypedQuery<');
        expect(code).toContain('export const SalesOrdersByRegion = DefineTypedQuery<');
        expect(code).toContain('OrdersByRegion: OperationsOrdersByRegion,');
        expect(code).toContain('OrdersByRegion: SalesOrdersByRegion,');
    });

    it('disambiguates a leaf query whose identifier collides with a sibling child category in Queries', () => {
        const leafCollidingWithCategory: TypedQueryCodeGenQuery = {
            ID: 'bbbbbbbb-0000-0000-0000-000000000001',
            Name: 'Reports',
            Status: 'Approved',
            Reusable: true,
            CategoryPath: '/Sales/',
            Parameters: [],
            Fields: [{ Name: 'Total', SQLBaseType: 'decimal', InAllBranchVariants: true }],
        };
        const nestedUnderCategory: TypedQueryCodeGenQuery = {
            ID: 'bbbbbbbb-0000-0000-0000-000000000002',
            Name: 'Monthly Revenue',
            Status: 'Approved',
            Reusable: true,
            CategoryPath: '/Sales/Reports/',
            Parameters: [],
            Fields: [{ Name: 'Revenue', SQLBaseType: 'decimal', InAllBranchVariants: true }],
        };

        const code = GenerateTypedQueriesFileContent(
            [leafCollidingWithCategory, nestedUnderCategory],
            sampleEntities,
            { platform: 'sqlserver' },
        );
        // Child category takes `Reports: {`, while the sibling leaf query is disambiguated as `ReportsQuery: Reports,`
        expect(code).toContain('Reports: {');
        expect(code).toContain('MonthlyRevenue,');
        expect(code).toContain('ReportsQuery: Reports,');
    });

    it('matches runtime ComputeTypedQuerySignature(liveQuery) when query.Parameters is populated and falls back to template parameters when empty', () => {
        const persistedQuery: TypedQueryCodeGenQuery = {
            ID: 'cccccccc-0000-0000-0000-000000000001',
            Name: 'Partial Metadata Query',
            Status: 'Approved',
            Reusable: true,
            CategoryPath: '/Sales/',
            SQL: `
                {# @param {string} mysteryParam Overridden via doc comment #}
                SELECT Total FROM Orders
                WHERE Region = {{ region | sqlString }}
                  AND Mystery = {{ mysteryParam }}
                  AND Extra = {{ templateOnlyParam | sqlNumber }}
            `,
            Parameters: [
                {
                    Name: 'region',
                    Type: 'string',
                    IsRequired: true,
                    DefaultValue: null,
                    DetectionMethod: 'Manual',
                },
                {
                    Name: 'mysteryParam',
                    Type: 'unknown',
                    IsRequired: true,
                    DefaultValue: null,
                    DetectionMethod: 'Auto',
                },
            ],
            Fields: [{ Name: 'Total', SQLBaseType: 'decimal', InAllBranchVariants: true }],
        };

        const codePersisted = GenerateTypedQueriesFileContent([persistedQuery], sampleEntities, {
            platform: 'sqlserver',
        });
        const emittedSig = /Signature:\s*"([^"]+)"/.exec(codePersisted)?.[1];
        const runtimeSig = ComputeTypedQuerySignature({
            Parameters: persistedQuery.Parameters,
            Fields: persistedQuery.Fields,
        });
        expect(emittedSig).toBe(runtimeSig);

        // Fallback when query.Parameters is empty: hashes template-extracted parameters
        const templateOnly1: TypedQueryCodeGenQuery = {
            ...persistedQuery,
            Parameters: [],
            SQL: 'SELECT Total FROM Orders WHERE Region = {{ region | sqlString }} AND Total >= {{ minTotal | sqlNumber }}',
        };
        const templateOnly2: TypedQueryCodeGenQuery = {
            ...persistedQuery,
            Parameters: [],
            SQL: 'SELECT Total FROM Orders WHERE Region = {{ region | sqlString }}',
        };
        const sig1 = /Signature:\s*"([^"]+)"/.exec(
            GenerateTypedQueriesFileContent([templateOnly1], sampleEntities, { platform: 'sqlserver' }),
        )?.[1];
        const sig2 = /Signature:\s*"([^"]+)"/.exec(
            GenerateTypedQueriesFileContent([templateOnly2], sampleEntities, { platform: 'sqlserver' }),
        )?.[1];
        expect(sig1).toBeDefined();
        expect(sig2).toBeDefined();
        expect(sig1).not.toBe(sig2);
    });

    it('emits identical Params interface regardless of query.Parameters array order', () => {
        const makeQuery = (params: NonNullable<TypedQueryCodeGenQuery['Parameters']>): TypedQueryCodeGenQuery => ({
            ID: '52E5C84F-6B00-45AA-BCB4-9429B1CE5BA7',
            Name: 'Entity Records By Tag',
            Status: 'Approved',
            Reusable: true,
            CategoryPath: '/MJ/Tags/',
            Parameters: params,
            Fields: [{ Name: 'RecordID', SQLBaseType: 'nvarchar', InAllBranchVariants: true }],
        });

        const forward = GenerateTypedQueriesFileContent(
            [
                makeQuery([
                    { Name: 'entityName', Type: 'string', IsRequired: true, DefaultValue: null, DetectionMethod: 'Auto' },
                    { Name: 'tagName', Type: 'string', IsRequired: true, DefaultValue: null, DetectionMethod: 'Auto' },
                ]),
            ],
            sampleEntities,
            { platform: 'sqlserver' },
        );
        const reversed = GenerateTypedQueriesFileContent(
            [
                makeQuery([
                    { Name: 'tagName', Type: 'string', IsRequired: true, DefaultValue: null, DetectionMethod: 'Auto' },
                    { Name: 'entityName', Type: 'string', IsRequired: true, DefaultValue: null, DetectionMethod: 'Auto' },
                ]),
            ],
            sampleEntities,
            { platform: 'sqlserver' },
        );
        expect(forward).toBe(reversed);
        expect(forward.indexOf('entityName: string;')).toBeLessThan(forward.indexOf('tagName: string;'));
    });
});

describe('typed_query_codegen — QueryEngine input and the DefineTypedQuery import', () => {
    const approved: TypedQueryCodeGenQuery = {
        ID: 'dddddddd-0000-0000-0000-000000000001',
        Name: 'Order Totals',
        Status: 'Approved',
        Reusable: true,
        CategoryPath: '/Sales/',
        SQL: 'SELECT Total FROM Orders',
        Fields: [{ Name: 'Total', SQLBaseType: 'decimal', InAllBranchVariants: true }],
    };

    it('imports DefineTypedQuery from @memberjunction/core-entities by default', () => {
        const code = GenerateTypedQueriesFileContent([approved], sampleEntities, { platform: 'sqlserver' });
        expect(TypedQueryDefinerModule).toBe('@memberjunction/core-entities');
        expect(code).toContain("import { DefineTypedQuery } from '@memberjunction/core-entities';");
        expect(code).not.toContain("from '@memberjunction/core';");
    });

    it('imports DefineTypedQuery from the module it is given, for output inside core-entities itself', () => {
        const code = GenerateTypedQueriesFileContent([approved], sampleEntities, { platform: 'sqlserver', definerModule: '../../custom/typedQuery.js' });
        expect(code).toContain("import { DefineTypedQuery } from '../../custom/typedQuery.js';");
    });

    it('reads a QueryEngine query through its QueryParameters, QueryFields and QueryEntities', () => {
        const parameters = [{ Name: 'region', Type: 'string', IsRequired: true, DefaultValue: null, IsServerSet: false }];
        const fields = [{ Name: 'Total', SQLBaseType: 'decimal', InAllBranchVariants: true, Sequence: 1 }];
        const entities = [{ EntityID: 'ent-orders', Entity: 'Orders' }];
        const engineQuery = {
            ID: 'dddddddd-0000-0000-0000-000000000002',
            Name: 'Orders By Region',
            Description: null,
            SQL: 'SELECT Total FROM Orders WHERE Region = {{ region | sqlString }}',
            Status: 'Approved',
            Reusable: true,
            CategoryPath: '/Sales/',
            Category: 'Sales',
            QueryParameters: parameters,
            QueryFields: fields,
            QueryEntities: entities,
        } as unknown as MJQueryEntityExtended;

        const [adapted] = TypedQueryCodeGenQueriesFromEngine([engineQuery]);

        expect(adapted).toMatchObject({ ID: engineQuery.ID, Name: 'Orders By Region', CategoryPath: '/Sales/', Category: 'Sales', Status: 'Approved', Reusable: true });
        expect(adapted.Parameters).toBe(parameters);
        expect(adapted.Fields).toBe(fields);
        expect(adapted.Entities).toBe(entities);
        // The emitted signature is the one the runtime drift check computes from the same query.
        const code = GenerateTypedQueriesFileContent([adapted], sampleEntities, { platform: 'sqlserver' });
        const emitted = /Signature:\s*"([^"]+)"/.exec(code)?.[1];
        expect(emitted).toBe(ComputeTypedQuerySignature({ Parameters: parameters, Fields: fields }));
    });
});
