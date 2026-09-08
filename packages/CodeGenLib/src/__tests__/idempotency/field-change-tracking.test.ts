import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import {
   ManageMetadataBase,
   FieldChangeReason,
   DISPLAYNAME_REOPEN_REASONS,
   TYPE_REOPEN_REASONS,
} from '../../Database/manage-metadata';
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
      virtualEntity: any,
      veField: any,
      fieldSequence: number
   ): Promise<any> {
      return this.manageSingleVirtualEntityField(pool, virtualEntity, veField, fieldSequence, false, false);
   }

   public async callManageSingleEntityParentFields(
      pool: CodeGenConnection,
      childEntity: any
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

function createMockConnection(queryHandler: (sql: string) => any[]): CodeGenConnection {
   return {
      query: async (sql: string): Promise<CodeGenQueryResult> => {
         const recordset = queryHandler(sql);
         return { recordset } as CodeGenQueryResult;
      },
      queryWithParams: async (sql: string): Promise<CodeGenQueryResult> => {
         const recordset = queryHandler(sql);
         return { recordset } as CodeGenQueryResult;
      },
      beginTransaction: async () => ({
         commit: async () => {},
         rollback: async () => {},
      }),
   } as unknown as CodeGenConnection;
}

describe('T1 — Field Change Tracking (C1)', () => {
   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      ManageMetadataBase.clearFieldTracking();
   });

   afterEach(() => {
      SQLLogging.resetForTests();
      ManageMetadataBase.clearFieldTracking();
   });

   describe('registerNewField and isFieldNew', () => {
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

      it('clearFieldTracking empties both structures', () => {
         ManageMetadataBase.registerNewField('E1', 'Col1');
         ManageMetadataBase.registerFieldChange('E1', 'Col2', ['Type']);
         expect(ManageMetadataBase.newFieldCount).toBe(1);
         expect(ManageMetadataBase.changedFieldCount).toBe(1);

         ManageMetadataBase.clearFieldTracking();
         expect(ManageMetadataBase.newFieldCount).toBe(0);
         expect(ManageMetadataBase.changedFieldCount).toBe(0);
         expect(ManageMetadataBase.isFieldNew('E1', 'Col1')).toBe(false);
         expect(ManageMetadataBase.fieldChangeReasons('E1', 'Col2').size).toBe(0);
      });
   });

   describe('registerFieldChange, reasons, and reopen predicates', () => {
      it('accumulates reasons across multiple calls', () => {
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

      it('Sequence-only and Unknown re-open neither DisplayName nor Type', () => {
         ManageMetadataBase.registerFieldChange('E1', 'Col1', ['Sequence']);
         expect(ManageMetadataBase.isDisplayNameReopened('E1', 'Col1')).toBe(false);
         expect(ManageMetadataBase.isTypeReopened('E1', 'Col1')).toBe(false);

         ManageMetadataBase.registerFieldChange('E1', 'Col2', ['Unknown']);
         expect(ManageMetadataBase.isDisplayNameReopened('E1', 'Col2')).toBe(false);
         expect(ManageMetadataBase.isTypeReopened('E1', 'Col2')).toBe(false);
      });

      it('correctly tracks newFieldCount and changedFieldCount counters', () => {
         expect(ManageMetadataBase.newFieldCount).toBe(0);
         expect(ManageMetadataBase.changedFieldCount).toBe(0);

         ManageMetadataBase.registerNewField('E1', 'F1');
         ManageMetadataBase.registerNewField('E1', 'F2');
         ManageMetadataBase.registerFieldChange('E1', 'F3', ['Type']);

         expect(ManageMetadataBase.newFieldCount).toBe(2);
         expect(ManageMetadataBase.changedFieldCount).toBe(1);
      });
   });

   describe('three INSERT sites register new fields', () => {
      const mm = new TestableManageMetadata();

      it('site 1: createNewEntityFieldsFromSchema registers new field', async () => {
         const pendingFields = [
            {
               EntityID: '11111111-1111-1111-1111-111111111111',
               FieldName: 'PendingField1',
               EntityName: 'TestEntity1',
               Sequence: 1,
               Type: 'nvarchar',
               Length: 100,
               AllowsNull: true,
            },
         ];

         const pool = createMockConnection((sql: string) => {
            if (sql.includes('getPendingEntityFields') || sql.includes('EntityField')) {
               return pendingFields;
            }
            return [];
         });

         await mm.callCreateNewEntityFields(pool);

         expect(
            ManageMetadataBase.isFieldNew('11111111-1111-1111-1111-111111111111', 'PendingField1')
         ).toBe(true);
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

         vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue(virtualEntity as any);

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

   describe('updateExistingEntityFieldsFromSchema updates change map and modified entity list', () => {
      const mm = new TestableManageMetadata();

      it('populates changed fields and reasons when ChangeReasons column is present', async () => {
         const spResult = [
            {
               EntityID: 'AAAA1111-1111-1111-1111-111111111111',
               EntityName: 'EntityWithMaterialChange',
               EntityFieldName: 'StatusField',
               ChangeReasons: 'Type,Length',
            },
         ];

         const pool = createMockConnection((_sql: string) => spResult);
         await mm.callUpdateExistingEntityFields(pool, []);

         expect(ManageMetadataBase.modifiedEntityList).toContain('EntityWithMaterialChange');
         expect(
            ManageMetadataBase.isTypeReopened('AAAA1111-1111-1111-1111-111111111111', 'StatusField')
         ).toBe(true);
         expect(
            ManageMetadataBase.isDisplayNameReopened('AAAA1111-1111-1111-1111-111111111111', 'StatusField')
         ).toBe(false);
      });

      it('defaults to Unknown reason when ChangeReasons column is missing (stale proc)', async () => {
         const spResult = [
            {
               EntityID: 'BBBB2222-2222-2222-2222-222222222222',
               EntityName: 'EntityWithStaleProc',
               EntityFieldName: 'OldField',
               // ChangeReasons missing!
            },
         ];

         const pool = createMockConnection((_sql: string) => spResult);
         await mm.callUpdateExistingEntityFields(pool, []);

         expect(ManageMetadataBase.modifiedEntityList).toContain('EntityWithStaleProc');
         const reasons = ManageMetadataBase.fieldChangeReasons('BBBB2222-2222-2222-2222-222222222222', 'OldField');
         expect(reasons.has('Unknown')).toBe(true);
         expect(
            ManageMetadataBase.isDisplayNameReopened('BBBB2222-2222-2222-2222-222222222222', 'OldField')
         ).toBe(false);
         expect(
            ManageMetadataBase.isTypeReopened('BBBB2222-2222-2222-2222-222222222222', 'OldField')
         ).toBe(false);
      });
   });
});
