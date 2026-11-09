/**
 * #5976 — upgrading an application schema to 6.1 must not drop the Root<Field> columns its
 * self-referencing foreign keys had before hierarchy generation became opt-in.
 *
 * Before Pass 1 field sync, CodeGen seeds Configuration.Hierarchy.IsHierarchy = true on every
 * non-virtual self-referencing FK whose Configuration has no Hierarchy key, when the entity still
 * has a virtual Root<Field> EntityField or the fn<Table><Field>_GetRootID function still exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLLogging } from '../Misc/sql_logging';

type CandidateRow = {
   ID: string; EntityID: string; Name: string; Configuration: string | null;
   EntityName: string; SchemaName: string; BaseTable: string;
};
type SeedPlan = { Row: CandidateRow; Reason: string; Configuration: string };

const COURSE_ENTITY = 'AAAAAAAA-0000-0000-0000-000000000001';
const CATEGORY_ENTITY = 'AAAAAAAA-0000-0000-0000-000000000002';

function candidate(overrides: Partial<CandidateRow>): CandidateRow {
   return {
      ID: 'F0000000-0000-0000-0000-000000000001', EntityID: COURSE_ENTITY, Name: 'PrerequisiteCourseID', Configuration: null,
      EntityName: 'Courses', SchemaName: 'AssociationDemo', BaseTable: 'Course',
      ...overrides,
   };
}

class HierarchySeed extends ManageMetadataBase {
   public plan(
      candidates: CandidateRow[],
      rootFields: Array<{ EntityID: string; Name: string }>,
      functions: Array<{ RoutineSchema: string; RoutineName: string }>
   ): SeedPlan[] {
      return this.planLegacyHierarchySeeds(candidates, rootFields, functions) as SeedPlan[];
   }
   public seed(pool: CodeGenConnection, excludeSchemas: string[]) {
      return this.seedLegacyHierarchyConfiguration(pool, excludeSchemas);
   }
}

describe('planLegacyHierarchySeeds (#5976)', () => {
   const mm = new HierarchySeed();

   it('seeds a field whose entity still has a virtual Root<Field> EntityField', () => {
      const seeds = mm.plan([candidate({})], [{ EntityID: COURSE_ENTITY.toLowerCase(), Name: 'RootPrerequisiteCourseID' }], []);

      expect(seeds).toHaveLength(1);
      expect(JSON.parse(seeds[0].Configuration)).toEqual({ Hierarchy: { IsHierarchy: true } });
      expect(seeds[0].Reason).toContain('RootPrerequisiteCourseID');
   });

   it('seeds a field whose root ID function still exists (SQL Server name)', () => {
      const seeds = mm.plan([candidate({})], [], [{ RoutineSchema: 'AssociationDemo', RoutineName: 'fnCoursePrerequisiteCourseID_GetRootID' }]);

      expect(seeds).toHaveLength(1);
   });

   it('matches the PostgreSQL snake_case root ID function name', () => {
      const row = candidate({ EntityID: CATEGORY_ENTITY, Name: 'ParentCategoryID', BaseTable: 'ProductCategory', EntityName: 'Product Categories' });
      const seeds = mm.plan([row], [], [{ RoutineSchema: 'associationdemo', RoutineName: 'fn_product_category_parent_category_id_get_root_id' }]);

      expect(seeds).toHaveLength(1);
   });

   it('ignores a function in another schema', () => {
      const seeds = mm.plan([candidate({})], [], [{ RoutineSchema: 'OtherApp', RoutineName: 'fnCoursePrerequisiteCourseID_GetRootID' }]);

      expect(seeds).toEqual([]);
   });

   it('does not seed a field with neither a Root field nor a root function', () => {
      const seeds = mm.plan([candidate({})], [{ EntityID: COURSE_ENTITY, Name: 'RootSomethingElseID' }], []);

      expect(seeds).toEqual([]);
   });

   it('leaves an explicit Hierarchy setting alone, including an opt-out', () => {
      const optOut = candidate({ Configuration: '{"Hierarchy":{"IsHierarchy":false}}' });
      const seeds = mm.plan([optOut], [{ EntityID: COURSE_ENTITY, Name: 'RootPrerequisiteCourseID' }], []);

      expect(seeds).toEqual([]);
   });

   it('merges into an existing Configuration that has no Hierarchy key', () => {
      const other = candidate({ Configuration: '{"Other":{"Flag":1}}' });
      const seeds = mm.plan([other], [{ EntityID: COURSE_ENTITY, Name: 'RootPrerequisiteCourseID' }], []);

      expect(JSON.parse(seeds[0].Configuration)).toEqual({ Other: { Flag: 1 }, Hierarchy: { IsHierarchy: true } });
   });

   it('skips a field whose Configuration is not a JSON object', () => {
      const broken = candidate({ Configuration: '{not json' });
      const arrayConfig = candidate({ ID: 'F0000000-0000-0000-0000-000000000002', Configuration: '[1]' });
      const seeds = mm.plan([broken, arrayConfig], [{ EntityID: COURSE_ENTITY, Name: 'RootPrerequisiteCourseID' }], []);

      expect(seeds).toEqual([]);
   });
});

describe('seedLegacyHierarchyConfiguration (#5976)', () => {
   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
   });

   afterEach(() => {
      vi.restoreAllMocks();
      SQLLogging.resetForTests();
   });

   function pool(candidates: CandidateRow[], rootFields: Array<{ EntityID: string; Name: string }>, executed: string[]): CodeGenConnection {
      const run = async (sql: string): Promise<CodeGenQueryResult> => {
         executed.push(sql);
         let rows: Record<string, unknown>[] = [];
         if (sql.includes('INNER JOIN')) rows = candidates;
         else if (sql.includes("LIKE 'Root%'")) rows = rootFields;
         return { recordset: rows } as unknown as CodeGenQueryResult;
      };
      return { query: run, queryWithParams: run } as unknown as CodeGenConnection;
   }

   it('writes a guarded UPDATE for each seeded field', async () => {
      const executed: string[] = [];
      const ok = await new HierarchySeed().seed(pool([candidate({})], [{ EntityID: COURSE_ENTITY, Name: 'RootPrerequisiteCourseID' }], executed), ['sys']);

      expect(ok).toBe(true);
      const update = executed.find(s => s.trim().startsWith('UPDATE'))!.replace(/\s+/g, ' ');
      expect(update).toContain(`SET [Configuration] = '{"Hierarchy":{"IsHierarchy":true}}'`);
      expect(update).toContain(`WHERE [ID] = 'F0000000-0000-0000-0000-000000000001' AND ([Configuration] IS NULL OR [Configuration] = '')`);
   });

   it('skips excluded schemas and the core schema', async () => {
      const executed: string[] = [];
      const rows = [candidate({ SchemaName: 'Excluded' }), candidate({ ID: 'F0000000-0000-0000-0000-000000000009', SchemaName: '__mj' })];

      await new HierarchySeed().seed(pool(rows, [{ EntityID: COURSE_ENTITY, Name: 'RootPrerequisiteCourseID' }], executed), ['excluded']);

      expect(executed.some(s => s.trim().startsWith('UPDATE'))).toBe(false);
   });

   it('returns false when a query fails', async () => {
      const failing = { query: async () => { throw new Error('Invalid column name Configuration'); } } as unknown as CodeGenConnection;

      await expect(new HierarchySeed().seed(failing, [])).resolves.toBe(false);
   });
});
