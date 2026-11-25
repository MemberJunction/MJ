import { describe, it, expect } from 'vitest';
import { SQLServerDialect, PostgreSQLDialect, type CatalogIndex } from '@memberjunction/sql-dialect';
import {
   ResolveDesiredEntityIndexes,
   DiffEntityIndexes,
   BuildEntityIndexSyncSQL,
   ClassifyCatalogIndexSource,
   type IndexSyncEntityRef,
   type IndexSyncEntityFieldRef,
   type StoredEntityIndex,
   type StoredEntityIndexField,
} from '../Database/entity-index-sync';

const ENTITY_ORDER: IndexSyncEntityRef = {
   ID: '11111111-1111-1111-1111-111111111111',
   SchemaName: 'dbo',
   BaseTable: 'Order',
   VirtualEntity: false,
};
const ENTITY_VIRTUAL: IndexSyncEntityRef = {
   ID: '11111111-1111-1111-1111-111111111112',
   SchemaName: 'dbo',
   BaseTable: 'vwOrderSummary',
   VirtualEntity: true,
};

const FIELD_ID = '22222222-2222-2222-2222-222222222201';
const FIELD_CUSTOMER = '22222222-2222-2222-2222-222222222202';
const FIELD_STATUS = '22222222-2222-2222-2222-222222222203';
const FIELD_TOTAL = '22222222-2222-2222-2222-222222222204';

const FIELDS: IndexSyncEntityFieldRef[] = [
   { ID: FIELD_ID, EntityID: ENTITY_ORDER.ID, Name: 'ID' },
   { ID: FIELD_CUSTOMER, EntityID: ENTITY_ORDER.ID, Name: 'CustomerID' },
   { ID: FIELD_STATUS, EntityID: ENTITY_ORDER.ID, Name: 'Status' },
   { ID: FIELD_TOTAL, EntityID: ENTITY_ORDER.ID, Name: 'Total' },
];

function catalogIdx(overrides: Partial<CatalogIndex>): CatalogIndex {
   return {
      SchemaName: 'dbo',
      TableName: 'Order',
      IndexName: 'IX_Order_CustomerID',
      IndexType: 'BTree',
      NativeType: 'NONCLUSTERED',
      IsUnique: false,
      IsPrimaryKey: false,
      IsClustered: false,
      FilterDefinition: null,
      HasExpressions: false,
      Fields: [{ ColumnName: 'CustomerID', Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' }],
      ...overrides,
   };
}

describe('entity-index-sync', () => {
   it('ignores non-entity tables and virtual entities, and marks IDX_AUTO_MJ_FKEY_* as CodeGen', () => {
      const catalog: CatalogIndex[] = [
         catalogIdx({ IndexName: 'IDX_AUTO_MJ_FKEY_Order_CustomerID' }),
         catalogIdx({ TableName: 'flyway_schema_history', IndexName: 'PK_flyway' }),
         catalogIdx({ TableName: 'vwOrderSummary', IndexName: 'IX_Virtual' }),
         catalogIdx({
            IndexName: 'IX_Order_LowerStatus_Expr',
            HasExpressions: true,
            Fields: [
               { ColumnName: null, Expression: 'lower(status)', Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
               { ColumnName: 'Total', Expression: null, Sequence: 2, Role: 'Include', SortDirection: 'ASC' },
            ],
         }),
      ];

      const desired = ResolveDesiredEntityIndexes(catalog, [ENTITY_ORDER, ENTITY_VIRTUAL], FIELDS);
      expect(desired).toHaveLength(2);

      const fkIdx = desired.find((d) => d.Name === 'IDX_AUTO_MJ_FKEY_Order_CustomerID')!;
      expect(fkIdx.Source).toBe('CodeGen');
      expect(fkIdx.Fields).toEqual([
         { EntityFieldID: FIELD_CUSTOMER, Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
      ]);

      const exprIdx = desired.find((d) => d.Name === 'IX_Order_LowerStatus_Expr')!;
      expect(exprIdx.Source).toBe('Database');
      expect(exprIdx.HasExpressions).toBe(true);
      expect(exprIdx.Fields).toEqual([
         { EntityFieldID: null, Expression: 'lower(status)', Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
         { EntityFieldID: FIELD_TOTAL, Expression: null, Sequence: 2, Role: 'Include', SortDirection: 'ASC' },
      ]);

      expect(ClassifyCatalogIndexSource('idx_auto_mj_fkey_Foo_Bar')).toBe('CodeGen');
      expect(ClassifyCatalogIndexSource('IX_Foo_Bar')).toBe('Database');
   });

   it('adds new indexes, updates changed ones, and deletes removed Active indexes', () => {
      const desired = ResolveDesiredEntityIndexes(
         [
            catalogIdx({ IndexName: 'PK_Order', IsPrimaryKey: true, IsUnique: true, IsClustered: true, NativeType: 'CLUSTERED', Fields: [{ ColumnName: 'ID', Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' }] }),
            catalogIdx({
               IndexName: 'IX_Order_Status',
               FilterDefinition: "([Status]<>'Closed')",
               Fields: [
                  { ColumnName: 'Status', Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'DESC' },
                  { ColumnName: 'Total', Expression: null, Sequence: 2, Role: 'Include', SortDirection: 'ASC' },
               ],
            }),
         ],
         [ENTITY_ORDER],
         FIELDS,
      );

      const stored: StoredEntityIndex[] = [
         {
            ID: 'aaaa-0001', EntityID: ENTITY_ORDER.ID, Name: 'IX_Order_Status',
            IndexType: 'BTree', NativeType: 'NONCLUSTERED', IsUnique: false, IsPrimaryKey: false,
            IsClustered: false, FilterDefinition: null, HasExpressions: false,
            Source: 'Database', Status: 'Active', Description: null,
         },
         {
            ID: 'aaaa-0002', EntityID: ENTITY_ORDER.ID, Name: 'IX_Order_Dropped',
            IndexType: 'BTree', NativeType: 'NONCLUSTERED', IsUnique: false, IsPrimaryKey: false,
            IsClustered: false, FilterDefinition: null, HasExpressions: false,
            Source: 'Database', Status: 'Active', Description: null,
         },
      ];
      const storedFields: StoredEntityIndexField[] = [
         { ID: 'f-1', EntityIndexID: 'aaaa-0001', EntityFieldID: FIELD_STATUS, Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
      ];

      const changes = DiffEntityIndexes(desired, stored, storedFields);
      expect(changes.Inserts.map((i) => i.Name)).toEqual(['PK_Order']);
      expect(changes.Updates).toHaveLength(1);
      expect(changes.Updates[0]).toMatchObject({ ID: 'aaaa-0001', HeaderChanged: true, FieldsChanged: true, PromotedFromProposed: false });
      expect(changes.Deletes.map((d) => d.Name)).toEqual(['IX_Order_Dropped']);
   });

   it('preserves Proposed and Rejected rows and never deletes them', () => {
      const stored: StoredEntityIndex[] = [
         {
            ID: 'prop-1', EntityID: ENTITY_ORDER.ID, Name: 'IX_Proposed_Customer',
            IndexType: 'BTree', NativeType: '', IsUnique: false, IsPrimaryKey: false,
            IsClustered: false, FilterDefinition: null, HasExpressions: false,
            Source: 'DBAutoDoc', Status: 'Proposed', Description: 'Missing FK index',
         },
         {
            ID: 'rej-1', EntityID: ENTITY_ORDER.ID, Name: 'IX_Rejected_Total',
            IndexType: 'BTree', NativeType: '', IsUnique: false, IsPrimaryKey: false,
            IsClustered: false, FilterDefinition: null, HasExpressions: false,
            Source: 'DBAutoDoc', Status: 'Rejected', Description: 'Not needed',
         },
      ];

      const changes = DiffEntityIndexes([], stored, []);
      expect(changes.Inserts).toEqual([]);
      expect(changes.Updates).toEqual([]);
      expect(changes.Deletes).toEqual([]);
   });

   it('promotes Proposed rows to Active when matched by name or normalized signature, preserving DBAutoDoc source', () => {
      const desired = ResolveDesiredEntityIndexes(
         [
            catalogIdx({ IndexName: 'IX_DBA_Created_CustomerID', Fields: [{ ColumnName: 'CustomerID', Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' }] }),
         ],
         [ENTITY_ORDER],
         FIELDS,
      );

      const stored: StoredEntityIndex[] = [
         {
            ID: 'prop-sig', EntityID: ENTITY_ORDER.ID, Name: 'IX_Proposed_Order_CustomerID',
            IndexType: 'BTree', NativeType: '', IsUnique: false, IsPrimaryKey: false,
            IsClustered: false, FilterDefinition: null, HasExpressions: false,
            Source: 'DBAutoDoc', Status: 'Proposed', Description: 'FK coverage',
         },
      ];
      const storedFields: StoredEntityIndexField[] = [
         { ID: 'pf-1', EntityIndexID: 'prop-sig', EntityFieldID: FIELD_CUSTOMER.toUpperCase(), Expression: null, Sequence: 1, Role: 'Key', SortDirection: 'ASC' },
      ];

      const changes = DiffEntityIndexes(desired, stored, storedFields);
      expect(changes.Inserts).toEqual([]);
      expect(changes.Deletes).toEqual([]);
      expect(changes.Updates).toHaveLength(1);
      expect(changes.Updates[0]).toMatchObject({
         ID: 'prop-sig',
         PromotedFromProposed: true,
         HeaderChanged: true,
         FieldsChanged: false,
      });
      expect(changes.Updates[0].Desired.Name).toBe('IX_DBA_Created_CustomerID');
      expect(changes.Updates[0].Desired.Status).toBe('Active');
      expect(changes.Updates[0].Desired.Source).toBe('DBAutoDoc');
   });

   it('emits dialect-specific SQL for SQL Server and PostgreSQL', () => {
      const desired = ResolveDesiredEntityIndexes([catalogIdx({})], [ENTITY_ORDER], FIELDS);
      const changes = DiffEntityIndexes(desired, [], []);
      let seq = 0;
      const nextId = () => `id-${++seq}`;

      const mssql = BuildEntityIndexSyncSQL(new SQLServerDialect(), '__mj', changes, nextId);
      expect(mssql).toHaveLength(2);
      expect(mssql[0]).toContain('INSERT INTO [__mj].[EntityIndex]');
      expect(mssql[1]).toContain('INSERT INTO [__mj].[EntityIndexField]');

      const pg = BuildEntityIndexSyncSQL(new PostgreSQLDialect(), '__mj', changes, nextId);
      expect(pg).toHaveLength(2);
      expect(pg[0]).toContain('INSERT INTO "__mj"."EntityIndex"');
      expect(pg[1]).toContain('INSERT INTO "__mj"."EntityIndexField"');
   });
});
