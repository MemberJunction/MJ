/**
 * #4050 / #5976 / #6028 — the post-SQL field pass must prune EntityField rows orphaned by base-view
 * regeneration, even when the orphaned entity is in no change list.
 *
 * The SQL pass regenerates every included entity's base view, so a view can lose columns while
 * its table is unchanged. Such an entity is in neither the new nor the modified list (both are
 * built from table changes), so a prune scoped to those lists, or the empty-filter exit, never
 * reaches it. These tests pin: the prune runs unscoped, runs before the empty-filter exit, folds
 * the entities it pruned into the pass scope, and reports its failure.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../Config/config', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../Config/config')>();
   return { ...actual, ResolveAdditionalSchemaInfoPath: vi.fn(() => undefined) };
});

import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../Database/manage-metadata';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';
import { SQLLogging } from '../Misc/sql_logging';
import type { UserInfo } from '@memberjunction/core';

const FAKE_POOL = {} as unknown as CodeGenConnection;
const FAKE_USER = {} as unknown as UserInfo;

/** Stubs every DB-touching step of ManageEntityFields and records the scope each one received. */
class StubbedFieldPass extends ManageMetadataBase {
   public pruneScopes: Array<string[] | undefined> = [];
   public createScopes: Array<string[] | undefined> = [];
   public updateScopes: Array<string[] | undefined> = [];
   public entityIDsByName: Record<string, string> = {};
   public pruneResult: { success: boolean; prunedEntityNames: string[] } = { success: true, prunedEntityNames: [] };

   public exposeDistinct(rows: ReadonlyArray<{ Entity?: unknown }> | null | undefined): string[] {
      return this.distinctPrunedEntityNames(rows);
   }

   protected override resolveEntityNamesToIDs(entityNames: string[]): string[] {
      return entityNames.map(n => this.entityIDsByName[n]).filter((id): id is string => !!id);
   }
   protected override async deleteUnneededEntityFields(_pool: CodeGenConnection, _exclude: string[], entityIDs?: string[]) {
      this.pruneScopes.push(entityIDs);
      return this.pruneResult;
   }
   protected override async createNewEntityFieldsFromSchema(_pool: CodeGenConnection, entityIDs?: string[]): Promise<boolean> {
      this.createScopes.push(entityIDs);
      return true;
   }
   protected override async updateExistingEntityFieldsFromSchema(_pool: CodeGenConnection, _exclude: string[], entityIDs?: string[]): Promise<boolean> {
      this.updateScopes.push(entityIDs);
      return true;
   }
   protected override async applySoftPKFKConfig(): Promise<boolean> { return true; }
   protected override async manageParentEntityFields() { return { success: true, anyUpdates: false }; }
   protected override async setDefaultColumnWidthWhereNeeded(): Promise<boolean> { return true; }
   protected override async updateEntityFieldDisplayNameWhereNull(): Promise<boolean> { return true; }
   protected override async manageEntityFieldValuesAndValidatorFunctions(): Promise<boolean> { return true; }
   protected override async applyValueListConfig(): Promise<boolean> { return true; }
   protected override async applyAdvancedGeneration(): Promise<boolean> { return true; }
   protected override async applySearchFlagHygiene(): Promise<boolean> { return true; }
}

/** Pass 2's call shape in sql_codegen: prune on, advanced generation on, scoped by the change lists. */
const runPass2 = (mm: StubbedFieldPass, filter: string[] | undefined) =>
   mm.ManageEntityFields(FAKE_POOL, ['sys'], true, true, FAKE_USER, false, false, filter);

/** Pass 1's call shape: unscoped, prune deferred. */
const runPass1 = (mm: StubbedFieldPass) =>
   mm.ManageEntityFields(FAKE_POOL, ['sys'], true, true, FAKE_USER, true, true);

describe('ManageEntityFields prunes orphaned fields unscoped (#4050)', () => {
   let mm: StubbedFieldPass;

   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      mm = new StubbedFieldPass();
   });

   afterEach(() => {
      SQLLogging.resetForTests();
      vi.restoreAllMocks();
   });

   it('prunes when the filter is empty (no entity changed)', async () => {
      const ok = await runPass2(mm, []);

      expect(ok).toBe(true);
      expect(mm.pruneScopes).toEqual([undefined]);
   });

   it('prunes unscoped even when the filter names other entities', async () => {
      mm.entityIDsByName = { 'Other Entity': '11111111-1111-1111-1111-111111111111' };

      await runPass2(mm, ['Other Entity']);

      expect(mm.pruneScopes).toEqual([undefined]);
   });

   it('keeps the create and update steps scoped to the filter', async () => {
      const id = '22222222-2222-2222-2222-222222222222';
      mm.entityIDsByName = { 'Journal Entries': id };

      await runPass2(mm, ['Journal Entries']);

      expect(mm.createScopes).toEqual([[id]]);
      expect(mm.updateScopes).toEqual([[id]]);
   });

   it('folds pruned entities into the scope so their Sequence is renumbered', async () => {
      const id = '33333333-3333-3333-3333-333333333333';
      mm.entityIDsByName = { 'Product Categories': id };
      mm.pruneResult = { success: true, prunedEntityNames: ['Product Categories'] };

      await runPass2(mm, []);

      expect(mm.updateScopes).toEqual([[id]]);
   });

   it('does not duplicate an entity that is both in the filter and pruned', async () => {
      const id = '44444444-4444-4444-4444-444444444444';
      mm.entityIDsByName = { 'Courses': id };
      mm.pruneResult = { success: true, prunedEntityNames: ['Courses'] };

      await runPass2(mm, ['Courses']);

      expect(mm.updateScopes).toEqual([[id]]);
   });

   it('skips the rest of the pass when nothing changed and nothing was pruned', async () => {
      await runPass2(mm, []);

      expect(mm.createScopes).toEqual([]);
      expect(mm.updateScopes).toEqual([]);
   });

   it('returns false when the prune fails, including on the empty-filter exit', async () => {
      mm.pruneResult = { success: false, prunedEntityNames: [] };

      await expect(runPass2(mm, [])).resolves.toBe(false);
   });

   it('Pass 1 still defers the prune', async () => {
      await runPass1(mm);

      expect(mm.pruneScopes).toEqual([]);
      expect(mm.updateScopes).toEqual([undefined]);
   });
});

describe('distinctPrunedEntityNames', () => {
   it('returns distinct, non-blank entity names from the routine rows', () => {
      const mm = new StubbedFieldPass();
      expect(mm.exposeDistinct([
         { Entity: 'Courses' }, { Entity: 'Courses' }, { Entity: '  ' }, { Entity: null }, { Entity: 7 }, { Entity: 'Forum Posts' },
      ])).toEqual(['Courses', 'Forum Posts']);
      expect(mm.exposeDistinct(null)).toEqual([]);
      expect(mm.exposeDistinct([])).toEqual([]);
   });
});

describe('deleteUnneededEntityFields', () => {
   class RealPrune extends ManageMetadataBase {
      public callPrune(pool: CodeGenConnection) {
         return this.deleteUnneededEntityFields(pool, ['sys']);
      }
   }

   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      ManageMetadataBase.ModifiedEntityList = [];
   });

   afterEach(() => {
      SQLLogging.resetForTests();
      ManageMetadataBase.ModifiedEntityList = [];
   });

   it('reports the pruned entity names and marks them modified', async () => {
      const rows = [{ Entity: 'Courses', Name: 'RootPrerequisiteCourseID' }, { Entity: 'Courses', Name: 'Depth' }];
      const pool = { query: async () => ({ recordset: rows }) } as unknown as CodeGenConnection;

      const result = await new RealPrune().callPrune(pool);

      expect(result).toEqual({ success: true, prunedEntityNames: ['Courses'] });
      expect(ManageMetadataBase.ModifiedEntityList).toContain('Courses');
   });

   it('reports failure with no names when the routine throws', async () => {
      const pool = { query: async () => { throw new Error('deadlock'); } } as unknown as CodeGenConnection;

      const result = await new RealPrune().callPrune(pool);

      expect(result).toEqual({ success: false, prunedEntityNames: [] });
   });
});
