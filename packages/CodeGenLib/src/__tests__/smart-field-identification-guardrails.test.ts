import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../Misc/status_logging', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../Misc/status_logging')>();
   return { ...actual, logStatus: vi.fn(), LogWarning: vi.fn(), UpdateSpinner: vi.fn() };
});

import { ManageMetadataBase } from '../Database/manage-metadata';
import { AdvancedGeneration, type SmartFieldIdentificationResult } from '../Misc/advanced_generation';
import { logStatus, LogWarning } from '../Misc/status_logging';
import { configInfo } from '../Config/config';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';
import type { EntityInfo, UserInfo } from '@memberjunction/core';

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
   public inheritedISAField(field: Record<string, unknown>): boolean {
      return this.isInheritedISAField(field);
   }
   public runNameFieldUpdates(fields: Array<Record<string, unknown>>, result: SmartFieldIdentificationResult, entityName?: string): string[] {
      const sql: string[] = [];
      this.applyNameFieldUpdates(sql, fields, result, entityName ? { Name: entityName } : undefined);
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
      vi.mocked(logStatus).mockClear();
      vi.mocked(LogWarning).mockClear();
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

      it('rejects unbounded (MAX) text when the length arrives under the runtime alias MaxLength', () => {
         // The advanced-generation metadata query selects `ef.Length AS MaxLength`, so
         // runtime rows carry MaxLength — checking only Length made the MAX rejection a
         // silent no-op (how Conversation Details.Message, nvarchar(MAX), got flagged).
         expect(mm.eligibleForNameField({ Type: 'nvarchar', MaxLength: -1, IsPrimaryKey: false })).toBe(false);
         expect(mm.eligibleForNameField({ Type: 'nvarchar', MaxLength: 510, IsPrimaryKey: false })).toBe(true);
      });

      it('rejects virtual fields (view-only columns cannot anchor FK-name joins)', () => {
         expect(mm.eligibleForNameField({ Type: 'nvarchar', Length: 510, IsPrimaryKey: false, IsVirtual: true })).toBe(false);
      });

      // ── IS-A (Table-Per-Type) carve-out — MJ issue #3551 ───────────────────────

      it('accepts an IS-A inherited virtual field (the child mirror of a parent column)', () => {
         // A TPT child's Name is IsVirtual=1 (it lives on the parent table and is
         // surfaced through the child's view) but AllowUpdateAPI=1, because the IS-A
         // sync sets it. It is the only sensible display value the child has.
         expect(mm.eligibleForNameField({
            Name: 'Name', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: true,
         })).toBe(true);
      });

      it('still rejects a BORROWED FK-name virtual column (AllowUpdateAPI = 0)', () => {
         // The base-view generator's `_RelatedEntityNameFieldMap` columns are virtual
         // AND read-only; letting one be a name field resolves circularly.
         expect(mm.eligibleForNameField({
            Name: 'Customer', Type: 'nvarchar', Length: 510, IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: false,
         })).toBe(false);
      });

      it('applies the type guardrails to IS-A inherited fields too', () => {
         const isa = { IsVirtual: true, AllowUpdateAPI: true, IsPrimaryKey: false };
         expect(mm.eligibleForNameField({ ...isa, Name: 'Payload', Type: 'nvarchar', Length: -1 })).toBe(false);
         expect(mm.eligibleForNameField({ ...isa, Name: 'Count', Type: 'int' })).toBe(false);
         expect(mm.eligibleForNameField({ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, IsVirtual: true, AllowUpdateAPI: true })).toBe(false);
      });

      it('rejects foreign-key columns (RelatedEntityID) and polymorphic RecordID columns', () => {
         expect(mm.eligibleForNameField({
            Name: 'CustomerID', Type: 'nvarchar', Length: 100, IsPrimaryKey: false, RelatedEntityID: 'ent-cust-1',
         })).toBe(false);
         expect(mm.eligibleForNameField({
            Name: 'CustomRef', Type: 'nvarchar', Length: 450, IsPrimaryKey: false, EntityIDFieldName: 'EntityID',
         })).toBe(false);
         expect(mm.eligibleForNameField({
            Name: 'RecordID', Type: 'nvarchar', Length: 450, IsPrimaryKey: false,
         })).toBe(false);
         expect(mm.eligibleForNameField({
            Name: 'SourceRecordID', Type: 'nvarchar', Length: 450, IsPrimaryKey: false,
         })).toBe(false);
         expect(mm.eligibleForNameField({
            Name: 'LinkedRecordPrimaryKey', Type: 'nvarchar', Length: 450, IsPrimaryKey: false,
         })).toBe(false);
         // Normal text fields that happen to start with Record (e.g. RecordName, RecordLabel) remain eligible
         expect(mm.eligibleForNameField({
            Name: 'RecordName', Type: 'nvarchar', Length: 200, IsPrimaryKey: false,
         })).toBe(true);
      });
   });

   describe('isInheritedISAField', () => {
      it('requires BOTH IsVirtual and AllowUpdateAPI', () => {
         expect(mm.inheritedISAField({ Name: 'Name', IsVirtual: true, AllowUpdateAPI: true })).toBe(true);
         expect(mm.inheritedISAField({ Name: 'Name', IsVirtual: true, AllowUpdateAPI: false })).toBe(false);
         expect(mm.inheritedISAField({ Name: 'Name', IsVirtual: false, AllowUpdateAPI: true })).toBe(false);
      });

      it('excludes primary keys and MJ system columns', () => {
         expect(mm.inheritedISAField({ Name: 'ID', IsVirtual: true, AllowUpdateAPI: true, IsPrimaryKey: true })).toBe(false);
         expect(mm.inheritedISAField({ Name: '__mj_CreatedAt', IsVirtual: true, AllowUpdateAPI: true })).toBe(false);
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

      // ── Single-winner semantics ────────────────────────────────────────────────

      it('flags ONLY the first eligible LLM candidate when nothing is flagged yet', () => {
         const fields = [
            { ID: 'f-ext', Name: 'ExternalID', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
            { ID: 'f-role', Name: 'Role', Type: 'nvarchar', Length: 40, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
            { ID: 'f-msg', Name: 'Message', Type: 'nvarchar', Length: -1, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         // LLM ranks Message first (ineligible: MAX) — winner must be Role, and ONLY Role.
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: ['Message', 'Role', 'ExternalID'] }));
         expect(sql).toHaveLength(1);
         expect(sql[0]).toContain("'f-role'");
         expect(sql[0]).toContain('IsNameField = 1');
      });

      it('keeps a single already-valid winner stable even when the LLM proposes a different field', () => {
         const fields = [
            { ID: 'f-a', Name: 'Title', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-b', Name: 'Code', Type: 'nvarchar', Length: 40, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: ['Code'] }));
         expect(sql).toHaveLength(0); // no drift: Title stays, Code is not flagged
      });

      it('repairs multi-flag accumulation: keeps one winner and clears the rest', () => {
         // The Conversation Details case: three flagged, one of them MAX (ineligible).
         const fields = [
            { ID: 'f-ext', Name: 'ExternalID', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-role', Name: 'Role', Type: 'nvarchar', Length: 40, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-msg', Name: 'Message', Type: 'nvarchar', Length: -1, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }));
         // Winner = ExternalID (first eligible flagged in field/sequence order, no literal 'Name');
         // Role and Message are cleared. No SET for the winner (already flagged).
         expect(sql).toHaveLength(2);
         expect(sql.join('\n')).toContain("'f-role'");
         expect(sql.join('\n')).toContain("'f-msg'");
         expect(sql.join('\n')).not.toContain("'f-ext'");
         for (const stmt of sql) {
            expect(stmt).toContain('IsNameField = 0');
         }
      });

      it('prefers the field literally named Name when repairing multiple flagged fields', () => {
         const fields = [
            { ID: 'f-dn', Name: 'DisplayName', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-n', Name: 'Name', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }));
         expect(sql).toHaveLength(1);
         expect(sql[0]).toContain("'f-dn'");
         expect(sql[0]).toContain('IsNameField = 0');
      });

      it('never clears a pinned loser (AutoUpdateIsNameField = 0)', () => {
         const fields = [
            { ID: 'f-n', Name: 'Name', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-pin', Name: 'LegacyName', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: false },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }));
         expect(sql).toHaveLength(0); // winner Name already set; pinned LegacyName untouched
      });

      it('clears a stale ineligible flag even when no eligible winner exists', () => {
         const fields = [
            { ID: 'f-blob', Name: 'Payload', Type: 'nvarchar', Length: -1, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }));
         expect(sql).toHaveLength(1);
         expect(sql[0]).toContain("'f-blob'");
         expect(sql[0]).toContain('IsNameField = 0');
      });

      it('clears a uniqueidentifier PK flag with no replacement (the v5.40 guardrail must survive)', () => {
         const fields = [
            { ID: 'f-id', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, IsNameField: true, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }));
         expect(sql).toHaveLength(1);
         expect(sql[0]).toContain("'f-id'");
         expect(sql[0]).toContain('IsNameField = 0');
      });

      // ── MJ issue #3551: never clear IsNameField without nominating a replacement ─

      it('leaves an IS-A child\'s inherited Name flag alone (issue #3551 regression)', () => {
         // AccountingCompanyProfile IS-A MJ: Companies — Name is mirrored from the
         // parent, so it is virtual. Before the fix the winner was null and the
         // clear-loop wiped the flag, leaving the entity with ZERO name fields.
         const fields = [
            { ID: 'f-id', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, IsNameField: false, AutoUpdateIsNameField: true },
            { ID: 'f-name', Name: 'Name', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: true, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-code', Name: 'ProfileCode', Type: 'nvarchar', Length: 50, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }));
         expect(sql).toHaveLength(0);
      });

      it('picks an IS-A inherited Name as a FRESH winner when the LLM ranks it first', () => {
         const fields = [
            { ID: 'f-name', Name: 'Name', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: true, IsNameField: false, AutoUpdateIsNameField: true },
            { ID: 'f-code', Name: 'ProfileCode', Type: 'nvarchar', Length: 50, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: ['Name', 'ProfileCode'] }));
         expect(sql).toHaveLength(1);
         expect(sql[0]).toContain("'f-name'");
         expect(sql[0]).toContain('IsNameField = 1');
      });

      it('preserves the last type-safe flag rather than clearing it with nothing to replace it', () => {
         // A view-only (non-IS-A) Name is still not PREFERRED, but dropping the
         // deterministic answer for nothing is worse than keeping a view-routed one.
         const fields = [
            { ID: 'f-name', Name: 'Name', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: false, IsNameField: true, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }));
         expect(sql).toHaveLength(0);
      });

      it('DOES clear a view-only flag once a real base-table replacement exists', () => {
         const fields = [
            { ID: 'f-name', Name: 'Name', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: false, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-title', Name: 'Title', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: ['Title'] }));
         expect(sql).toHaveLength(2);
         const joined = sql.join('\n');
         expect(joined).toContain("'f-title'");
         expect(joined).toContain('IsNameField = 1');
         expect(joined).toContain("'f-name'");
         expect(joined).toContain('IsNameField = 0');
      });

      it('prefers the literal Name field when preserving several type-safe flags', () => {
         const fields = [
            { ID: 'f-dn', Name: 'DisplayName', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: false, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-n', Name: 'Name', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsVirtual: true, AllowUpdateAPI: false, IsNameField: true, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }));
         expect(sql).toHaveLength(1);
         expect(sql[0]).toContain("'f-dn'");
         expect(sql[0]).toContain('IsNameField = 0');
      });

      it('rejects polymorphic RecordID when proposed by the LLM and replaces an existing RecordID flag when a real text candidate exists', () => {
         const freshFields = [
            { ID: 'f-rec', Name: 'RecordID', Type: 'nvarchar', Length: 450, IsPrimaryKey: false, EntityIDFieldName: 'EntityID', IsNameField: false, AutoUpdateIsNameField: true },
         ];
         expect(mm.runNameFieldUpdates(freshFields, emptyResult({ nameFields: ['RecordID'] }))).toHaveLength(0);

         const replaceableFields = [
            { ID: 'f-rec', Name: 'RecordID', Type: 'nvarchar', Length: 450, IsPrimaryKey: false, EntityIDFieldName: 'EntityID', IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-status', Name: 'Status', Type: 'nvarchar', Length: 50, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         const sql = mm.runNameFieldUpdates(replaceableFields, emptyResult({ nameFields: ['RecordID', 'Status'] }));
         expect(sql).toHaveLength(2);
         const joined = sql.join('\n');
         expect(joined).toContain("'f-status'");
         expect(joined).toContain('IsNameField = 1');
         expect(joined).toContain("'f-rec'");
         expect(joined).toContain('IsNameField = 0');
      });
   });

   // ── MJ issue #3608: say when the AI picks the name field, or nothing does ──
   describe('name-field logging', () => {
      const statusLines = (): string[] => vi.mocked(logStatus).mock.calls.map((c) => String(c[0]));

      it('logs the entity, the field and that it was an AI pick when step 3 sets the name field', () => {
         const fields = [
            { ID: 'f-subj', Name: 'SubjectEntityName', Type: 'nvarchar', Length: 255, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         mm.runNameFieldUpdates(fields, emptyResult({ nameFields: ['SubjectEntityName'] }), 'Assessment Sessions');
         const lines = statusLines();
         expect(lines).toHaveLength(1);
         expect(lines[0]).toContain('Assessment Sessions.SubjectEntityName');
         expect(lines[0]).toContain('AI pick');
      });

      it('logs nothing when an already-flagged field stays the winner', () => {
         const fields = [
            { ID: 'f-a', Name: 'Title', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: true, AutoUpdateIsNameField: true },
            { ID: 'f-b', Name: 'Code', Type: 'nvarchar', Length: 40, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         mm.runNameFieldUpdates(fields, emptyResult({ nameFields: ['Code'] }), 'Things');
         expect(statusLines()).toHaveLength(0);
      });

      it('does not claim an AI pick when the candidate is pinned (AutoUpdateIsNameField = 0)', () => {
         const fields = [
            { ID: 'f-t', Name: 'Title', Type: 'nvarchar', Length: 200, IsPrimaryKey: false, IsNameField: false, AutoUpdateIsNameField: false },
         ];
         const sql = mm.runNameFieldUpdates(fields, emptyResult({ nameFields: ['Title'] }), 'Things');
         expect(sql).toHaveLength(0);
         expect(statusLines().some((l) => l.includes('AI pick'))).toBe(false);
      });

      it('logs when no field wins, naming the entity', () => {
         const fields = [
            { ID: 'f-id', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, IsNameField: false, AutoUpdateIsNameField: true },
         ];
         mm.runNameFieldUpdates(fields, emptyResult({ nameFields: [] }), 'Assessment Sessions');
         const lines = statusLines();
         expect(lines).toHaveLength(1);
         expect(lines[0]).toContain('no eligible name field for Assessment Sessions');
      });
   });

   // ── MJ issue #3608: an open AI circuit must not skip entities silently ──
   describe('processEntitiesBatched circuit warning', () => {
      class FakeAG extends AdvancedGeneration {
         public Open = false;
         public override get AICircuitOpen(): boolean {
            return this.Open;
         }
      }

      class BatchHarness extends ManageMetadataBase {
         public Processed: string[] = [];
         /** Opens the circuit after this entity is processed (simulates repeated credential failures). */
         public OpenCircuitAfter: string | null = null;
         public Ag = new FakeAG();
         protected override async processEntityAdvancedGeneration(_pool: CodeGenConnection, entity: EntityInfo): Promise<void> {
            if (this.Ag.AICircuitOpen) {
               return;
            }
            this.Processed.push(entity.Name);
            if (entity.Name === this.OpenCircuitAfter) {
               this.Ag.Open = true;
            }
         }
         public async Run(count: number): Promise<boolean> {
            const entities = Array.from({ length: count }, (_, i) => ({ ID: `e${i}`, Name: `E${i}` }));
            return this.processEntitiesBatched({} as CodeGenConnection, entities, [], this.Ag, {} as UserInfo);
         }
      }

      let savedBatchSize: number | undefined;
      beforeEach(() => {
         savedBatchSize = configInfo.advancedGeneration?.batchSize;
         if (configInfo.advancedGeneration) {
            configInfo.advancedGeneration.batchSize = 2;
         }
      });
      afterEach(() => {
         if (configInfo.advancedGeneration && savedBatchSize !== undefined) {
            configInfo.advancedGeneration.batchSize = savedBatchSize;
         }
      });

      const warnings = (): string[] => vi.mocked(LogWarning).mock.calls.map((c) => String(c[0]));

      it('warns nothing when the circuit stays closed', async () => {
         const h = new BatchHarness();
         await h.Run(5);
         expect(h.Processed).toHaveLength(5);
         expect(warnings()).toHaveLength(0);
      });

      it('warns once with the count of entities the open circuit skipped', async () => {
         const h = new BatchHarness();
         h.OpenCircuitAfter = 'E1'; // circuit opens during the first batch (E0, E1)
         await h.Run(5);
         expect(h.Processed).toEqual(['E0', 'E1']);
         const w = warnings();
         expect(w).toHaveLength(1);
         expect(w[0]).toContain('smart-field identification');
         expect(w[0]).toContain('3 of 5');
      });

      it('counts every entity when the circuit was already open before the phase', async () => {
         const h = new BatchHarness();
         h.Ag.Open = true;
         await h.Run(5);
         expect(h.Processed).toHaveLength(0);
         const w = warnings();
         expect(w).toHaveLength(1);
         expect(w[0]).toContain('5 of 5');
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
