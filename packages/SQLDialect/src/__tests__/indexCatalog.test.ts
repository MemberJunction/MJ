import { describe, it, expect } from 'vitest';
import {
    NormalizeIndexType,
    BuildSQLServerIndexCatalogQuery,
    MapSQLServerIndexCatalogRows,
    POSTGRESQL_INDEX_CATALOG_QUERY,
    BuildPostgreSQLIndexCatalogQuery,
    MapPostgreSQLIndexCatalogRows,
    MYSQL_INDEX_CATALOG_QUERY,
    MapMySQLIndexCatalogRows,
    type SQLServerIndexCatalogRow,
    type PostgreSQLIndexCatalogRow,
    type MySQLIndexCatalogRow,
} from '../indexCatalog.js';

describe('NormalizeIndexType', () => {
    it('maps SQL Server native types', () => {
        expect(NormalizeIndexType('CLUSTERED')).toBe('BTree');
        expect(NormalizeIndexType('NONCLUSTERED')).toBe('BTree');
        expect(NormalizeIndexType('CLUSTERED COLUMNSTORE')).toBe('Columnstore');
        expect(NormalizeIndexType('NONCLUSTERED COLUMNSTORE')).toBe('Columnstore');
        expect(NormalizeIndexType('NONCLUSTERED HASH')).toBe('Hash');
        expect(NormalizeIndexType('SPATIAL')).toBe('Spatial');
        expect(NormalizeIndexType('XML')).toBe('XML');
    });

    it('maps PostgreSQL access methods', () => {
        expect(NormalizeIndexType('btree')).toBe('BTree');
        expect(NormalizeIndexType('hash')).toBe('Hash');
        expect(NormalizeIndexType('gin')).toBe('GIN');
        expect(NormalizeIndexType('gist')).toBe('GiST');
        expect(NormalizeIndexType('spgist')).toBe('GiST');
        expect(NormalizeIndexType('brin')).toBe('BRIN');
    });

    it('maps MySQL index types and unknown values', () => {
        expect(NormalizeIndexType('BTREE')).toBe('BTree');
        expect(NormalizeIndexType('FULLTEXT')).toBe('FullText');
        expect(NormalizeIndexType('RTREE')).toBe('Spatial');
        expect(NormalizeIndexType('bloom')).toBe('Other');
        expect(NormalizeIndexType(null)).toBe('Other');
    });
});

describe('SQL Server index catalog', () => {
    it('builds query with escaped schema filter and excludes disabled/hypothetical/heaps', () => {
        const sql = BuildSQLServerIndexCatalogQuery({ SchemaName: "o'brien" });
        expect(sql).toContain("s.name = N'o''brien'");
        expect(sql).toContain('i.type > 0');
        expect(sql).toContain('i.is_hypothetical = 0');
        expect(sql).toContain('i.is_disabled = 0');
    });

    it('builds query with ExcludeSchemas filter', () => {
        const sql = BuildSQLServerIndexCatalogQuery({ ExcludeSchemas: ['sys', 'temp'] });
        expect(sql).toContain("s.name NOT IN (N'sys', N'temp')");
    });

    it('maps clustered PK, composite DESC key, INCLUDE columns, and filtered index', () => {
        const rows: SQLServerIndexCatalogRow[] = [
            {
                SchemaName: '__mj', TableName: 'Action', IndexName: 'PK_Action',
                NativeType: 'CLUSTERED', IsUnique: true, IsPrimaryKey: true, IsClustered: true,
                FilterDefinition: null, ColumnName: 'ID', IsIncludedColumn: false, IsDescendingKey: false,
                KeyOrdinal: 1, IndexColumnID: 1,
            },
            {
                SchemaName: '__mj', TableName: 'Action', IndexName: 'IX_Action_Status_Created',
                NativeType: 'NONCLUSTERED', IsUnique: false, IsPrimaryKey: false, IsClustered: false,
                FilterDefinition: "([Status]<>'Archived')", ColumnName: 'Name', IsIncludedColumn: true, IsDescendingKey: false,
                KeyOrdinal: 0, IndexColumnID: 3,
            },
            {
                SchemaName: '__mj', TableName: 'Action', IndexName: 'IX_Action_Status_Created',
                NativeType: 'NONCLUSTERED', IsUnique: false, IsPrimaryKey: false, IsClustered: false,
                FilterDefinition: "([Status]<>'Archived')", ColumnName: 'CreatedAt', IsIncludedColumn: false, IsDescendingKey: true,
                KeyOrdinal: 2, IndexColumnID: 2,
            },
            {
                SchemaName: '__mj', TableName: 'Action', IndexName: 'IX_Action_Status_Created',
                NativeType: 'NONCLUSTERED', IsUnique: false, IsPrimaryKey: false, IsClustered: false,
                FilterDefinition: "([Status]<>'Archived')", ColumnName: 'Status', IsIncludedColumn: false, IsDescendingKey: false,
                KeyOrdinal: 1, IndexColumnID: 1,
            },
        ];

        const indexes = MapSQLServerIndexCatalogRows(rows);
        expect(indexes).toHaveLength(2);

        const pk = indexes.find((i) => i.IndexName === 'PK_Action')!;
        expect(pk).toMatchObject({
            IndexType: 'BTree',
            NativeType: 'CLUSTERED',
            IsUnique: true,
            IsPrimaryKey: true,
            IsClustered: true,
            FilterDefinition: null,
            HasExpressions: false,
        });
        expect(pk.Fields).toEqual([
            { ColumnName: 'ID', Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
        ]);

        const ix = indexes.find((i) => i.IndexName === 'IX_Action_Status_Created')!;
        expect(ix).toMatchObject({
            IndexType: 'BTree',
            NativeType: 'NONCLUSTERED',
            IsUnique: false,
            IsPrimaryKey: false,
            IsClustered: false,
            FilterDefinition: "([Status]<>'Archived')",
        });
        expect(ix.Fields).toEqual([
            { ColumnName: 'Status', Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
            { ColumnName: 'CreatedAt', Expression: null, Sequence: 2, Role: 'Key', SortDirection: 'DESC' },
            { ColumnName: 'Name', Expression: null, Sequence: 3, Role: 'Include', SortDirection: 'ASC' },
        ]);
    });

    it('handles columnstore index with no index_columns rows', () => {
        const rows: SQLServerIndexCatalogRow[] = [{
            SchemaName: 'analytics', TableName: 'FactSales', IndexName: 'CCI_FactSales',
            NativeType: 'CLUSTERED COLUMNSTORE', IsUnique: false, IsPrimaryKey: false, IsClustered: true,
            FilterDefinition: null, ColumnName: null, IsIncludedColumn: null, IsDescendingKey: null,
            KeyOrdinal: null, IndexColumnID: null,
        }];
        const [cci] = MapSQLServerIndexCatalogRows(rows);
        expect(cci.IndexType).toBe('Columnstore');
        expect(cci.IsClustered).toBe(true);
        expect(cci.Fields).toEqual([]);
    });
});

describe('PostgreSQL index catalog', () => {
    it('exports parameterized single-schema query and builds multi-schema ExcludeSchemas query', () => {
        expect(POSTGRESQL_INDEX_CATALOG_QUERY).toContain('n.nspname = $1');
        expect(POSTGRESQL_INDEX_CATALOG_QUERY).toContain('pg_get_indexdef(ix.indexrelid, k.ord::int, true)');

        const sql = BuildPostgreSQLIndexCatalogQuery({ ExcludeSchemas: ['pg_temp', 'audit'] });
        expect(sql).toContain("n.nspname NOT IN ('pg_temp', 'audit')");
        expect(sql).toContain('ix.indisvalid');
        expect(sql).toContain('ix.indisready');
    });

    it('maps partial index, INCLUDE columns, DESC key, GIN index, and expression key parts', () => {
        const rows: PostgreSQLIndexCatalogRow[] = [
            {
                SchemaName: '__mj', TableName: 'User', IndexName: 'ix_user_email_lower',
                NativeType: 'btree', IsUnique: true, IsPrimaryKey: false, IsClustered: false,
                FilterDefinition: '(is_active = true)', HasExpressions: true,
                ColumnName: null, Expression: 'lower(email)', Sequence: 1, IsIncluded: false, IsDescending: false,
            },
            {
                SchemaName: '__mj', TableName: 'User', IndexName: 'ix_user_email_lower',
                NativeType: 'btree', IsUnique: true, IsPrimaryKey: false, IsClustered: false,
                FilterDefinition: '(is_active = true)', HasExpressions: true,
                ColumnName: 'created_at', Expression: null, Sequence: 2, IsIncluded: false, IsDescending: true,
            },
            {
                SchemaName: '__mj', TableName: 'User', IndexName: 'ix_user_email_lower',
                NativeType: 'btree', IsUnique: true, IsPrimaryKey: false, IsClustered: false,
                FilterDefinition: '(is_active = true)', HasExpressions: true,
                ColumnName: 'display_name', Expression: null, Sequence: 3, IsIncluded: true, IsDescending: false,
            },
            {
                SchemaName: '__mj', TableName: 'User', IndexName: 'ix_user_tags_gin',
                NativeType: 'gin', IsUnique: false, IsPrimaryKey: false, IsClustered: false,
                FilterDefinition: null, HasExpressions: false,
                ColumnName: 'tags', Expression: null, Sequence: 1, IsIncluded: false, IsDescending: false,
            },
        ];

        const indexes = MapPostgreSQLIndexCatalogRows(rows);
        expect(indexes).toHaveLength(2);

        const exprIdx = indexes.find((i) => i.IndexName === 'ix_user_email_lower')!;
        expect(exprIdx).toMatchObject({
            IndexType: 'BTree',
            NativeType: 'btree',
            IsUnique: true,
            IsPrimaryKey: false,
            IsClustered: false,
            FilterDefinition: '(is_active = true)',
            HasExpressions: true,
        });
        expect(exprIdx.Fields).toEqual([
            { ColumnName: null, Expression: 'lower(email)', Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
            { ColumnName: 'created_at', Expression: null, Sequence: 2, Role: 'Key', SortDirection: 'DESC' },
            { ColumnName: 'display_name', Expression: null, Sequence: 3, Role: 'Include', SortDirection: 'ASC' },
        ]);

        const ginIdx = indexes.find((i) => i.IndexName === 'ix_user_tags_gin')!;
        expect(ginIdx.IndexType).toBe('GIN');
        expect(ginIdx.Fields).toEqual([
            { ColumnName: 'tags', Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
        ]);
    });
});

describe('MySQL index catalog', () => {
    it('groups per-column rows in sequence order with sort direction and expression flag', () => {
        expect(MYSQL_INDEX_CATALOG_QUERY).toContain('FROM information_schema.STATISTICS');
        const rows: MySQLIndexCatalogRow[] = [
            { SchemaName: 'app', TableName: 'orders', IndexName: 'ix_ab', NonUnique: 1, NativeType: 'BTREE', ColumnName: 'b', Sequence: 2, Collation: 'D' },
            { SchemaName: 'app', TableName: 'orders', IndexName: 'ix_ab', NonUnique: 1, NativeType: 'BTREE', ColumnName: 'a', Sequence: 1, Collation: 'A' },
            { SchemaName: 'app', TableName: 'orders', IndexName: 'PRIMARY', NonUnique: '0', NativeType: 'BTREE', ColumnName: 'id', Sequence: 1, Collation: 'A' },
            { SchemaName: 'app', TableName: 'orders', IndexName: 'ix_fn', NonUnique: 1, NativeType: 'BTREE', ColumnName: null, Sequence: 1, Collation: 'A' },
        ];

        const indexes = MapMySQLIndexCatalogRows(rows);
        const byName = Object.fromEntries(indexes.map((i) => [i.IndexName, i]));
        expect(byName['ix_ab'].Fields).toEqual([
            { ColumnName: 'a', Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
            { ColumnName: 'b', Expression: null, Sequence: 2, Role: 'Key', SortDirection: 'DESC' },
        ]);
        expect(byName['PRIMARY']).toMatchObject({ IsPrimaryKey: true, IsUnique: true, IsClustered: true });
        expect(byName['ix_fn']).toMatchObject({ HasExpressions: true });
        expect(byName['ix_fn'].Fields).toEqual([
            { ColumnName: null, Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
        ]);
    });
});
