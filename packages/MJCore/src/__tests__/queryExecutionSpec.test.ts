import { describe, it, expect, vi, afterEach } from 'vitest';
import { BuildSpecFromQueryInfo, QueryExecutionSpec, QueryDependencySpec } from '../generic/queryExecutionSpec';
import { QueryInfo } from '../generic/queryInfo';
import { Metadata } from '../generic/metadata';

// ---- Helpers ----

function makeQueryInfo(overrides: Partial<{
    ID: string;
    Name: string;
    SQL: string;
    Status: QueryInfo['Status'];
    Reusable: boolean;
    UsesTemplate: boolean;
}>): QueryInfo {
    const q = new QueryInfo();
    q.ID = overrides.ID ?? 'q-1';
    q.Name = overrides.Name ?? 'Test Query';
    q.SQL = overrides.SQL ?? 'SELECT 1';
    q.Status = overrides.Status ?? 'Approved';
    q.Reusable = overrides.Reusable ?? false;
    q.UsesTemplate = overrides.UsesTemplate ?? false;

    // Mock GetPlatformSQL — for sqlserver, returns SQL directly
    q.GetPlatformSQL = vi.fn().mockImplementation((platform: string) => {
        return q.SQL;
    });

    return q;
}

function mockProvider(overrides: Partial<{
    Queries: QueryInfo[];
    QueryParameters: unknown[];
    QueryFields: unknown[];
    QueryPermissions: unknown[];
}>): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: overrides.Queries ?? [],
        QueryParameters: overrides.QueryParameters ?? [],
        QueryFields: overrides.QueryFields ?? [],
        QueryPermissions: overrides.QueryPermissions ?? [],
    } as ReturnType<typeof Metadata.Provider>);
}

// ---- Tests ----

describe('QueryExecutionSpec', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ================================================================
    // Interface shape validation
    // ================================================================
    describe('interface shape', () => {
        it('should allow a minimal spec with just SQL', () => {
            const spec: QueryExecutionSpec = {
                SQL: 'SELECT 1',
            };
            expect(spec.SQL).toBe('SELECT 1');
            expect(spec.Parameters).toBeUndefined();
            expect(spec.UsesTemplate).toBeUndefined();
            expect(spec.ParameterDefinitions).toBeUndefined();
            expect(spec.Dependencies).toBeUndefined();
            expect(spec.MaxRows).toBeUndefined();
        });

        it('should allow a fully populated spec', () => {
            const spec: QueryExecutionSpec = {
                SQL: 'SELECT * FROM Users WHERE Region = {{ region }}',
                Parameters: { region: 'Northeast' },
                UsesTemplate: true,
                ParameterDefinitions: [],
                Dependencies: [
                    {
                        Name: 'Active Users',
                        CategoryPath: '/Demos/',
                        SQL: 'SELECT ID FROM Users WHERE Active = 1',
                    },
                ],
                MaxRows: 500,
            };

            expect(spec.SQL).toContain('{{ region }}');
            expect(spec.Parameters).toEqual({ region: 'Northeast' });
            expect(spec.UsesTemplate).toBe(true);
            expect(spec.Dependencies).toHaveLength(1);
            expect(spec.MaxRows).toBe(500);
        });
    });

    // ================================================================
    // QueryDependencySpec
    // ================================================================
    describe('QueryDependencySpec', () => {
        it('should support minimal dependency with Name, CategoryPath, SQL', () => {
            const dep: QueryDependencySpec = {
                Name: 'Active Customers',
                CategoryPath: '/Sales/',
                SQL: 'SELECT ID, Name FROM Customers WHERE Active = 1',
            };

            expect(dep.Name).toBe('Active Customers');
            expect(dep.CategoryPath).toBe('/Sales/');
            expect(dep.SQL).toContain('Active = 1');
            expect(dep.Dependencies).toBeUndefined();
        });

        it('should support recursive nested dependencies', () => {
            const dep: QueryDependencySpec = {
                Name: 'Revenue Summary',
                CategoryPath: '/Analytics/',
                SQL: 'SELECT SUM(Amount) FROM {{query:"Analytics/Revenue Detail"}} rd',
                Dependencies: [
                    {
                        Name: 'Revenue Detail',
                        CategoryPath: '/Analytics/',
                        SQL: 'SELECT Amount, Region FROM Orders WHERE Status = \'Completed\'',
                    },
                ],
            };

            expect(dep.Dependencies).toHaveLength(1);
            expect(dep.Dependencies![0].Name).toBe('Revenue Detail');
        });

        it('should support deeply nested dependencies (3 levels)', () => {
            const leaf: QueryDependencySpec = {
                Name: 'Leaf',
                CategoryPath: '/Deep/',
                SQL: 'SELECT 1 AS Val',
            };

            const mid: QueryDependencySpec = {
                Name: 'Mid',
                CategoryPath: '/Deep/',
                SQL: 'SELECT * FROM {{query:"Deep/Leaf"}} l',
                Dependencies: [leaf],
            };

            const top: QueryDependencySpec = {
                Name: 'Top',
                CategoryPath: '/Deep/',
                SQL: 'SELECT * FROM {{query:"Deep/Mid"}} m',
                Dependencies: [mid],
            };

            expect(top.Dependencies).toHaveLength(1);
            expect(top.Dependencies![0].Dependencies).toHaveLength(1);
            expect(top.Dependencies![0].Dependencies![0].Name).toBe('Leaf');
        });

        it('should support template parameters on dependencies', () => {
            const dep: QueryDependencySpec = {
                Name: 'Parameterized Dep',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM Users WHERE Region = {{ region }}',
                UsesTemplate: true,
                Parameters: { region: 'West' },
                ParameterDefinitions: [],
            };

            expect(dep.UsesTemplate).toBe(true);
            expect(dep.Parameters).toEqual({ region: 'West' });
        });
    });

    // ================================================================
    // BuildSpecFromQueryInfo
    // ================================================================
    describe('BuildSpecFromQueryInfo', () => {
        it('should build a spec from a basic QueryInfo', () => {
            const query = makeQueryInfo({
                ID: 'q-build-1',
                Name: 'Simple Query',
                SQL: 'SELECT TOP 10 * FROM Users',
            });

            // Need to mock Metadata.Provider for Parameters getter
            mockProvider({ QueryParameters: [] });

            const spec = BuildSpecFromQueryInfo(query, 'sqlserver');

            expect(spec.SQL).toBe('SELECT TOP 10 * FROM Users');
            expect(spec.Parameters).toBeUndefined();
            expect(spec.UsesTemplate).toBe(false);
            expect(spec.Dependencies).toBeUndefined();
            expect(query.GetPlatformSQL).toHaveBeenCalledWith('sqlserver');
        });

        it('should pass through parameters', () => {
            const query = makeQueryInfo({
                SQL: 'SELECT * FROM Users WHERE Region = {{ region }}',
                UsesTemplate: true,
            });

            mockProvider({ QueryParameters: [] });

            const params = { region: 'Northeast', year: '2024' };
            const spec = BuildSpecFromQueryInfo(query, 'sqlserver', params);

            expect(spec.Parameters).toEqual(params);
            expect(spec.UsesTemplate).toBe(true);
        });

        it('should call GetPlatformSQL with the given platform', () => {
            const query = makeQueryInfo({ SQL: 'SELECT 1' });
            mockProvider({ QueryParameters: [] });

            BuildSpecFromQueryInfo(query, 'postgresql');

            expect(query.GetPlatformSQL).toHaveBeenCalledWith('postgresql');
        });

        it('should set Dependencies to undefined (saved queries use metadata lookup)', () => {
            const query = makeQueryInfo({ SQL: 'SELECT * FROM {{query:"Test/Dep"}} d' });
            mockProvider({ QueryParameters: [] });

            const spec = BuildSpecFromQueryInfo(query, 'sqlserver');

            // Saved queries resolve dependencies from Metadata.Provider.Queries at runtime,
            // not from inline specs
            expect(spec.Dependencies).toBeUndefined();
        });

        it('should include ParameterDefinitions from QueryInfo.Parameters', () => {
            const query = makeQueryInfo({
                SQL: 'SELECT * FROM Users WHERE Region = {{ region }}',
                UsesTemplate: true,
            });

            // Mock the Parameters getter to return definitions
            const mockParamDefs = [
                { ID: 'p-1', QueryID: 'q-1', Name: 'region', DataType: 'nvarchar' },
            ];
            mockProvider({ QueryParameters: mockParamDefs });

            const spec = BuildSpecFromQueryInfo(query, 'sqlserver');

            // Parameters should be populated from QueryInfo.Parameters getter
            expect(spec.ParameterDefinitions).toBeDefined();
        });

        it('should copy UsesTemplate flag accurately', () => {
            const templateQuery = makeQueryInfo({ UsesTemplate: true });
            const plainQuery = makeQueryInfo({ UsesTemplate: false });

            mockProvider({ QueryParameters: [] });

            expect(BuildSpecFromQueryInfo(templateQuery, 'sqlserver').UsesTemplate).toBe(true);
            expect(BuildSpecFromQueryInfo(plainQuery, 'sqlserver').UsesTemplate).toBe(false);
        });
    });
});
