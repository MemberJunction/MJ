import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import {
   computeFieldMetadataUpdate,
   FieldLockContext,
   FieldMetadataProposal,
   FieldMetadataState,
} from '../../Database/field-metadata-lock';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';
import { EntityInfo, EntityFieldInfo, EntityFieldExtendedType } from '@memberjunction/core';
import { CodeGenReporter } from '../../Misc/codegen-reporter';
import { SQLLogging } from '../../Misc/sql_logging';

class TestableManageMetadata extends ManageMetadataBase {
   public async callApplyFieldCategories(
      pool: CodeGenConnection,
      entity: EntityInfo,
      fields: Array<{
         ID: string;
         Name: string;
         Category: string | null;
         AutoUpdateCategory: boolean;
         AutoUpdateDisplayName: boolean;
         AutoUpdateExtendedType: boolean;
         GeneratedFormSection: string;
         DisplayName: string;
         ExtendedType: string;
         CodeType: string;
      }>,
      fieldCategories: Array<{
         fieldName: string;
         category: string;
         displayName?: string;
         extendedType?: string | null;
         codeType?: string | null;
         reason?: string;
      }>,
      existingCategories: Set<string>,
      ctx: { isNewEntity: boolean }
   ): Promise<void> {
      return this.applyFieldCategories(pool, entity, fields, fieldCategories, existingCategories, ctx);
   }

   public testValidateExtendedType(suggested: string): EntityFieldExtendedType | null {
      return this.validateExtendedType(suggested);
   }

   public testSanitizeCodeType(
      codeType: string | null | undefined,
      fieldName: string,
      entityName: string
   ): string | null | undefined {
      return this.sanitizeCodeType(codeType, fieldName, entityName);
   }
}

function createMockConnection(executedSql: string[]): CodeGenConnection {
   return {
      query: async (sql: string): Promise<CodeGenQueryResult> => {
         executedSql.push(sql);
         return { recordset: [] } as CodeGenQueryResult;
      },
      queryWithParams: async (sql: string): Promise<CodeGenQueryResult> => {
         executedSql.push(sql);
         return { recordset: [] } as CodeGenQueryResult;
      },
      beginTransaction: async () => ({
         commit: async () => {},
         rollback: async () => {},
      }),
   };
}

describe('T2 — Field Metadata Lock Table (C2, FM1, FM5, §3.4)', () => {
   const mm = new TestableManageMetadata();
   const validateExtType = (v: string) => mm.testValidateExtendedType(v);
   const sanitizeCode = (v: string | null | undefined, fn?: string, en?: string) =>
      mm.testSanitizeCodeType(v, fn ?? 'TestField', en ?? 'TestEntity');

   let restoreSQLOutput: () => void;
   beforeAll(() => {
      restoreSQLOutput = SQLLogging.suppressOutputForTests();
   });
   afterAll(() => {
      restoreSQLOutput();
   });

   const defaultBaseField: FieldMetadataState = {
      ID: 'field-1',
      Name: 'Status',
      Category: 'General',
      GeneratedFormSection: null,
      DisplayName: 'Status',
      ExtendedType: null,
      CodeType: null,
      AutoUpdateCategory: true,
      AutoUpdateDisplayName: true,
      AutoUpdateExtendedType: true,
   };

   const defaultBaseContext: FieldLockContext = {
      isNewEntity: false,
      isNewField: false,
      descriptionReopened: false,
      typeReopened: false,
      existingCategories: new Set(['General', 'Details', 'Audit']),
   };

   beforeEach(() => {
      ManageMetadataBase.clearFieldTracking();
      CodeGenReporter.Instance.startRun();
   });

   describe('computeFieldMetadataUpdate pure matrix', () => {
      it('locks non-blank Category on existing entity even if proposal matches an existing category', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Category: 'General',
         };
         const proposal: FieldMetadataProposal = {
            category: 'Details',
         };
         const res = computeFieldMetadataUpdate(field, proposal, defaultBaseContext, validateExtType, sanitizeCode);
         expect(res.Category).toBeUndefined();
         expect(res.skipped).toContainEqual({ column: 'Category', reason: 'locked' });
      });

      it('allows Category update when current Category is blank on existing entity', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Category: null,
            GeneratedFormSection: null,
         };
         const proposal: FieldMetadataProposal = {
            category: 'Details',
         };
         const res = computeFieldMetadataUpdate(field, proposal, defaultBaseContext, validateExtType, sanitizeCode);
         expect(res.Category).toBe('Details');
         expect(res.GeneratedFormSection).toBe('Category');
      });

      it('allows Category update when entity is new, even if current category was set', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Category: 'Initial',
            GeneratedFormSection: null,
         };
         const proposal: FieldMetadataProposal = {
            category: 'Custom Category',
         };
         const ctx: FieldLockContext = {
            ...defaultBaseContext,
            isNewEntity: true,
         };
         const res = computeFieldMetadataUpdate(field, proposal, ctx, validateExtType, sanitizeCode);
         expect(res.Category).toBe('Custom Category');
         expect(res.GeneratedFormSection).toBe('Category');
      });

      it('skips Category with reason flag when AutoUpdateCategory is false', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Category: null,
            AutoUpdateCategory: false,
         };
         const proposal: FieldMetadataProposal = {
            category: 'Details',
         };
         const ctx: FieldLockContext = {
            ...defaultBaseContext,
            isNewEntity: true,
         };
         const res = computeFieldMetadataUpdate(field, proposal, ctx, validateExtType, sanitizeCode);
         expect(res.Category).toBeUndefined();
         expect(res.skipped).toContainEqual({ column: 'Category', reason: 'flag' });
      });

      it('forces __mj_ fields to Category System Metadata', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Name: '__mj_CreatedAt',
            Category: null,
            GeneratedFormSection: null,
         };
         const proposal: FieldMetadataProposal = {
            category: 'Custom Category',
         };
         const res = computeFieldMetadataUpdate(field, proposal, defaultBaseContext, validateExtType, sanitizeCode);
         expect(res.Category).toBe('System Metadata');
         expect(res.GeneratedFormSection).toBe('Category');
      });

      it('does not re-emit GeneratedFormSection if already Category', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Category: null,
            GeneratedFormSection: 'Category',
         };
         const proposal: FieldMetadataProposal = {
            category: 'Custom Category',
         };
         const res = computeFieldMetadataUpdate(field, proposal, defaultBaseContext, validateExtType, sanitizeCode);
         expect(res.Category).toBe('Custom Category');
         expect(res.GeneratedFormSection).toBeUndefined();
      });

      it('descriptionReopened alone re-opens DisplayName and leaves Category/ExtendedType/CodeType locked', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Category: 'General',
            DisplayName: 'Old Display',
            ExtendedType: null,
            CodeType: null,
         };
         const proposal: FieldMetadataProposal = {
            category: 'New Category',
            displayName: 'New Display',
            extendedType: 'URL',
         };
         const ctx: FieldLockContext = {
            ...defaultBaseContext,
            descriptionReopened: true,
            typeReopened: false,
         };
         const res = computeFieldMetadataUpdate(field, proposal, ctx, validateExtType, sanitizeCode);
         expect(res.DisplayName).toBe('New Display');
         expect(res.Category).toBeUndefined();
         expect(res.ExtendedType).toBeUndefined();
         expect(res.skipped).toContainEqual({ column: 'Category', reason: 'locked' });
         expect(res.skipped).toContainEqual({ column: 'ExtendedType', reason: 'locked' });
      });

      it('typeReopened alone re-opens ExtendedType/CodeType and leaves DisplayName/Category locked', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Category: 'General',
            DisplayName: 'Old Display',
            ExtendedType: null,
            CodeType: null,
         };
         const proposal: FieldMetadataProposal = {
            category: 'New Category',
            displayName: 'New Display',
            extendedType: 'Code',
            codeType: 'TypeScript',
         };
         const ctx: FieldLockContext = {
            ...defaultBaseContext,
            descriptionReopened: false,
            typeReopened: true,
         };
         const res = computeFieldMetadataUpdate(field, proposal, ctx, validateExtType, sanitizeCode);
         expect(res.ExtendedType).toBe('Code');
         expect(res.CodeType).toBe('TypeScript');
         expect(res.DisplayName).toBeUndefined();
         expect(res.Category).toBeUndefined();
         expect(res.skipped).toContainEqual({ column: 'Category', reason: 'locked' });
         expect(res.skipped).toContainEqual({ column: 'DisplayName', reason: 'locked' });
      });

      it('forces CodeType to null when effective ExtendedType is not Code', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            ExtendedType: 'Code',
            CodeType: 'TypeScript',
         };
         const proposal: FieldMetadataProposal = {
            extendedType: 'URL',
            codeType: 'TypeScript',
         };
         const ctx: FieldLockContext = {
            ...defaultBaseContext,
            typeReopened: true,
         };
         const res = computeFieldMetadataUpdate(field, proposal, ctx, validateExtType, sanitizeCode);
         expect(res.ExtendedType).toBe('URL');
         expect(res.CodeType).toBeNull();
      });

      it('rejects invalid extendedType (e.g. textarea) with reason invalid', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            ExtendedType: null,
         };
         const proposal: FieldMetadataProposal = {
            extendedType: 'textarea',
         };
         const ctx: FieldLockContext = {
            ...defaultBaseContext,
            isNewField: true,
         };
         const res = computeFieldMetadataUpdate(field, proposal, ctx, validateExtType, sanitizeCode);
         expect(res.ExtendedType).toBeUndefined();
         expect(res.skipped).toContainEqual({ column: 'ExtendedType', reason: 'invalid' });
      });

      it('accepts every member of EntityFieldInfo.ExtendedTypes', () => {
         const ctx: FieldLockContext = {
            ...defaultBaseContext,
            isNewField: true,
         };

         for (const extType of EntityFieldInfo.ExtendedTypes) {
            const field: FieldMetadataState = {
               ...defaultBaseField,
               ExtendedType: null,
            };
            const proposal: FieldMetadataProposal = {
               extendedType: extType,
            };
            const res = computeFieldMetadataUpdate(field, proposal, ctx, validateExtType, sanitizeCode);
            expect(res.ExtendedType).toBe(extType);
            expect(res.skipped.filter(s => s.column === 'ExtendedType')).toHaveLength(0);
         }
      });

      it('records unchanged reason when proposals match existing values', () => {
         const field: FieldMetadataState = {
            ...defaultBaseField,
            Category: null,
            DisplayName: 'Existing Name',
            ExtendedType: 'URL',
         };
         const proposal: FieldMetadataProposal = {
            category: '   ',
            displayName: 'Existing Name',
            extendedType: 'URL',
         };
         const ctx: FieldLockContext = {
            ...defaultBaseContext,
            isNewField: true,
         };
         const res = computeFieldMetadataUpdate(field, proposal, ctx, validateExtType, sanitizeCode);
         expect(res.skipped).toContainEqual({ column: 'Category', reason: 'blank-proposal' });
         expect(res.skipped).toContainEqual({ column: 'DisplayName', reason: 'unchanged' });
         expect(res.skipped).toContainEqual({ column: 'ExtendedType', reason: 'unchanged' });
      });
   });

   describe('applyFieldCategories SQL emission & error handling', () => {
      it('executes UPDATE with WHERE ID = ... and NO AutoUpdateCategory in WHERE clause', async () => {
         const executedSql: string[] = [];
         const pool = createMockConnection(executedSql);
         const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });

         const fields = [
            {
               ID: 'field-uuid-1',
               Name: 'CompanyName',
               Category: null,
               AutoUpdateCategory: true,
               AutoUpdateDisplayName: true,
               AutoUpdateExtendedType: true,
               GeneratedFormSection: '',
               DisplayName: 'Company Name',
               ExtendedType: '',
               CodeType: '',
            },
         ];

         const proposals = [
            {
               fieldName: 'CompanyName',
               category: 'Overview',
               displayName: 'Organization Name',
               extendedType: null,
               codeType: null,
            },
         ];

         ManageMetadataBase.registerNewField('entity-1', 'CompanyName');

         await mm.callApplyFieldCategories(
            pool,
            entity,
            fields,
            proposals,
            new Set(),
            { isNewEntity: false }
         );

         expect(executedSql.length).toBeGreaterThan(0);
         const joinedSql = executedSql.join('\n');
         expect(joinedSql).toContain("ID = 'field-uuid-1'");
         expect(joinedSql).not.toContain('AutoUpdateCategory');
         expect(joinedSql).toContain("Category = 'Overview'");
         expect(joinedSql).toContain("DisplayName = 'Organization Name'");
      });

      it('matches field name case-insensitively', async () => {
         const executedSql: string[] = [];
         const pool = createMockConnection(executedSql);
         const entity = new EntityInfo({ ID: 'entity-2', Name: 'Invoice' });

         const fields = [
            {
               ID: 'f-2',
               Name: 'TotalAmount',
               Category: null,
               AutoUpdateCategory: true,
               AutoUpdateDisplayName: true,
               AutoUpdateExtendedType: true,
               GeneratedFormSection: '',
               DisplayName: 'Total Amount',
               ExtendedType: '',
               CodeType: '',
            },
         ];

         const proposals = [
            {
               fieldName: 'totalamount',
               category: 'Financials',
            },
         ];

         await mm.callApplyFieldCategories(
            pool,
            entity,
            fields,
            proposals,
            new Set(),
            { isNewEntity: true }
         );

         const joinedSql = executedSql.join('\n');
         expect(joinedSql).toContain("ID = 'f-2'");
         expect(joinedSql).toContain("Category = 'Financials'");
      });

      it('logs unknown field name without throwing', async () => {
         const executedSql: string[] = [];
         const pool = createMockConnection(executedSql);
         const entity = new EntityInfo({ ID: 'entity-3', Name: 'Order' });

         const fields = [
            {
               ID: 'f-3',
               Name: 'OrderDate',
               Category: null,
               AutoUpdateCategory: true,
               AutoUpdateDisplayName: true,
               AutoUpdateExtendedType: true,
               GeneratedFormSection: '',
               DisplayName: 'Order Date',
               ExtendedType: '',
               CodeType: '',
            },
         ];

         const proposals = [
            {
               fieldName: 'NonExistentField',
               category: 'General',
            },
         ];

         await expect(
            mm.callApplyFieldCategories(
               pool,
               entity,
               fields,
               proposals,
               new Set(),
               { isNewEntity: false }
            )
         ).resolves.not.toThrow();

         expect(executedSql.length).toBe(0);
      });
   });
});
