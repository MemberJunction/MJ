import { describe, it, expect } from 'vitest';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import {
   BuildCatalogUniqueKeyColumnsSQL,
   BuildStoredUniqueKeySetsSQL,
   BuildUniqueKeySetSyncSQL,
   CatalogUniqueKeyColumn,
   DiffUniqueKeySets,
   GroupUniqueKeyColumns,
   StoredUniqueKeySet,
} from '../Database/unique-key-sets';

/**
 * #4536: CodeGen records each unique index or constraint as a key set in EntityUniqueKey, so a
 * composite key no longer has to be smeared over EntityField.IsUnique.
 */

const ACTION_PARAMS = 'AAAAAAAA-0000-0000-0000-000000000001';
const USERS = 'BBBBBBBB-0000-0000-0000-000000000002';

function col(entityID: string, index: string, column: string, ordinal: number, filter: string | null = null): CatalogUniqueKeyColumn {
   return { EntityID: entityID, IndexName: index, ColumnName: column, KeyOrdinal: ordinal, FilterDefinition: filter };
}

describe('GroupUniqueKeyColumns', () => {
   it('makes one key set per index, columns in key order', () => {
      const sets = GroupUniqueKeyColumns([
         col(ACTION_PARAMS, 'UQ_ActionParam_Name', 'Name', 2),
         col(ACTION_PARAMS, 'UQ_ActionParam_Name', 'ActionID', 1),
         col(USERS, 'UQ_User_Email', 'Email', 1),
      ]);
      expect(sets).toEqual([
         { EntityID: ACTION_PARAMS, Name: 'UQ_ActionParam_Name', FieldNames: 'ActionID,Name', FilterDefinition: null },
         { EntityID: USERS, Name: 'UQ_User_Email', FieldNames: 'Email', FilterDefinition: null },
      ]);
   });

   it('keeps the filter of a filtered or partial index', () => {
      const [set] = GroupUniqueKeyColumns([col(USERS, 'UX_User_Code', 'Code', 1, '([Code] IS NOT NULL)')]);
      expect(set.FilterDefinition).toBe('([Code] IS NOT NULL)');
   });

   it('keeps two indexes with the same name on different entities apart', () => {
      const sets = GroupUniqueKeyColumns([col(USERS, 'UQ_Name', 'Name', 1), col(ACTION_PARAMS, 'UQ_Name', 'Name', 1)]);
      expect(sets).toHaveLength(2);
   });
});

describe('DiffUniqueKeySets', () => {
   const stored = (id: string, entityID: string, name: string, fields: string, filter: string | null = null): StoredUniqueKeySet =>
      ({ ID: id, EntityID: entityID, Name: name, FieldNames: fields, FilterDefinition: filter });

   it('inserts new keys, deletes keys gone from the catalog and leaves matching keys alone', () => {
      const changes = DiffUniqueKeySets(
         [
            { EntityID: USERS, Name: 'UQ_User_Email', FieldNames: 'Email', FilterDefinition: null },
            { EntityID: USERS, Name: 'UQ_User_Login', FieldNames: 'Login', FilterDefinition: null },
         ],
         [stored('1', USERS, 'UQ_User_Email', 'Email'), stored('2', USERS, 'UQ_User_Old', 'Old')],
      );
      expect(changes.Inserts.map(i => i.Name)).toEqual(['UQ_User_Login']);
      expect(changes.Deletes.map(d => d.ID)).toEqual(['2']);
      expect(changes.Updates).toEqual([]);
   });

   it('updates a key whose columns or filter changed, keeping the stored ID', () => {
      const changes = DiffUniqueKeySets(
         [
            { EntityID: USERS, Name: 'UQ_A', FieldNames: 'A,B', FilterDefinition: null },
            { EntityID: USERS, Name: 'UQ_C', FieldNames: 'C', FilterDefinition: '([C] IS NOT NULL)' },
         ],
         [stored('1', USERS, 'UQ_A', 'A'), stored('2', USERS, 'UQ_C', 'C')],
      );
      expect(changes.Updates).toEqual([
         { ID: '1', EntityID: USERS, Name: 'UQ_A', FieldNames: 'A,B', FilterDefinition: null },
         { ID: '2', EntityID: USERS, Name: 'UQ_C', FieldNames: 'C', FilterDefinition: '([C] IS NOT NULL)' },
      ]);
      expect(changes.Inserts).toEqual([]);
      expect(changes.Deletes).toEqual([]);
   });

   it('matches entity IDs regardless of case and index names regardless of case', () => {
      const changes = DiffUniqueKeySets(
         [{ EntityID: USERS.toLowerCase(), Name: 'uq_user_email', FieldNames: 'Email', FilterDefinition: null }],
         [stored('1', USERS, 'UQ_User_Email', 'Email')],
      );
      expect(changes.Inserts).toEqual([]);
      expect(changes.Deletes).toEqual([]);
      // the name's case changed, so the row is rewritten with the catalog's spelling
      expect(changes.Updates.map(u => u.Name)).toEqual(['uq_user_email']);
   });

   it('deletes duplicate stored rows for one key beyond the first', () => {
      const changes = DiffUniqueKeySets(
         [{ EntityID: USERS, Name: 'UQ_A', FieldNames: 'A', FilterDefinition: null }],
         [stored('1', USERS, 'UQ_A', 'A'), stored('2', USERS, 'UQ_A', 'A')],
      );
      expect(changes.Deletes.map(d => d.ID)).toEqual(['2']);
   });

   it('is a no-op when the catalog and the stored rows already agree', () => {
      const desired = GroupUniqueKeyColumns([col(USERS, 'UQ_A', 'A', 1)]);
      const changes = DiffUniqueKeySets(desired, [stored('1', USERS, 'UQ_A', 'A')]);
      expect(changes).toEqual({ Inserts: [], Updates: [], Deletes: [] });
   });
});

describe('BuildUniqueKeySetSyncSQL', () => {
   const changes = {
      Inserts: [{ EntityID: USERS, Name: "UQ_O'Brien", FieldNames: 'A,B', FilterDefinition: '([Status]=N\'Active\')' }],
      Updates: [{ ID: '11111111-1111-1111-1111-111111111111', EntityID: USERS, Name: 'UQ_C', FieldNames: 'C', FilterDefinition: null }],
      Deletes: [{ ID: '22222222-2222-2222-2222-222222222222', EntityID: USERS, Name: 'UQ_D', FieldNames: 'D', FilterDefinition: null }],
   };

   it('deletes first, then updates, then inserts with explicit IDs (SQL Server)', () => {
      const sql = BuildUniqueKeySetSyncSQL(new SQLServerDialect(), '__mj', changes, () => '33333333-3333-3333-3333-333333333333');
      expect(sql).toHaveLength(3);
      expect(sql[0]).toBe(`DELETE FROM [__mj].[EntityUniqueKey] WHERE [ID] = '22222222-2222-2222-2222-222222222222'`);
      expect(sql[1]).toContain(`UPDATE [__mj].[EntityUniqueKey] SET [Name] = 'UQ_C', [FieldNames] = 'C', [FilterDefinition] = NULL`);
      expect(sql[1]).toContain(`WHERE [ID] = '11111111-1111-1111-1111-111111111111'`);
      expect(sql[2]).toBe(
         `INSERT INTO [__mj].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) ` +
         `VALUES ('33333333-3333-3333-3333-333333333333', '${USERS}', 'UQ_O''Brien', 'A,B', '([Status]=N''Active'')')`,
      );
   });

   it('quotes identifiers for PostgreSQL', () => {
      const sql = BuildUniqueKeySetSyncSQL(new PostgreSQLDialect(), '__mj', changes, () => '33333333-3333-3333-3333-333333333333');
      expect(sql[0]).toContain(`DELETE FROM "__mj"."EntityUniqueKey" WHERE "ID" =`);
      expect(sql[2]).toContain(`INSERT INTO "__mj"."EntityUniqueKey" ("ID", "EntityID", "Name", "FieldNames", "FilterDefinition")`);
   });

   it('emits nothing when there is nothing to change', () => {
      expect(BuildUniqueKeySetSyncSQL(new SQLServerDialect(), '__mj', { Inserts: [], Updates: [], Deletes: [] }, () => 'x')).toEqual([]);
   });
});

describe('catalog and stored-row queries', () => {
   it('reads key columns of non-virtual entities outside the excluded schemas', () => {
      const sql = BuildCatalogUniqueKeyColumnsSQL(new SQLServerDialect(), '__mj', ['sys', "o'dd"]);
      expect(sql).toContain('FROM [__mj].[vwTableUniqueKeys] uk');
      expect(sql).toContain('e.[SchemaName] = uk.[SchemaName] AND e.[BaseTable] = uk.[TableName]');
      expect(sql).toContain('e.[VirtualEntity] = 0');
      expect(sql).toContain(`e.[SchemaName] NOT IN ('sys', 'o''dd')`);
   });

   it('reads stored rows of every entity outside the excluded schemas, virtual ones included', () => {
      const sql = BuildStoredUniqueKeySetsSQL(new PostgreSQLDialect(), '__mj', []);
      expect(sql).toContain('FROM "__mj"."EntityUniqueKey" k');
      expect(sql).not.toContain('VirtualEntity');
      expect(sql).not.toContain('NOT IN');
   });
});
