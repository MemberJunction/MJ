/**
 * Unit tests for the PostgreSQL portability of the IS-A (Table-Per-Type) CodeGen path.
 *
 * Both defects these cover were PostgreSQL-only, and both were SILENT: the surrounding code
 * catches per-relationship / per-entity errors and logs them, so CodeGen ran to completion with a
 * zero exit code while the IS-A wiring did nothing at all. The observable end state was an entity
 * that registered and queried normally but had Entity.ParentID NULL, no mirrored parent fields, no
 * parent JOIN in its base view, and a Save() that never wrote the parent row.
 *
 *   1. buildISAEntityLookupSQL — the entity lookup must not emit a parameter whose only
 *      unambiguous use is `@p IS NULL`. PostgreSQL cannot infer a type for it and fails to prepare
 *      the statement ("could not determine data type of parameter $n"); SQL Server infers it from
 *      the other side of the OR, which is why this survived.
 *
 *   2. manageSingleEntityParentFields — every __mj.EntityField identifier must be quoted. The
 *      columns are mixed-case; an unquoted reference folds to lower case on PostgreSQL
 *      (`column "length" does not exist`) while SQL Server resolves it case-insensitively.
 *
 * The SQL is composed through REAL dialects (both of them), so these assert what actually reaches
 * the database rather than a restatement of the implementation.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: {},
   currentWorkingDirectory: '/tmp',
   getSettingValue: vi.fn(),
   mj_core_schema: () => '__mj',
   dbPlatform: () => 'postgresql',
   outputDir: '/tmp',
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
   return { ...actual };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(),
   logMessage: vi.fn(),
   logStatus: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('@memberjunction/global', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/global')>();
   return { ...actual };
});
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase } from '../Database/manage-metadata';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';

class TestableISALookup extends ManageMetadataBase {
   constructor(private readonly _dialect: SQLDialect) { super(); }
   protected get dialect(): SQLDialect { return this._dialect; }

   public build(selectBody: string, nameParam: string, schemaName?: string) {
      return this.buildISAEntityLookupSQL('__mj', selectBody, nameParam, schemaName);
   }
}

const pg = () => new TestableISALookup(new PostgreSQLDialect());
const ss = () => new TestableISALookup(new SQLServerDialect());

describe('buildISAEntityLookupSQL — parameter typing (PostgreSQL-fatal when wrong)', () => {
   it('never emits a bare "@param IS NULL" test, which PostgreSQL cannot type', () => {
      for (const builder of [pg(), ss()]) {
         for (const schema of ['crm', undefined]) {
            const { sql } = builder.build('ID, Name', 'ParentName', schema);
            expect(sql).not.toMatch(/@\w+\s+IS\s+NULL/i);
         }
      }
   });

   it('omits the schema predicate AND its parameter when no schema is declared', () => {
      const { sql, params } = pg().build('ID, Name', 'ParentName', undefined);
      expect(sql).not.toContain('SchemaName');
      expect(params).toEqual({});
   });

   it('emits the schema predicate and binds it when a schema IS declared', () => {
      const { sql, params } = pg().build('ID, Name', 'ParentName', 'crm');
      expect(sql).toContain('AND SchemaName = @ISASchemaName');
      expect(params).toEqual({ ISASchemaName: 'crm' });
   });

   it('still matches on Name first, then BaseTable — the lookup contract is unchanged', () => {
      const { sql } = pg().build('ID, Name, ParentID', 'ChildName', 'crm');
      expect(sql).toContain('WHERE Name = @ChildName');
      expect(sql).toContain('OR (BaseTable = @ChildName');
      expect(sql).toContain('CASE WHEN Name = @ChildName THEN 0 ELSE 1 END');
   });

   it('honours each dialect row limit (TOP vs LIMIT)', () => {
      expect(ss().build('ID, Name', 'ParentName', 'crm').sql).toMatch(/SELECT\s+TOP\s+1/i);
      expect(pg().build('ID, Name', 'ParentName', 'crm').sql).toMatch(/LIMIT\s+1/i);
   });

   it('every parameter placeholder in the SQL is bound', () => {
      for (const schema of ['crm', undefined]) {
         const { sql, params } = pg().build('ID, Name', 'ParentName', schema);
         const placeholders = new Set([...sql.matchAll(/@(\w+)/g)].map((m) => m[1]));
         const bound = new Set([...Object.keys(params), 'ParentName']);
         for (const p of placeholders) expect(bound.has(p)).toBe(true);
      }
   });
});

describe('EntityField identifier quoting in the IS-A parent-field sync', () => {
   // The columns manageSingleEntityParentFields reads and writes. Each is mixed-case in __mj, so
   // each must arrive quoted or PostgreSQL folds it to lower case and the statement throws.
   const COLUMNS = ['ID', 'IsVirtual', 'Type', 'Length', 'Precision', 'Scale', 'AllowsNull', 'AllowUpdateAPI', 'EntityID', 'Name'];

   it('PostgreSQL quotes every mixed-case EntityField column', () => {
      const dialect = new PostgreSQLDialect();
      for (const col of COLUMNS) {
         expect(dialect.QuoteIdentifier(col)).toBe(`"${col}"`);
      }
   });

   it('the quoted form preserves case, which is the whole point', () => {
      const dialect = new PostgreSQLDialect();
      expect(dialect.QuoteIdentifier('Length')).not.toBe('length');
      expect(dialect.QuoteIdentifier('Length')).toContain('Length');
   });
});
