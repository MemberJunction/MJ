/**
 * #3384 wiring: the include-schema resolution and the CRUD-validator baseline, which were only
 * covered through their helpers, are tested at the seams the run calls.
 *   - ResolveIncludeSchemaScope reports an unmatched entry as false (the run's ManageMetadata step
 *     starts from that value), applies the scope anyway, and returns null when it cannot resolve.
 *   - CRUDValidationBaseline expects routines only for in-scope entities with IncludeInAPI set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
   config: { includeSchemas: [] as string[], excludeSchemas: [] as string[] },
}));

vi.mock('@memberjunction/server-bootstrap-lite/mj-class-registrations', () => ({}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));
vi.mock('mssql', () => ({}));
vi.mock('../Config/config', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../Config/config')>();
   return { ...actual, configInfo: state.config };
});

import { ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { RunCodeGenBase } from '../runCodeGen';

class ScopeMM extends ManageMetadataBase {
   public Schemas: string[] = [];
   public Fail = false;
   protected async runQuery(_pool: CodeGenConnection, _sql: string): Promise<CodeGenQueryResult> {
      if (this.Fail) throw new Error('connection lost');
      return { recordset: this.Schemas.map(SchemaName => ({ SchemaName })) } as CodeGenQueryResult;
   }
}

beforeEach(() => {
   state.config.includeSchemas = [];
   state.config.excludeSchemas = [];
});

describe('ResolveIncludeSchemaScope', () => {
   const pool = {} as CodeGenConnection;

   it('is true with no includeSchemas, and queries nothing', async () => {
      const mm = new ScopeMM();
      mm.Fail = true;
      expect(await mm.ResolveIncludeSchemaScope(pool)).toBe(true);
   });

   it('is true when every entry matches a database schema', async () => {
      state.config.includeSchemas = ['app'];
      const mm = new ScopeMM();
      mm.Schemas = ['app', 'other'];
      expect(await mm.ResolveIncludeSchemaScope(pool)).toBe(true);
      expect(state.config.excludeSchemas).toEqual(['other']);
   });

   it('is false when an entry matches no schema, and still applies the scope', async () => {
      state.config.includeSchemas = ['app', 'app_typo'];
      const mm = new ScopeMM();
      mm.Schemas = ['app', 'other'];
      expect(await mm.ResolveIncludeSchemaScope(pool)).toBe(false);
      expect(state.config.excludeSchemas).toEqual(['other']);
   });

   it('is null when the schema list cannot be read', async () => {
      state.config.includeSchemas = ['app'];
      const mm = new ScopeMM();
      mm.Fail = true;
      expect(await mm.ResolveIncludeSchemaScope(pool)).toBeNull();
   });
});

describe('RunCodeGenBase.CRUDValidationBaseline', () => {
   const e = (Name: string, SchemaName: string, IncludeInAPI = true) => ({ Name, SchemaName, IncludeInAPI });

   it('keeps in-scope IncludeInAPI entities only', () => {
      const entities = [e('Orders', 'app'), e('Users', '__mj'), e('Hidden', 'app', false)];
      expect(RunCodeGenBase.CRUDValidationBaseline(entities, ['__MJ']).map(x => x.Name)).toEqual(['Orders']);
   });

   it('treats a missing exclude list as nothing excluded', () => {
      expect(RunCodeGenBase.CRUDValidationBaseline([e('Users', '__mj')], undefined).map(x => x.Name)).toEqual(['Users']);
   });
});
