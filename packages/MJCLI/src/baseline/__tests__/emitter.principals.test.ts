import { describe, it, expect } from 'vitest';
import { emitBaselineTsql, EmitInput } from '../emitter';
import type { DatabasePrincipalDef, SchemaSnapshot, BaselineEmitOptions } from '../types';

/** Emit a baseline containing only the given principals (everything else empty). */
function emitWith(principals: DatabasePrincipalDef[]): string {
  const snapshot: SchemaSnapshot = {
    dialect: 'mssql',
    schemas: [], tables: [], views: [], procedures: [], functions: [],
    triggers: [], sequences: [], userDefinedTypes: [], extendedProperties: [],
    principals, roleMemberships: [], permissions: [],
  };
  const options: BaselineEmitOptions = {
    baselineVersion: '5.99',
    description: 'test',
    generatedAtUtc: new Date('2026-01-01T00:00:00Z'),
    includeData: false,
    excludedDataTables: new Set<string>(),
    batchSize: 100,
  };
  const input: EmitInput = { snapshot, dataDumps: [], options };
  return emitBaselineTsql(input);
}

const sqlUser = (name: string): DatabasePrincipalDef => ({ name, kind: 'sql_user' });

describe('emitPrincipals — Azure SQL login probe', () => {
  it('defers the cross-database login probe into sp_executesql', () => {
    const sql = emitWith([sqlUser('MJ_CodeGen')]);
    expect(sql).toContain('EXEC sp_executesql');
    // The probe is parameterized (@n) inside the dynamic statement...
    expect(sql).toContain('WHERE name = @n');
    // ...and its result flows back through the OUTPUT parameter into @login_exists_*.
    expect(sql).toContain('@e = @login_exists_MJ_CodeGen OUTPUT');
    expect(sql).toContain("@n = N'MJ_CodeGen'");
  });

  it('never emits a STATIC master.sys.* reference in the batch (the Azure compile-time failure)', () => {
    const sql = emitWith([sqlUser('MJ_CodeGen')]);
    // The old broken form referenced the cross-db catalog with a literal name directly in the
    // batch, which Azure SQL fails to compile up front. That exact form must be gone.
    expect(sql).not.toContain("ELSE IF EXISTS (SELECT 1 FROM master.sys.server_principals");
    expect(sql).not.toMatch(/master\.sys\.server_principals WHERE name = N'/);
    // Every surviving reference to the cross-db catalog must live inside the sp_executesql
    // string literal (i.e. immediately after `N'IF EXISTS (SELECT 1 FROM `).
    const refs = sql.match(/master\.sys\.server_principals/g) ?? [];
    expect(refs.length).toBe(1);
    expect(sql).toContain("N'IF EXISTS (SELECT 1 FROM master.sys.server_principals WHERE name = @n) SET @e = 1'");
  });

  it('keeps the runtime EngineEdition guard and both user-creation branches', () => {
    const sql = emitWith([sqlUser('MJ_CodeGen')]);
    expect(sql).toContain("IF SERVERPROPERTY('EngineEdition') = 5");
    expect(sql).toContain('CREATE USER [MJ_CodeGen] FOR LOGIN [MJ_CodeGen]');
    expect(sql).toContain('CREATE USER [MJ_CodeGen] WITHOUT LOGIN');
    expect(sql).toContain('DATABASE_PRINCIPAL_ID');
  });

  it('emits an independent, correctly-named probe for each of the four MJ service logins', () => {
    const names = ['MJ_CodeGen', 'MJ_CodeGen_Dev', 'MJ_Connect', 'MJ_Connect_Dev'];
    const sql = emitWith(names.map(sqlUser));
    for (const n of names) {
      expect(sql).toContain(`@n = N'${n}', @e = @login_exists_${n} OUTPUT`);
    }
    // One sp_executesql probe per user, none left as static batch SQL.
    expect((sql.match(/EXEC sp_executesql/g) ?? []).length).toBe(names.length);
    expect((sql.match(/master\.sys\.server_principals/g) ?? []).length).toBe(names.length);
  });
});
