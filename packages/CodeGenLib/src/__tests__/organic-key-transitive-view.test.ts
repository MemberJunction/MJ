/**
 * Transitive bridge views for organic keys (#4409).
 *
 * An organic key's related entity can declare a `TransitiveView` in additionalSchemaInfo, and
 * CodeGen creates that bridge view before recording the key. The DDL used to be hardcoded as
 * `CREATE OR ALTER VIEW` — SQL Server syntax — so on PostgreSQL the statement failed and the
 * feature was unusable. The failure was quiet: `processOrganicKeyConfig` catches per key, logs,
 * and carries on, so CodeGen completed while the view and the key it backs were both missing.
 *
 * These tests pin the per-platform DDL, and drive the real `processOrganicKeyConfig` against both
 * providers to pin what reaches the database and the migration log: the platform's own
 * create-or-replace form, followed by the platform's batch separator (a view must be alone in its
 * SQL Server batch, so a missing `GO` breaks replay of the logged migration).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  'FROM acgi."Employee" p JOIN acgi."EmployeeAttribute" c ON c."employeeId" = p."id";';

describe('generateCreateOrReplaceViewSQL', () => {
  describe('PostgreSQL', () => {
    const provider = new PostgreSQLCodeGenProvider();
    const sql = provider.generateCreateOrReplaceViewSQL('acgi', 'vwBridgeEmployeeAttribute', BRIDGE_BODY);

    it('emits CREATE OR REPLACE VIEW, never the SQL Server-only CREATE OR ALTER', () => {
      expect(sql).toContain('CREATE OR REPLACE VIEW "acgi"."vwBridgeEmployeeAttribute"');
      expect(sql).not.toMatch(/CREATE OR ALTER/i);
    });

    it('embeds the body verbatim, minus its trailing terminator', () => {
      expect(sql).toContain('FROM acgi."Employee" p JOIN acgi."EmployeeAttribute" c ON c."employeeId" = p."id"$mj_view_sql$');
    });

    it('drops and recreates only on 42P16, and never cascades into dependents', () => {
      expect(sql).toMatch(/^DO \$mj_create_view\$/);
      expect(sql).toContain('EXCEPTION WHEN invalid_table_definition THEN');
      expect(sql).toContain('DROP VIEW "acgi"."vwBridgeEmployeeAttribute";');
      expect(sql).not.toMatch(/CASCADE\s*;/);
      expect(sql).toMatch(/END \$mj_create_view\$$/);
    });

    it('is left untouched by the identifier auto-quoter, which skips dollar-quoted blocks', () => {
      expect(provider.quoteSQLForExecution(sql)).toBe(sql);
    });

    it('refuses a body containing its reserved dollar-quote tag rather than emitting broken SQL', () => {
      expect(() => provider.generateCreateOrReplaceViewSQL('acgi', 'vwX', 'SELECT 1 AS "$mj_view_sql$"')).toThrow(/reserved dollar-quote tag/);
    });
  });

  describe('SQL Server', () => {
    const provider = new SQLServerCodeGenProvider();

    it('emits CREATE OR ALTER VIEW as a single GO-free batch without the trailing terminator', () => {
      const sql = provider.generateCreateOrReplaceViewSQL('acgi', 'vwBridge', 'SELECT 1 AS [One];  \n');
      expect(sql).toBe('CREATE OR ALTER VIEW [acgi].[vwBridge]\nAS\nSELECT 1 AS [One]');
    });

    it('escapes a closing bracket in the schema and view names', () => {
      const sql = provider.generateCreateOrReplaceViewSQL('ac]gi', 'vw]Bridge', 'SELECT 1 AS [One]');
      expect(sql).toContain('CREATE OR ALTER VIEW [ac]]gi].[vw]]Bridge]');
    });
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

  public Run(pool: CodeGenConnection): Promise<{ success: boolean; createdCount: number; updatedCount: number }> {
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
  acgi: [
    {
      TableName: 'Employee',
      OrganicKeys: [
        {
          Name: 'Employee Attribute Link',
          MatchFieldNames: ['recordKey'],
          NormalizationStrategy: 'Trim',
          RelatedEntities: [
            {
              SchemaName: 'acgi',
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

  it('creates the view with PostgreSQL DDL on PostgreSQL, with no batch separator appended', async () => {
    const provider = new PostgreSQLCodeGenProvider();
    const [, query, , isRecurringScript, includeBatchSeparator, batchSeparator] = await runWith(provider);

    expect(query).toBe(provider.generateCreateOrReplaceViewSQL('acgi', 'vwBridgeEmployeeAttribute', BRIDGE_BODY));
    expect(query).not.toMatch(/CREATE OR ALTER/i);
    expect(isRecurringScript).toBe(false);
    expect(includeBatchSeparator).toBe(true);
    expect(batchSeparator).toBe('');
  });

  it('creates the view with CREATE OR ALTER on SQL Server, followed by GO in the migration', async () => {
    const provider = new SQLServerCodeGenProvider();
    const [, query, , , includeBatchSeparator, batchSeparator] = await runWith(provider);

    expect(query).toMatch(/^CREATE OR ALTER VIEW \[acgi\]\.\[vwBridgeEmployeeAttribute\]/);
    expect(includeBatchSeparator).toBe(true);
    expect(batchSeparator).toBe('GO');
  });

  it('creates the view before recording the key, and records the view as the transitive object', async () => {
    await runWith(new PostgreSQLCodeGenProvider());
    const queries = logged.map(([, query]) => query);

    const viewIndex = queries.findIndex((q) => q.includes('CREATE OR REPLACE VIEW'));
    const mappingIndex = queries.findIndex((q) => q.includes('EntityOrganicKeyRelatedEntity'));
    expect(viewIndex).toBe(0);
    expect(mappingIndex).toBeGreaterThan(viewIndex);
    expect(queries[mappingIndex]).toContain("'acgi.vwBridgeEmployeeAttribute'");
  });
});
