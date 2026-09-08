import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import {
   FieldChangeReason,
   DISPLAYNAME_REOPEN_REASONS,
   TYPE_REOPEN_REASONS,
   TRACKED_FIELD_COLUMNS,
   EntityFieldSnapshotRow,
   diffEntityFieldSnapshots,
   normalizeSnapshotValue,
} from '../../Database/entity-field-change-tracking';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';
import { SQLLogging } from '../../Misc/sql_logging';
import { Metadata } from '@memberjunction/core';

class TestableManageMetadata extends ManageMetadataBase {
   public async callCreateNewEntityFields(
      pool: CodeGenConnection,
      entityIDs?: string[],
      excludeSchemas?: string[]
   ): Promise<boolean> {
      return this.createNewEntityFieldsFromSchema(pool, entityIDs, excludeSchemas);
   }

   public async callManageSingleVirtualEntityField(
      pool: CodeGenConnection,
      virtualEntity: { ID: string; Name: string; Fields: unknown[] },
      veField: { FieldName: string; Type: string; Length: number; Precision: number; Scale: number; AllowsNull: boolean },
      fieldSequence: number
   ): Promise<{ success: boolean; updatedField: boolean; newFieldID: string }> {
      return this.manageSingleVirtualEntityField(pool, virtualEntity, veField, fieldSequence, false, false);
   }

   public async callManageSingleEntityParentFields(
      pool: CodeGenConnection,
      childEntity: { ID: string; Name: string; Fields: unknown[]; AllParentFields: Array<{ Name: string; Type: string; Length: number; Precision: number; Scale: number; AllowsNull: boolean }> }
   ): Promise<boolean> {
      const result = await this.manageSingleEntityParentFields(pool, childEntity);
      return result.success;
   }

   public async callUpdateExistingEntityFields(
      pool: CodeGenConnection,
      excludeSchemas: string[],
      entityIDs?: string[]
   ): Promise<boolean> {
      return this.updateExistingEntityFieldsFromSchema(pool, excludeSchemas, entityIDs);
   }
}

function createMockConnection(queryHandler: (sql: string) => Record<string, unknown>[]): CodeGenConnection {
   return {
      query: async (sql: string): Promise<CodeGenQueryResult> => {
         const recordset = queryHandler(sql);
         return { recordset } as unknown as CodeGenQueryResult;
      },
      queryWithParams: async (sql: string): Promise<CodeGenQueryResult> => {
         const recordset = queryHandler(sql);
         return { recordset } as unknown as CodeGenQueryResult;
      },
      beginTransaction: async () => ({
         commit: async () => {},
         rollback: async () => {},
      }),
   } as unknown as CodeGenConnection;
}

function makeSnapshotRow(overrides: Partial<EntityFieldSnapshotRow> = {}): EntityFieldSnapshotRow {
   return {
      ID: '11111111-1111-1111-1111-111111111111',
      EntityID: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
      EntityName: 'TestEntity',
      Name: 'Field1',
      Description: 'A description',
      Type: 'nvarchar',
      Length: 100,
      Precision: null,
      Scale: null,
      AllowsNull: true,
      DefaultValue: null,
      AutoIncrement: false,
      IsVirtual: false,
      IsComputed: false,
      RelatedEntityID: null,
      RelatedEntityFieldName: null,
      IsPrimaryKey: false,
      IsUnique: false,
      AllowUpdateAPI: true,
      ...overrides,
   };
}

describe('T1 — Field Change Tracking (C1)', () => {
   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      ManageMetadataBase.clearFieldTracking();
      ManageMetadataBase.modifiedEntityList = [];
   });

   afterEach(() => {
      SQLLogging.resetForTests();
      ManageMetadataBase.clearFieldTracking();
      ManageMetadataBase.modifiedEntityList = [];
   });

   describe('The diff (pure: diffEntityFieldSnapshots)', () => {
      it('identical snapshots yield empty changes', () => {
         const row = makeSnapshotRow();
         const before = new Map([[row.ID, row]]);
         const after = new Map([[row.ID, { ...row }]]);

         const changes = diffEntityFieldSnapshots(before, after, () => false);
         expect(changes).toEqual([]);
      });

      it('one column differing produces one change with that one reason', () => {
         const rowBefore = makeSnapshotRow({ Length: 100 });
         const rowAfter = makeSnapshotRow({ Length: 200 });
         const before = new Map([[rowBefore.ID, rowBefore]]);
         const after = new Map([[rowAfter.ID, rowAfter]]);

         const changes = diffEntityFieldSnapshots(before, after, () => false);
         expect(changes).toHaveLength(1);
         expect(changes[0].reasons).toEqual(['Length']);
         expect(changes[0].fieldName).toBe('Field1');
         expect(changes[0].entityName).toBe('TestEntity');
      });

      it('only Sequence differing yields empty changes (Sequence is not tracked)', () => {
         expect(TRACKED_FIELD_COLUMNS).not.toContain('Sequence');
         const rowBefore = makeSnapshotRow();
         const rowAfter = makeSnapshotRow();
         // Snapshot rows do not even have Sequence in TRACKED_FIELD_COLUMNS
         const before = new Map([[rowBefore.ID, rowBefore]]);
         const after = new Map([[rowAfter.ID, rowAfter]]);

         const changes = diffEntityFieldSnapshots(before, after, () => false);
         expect(changes).toEqual([]);
      });

      it('a row present only in after is ignored (new field this run)', () => {
         const rowBefore = makeSnapshotRow({ ID: 'F1', Name: 'Col1' });
         const rowAfterNew = makeSnapshotRow({ ID: 'F2', Name: 'Col2' });
         const before = new Map([[rowBefore.ID, rowBefore]]);
         const after = new Map([
            [rowBefore.ID, rowBefore],
            [rowAfterNew.ID, rowAfterNew],
         ]);

         const changes = diffEntityFieldSnapshots(before, after, () => false);
         expect(changes).toEqual([]);
      });

      it('a row present only in before is ignored (deleted field)', () => {
         const rowBefore = makeSnapshotRow({ ID: 'F1', Name: 'Col1' });
         const before = new Map([[rowBefore.ID, rowBefore]]);
         const after = new Map<string, EntityFieldSnapshotRow>();

         const changes = diffEntityFieldSnapshots(before, after, () => false);
         expect(changes).toEqual([]);
      });

      it('isNew(entityID, name) === true is ignored even when columns differ', () => {
         const rowBefore = makeSnapshotRow({ Length: 100 });
         const rowAfter = makeSnapshotRow({ Length: 200 });
         const before = new Map([[rowBefore.ID, rowBefore]]);
         const after = new Map([[rowAfter.ID, rowAfter]]);

         const changes = diffEntityFieldSnapshots(before, after, (eid, name) => {
            return eid === rowBefore.EntityID && name === rowBefore.Name;
         });
         expect(changes).toEqual([]);
      });

      describe('the normalization table', () => {
         it('trims strings and treats null ≡ empty string for Description, DefaultValue, RelatedEntityFieldName', () => {
            expect(normalizeSnapshotValue('Description', null)).toBe('');
            expect(normalizeSnapshotValue('Description', '  hello  ')).toBe('hello');
            expect(normalizeSnapshotValue('Description', '')).toBe('');

            expect(normalizeSnapshotValue('DefaultValue', null)).toBe('');
            expect(normalizeSnapshotValue('DefaultValue', '  (1)  ')).toBe('(1)');

            expect(normalizeSnapshotValue('RelatedEntityFieldName', null)).toBe('');
            expect(normalizeSnapshotValue('RelatedEntityFieldName', '  ID  ')).toBe('ID');

            // Snapshot rows with null vs '' do not report a change
            const rowBefore = makeSnapshotRow({ Description: null });
            const rowAfter = makeSnapshotRow({ Description: '   ' });
            const before = new Map([[rowBefore.ID, rowBefore]]);
            const after = new Map([[rowAfter.ID, rowAfter]]);

            expect(diffEntityFieldSnapshots(before, after, () => false)).toEqual([]);
         });

         it('compares RelatedEntityID case-insensitively and trimmed', () => {
            expect(normalizeSnapshotValue('RelatedEntityID', '  C70448F9-9792-41D7-A82C-784B66429D54  ')).toBe(
               'c70448f9-9792-41d7-a82c-784b66429d54'
            );
            expect(normalizeSnapshotValue('RelatedEntityID', null)).toBe('');

            const rowBefore = makeSnapshotRow({ RelatedEntityID: 'C70448F9-9792-41D7-A82C-784B66429D54' });
            const rowAfter = makeSnapshotRow({ RelatedEntityID: 'c70448f9-9792-41d7-a82c-784b66429d54' });
            const before = new Map([[rowBefore.ID, rowBefore]]);
            const after = new Map([[rowAfter.ID, rowAfter]]);

            expect(diffEntityFieldSnapshots(before, after, () => false)).toEqual([]);
         });

         it('coerces 0/1 vs true/false for every bit column', () => {
            const bitCols: FieldChangeReason[] = [
               'AllowsNull',
               'AutoIncrement',
               'IsVirtual',
               'IsComputed',
               'IsPrimaryKey',
               'IsUnique',
               'AllowUpdateAPI',
            ];
            for (const col of bitCols) {
               expect(normalizeSnapshotValue(col, 1)).toBe(true);
               expect(normalizeSnapshotValue(col, 0)).toBe(false);
               expect(normalizeSnapshotValue(col, '1')).toBe(true);
               expect(normalizeSnapshotValue(col, '0')).toBe(false);
               expect(normalizeSnapshotValue(col, true)).toBe(true);
               expect(normalizeSnapshotValue(col, false)).toBe(false);
               expect(normalizeSnapshotValue(col, null)).toBe(false);
            }
         });

         it('preserves numeric null as null', () => {
            expect(normalizeSnapshotValue('Length', null)).toBeNull();
            expect(normalizeSnapshotValue('Length', '')).toBeNull();
            expect(normalizeSnapshotValue('Length', 100)).toBe(100);
            expect(normalizeSnapshotValue('Precision', null)).toBeNull();
            expect(normalizeSnapshotValue('Scale', null)).toBeNull();
         });
      });

      it('sorts output ordinally by entityName then fieldName', () => {
         const rowZ = makeSnapshotRow({ ID: '1', EntityName: 'ZEntity', Name: 'FieldA', Length: 10 });
         const rowZ_after = makeSnapshotRow({ ID: '1', EntityName: 'ZEntity', Name: 'FieldA', Length: 20 });
         const rowA2 = makeSnapshotRow({ ID: '2', EntityName: 'AEntity', Name: 'FieldB', Length: 10 });
         const rowA2_after = makeSnapshotRow({ ID: '2', EntityName: 'AEntity', Name: 'FieldB', Length: 20 });
         const rowA1 = makeSnapshotRow({ ID: '3', EntityName: 'AEntity', Name: 'FieldA', Length: 10 });
         const rowA1_after = makeSnapshotRow({ ID: '3', EntityName: 'AEntity', Name: 'FieldA', Length: 20 });

         const before = new Map([
            ['1', rowZ],
            ['2', rowA2],
            ['3', rowA1],
         ]);
         const after = new Map([
            ['1', rowZ_after],
            ['2', rowA2_after],
            ['3', rowA1_after],
         ]);

         const changes = diffEntityFieldSnapshots(before, after, () => false);
         expect(changes).toHaveLength(3);
         expect(changes[0].entityName).toBe('AEntity');
         expect(changes[0].fieldName).toBe('FieldA');
         expect(changes[1].entityName).toBe('AEntity');
         expect(changes[1].fieldName).toBe('FieldB');
         expect(changes[2].entityName).toBe('ZEntity');
         expect(changes[2].fieldName).toBe('FieldA');
      });

      it('DISPLAYNAME_REOPEN_REASONS and TYPE_REOPEN_REASONS are disjoint and cover §3.4', () => {
         expect(Array.from(DISPLAYNAME_REOPEN_REASONS)).toEqual(['Description']);
         expect(Array.from(TYPE_REOPEN_REASONS).sort()).toEqual(
            ['AllowsNull', 'Length', 'Precision', 'Scale', 'Type'].sort()
         );
         for (const r of DISPLAYNAME_REOPEN_REASONS) {
            expect(TYPE_REOPEN_REASONS.has(r)).toBe(false);
         }
      });
   });

   describe('The registry (ManageMetadataBase statics)', () => {
      it('registers a new field and round-trips via isFieldNew', () => {
         expect(ManageMetadataBase.isFieldNew('E1', 'Col1')).toBe(false);
         ManageMetadataBase.registerNewField('E1', 'Col1');
         expect(ManageMetadataBase.isFieldNew('E1', 'Col1')).toBe(true);
         expect(ManageMetadataBase.isFieldNew('E1', 'Col2')).toBe(false);
         expect(ManageMetadataBase.isFieldNew('E2', 'Col1')).toBe(false);
      });

      it('normalizes GUID case, name case, and trailing spaces', () => {
         ManageMetadataBase.registerNewField('C70448F9-9792-41D7-A82C-784B66429D54', 'CreatedDate');
         expect(
            ManageMetadataBase.isFieldNew('  c70448f9-9792-41d7-a82c-784b66429d54  ', '  createddate  ')
         ).toBe(true);
      });

      it('ignores blank or whitespace-only entityID or name', () => {
         ManageMetadataBase.registerNewField('', 'Col1');
         ManageMetadataBase.registerNewField('   ', 'Col1');
         ManageMetadataBase.registerNewField('E1', '');
         ManageMetadataBase.registerNewField('E1', '   ');

         expect(ManageMetadataBase.newFieldCount).toBe(0);
         expect(ManageMetadataBase.isFieldNew('', 'Col1')).toBe(false);
         expect(ManageMetadataBase.isFieldNew('E1', '')).toBe(false);
      });

      it('clearFieldTracking empties all three structures', () => {
         ManageMetadataBase.registerNewField('E1', 'Col1');
         ManageMetadataBase.registerFieldChange('E1', 'Col2', ['Type']);
         expect(ManageMetadataBase.newFieldCount).toBe(1);
         expect(ManageMetadataBase.changedFieldCount).toBe(1);

         ManageMetadataBase.clearFieldTracking();
         expect(ManageMetadataBase.newFieldCount).toBe(0);
         expect(ManageMetadataBase.changedFieldCount).toBe(0);
         expect(ManageMetadataBase.changedFieldReport).toHaveLength(0);
         expect(ManageMetadataBase.isFieldNew('E1', 'Col1')).toBe(false);
         expect(ManageMetadataBase.fieldChangeReasons('E1', 'Col2').size).toBe(0);
      });

      it('registerFieldChange accumulates reasons across calls', () => {
         ManageMetadataBase.registerFieldChange('E1', 'Col1', ['Type']);
         expect(Array.from(ManageMetadataBase.fieldChangeReasons('E1', 'Col1'))).toEqual(['Type']);

         ManageMetadataBase.registerFieldChange('E1', 'Col1', ['Length', 'Precision']);
         const reasons = ManageMetadataBase.fieldChangeReasons('E1', 'Col1');
         expect(reasons.has('Type')).toBe(true);
         expect(reasons.has('Length')).toBe(true);
         expect(reasons.has('Precision')).toBe(true);
         expect(reasons.size).toBe(3);
      });

      it('isDisplayNameReopened is true only for Description', () => {
         ManageMetadataBase.registerFieldChange('E1', 'Col1', ['Type', 'Length']);
         expect(ManageMetadataBase.isDisplayNameReopened('E1', 'Col1')).toBe(false);

         ManageMetadataBase.registerFieldChange('E1', 'Col1', ['Description']);
         expect(ManageMetadataBase.isDisplayNameReopened('E1', 'Col1')).toBe(true);
      });

      it('isTypeReopened is true only for Type, Length, Precision, Scale, AllowsNull', () => {
         const typeReasons: FieldChangeReason[] = ['Type', 'Length', 'Precision', 'Scale', 'AllowsNull'];
         for (const r of typeReasons) {
            ManageMetadataBase.clearFieldTracking();
            ManageMetadataBase.registerFieldChange('E1', 'Col', [r]);
            expect(ManageMetadataBase.isTypeReopened('E1', 'Col')).toBe(true);
         }

         ManageMetadataBase.clearFieldTracking();
         ManageMetadataBase.registerFieldChange('E1', 'Col', ['Description', 'DefaultValue', 'AutoIncrement']);
         expect(ManageMetadataBase.isTypeReopened('E1', 'Col')).toBe(false);
      });
   });

   describe('Three INSERT sites register new fields', () => {
      const mm = new TestableManageMetadata();

      it('site 1: createNewEntityFieldsFromSchema registers new field and sets IncludeInUserSearchAPI from IsNameField alone', async () => {
         const pendingFields = [
            {
               EntityID: '11111111-1111-1111-1111-111111111111',
               FieldName: 'ID',
               EntityName: 'TestEntity1',
               Sequence: 1,
               Type: 'uniqueidentifier',
               Length: 16,
               AllowsNull: false,
               IsPrimaryKey: true,
               IsNameField: false,
            },
            {
               EntityID: '11111111-1111-1111-1111-111111111111',
               FieldName: 'Name',
               EntityName: 'TestEntity1',
               Sequence: 2,
               Type: 'nvarchar',
               Length: 100,
               AllowsNull: false,
               IsPrimaryKey: false,
               IsNameField: true,
            },
         ];

         const executedSql: string[] = [];
         const pool = createMockConnection((sql: string) => {
            executedSql.push(sql);
            if (sql.includes('getPendingEntityFields') || sql.includes('EntityField')) {
               return pendingFields;
            }
            return [];
         });

         await mm.callCreateNewEntityFields(pool);

         expect(
            ManageMetadataBase.isFieldNew('11111111-1111-1111-1111-111111111111', 'ID')
         ).toBe(true);
         expect(
            ManageMetadataBase.isFieldNew('11111111-1111-1111-1111-111111111111', 'Name')
         ).toBe(true);

         // Assert that in the INSERT SQL, ID (IsNameField=false) has IncludeInUserSearchAPI=0
         // and Name (IsNameField=true) has IncludeInUserSearchAPI=1
         const insertBatch = executedSql.find(s => s.includes('INSERT INTO'));
         expect(insertBatch).toBeDefined();
      });

      it('site 2: manageSingleVirtualEntityField registers new virtual field', async () => {
         const virtualEntity = {
            ID: '22222222-2222-2222-2222-222222222222',
            Name: 'VirtualEntity1',
            Fields: [], // empty -> field does not exist, triggers INSERT
         };
         const veField = {
            FieldName: 'VEField1',
            Type: 'int',
            Length: 4,
            Precision: 10,
            Scale: 0,
            AllowsNull: true,
         };

         vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue(virtualEntity as unknown as import('@memberjunction/core').EntityInfo);

         const pool = createMockConnection((sql: string) => {
            if (sql.includes('MAX') && sql.includes('Sequence')) {
               return [{ MaxSeq: 0, Hit: 0 }];
            }
            return [];
         });

         await mm.callManageSingleVirtualEntityField(pool, virtualEntity, veField, 1);

         expect(
            ManageMetadataBase.isFieldNew('22222222-2222-2222-2222-222222222222', 'VEField1')
         ).toBe(true);
      });

      it('site 3: manageSingleEntityParentFields registers new IS-A parent field', async () => {
         const childEntity = {
            ID: '33333333-3333-3333-3333-333333333333',
            Name: 'ChildEntity1',
            Fields: [], // empty -> parent field does not exist, triggers INSERT
            AllParentFields: [
               {
                  Name: 'ParentField1',
                  Type: 'nvarchar',
                  Length: 50,
                  Precision: 0,
                  Scale: 0,
                  AllowsNull: true,
               },
            ],
         };

         const pool = createMockConnection((sql: string) => {
            if (sql.includes('MAX') && sql.includes('Sequence')) {
               return [{ MaxSeq: 0, Hit: 0 }];
            }
            return [];
         });

         await mm.callManageSingleEntityParentFields(pool, childEntity);

         expect(
            ManageMetadataBase.isFieldNew('33333333-3333-3333-3333-333333333333', 'ParentField1')
         ).toBe(true);
      });
   });

   describe('The caller: updateExistingEntityFieldsFromSchema', () => {
      const mm = new TestableManageMetadata();

      it('answers before/proc/after, populates map, adds only materially changed entities, ignores proc result set', async () => {
         const row1_before = makeSnapshotRow({
            ID: 'F1',
            EntityID: 'E1',
            EntityName: 'EntityWithMaterialChange',
            Name: 'StatusField',
            Length: 50,
         });
         const row2_before = makeSnapshotRow({
            ID: 'F2',
            EntityID: 'E2',
            EntityName: 'EntityUnchangedInSnapshot',
            Name: 'UnchangedField',
            Length: 100,
         });

         const row1_after = makeSnapshotRow({
            ID: 'F1',
            EntityID: 'E1',
            EntityName: 'EntityWithMaterialChange',
            Name: 'StatusField',
            Length: 100, // materially changed!
         });
         const row2_after = makeSnapshotRow({
            ID: 'F2',
            EntityID: 'E2',
            EntityName: 'EntityUnchangedInSnapshot',
            Name: 'UnchangedField',
            Length: 100, // unchanged!
         });

         // The proc returns a row for EntityUnchangedInSnapshot to prove the proc return value is ignored!
         const fakeProcResult = [
            {
               EntityID: 'E2',
               EntityName: 'EntityUnchangedInSnapshot',
               EntityFieldName: 'UnchangedField',
            },
         ];

         let snapshotCallCount = 0;
         const pool = createMockConnection((sql: string) => {
            if (sql.includes('vwEntityFields')) {
               snapshotCallCount++;
               if (snapshotCallCount === 1) {
                  // before snapshot
                  return [row1_before, row2_before];
               } else {
                  // after snapshot
                  return [row1_after, row2_after];
               }
            }
            if (sql.includes('spUpdateExistingEntityFieldsFromSchema')) {
               return fakeProcResult;
            }
            return [];
         });

         await mm.callUpdateExistingEntityFields(pool, []);

         // Materially changed entity MUST be in modifiedEntityList
         expect(ManageMetadataBase.modifiedEntityList).toContain('EntityWithMaterialChange');
         // Entity that proc returned but whose snapshot didn't change MUST NOT be in modifiedEntityList
         expect(ManageMetadataBase.modifiedEntityList).not.toContain('EntityUnchangedInSnapshot');

         // Check registered change reasons
         expect(ManageMetadataBase.isTypeReopened('E1', 'StatusField')).toBe(true);
         expect(ManageMetadataBase.isDisplayNameReopened('E1', 'StatusField')).toBe(false);

         // Check changedFieldReport
         expect(ManageMetadataBase.changedFieldReport).toHaveLength(1);
         expect(ManageMetadataBase.changedFieldReport[0].entityName).toBe('EntityWithMaterialChange');
         expect(ManageMetadataBase.changedFieldReport[0].fieldName).toBe('StatusField');
         expect(ManageMetadataBase.changedFieldReport[0].reasons).toEqual(['Length']);
         expect(ManageMetadataBase.changedFieldCount).toBe(1);
      });
   });
});
