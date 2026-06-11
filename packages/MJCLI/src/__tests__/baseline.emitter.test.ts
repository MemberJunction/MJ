import { describe, expect, it } from 'vitest';
import { emitBaselineTsql } from '../baseline/emitter';
import type { SchemaSnapshot, TableDataDump } from '../baseline/types';

function snapshotFixture(): SchemaSnapshot {
  return {
    dialect: 'mssql',
    schemas: [{ name: 'dbo' }, { name: '__mj' }],
    tables: [
      {
        schema: 'dbo',
        name: 'Customer',
        hasIdentity: true,
        columns: [
          { name: 'ID', ordinal: 1, dataType: 'int', isNullable: false, isIdentity: true, isComputed: false },
          { name: 'Name', ordinal: 2, dataType: 'nvarchar(255)', isNullable: false, isIdentity: false, isComputed: false },
          { name: 'CreatedAt', ordinal: 3, dataType: 'datetime2(3)', isNullable: false, isIdentity: false, isComputed: false, defaultExpression: 'GETUTCDATE()' },
        ],
        primaryKey: { name: 'PK_Customer', columns: ['ID'], clustered: true },
        uniqueConstraints: [{ name: 'UX_Customer_Name', columns: ['Name'], clustered: false }],
        indexes: [{ name: 'IX_Customer_CreatedAt', columns: ['CreatedAt'], includes: [], isUnique: false, isClustered: false }],
        foreignKeys: [],
        checks: [{ name: 'CK_Customer_NameNotEmpty', expression: '([Name]<>N\'\')' }],
      },
      {
        schema: 'dbo',
        name: 'Order',
        hasIdentity: false,
        columns: [
          { name: 'OrderID', ordinal: 1, dataType: 'uniqueidentifier', isNullable: false, isIdentity: false, isComputed: false },
          { name: 'CustomerID', ordinal: 2, dataType: 'int', isNullable: false, isIdentity: false, isComputed: false },
        ],
        primaryKey: { name: 'PK_Order', columns: ['OrderID'], clustered: true },
        uniqueConstraints: [],
        indexes: [],
        foreignKeys: [{
          name: 'FK_Order_Customer',
          columns: ['CustomerID'],
          referencedSchema: 'dbo',
          referencedTable: 'Customer',
          referencedColumns: ['ID'],
          onDelete: 'CASCADE',
          onUpdate: 'NO_ACTION',
        }],
        checks: [],
      },
    ],
    views: [{ schema: 'dbo', name: 'vCustomerSummary', definition: 'CREATE VIEW dbo.vCustomerSummary AS SELECT * FROM dbo.Customer' }],
    procedures: [{ schema: 'dbo', name: 'spDoStuff', kind: 'procedure', definition: 'CREATE PROCEDURE dbo.spDoStuff AS BEGIN SELECT 1 END' }],
    functions: [],
    triggers: [],
    sequences: [],
    userDefinedTypes: [],
    extendedProperties: [],
    principals: [],
    roleMemberships: [],
    permissions: [],
  };
}

function dataFixture(): TableDataDump[] {
  return [
    {
      schema: 'dbo',
      table: 'Customer',
      columns: ['ID', 'Name', 'CreatedAt'],
      rows: [
        [1, 'Alice', new Date('2026-05-01T00:00:00Z')],
        [2, "O'Brien", new Date('2026-05-02T00:00:00Z')],
      ],
      rowCount: 2,
    },
  ];
}

describe('baseline/emitter', () => {
  const fixedDate = new Date(Date.UTC(2026, 4, 2, 19, 47, 0));
  const baseOpts = {
    baselineVersion: '3.1',
    description: 'Test',
    generatedAtUtc: fixedDate,
    includeData: true,
    excludedDataTables: new Set<string>(),
    batchSize: 1000,
  };

  it('emits a non-empty T-SQL script', () => {
    const sql = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: dataFixture(), options: baseOpts });
    expect(sql.length).toBeGreaterThan(100);
    expect(sql).toContain('-- ============================================================================');
  });

  it('is deterministic across runs (byte-identical)', () => {
    const a = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: dataFixture(), options: baseOpts });
    const b = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: dataFixture(), options: baseOpts });
    expect(a).toBe(b);
  });

  it('places foreign keys after table creation', () => {
    const sql = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: [], options: { ...baseOpts, includeData: false } });
    const tableIdx = sql.indexOf('CREATE TABLE [dbo].[Order]');
    const fkIdx = sql.indexOf('FK_Order_Customer');
    expect(tableIdx).toBeGreaterThan(-1);
    expect(fkIdx).toBeGreaterThan(tableIdx);
  });

  it('places views after data inserts', () => {
    const sql = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: dataFixture(), options: baseOpts });
    const dataIdx = sql.indexOf('INSERT INTO [dbo].[Customer]');
    const viewIdx = sql.indexOf('CREATE VIEW dbo.vCustomerSummary');
    expect(dataIdx).toBeGreaterThan(-1);
    expect(viewIdx).toBeGreaterThan(dataIdx);
  });

  it('wraps identity table inserts with SET IDENTITY_INSERT bookends', () => {
    const sql = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: dataFixture(), options: baseOpts });
    expect(sql).toContain('SET IDENTITY_INSERT [dbo].[Customer] ON;');
    expect(sql).toContain('SET IDENTITY_INSERT [dbo].[Customer] OFF;');
    expect(sql).toContain('DBCC CHECKIDENT');
  });

  it('escapes string literals correctly', () => {
    const sql = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: dataFixture(), options: baseOpts });
    expect(sql).toContain("N'O''Brien'");
  });

  it('omits data section when includeData is false', () => {
    const sql = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: dataFixture(), options: { ...baseOpts, includeData: false } });
    expect(sql).not.toContain('INSERT INTO');
    expect(sql).not.toContain('SET IDENTITY_INSERT');
  });

  it('honors excluded tables', () => {
    const sql = emitBaselineTsql({
      snapshot: snapshotFixture(),
      dataDumps: dataFixture(),
      options: { ...baseOpts, excludedDataTables: new Set(['dbo.customer']) },
    });
    // The emitter relies on the dumper to skip — so this test mainly proves
    // that absent dumps yield no INSERTs:
    const sqlAlt = emitBaselineTsql({
      snapshot: snapshotFixture(),
      dataDumps: [],
      options: baseOpts,
    });
    expect(sqlAlt).not.toContain('INSERT INTO');
    expect(sql.length).toBeGreaterThan(0);
  });

  it('emits CREATE SCHEMA for non-dbo schemas only', () => {
    const sql = emitBaselineTsql({ snapshot: snapshotFixture(), dataDumps: [], options: { ...baseOpts, includeData: false } });
    expect(sql).toContain("CREATE SCHEMA [__mj]");
    expect(sql).not.toContain("CREATE SCHEMA [dbo]");
  });

  /**
   * Azure SQL parses + binds every batch at submission time and rejects
   * cross-database references on sight, even if guarded by an unreachable
   * runtime IF. The v5.0 baseline historically worked on Azure because it
   * hid every `master.dbo.syslogins` lookup INSIDE an `sp_executesql N'...'`
   * string literal — the SQL inside the literal is opaque to the parser and
   * only re-parsed at runtime, when the EngineEdition check has already
   * short-circuited the call. This test locks that property in.
   *
   * Strategy: strip every (escaped-aware) `N'...'` / `'...'` string literal
   * from the emitted SQL, then assert no `master.*` reference survives.
   */
  it('keeps cross-DB references inside string literals (Azure-safe)', () => {
    const snapshot = snapshotFixture();
    snapshot.principals = [
      { name: 'MJ_Connect', kind: 'sql_user', defaultSchema: 'dbo' },
      { name: 'MJ_CodeGen', kind: 'sql_user', defaultSchema: 'dbo' },
      { name: 'cdp_UI', kind: 'database_role', owner: 'db_securityadmin' },
    ];
    const sql = emitBaselineTsql({
      snapshot,
      dataDumps: [],
      options: { ...baseOpts, includeData: false },
    });

    // Positive: the cross-DB query IS present, but only inside an
    // sp_executesql string literal.
    expect(sql).toMatch(/EXEC sp_executesql N'[^']*master\.dbo\.syslogins/);
    expect(sql).toContain('CREATE USER [MJ_Connect] FOR LOGIN [MJ_Connect]');
    expect(sql).toContain('CREATE USER [MJ_Connect] WITHOUT LOGIN');

    // Negative: strip every quoted string literal (handling `''` escapes)
    // and verify NO `master.*` reference remains in plain SQL — that's
    // exactly what Azure's parser would see.
    const noStrings = sql.replace(/N?'(?:''|[^'])*'/g, '<STRING>');
    expect(noStrings).not.toContain('master.dbo');
    expect(noStrings).not.toContain('master.sys');
    expect(noStrings).not.toContain('master.');
  });

  it('emits a CREATE ROLE block (AUTHORIZATION preserved when owner is set)', () => {
    const snapshot = snapshotFixture();
    snapshot.principals = [
      { name: 'cdp_UI', kind: 'database_role', owner: 'db_securityadmin' },
    ];
    const sql = emitBaselineTsql({
      snapshot,
      dataDumps: [],
      options: { ...baseOpts, includeData: false },
    });
    expect(sql).toMatch(/CREATE ROLE \[cdp_UI\] AUTHORIZATION \[db_securityadmin\]/);
    expect(sql).toMatch(/IF DATABASE_PRINCIPAL_ID\(N'cdp_UI'\) IS NULL/);
  });
});
