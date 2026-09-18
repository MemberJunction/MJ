/**
 * Deterministic search-flag hygiene.
 *
 * CodeGen inserts every new entity with `AllowUserSearchAPI = 1`, but the per-field
 * `IncludeInUserSearchAPI` flags are only ever set by the smart-field pipeline — which runs
 * under `AdvancedGeneration.enabled`, i.e. `enableAdvancedGeneration ?? false`. On a default
 * configuration that pipeline never runs, so every entity lands flagged searchable with nothing
 * searchable on it. `UserSearchString` against such an entity is a documented no-op
 * (MJ#4581/#4582): the provider ignores the term and returns the unfiltered table, and global
 * search fans out to it on every keystroke to discard every row it gets back.
 *
 * These two statements close that without a model in the loop.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { MAX_SEARCHABLE_FIELDS_PER_ENTITY, NAME_LIKE_FIELD_NAMES } from '../Database/search-guardrails';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

class TestableManageMetadata extends ManageMetadataBase {
   public executedSql: string[] = [];

   protected override async LogSQLBatchAndExecute(
      _pool: CodeGenConnection,
      sqlBatch: string[],
      _description: string,
      _throwError: boolean = false
   ): Promise<void> {
      this.executedSql.push(...sqlBatch);
   }

   public testBuild(excludeSchemas: string[]) {
      return this.buildSearchFlagHygieneSQL(excludeSchemas);
   }

   public testApply(pool: CodeGenConnection, excludeSchemas: string[]): Promise<boolean> {
      return this.applySearchFlagHygiene(pool, excludeSchemas);
   }
}

function createDummyConnection(): CodeGenConnection {
   return {
      query: async () => ({ recordset: [] } as CodeGenQueryResult),
      queryWithParams: async () => ({ recordset: [] } as CodeGenQueryResult),
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   };
}

/** Collapse whitespace so assertions read against the SQL's meaning, not its formatting. */
const flat = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('search-flag hygiene — seeding the name field', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => { mm = new TestableManageMetadata(); });

   it('only ever flags a name-like column, from the same list the LLM path uses', () => {
      const sql = flat(mm.testBuild([]).seedSQL);
      for (const n of NAME_LIKE_FIELD_NAMES) {
         expect(sql).toContain(`'${n.toLowerCase()}'`);
      }
   });

   it('never flags a virtual column', () => {
      // Virtual fields are the denormalized FK display columns CodeGen puts on views — computed
      // by JOIN, so a LIKE against one cannot seek an index. Measured against a real database,
      // seeding from IsNameField instead would have flagged 54 fields of which 41 were virtual.
      expect(flat(mm.testBuild([]).seedSQL)).toContain('ISNULL(f.[IsVirtual], 0) = 0');
   });

   it('does not key on IsNameField, which points at the wrong columns', () => {
      // MJ: Employees' only IsNameField is the VIRTUAL `FirstLast`, so an IsNameField-driven
      // seed would not have fixed the entity this whole change exists for — while flagging
      // identifiers like RecordID and Token on dozens of junction entities.
      expect(flat(mm.testBuild([]).seedSQL)).not.toContain('[IsNameField]');
   });

   it('respects the AutoUpdateIncludeInUserSearchAPI opt-out', () => {
      // This flag is how an operator pins a hand-made decision. A pass that ignored it would
      // silently re-enable search on a field someone deliberately turned off.
      expect(flat(mm.testBuild([]).seedSQL)).toContain('[AutoUpdateIncludeInUserSearchAPI] = 1');
   });

   it('only fires on an entity that has NO searchable field at all', () => {
      // Fill a gap, never override. An entity the LLM (or a human) already configured is left
      // exactly as it is.
      const sql = flat(mm.testBuild([]).seedSQL);
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('f2.[IncludeInUserSearchAPI] = 1');
   });

   it('refuses the primary key and non-text or unbounded columns', () => {
      // Mirrors isFieldEligibleForUserSearch / the runtime isTextSearchableType: a LIKE against
      // any of these forces an unindexed scan, which is what the guardrails exist to prevent.
      const sql = flat(mm.testBuild([]).seedSQL);
      expect(sql).toContain('[IsPrimaryKey]');
      expect(sql).toContain("LOWER(f.[Type]) IN ('nvarchar','varchar','char','nchar')");
      expect(sql).toContain('[Length] <> -1');
   });

   it('caps the number of seeded fields at the guardrail maximum', () => {
      const sql = flat(mm.testBuild([]).seedSQL);
      expect(sql).toContain('ROW_NUMBER() OVER');
      expect(sql).toContain(`ranked.rn <= ${MAX_SEARCHABLE_FIELDS_PER_ENTITY}`);
   });
});

describe('search-flag hygiene — clearing AllowUserSearchAPI', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => { mm = new TestableManageMetadata(); });

   it('turns the flag off only where it is currently on', () => {
      const sql = flat(mm.testBuild([]).clearSQL);
      expect(sql).toContain('SET [AllowUserSearchAPI] = 0');
      expect(sql).toContain('e.[AllowUserSearchAPI] = 1');
   });

   it('respects the AutoUpdateAllowUserSearchAPI opt-out', () => {
      // This is exactly how the curated entries in .entity-search-exclusions.json protect
      // themselves — they set the AutoUpdate flag false alongside the flag itself.
      expect(flat(mm.testBuild([]).clearSQL)).toContain('e.[AutoUpdateAllowUserSearchAPI] = 1');
   });

   it('leaves an entity alone once it has a searchable field', () => {
      const sql = flat(mm.testBuild([]).clearSQL);
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('f2.[IncludeInUserSearchAPI] = 1');
   });
});

describe('search-flag hygiene — full-text search entities are exempt', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => { mm = new TestableManageMetadata(); });

   // An FTS entity is searchable through its INDEX: createViewUserSearchSQL takes the full-text
   // branch before it ever reads IncludeInUserSearchAPI. Clearing its AllowUserSearchAPI because
   // it has no per-field flags would disable search on an entity that searches perfectly well.
   it('neither statement touches a FullTextSearchEnabled entity', () => {
      const { seedSQL, clearSQL } = mm.testBuild([]);
      expect(flat(seedSQL)).toContain('ISNULL(e.[FullTextSearchEnabled], 0) = 0');
      expect(flat(clearSQL)).toContain('ISNULL(e.[FullTextSearchEnabled], 0) = 0');
   });
});

describe('search-flag hygiene — scope and ordering', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => { mm = new TestableManageMetadata(); });

   it('excludes virtual entities and the caller-excluded schemas', () => {
      const { seedSQL, clearSQL } = mm.testBuild(['staging', 'scratch']);
      for (const sql of [flat(seedSQL), flat(clearSQL)]) {
         expect(sql).toContain('[VirtualEntity] = 0');
         expect(sql).toContain("[SchemaName] NOT IN ('staging','scratch')");
      }
   });

   it('omits the schema filter entirely when nothing is excluded', () => {
      expect(flat(mm.testBuild([]).seedSQL)).not.toContain('NOT IN ()');
   });

   it('seeds before it clears, so it never disables an entity it just fixed', async () => {
      // Reversed, the clear would fire against an entity whose name field the seed was about to
      // flag — turning search off on exactly the entities this pass exists to repair.
      const ok = await mm.testApply(createDummyConnection(), []);
      expect(ok).toBe(true);
      expect(mm.executedSql).toHaveLength(2);
      expect(mm.executedSql[0]).toContain('IncludeInUserSearchAPI');
      expect(mm.executedSql[1]).toContain('AllowUserSearchAPI');
   });

   it('uses the portable subquery form rather than T-SQL UPDATE ... FROM', () => {
      // CodeGen emits against both SQL Server and PostgreSQL; `UPDATE x SET ... FROM y JOIN z`
      // is T-SQL-only and would not run on PG. The subquery's own FROM is fine — only the OUTER
      // statement matters, so look at the text between SET and the outer WHERE and nothing else.
      for (const sql of Object.values(mm.testBuild([]))) {
         const outer = flat(sql);
         const setToWhere = outer.slice(outer.indexOf(' SET '), outer.indexOf(' WHERE '));
         expect(setToWhere).not.toMatch(/\sFROM\s/i);
         expect(outer).toMatch(/ WHERE \[ID\] IN \(/i);
      }
   });
});
