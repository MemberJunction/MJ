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
   /** Ordered log of probes and executes, shared with the fake connection. */
   public events: string[] = [];

   protected override async LogSQLBatchAndExecute(
      _pool: CodeGenConnection,
      sqlBatch: string[],
      _description: string,
      _throwError: boolean = false
   ): Promise<void> {
      for (const sql of sqlBatch) {
         this.events.push(/ROW_NUMBER/i.test(sql) ? 'exec:seed' : 'exec:clear');
      }
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

/**
 * A connection whose COUNT probes report outstanding work, plus a log of what was asked of it.
 *
 * `applySearchFlagHygiene` probes before each statement, so a test that expects the statements to
 * be emitted has to say there is something to do. The seed probe is the one carrying ROW_NUMBER;
 * the clear probe is the other.
 */
function createProbeConnection(seedCount: number, clearNames: string[], calls: string[] = []): CodeGenConnection {
   return {
      query: async (sql: string) => {
         const isSeedProbe = /ROW_NUMBER/i.test(sql);
         calls.push(isSeedProbe ? 'probe:seed' : 'probe:clear');
         // The seed probe counts; the clear probe returns the entity NAMES it would disable.
         return {
            recordset: isSeedProbe ? [{ Cnt: seedCount }] : clearNames.map(Name => ({ Name })),
         } as unknown as CodeGenQueryResult;
      },
      queryWithParams: async () => ({ recordset: [] } as CodeGenQueryResult),
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   };
}

/** A connection whose probes throw — the "cannot determine what I would do" case. */
function createFailingProbeConnection(): CodeGenConnection {
   return {
      query: async () => { throw new Error('probe failed: invalid object name'); },
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
      // A NULL Length must stay eligible — isFieldEligibleForUserSearch only rejects an explicit
      // -1, and a bare `[Length] <> -1` is UNKNOWN for NULL, which would silently drop the row.
      expect(sql).toContain("ISNULL(f.[Length], 0) <> -1");
   });

   it('caps the number of seeded fields at the guardrail maximum', () => {
      const sql = flat(mm.testBuild([]).seedSQL);
      expect(sql).toContain('ROW_NUMBER() OVER');
      expect(sql).toContain(`ranked.rn <= ${MAX_SEARCHABLE_FIELDS_PER_ENTITY}`);
   });
});

describe('search-flag hygiene — predicate and entity-shape guardrails', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => { mm = new TestableManageMetadata(); });

   it('sets the index-seekable predicate rather than inheriting the Contains default', () => {
      // EntityField.UserSearchPredicateAPI defaults to 'Contains' in the database, which is
      // LIKE '%term%' — an unindexable scan. Flagging a field without also setting the predicate
      // would make every seeded entity a full scan per keystroke, which is the exact cost this
      // whole change exists to avoid.
      const sql = flat(mm.testBuild([]).seedSQL);
      expect(sql).toContain("[UserSearchPredicateAPI] = 'BeginsWith'");
      expect(sql).not.toContain("'Contains'");
   });

   it('refuses log / audit / run-history entity shapes', () => {
      const sql = flat(mm.testBuild([]).seedSQL);
      expect(sql).toContain("LIKE '% Logs'");
      expect(sql).toContain("LIKE '% Audit'");
      expect(sql).toContain("LIKE '% Runs'");
   });

   it('refuses detail / line-item / step / param child shapes', () => {
      const sql = flat(mm.testBuild([]).seedSQL);
      for (const sfx of ['Details', 'Lines', 'Items', 'Steps', 'Params', 'Mappings']) {
         expect(sql).toContain(`LIKE '% ${sfx}'`);
      }
   });

   it('matches the final WORD, never a bare suffix', () => {
      // `LIKE '%Lines'` is a case-insensitive endsWith under the default collation, so it caught
      // Pipelines, Guidelines, Timelines, Airlines, Deadlines and Baselines; `'%Logs'` caught
      // Catalogs, Dialogs and Blogs; `'%Audit%'` caught Auditors. MJ's own `ML Training
      // Pipelines` was among the casualties. Those entities were then skipped by the seed AND
      // swept up by the clear, which carries no shape filter — so the guardrail did not merely
      // withhold help, it turned search OFF on them.
      const sql = flat(mm.testBuild([]).seedSQL);
      for (const word of ['Logs', 'Lines', 'Items', 'Runs', 'Details']) {
         // A space before the word, or the whole name being exactly that word.
         expect(sql).toContain(`LIKE '% ${word}'`);
         expect(sql).toContain(`e.[Name] = '${word}'`);
         // The bare form is what produced the false positives.
         expect(sql).not.toContain(`LIKE '%${word}'`);
      }
      expect(sql).not.toContain("LIKE '%Audit%'");
   });

   it('only seeds entities where search is actually enabled', () => {
      // Writing field flags to an entity whose AllowUserSearchAPI is off — a curated exclusion,
      // say — would permanently disarm both the clear below and the LLM path's
      // "no searchable fields survived guardrails" block, since those test for flagged fields.
      expect(flat(mm.testBuild([]).seedSQL)).toContain('e.[AllowUserSearchAPI] = 1');
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
      const ok = await mm.testApply(createProbeConnection(3, ['Widgets', 'Gizmos'], mm.events), []);
      expect(ok).toBe(true);
      expect(mm.executedSql).toHaveLength(2);
      expect(mm.executedSql[0]).toContain('IncludeInUserSearchAPI');
      expect(mm.executedSql[1]).toContain('AllowUserSearchAPI');
   });

   it('uses the portable subquery form rather than T-SQL UPDATE ... FROM', () => {
      // CodeGen emits against both SQL Server and PostgreSQL; `UPDATE x SET ... FROM y JOIN z`
      // is T-SQL-only and would not run on PG. The subquery's own FROM is fine — only the OUTER
      // statement matters, so look at the text between SET and the outer WHERE and nothing else.
      //
      // Only the two UPDATEs: testBuild also returns the COUNT probes, which have no SET clause.
      const { seedSQL, clearSQL } = mm.testBuild([]);
      for (const sql of [seedSQL, clearSQL]) {
         const outer = flat(sql);
         const setToWhere = outer.slice(outer.indexOf(' SET '), outer.indexOf(' WHERE '));
         expect(setToWhere).not.toMatch(/\sFROM\s/i);
         expect(outer).toMatch(/ WHERE \[ID\] IN \(/i);
      }
   });
});

/**
 * T20 — every-run config writers compare first and stay silent when there is nothing to do.
 *
 * This pass runs on EVERY CodeGen run. `LogSQLBatchAndExecute` writes whatever it is handed into
 * the run's `CodeGen_Run_*.sql` capture whether or not a row moves, and the drift gate's
 * warm-twice stage fails on any capture surviving a second run. So "the UPDATEs converge" is not
 * enough — the pass has to emit nothing once the database is already hygienic. It previously
 * emitted both statements unconditionally, which reddened the gate on every PR
 * (`❌ Surviving CodeGen_Run_*.sql found after run 2`) while the data was perfectly idempotent.
 */
describe('search-flag hygiene — compare-first (T20)', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => { mm = new TestableManageMetadata(); });

   it('captures nothing when every entity is already hygienic', async () => {
      const ok = await mm.testApply(createProbeConnection(0, [], mm.events), []);
      expect(ok).toBe(true);
      expect(mm.executedSql).toHaveLength(0);
   });

   it('emits only the seed when only the seed has work', async () => {
      await mm.testApply(createProbeConnection(2, [], mm.events), []);
      expect(mm.executedSql).toHaveLength(1);
      expect(mm.executedSql[0]).toContain('[IncludeInUserSearchAPI] = 1');
   });

   it('emits only the clear when only the clear has work', async () => {
      await mm.testApply(createProbeConnection(0, ['A','B','C','D','E'], mm.events), []);
      expect(mm.executedSql).toHaveLength(1);
      expect(mm.executedSql[0]).toContain('[AllowUserSearchAPI] = 0');
   });

   it('probes the clear AFTER the seed has run, not alongside it', async () => {
      // Seeding changes which entities still have nothing searchable. A clear probe taken before
      // the seed would count entities the seed was about to repair and emit a statement that then
      // matched nothing — putting the stray capture file straight back.
      await mm.testApply(createProbeConnection(1, ['Widgets'], mm.events), []);
      expect(mm.events).toEqual(['probe:seed', 'exec:seed', 'probe:clear', 'exec:clear']);
   });

   it('treats a probe that returns no rows as no work', async () => {
      // Skipping is the safe direction: the statement is withheld rather than emitted blind.
      const ok = await mm.testApply(createDummyConnection(), []);
      expect(ok).toBe(true);
      expect(mm.executedSql).toHaveLength(0);
   });
});

/**
 * The seed and the clear compose into an outcome neither states on its own.
 *
 * The shape filter gates the SEED only; the clear deliberately carries none, because a genuine
 * log / run / detail table is exactly what should drop out of the search fan-out. The consequence
 * is that the shape list does not merely withhold help — it DECIDES which entities get search
 * turned off. A name wrongly matched there is not "left alone", it is disabled. These pin that,
 * so the next person to widen the list sees it is a destructive change rather than a cautious one.
 */
describe('search-flag hygiene — seed/clear composition', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => { mm = new TestableManageMetadata(); });

   it('the clear carries no entity-shape filter, on purpose', () => {
      // If this ever starts failing, the shapes stopped being disabled and the fan-out no-op is
      // back for log tables — which is the bug the clear exists to fix.
      const clear = flat(mm.testBuild([]).clearSQL);
      expect(clear).not.toContain("LIKE '% Logs'");
      expect(clear).not.toContain("LIKE '% Runs'");
   });

   it('the clear probe selects names and shares the UPDATE predicate', () => {
      const { clearSQL, clearProbeSQL } = mm.testBuild([]);
      const probe = flat(clearProbeSQL);
      expect(probe).toContain('SELECT e.[Name]');
      // Every guard on the UPDATE has to be on the probe, or the two disagree about scope.
      for (const guard of [
         'e.[AllowUserSearchAPI] = 1',
         'e.[AutoUpdateAllowUserSearchAPI] = 1',
         'e.[VirtualEntity] = 0',
      ]) {
         expect(probe).toContain(guard);
         expect(flat(clearSQL)).toContain(guard);
      }
   });
});

describe('search-flag hygiene — the destructive half is auditable and fails loudly', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => { mm = new TestableManageMetadata(); });

   it('a probe that throws is NOT reported as a clean run', async () => {
      // This is the failure mode compare-first introduced. Before probing, SQLLogging appended the
      // statement to the CodeGen_Run capture BEFORE executing it, so a broken pass left a
      // surviving artifact and reddened the drift gate. Probing first removes that signal: the
      // throw happens before anything is written, so a swallowed probe error would look exactly
      // like "nothing to do" — no SQL, no artifact, every gate green, and search flags silently
      // never reconciled. The caller turns this false into a failed run.
      const ok = await mm.testApply(createFailingProbeConnection(), []);
      expect(ok).toBe(false);
      expect(mm.executedSql).toHaveLength(0);
   });

   it('a probe failure is distinguishable from having no work', async () => {
      const failed = await mm.testApply(createFailingProbeConnection(), []);
      const clean = await new TestableManageMetadata().testApply(createProbeConnection(0, []), []);
      expect(failed).toBe(false);
      expect(clean).toBe(true);
   });
});
