/**
 * Transitive bridge views for organic keys (#4409).
 *
 * An organic key's related entity can declare a `TransitiveView` in additionalSchemaInfo, and
 * CodeGen creates that bridge view before recording the key. The DDL used to be hardcoded as
 * `CREATE OR ALTER VIEW` — SQL Server syntax — so on PostgreSQL the statement failed and the
 * feature was unusable. The failure was quiet: `processOrganicKeyConfig` catches per key, logs,
 * and carries on, so CodeGen completed while the view and the key it backs were both missing.
 *
 * These tests pin the per-platform DDL, drive the real `processOrganicKeyConfig` against both
 * providers to pin what reaches the database and the migration log (the platform's own
 * create-or-replace form, alone in its batch — T-SQL requires a view to be both first and last in
 * its batch), and drive the real migration logger to pin the separators it writes around the view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../Misc/status_logging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../Misc/status_logging')>()),
  logError: vi.fn(),
  logStatus: vi.fn(),
  logWarning: vi.fn(),
}));

import { SQLDialect } from '@memberjunction/sql-dialect';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenDatabaseProvider, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLLogging } from '../Misc/sql_logging';
import { logError } from '../Misc/status_logging';

const BRIDGE_BODY =
  'SELECT p."recordKey" AS "ParentRecordKey", c."recordKey" AS "ChildRecordKey"\n' +
  'FROM hr."Employee" p JOIN hr."EmployeeAttribute" c ON c."employeeId" = p."id";';

describe('generateCreateOrReplaceViewSQL', () => {
  describe('PostgreSQL', () => {
    const provider = new PostgreSQLCodeGenProvider();
    const sql = provider.generateCreateOrReplaceViewSQL('hr', 'vwBridgeEmployeeAttribute', BRIDGE_BODY);

    it('emits CREATE OR REPLACE VIEW, never the SQL Server-only CREATE OR ALTER', () => {
      expect(sql).toContain('CREATE OR REPLACE VIEW "hr"."vwBridgeEmployeeAttribute"');
      expect(sql).not.toMatch(/CREATE OR ALTER/i);
    });

    it('embeds the body verbatim, minus its trailing terminator', () => {
      expect(sql).toContain('FROM hr."Employee" p JOIN hr."EmployeeAttribute" c ON c."employeeId" = p."id"$mj_view_sql$');
    });

    it('drops and recreates only on 42P16, and never cascades into dependents', () => {
      expect(sql).toMatch(/^DO \$mj_create_view\$/);
      expect(sql).toContain('EXCEPTION WHEN invalid_table_definition THEN');
      expect(sql).toContain('DROP VIEW "hr"."vwBridgeEmployeeAttribute";');
      expect(sql).not.toMatch(/CASCADE\s*;/);
      expect(sql).toMatch(/END \$mj_create_view\$$/);
    });

    it('is left untouched by the identifier auto-quoter, which skips dollar-quoted blocks', () => {
      expect(provider.quoteSQLForExecution(sql)).toBe(sql);
    });

    it('refuses a body containing either reserved dollar-quote tag rather than emitting broken SQL', () => {
      // PostgreSQL ends a dollar-quoted string at the first reoccurrence of its own tag, so the
      // outer tag inside the body would end the DO block early just as the inner one would.
      expect(() => provider.generateCreateOrReplaceViewSQL('hr', 'vwX', 'SELECT 1 AS "$mj_view_sql$"')).toThrow(/reserved dollar-quote tag \$mj_view_sql\$/);
      expect(() => provider.generateCreateOrReplaceViewSQL('hr', 'vwX', 'SELECT 1 AS "$mj_create_view$"')).toThrow(
        /reserved dollar-quote tag \$mj_create_view\$/,
      );
    });

    it('names the view in a NOTICE when the 42P16 fallback drops and recreates it (its grants are lost)', () => {
      const handler = sql.slice(sql.indexOf('EXCEPTION WHEN invalid_table_definition THEN'));
      expect(handler).toMatch(
        /RAISE NOTICE 'MJ CodeGen: recreated view % because its column list changed; grants on it were dropped[^']*', 'hr\.vwBridgeEmployeeAttribute';/,
      );
      expect(provider.generateCreateOrReplaceViewSQL("o'hr", 'vw', 'SELECT 1')).toContain("'o''hr.vw';");
    });
  });

  describe('SQL Server', () => {
    const provider = new SQLServerCodeGenProvider();

    it('emits CREATE OR ALTER VIEW as a single GO-free batch without the trailing terminator', () => {
      const sql = provider.generateCreateOrReplaceViewSQL('hr', 'vwBridge', 'SELECT 1 AS [One];  \n');
      expect(sql).toBe('CREATE OR ALTER VIEW [hr].[vwBridge]\nAS\nSELECT 1 AS [One]');
    });

    it('strips a mixed run of trailing terminators and whitespace, keeping everything before it', () => {
      const sql = provider.generateCreateOrReplaceViewSQL('hr', 'vwBridge', 'SELECT 1 AS [One] ;\n\t; \r\n');
      expect(sql.endsWith('SELECT 1 AS [One]')).toBe(true);
    });

    it('generates DDL for a body with a long interior whitespace run in linear time', () => {
      const body = `SELECT 1 AS [One]${' '.repeat(200_000)}FROM [hr].[T]`;
      const started = Date.now();
      const sql = provider.generateCreateOrReplaceViewSQL('hr', 'vwBridge', body);
      expect(Date.now() - started).toBeLessThan(500);
      expect(sql.endsWith(body)).toBe(true);
    });

    it('escapes a closing bracket in the schema and view names', () => {
      const sql = provider.generateCreateOrReplaceViewSQL('h]r', 'vw]Bridge', 'SELECT 1 AS [One]');
      expect(sql).toContain('CREATE OR ALTER VIEW [h]]r].[vw]]Bridge]');
    });
  });
});

describe('migration log — a view unit is alone in its batch', () => {
  let dir: string;
  let logFile: string;
  const ss = new SQLServerCodeGenProvider();
  const view = ss.generateCreateOrReplaceViewSQL('hr', 'vwBridge', 'SELECT 1 AS [One]');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sqllog-'));
    logFile = path.join(dir, 'CodeGen_Run_test.sql');
    fs.writeFileSync(logFile, '');
    SQLLogging.setFilePathForTesting(logFile);
  });

  afterEach(() => {
    SQLLogging.resetForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** The log split into batches the way sqlcmd/Flyway split it: on lines that are exactly `GO`. */
  function batches(): string[] {
    return fs
      .readFileSync(logFile, 'utf8')
      .split(/^GO$/m)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  }

  it('puts a GO BEFORE the view when the previous unit left its batch open (T-SQL Msg 111 otherwise)', async () => {
    await SQLLogging.appendToSQLLogFile("UPDATE [__mj].[Entity] SET TrackRecordChanges = 1 WHERE ID = 'x'", 'Update attributes on entity Foo');
    await SQLLogging.appendToSQLLogFile(view, 'Create transitive bridge view hr.vwBridge', false, true, 'GO', true);
    await SQLLogging.appendToSQLLogFile("INSERT INTO [__mj].[EntityOrganicKeyRelatedEntity] (ID) VALUES ('y')", 'Insert mapping');

    const [first, second, third] = batches();
    expect(first).toMatch(/^\/\* Update attributes on entity Foo \*\/\nUPDATE/);
    expect(second).toMatch(/^\/\* Create transitive bridge view hr\.vwBridge \*\/\nCREATE OR ALTER VIEW \[hr\]\.\[vwBridge\]/);
    expect(second).not.toMatch(/UPDATE|INSERT/);
    expect(third).toMatch(/INSERT INTO/);
  });

  it('adds no leading GO at the start of the log or right after a unit that already closed its batch', async () => {
    await SQLLogging.appendToSQLLogFile(view, 'first view', false, true, 'GO', true);
    await SQLLogging.appendToSQLLogFile(view, 'second view', false, true, 'GO', true);

    const text = fs.readFileSync(logFile, 'utf8');
    expect(text.startsWith('/* first view */')).toBe(true);
    expect(text).not.toMatch(/^GO\s*\n\s*GO$/m);
    expect(batches()).toHaveLength(2);
  });

  it('adds nothing around the view when the platform has no batch separator (PostgreSQL)', async () => {
    const pgView = new PostgreSQLCodeGenProvider().generateCreateOrReplaceViewSQL('hr', 'vwBridge', 'SELECT 1');
    await SQLLogging.appendToSQLLogFile('UPDATE __mj."Entity" SET "TrackRecordChanges" = true', 'update');
    await SQLLogging.appendToSQLLogFile(pgView, 'view', false, true, '', true);

    expect(fs.readFileSync(logFile, 'utf8')).not.toMatch(/^GO$/m);
  });

  it('logs a view whose body has a long interior whitespace run in linear time, end to end', async () => {
    const body = `SELECT 1 AS [One]${' '.repeat(200_000)}FROM [hr].[T]`;
    const started = Date.now();
    await SQLLogging.appendToSQLLogFile(ss.generateCreateOrReplaceViewSQL('hr', 'vwBridge', body), 'big view', false, true, 'GO', true);
    expect(Date.now() - started).toBeLessThan(500);
    expect(fs.readFileSync(logFile, 'utf8')).toContain(`${body};`);
  });
});

/**
 * Drives the real `processOrganicKeyConfig` with a real provider, a canned connection and the
 * migration logger stubbed. `SQLLogging.LogSQLAndExecute` receives exactly what is executed and
 * written to the migration file, so it is the one observation point that matters.
 */
class TestableOrganicKeys extends ManageMetadataBase {
  constructor(private readonly testProvider: CodeGenDatabaseProvider) {
    super();
  }

  protected get dbProvider(): CodeGenDatabaseProvider {
    return this.testProvider;
  }

  public Run(pool: CodeGenConnection): Promise<{ success: boolean; createdCount: number; updatedCount: number; failedCount: number }> {
    return this.processOrganicKeyConfig(pool);
  }
}

/** Answers the lookups the method makes: entities resolve, the key already exists, the mapping is new. */
function createConnection(dialect: SQLDialect): CodeGenConnection {
  const answer = async (sql: string): Promise<CodeGenQueryResult> => {
    if (sql.includes('vwEntities')) return { recordset: [{ ID: 'entity-id', Name: 'Employees' }] };
    if (sql.includes('EntityOrganicKeyRelatedEntity')) return { recordset: [] };
    if (sql.includes('EntityOrganicKey')) return { recordset: [{ ID: 'organic-key-id' }] };
    return { recordset: [] };
  };
  return {
    Dialect: dialect,
    query: answer,
    queryWithParams: answer,
    executeStoredProcedure: async () => ({ recordset: [] }),
    beginTransaction: async () => {
      throw new Error('processOrganicKeyConfig does not use transactions');
    },
  };
}

const organicKeyConfig = {
  hr: [
    {
      TableName: 'Employee',
      OrganicKeys: [
        {
          Name: 'Employee Attribute Link',
          MatchFieldNames: ['recordKey'],
          NormalizationStrategy: 'Trim',
          RelatedEntities: [
            {
              SchemaName: 'hr',
              TableName: 'EmployeeAttribute',
              TransitiveView: { Name: 'vwBridgeEmployeeAttribute', SQL: BRIDGE_BODY },
              TransitiveMatchFieldNames: ['ParentRecordKey'],
              TransitiveOutputFieldName: 'ChildRecordKey',
              RelatedEntityJoinFieldName: 'recordKey',
            },
          ],
        },
      ],
    },
  ],
};

type LoggedCall = Parameters<typeof SQLLogging.LogSQLAndExecute>;

describe('processOrganicKeyConfig — transitive bridge view DDL', () => {
  let logged: LoggedCall[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(ManageMetadataBase, 'getSoftPKFKConfig').mockReturnValue(organicKeyConfig);
    vi.spyOn(SQLLogging, 'LogSQLAndExecute').mockImplementation(async (...args: LoggedCall) => {
      logged.push(args);
      return [];
    });
    vi.mocked(logError).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runWith(provider: CodeGenDatabaseProvider): Promise<LoggedCall> {
    const result = await new TestableOrganicKeys(provider).Run(createConnection(provider.Dialect));
    expect(result.success).toBe(true);
    // A swallowed per-key failure is exactly how the original defect hid.
    expect(logError).not.toHaveBeenCalled();
    const viewCall = logged.find(([, query]) => /CREATE OR (REPLACE|ALTER) VIEW/.test(query));
    expect(viewCall).toBeDefined();
    return viewCall!;
  }

  it('creates the view with PostgreSQL DDL on PostgreSQL, with no batch separator', async () => {
    const provider = new PostgreSQLCodeGenProvider();
    const [, query, , isRecurringScript, includeBatchSeparator, batchSeparator, requiresOwnBatch] = await runWith(provider);

    expect(query).toBe(provider.generateCreateOrReplaceViewSQL('hr', 'vwBridgeEmployeeAttribute', BRIDGE_BODY));
    expect(query).not.toMatch(/CREATE OR ALTER/i);
    expect(isRecurringScript).toBe(false);
    expect(includeBatchSeparator).toBe(true);
    expect(requiresOwnBatch).toBe(true);
    expect(batchSeparator).toBe('');
  });

  it('logs the view with CREATE OR ALTER on SQL Server, alone in its GO-delimited batch', async () => {
    const provider = new SQLServerCodeGenProvider();
    const [, query, , , includeBatchSeparator, batchSeparator, requiresOwnBatch] = await runWith(provider);

    expect(query).toMatch(/^CREATE OR ALTER VIEW \[hr\]\.\[vwBridgeEmployeeAttribute\]/);
    expect(includeBatchSeparator).toBe(true);
    expect(requiresOwnBatch).toBe(true);
    expect(batchSeparator).toBe('GO');
  });

  it('reports failure — not success — when a key fails, and still processes the other keys', async () => {
    const badView = { Name: 'vwBad', SQL: 'SELECT 1 AS "$mj_create_view$"' };
    const twoKeys = {
      hr: [
        {
          TableName: 'Employee',
          OrganicKeys: [
            {
              ...organicKeyConfig.hr[0].OrganicKeys[0],
              Name: 'Broken Link',
              RelatedEntities: [{ ...organicKeyConfig.hr[0].OrganicKeys[0].RelatedEntities[0], TransitiveView: badView }],
            },
            organicKeyConfig.hr[0].OrganicKeys[0],
          ],
        },
      ],
    };
    vi.mocked(ManageMetadataBase.getSoftPKFKConfig).mockReturnValue(twoKeys);
    const provider = new PostgreSQLCodeGenProvider();

    const result = await new TestableOrganicKeys(provider).Run(createConnection(provider.Dialect));

    expect(result).toMatchObject({ success: false, failedCount: 1 });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to process "Broken Link"'));
    expect(logged.some(([, query]) => query.includes('"hr"."vwBridgeEmployeeAttribute"'))).toBe(true);
  });

  it('creates the view before recording the key, and records the view as the transitive object', async () => {
    await runWith(new PostgreSQLCodeGenProvider());
    const queries = logged.map(([, query]) => query);

    const viewIndex = queries.findIndex((q) => q.includes('CREATE OR REPLACE VIEW'));
    const mappingIndex = queries.findIndex((q) => q.includes('EntityOrganicKeyRelatedEntity'));
    expect(viewIndex).toBe(0);
    expect(mappingIndex).toBeGreaterThan(viewIndex);
    expect(queries[mappingIndex]).toContain("'hr.vwBridgeEmployeeAttribute'");
  });
});
