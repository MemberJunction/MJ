import { describe, it, expect, beforeEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import type { SmartFieldIdentificationResult } from '../Misc/advanced_generation';

/**
 * Tests for the Smart Field Identification guardrails added after a v5.39
 * regression where the LLM flagged AI Agent Runs.ID (a uniqueidentifier primary
 * key) as IsNameField, corrupting every FK-name virtual field that joins to that
 * entity (they resolved to the uniqueidentifier PK instead of the real name
 * column), and a separate crash where a missing `defaultInView` array threw
 * `Cannot read properties of undefined (reading 'includes')`.
 */

// Test seam: expose the protected methods under test. These paths (guardrail
// rejection + empty-array handling) build no SQL, so no db provider/config is
// needed to exercise them.
class TestableManageMetadata extends ManageMetadataBase {
   public eligibleForNameField(field: Record<string, unknown>): boolean {
      return this.isFieldEligibleForNameField(field);
   }
   public runNameFieldUpdates(fields: Array<Record<string, unknown>>, result: SmartFieldIdentificationResult): string[] {
      const sql: string[] = [];
      this.applyNameFieldUpdates(sql, fields, result);
      return sql;
   }
   public runDefaultInViewUpdates(fields: Array<Record<string, unknown>>, result: SmartFieldIdentificationResult): string[] {
      const sql: string[] = [];
      this.applyDefaultInViewUpdates(sql, fields, result);
      return sql;
   }
}

function emptyResult(overrides: Partial<SmartFieldIdentificationResult> = {}): SmartFieldIdentificationResult {
   return {
      nameFields: [],
      nameFieldsReason: '',
      defaultInView: [],
      defaultInViewReason: '',
      searchableFields: [],
      searchableFieldsReason: '',
      confidence: 'high',
      ...overrides,
   };
}

describe('SmartFieldIdentification guardrails', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => {
      mm = new TestableManageMetadata();
   });

   describe('isFieldEligibleForNameField', () => {
      it('accepts bounded text fields', () => {
         expect(mm.eligibleForNameField({ Type: 'nvarchar', Length: 510, IsPrimaryKey: false })).toBe(true);
         expect(mm.eligibleForNameField({ Type: 'varchar', Length: 100, IsPrimaryKey: false })).toBe(true);
         expect(mm.eligibleForNameField({ Type: 'nchar', Length: 20, IsPrimaryKey: false })).toBe(true);
      });

      it('rejects primary keys', () => {
         expect(mm.eligibleForNameField({ Type: 'nvarchar', Length: 510, IsPrimaryKey: true })).toBe(false);
      });

      it('rejects uniqueidentifier (the AI Agent Runs.ID regression case)', () => {
         expect(mm.eligibleForNameField({ Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true })).toBe(false);
         expect(mm.eligibleForNameField({ Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: false })).toBe(false);
      });

      it('rejects non-text types', () => {
         expect(mm.eligibleForNameField({ Type: 'int', IsPrimaryKey: false })).toBe(false);
         expect(mm.eligibleForNameField({ Type: 'datetimeoffset', IsPrimaryKey: false })).toBe(false);
         expect(mm.eligibleForNameField({ Type: 'bit', IsPrimaryKey: false })).toBe(false);
      });

      it('rejects unbounded (MAX) text', () => {
         expect(mm.eligibleForNameField({ Type: 'nvarchar', Length: -1, IsPrimaryKey: false })).toBe(false);
      });
   });

   describe('applyNameFieldUpdates', () => {
      it('does NOT mark a uniqueidentifier PK as a name field', () => {
         const fields = [
            { ID: 'fid-id', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, IsNameField: false, AutoUpdateIsNameField: true },
            { ID: 'fid-run', Name: 'RunName', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: ['ID'] }));
         expect(sql).toHaveLength(0);
      });

      it('tolerates an omitted nameFields array (?? [])', () => {
         const result = emptyResult();
         delete (result as Partial<SmartFieldIdentificationResult>).nameFields;
         expect(() => mm.runNameFieldUpdates([], result)).not.toThrow();
      });
   });

   describe('applyDefaultInViewUpdates', () => {
      it('does not throw when defaultInView is undefined (the original crash)', () => {
         const result = emptyResult();
         delete (result as Partial<SmartFieldIdentificationResult>).defaultInView;
         expect(() => mm.runDefaultInViewUpdates([{ ID: 'f1', Name: 'A', AutoUpdateDefaultInView: true }], result)).not.toThrow();
      });

      it('produces no SQL when defaultInView is empty', () => {
         const sql = mm.runDefaultInViewUpdates([{ ID: 'f1', Name: 'A', AutoUpdateDefaultInView: true }], emptyResult());
         expect(sql).toHaveLength(0);
      });
   });
});
