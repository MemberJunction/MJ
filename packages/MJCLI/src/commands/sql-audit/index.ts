import { Command, Flags } from '@oclif/core';
import type { IDatabaseAuditor, DatabaseInventory } from '@memberjunction/sql-converter';

/**
 * CLI command for auditing and comparing SQL databases.
 * Connects to source and target databases, compares object inventories
 * and row counts, and generates a detailed audit report.
 *
 * Usage:
 *   mj sql-audit --source "mssql://..." --target "postgres://..."
 *   mj sql-audit --source "mssql://..." --target "postgres://..." --output report.txt
 */
export default class SqlAudit extends Command {
  static description = 'Compare source and target databases for migration verification';

  static examples = [
    '<%= config.bin %> sql-audit --source "mssql://sa:pass@host/db" --target "postgres://user:pass@host:5432/db"',
    '<%= config.bin %> sql-audit --source "mssql://sa:pass@host/db" --target "postgres://user:pass@host:5432/db" --output report.txt',
    '<%= config.bin %> sql-audit --source "mssql://sa:pass@host/db" --target "postgres://user:pass@host:5432/db" --source-schema __mj --target-schema __mj',
  ];

  static flags = {
    source: Flags.string({
      description: 'Source database connection string (mssql://... or postgres://...)',
      required: true,
    }),
    target: Flags.string({
      description: 'Target database connection string (mssql://... or postgres://...)',
      required: true,
    }),
    'source-schema': Flags.string({
      description: 'Source schema name',
      default: '__mj',
    }),
    'target-schema': Flags.string({
      description: 'Target schema name',
      default: '__mj',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Save report to file',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SqlAudit);

    // Lazy-load
    const { DatabaseAuditRunner } = await import('@memberjunction/sql-converter');
    const runner = new DatabaseAuditRunner();

    this.log('SQL Database Audit');
    this.log(`  Source: ${this.maskConnectionString(flags.source)}`);
    this.log(`  Target: ${this.maskConnectionString(flags.target)}`);
    this.log(`  Source schema: ${flags['source-schema']}`);
    this.log(`  Target schema: ${flags['target-schema']}`);
    this.log('');

    // Create database auditors based on connection string protocol
    const sourceAuditor = await this.createAuditor(flags.source);
    const targetAuditor = await this.createAuditor(flags.target);

    try {
      const report = await runner.RunAudit(
        sourceAuditor,
        targetAuditor,
        flags['source-schema'],
        flags['target-schema']
      );

      const formatted = runner.FormatReport(report);
      this.log(formatted);

      if (flags.output) {
        const fs = await import('node:fs');
        fs.writeFileSync(flags.output, formatted, 'utf-8');
        this.log(`\nReport saved to: ${flags.output}`);
      }

      // Summary verdict
      const totalIssues = report.missing.length + report.rowCountMismatches.length;
      if (totalIssues === 0) {
        this.log('\nAudit PASSED — databases match.');
      } else {
        this.log(`\nAudit found ${totalIssues} issue(s).`);
      }
    } finally {
      await sourceAuditor.Close();
      await targetAuditor.Close();
    }
  }

  private maskConnectionString(connStr: string): string {
    // Mask password in connection string for display
    return connStr.replace(/:([^:@]+)@/, ':***@');
  }

  private async createAuditor(connectionString: string): Promise<IDatabaseAuditor> {
    const protocol = connectionString.split('://')[0]?.toLowerCase();

    if (protocol === 'postgres' || protocol === 'postgresql') {
      return new PostgresAuditor(connectionString);
    }
    if (protocol === 'mssql') {
      return new MSSQLAuditor(connectionString);
    }

    throw new Error(`Unsupported database protocol: ${protocol}. Use 'postgres://' or 'mssql://'`);
  }
}

/** Query result row shape used by pg driver */
interface PgQueryResult {
  rows: Record<string, string>[];
}

/** Pool-like interface for pg */
interface PgPool {
  query(sql: string, params?: string[]): Promise<PgQueryResult>;
  end(): Promise<void>;
}

/**
 * PostgreSQL database auditor using pg module.
 * Lazy-loaded to avoid requiring pg as a hard dependency.
 */
class PostgresAuditor implements IDatabaseAuditor {
  private pool: PgPool | null = null;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private async getPool(): Promise<PgPool> {
    if (!this.pool) {
      const pg = await import('pg');
      this.pool = new pg.default.Pool({ connectionString: this.connectionString }) as unknown as PgPool;
    }
    return this.pool;
  }

  async GetInventory(schema?: string): Promise<DatabaseInventory> {
    const pool = await this.getPool();
    const s = schema ?? 'public';

    const [tables, views, functions, triggers, indexes] = await Promise.all([
      pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`, [s]),
      pool.query(`SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name`, [s]),
      pool.query(`SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 ORDER BY routine_name`, [s]),
      pool.query(`SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = $1 ORDER BY trigger_name`, [s]),
      pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = $1 ORDER BY indexname`, [s]),
    ]);

    return {
      tables: tables.rows.map((r) => r.table_name),
      views: views.rows.map((r) => r.table_name),
      functions: functions.rows.map((r) => r.routine_name),
      triggers: triggers.rows.map((r) => r.trigger_name),
      indexes: indexes.rows.map((r) => r.indexname),
    };
  }

  async GetRowCounts(schema?: string): Promise<Map<string, number>> {
    const pool = await this.getPool();
    const s = schema ?? 'public';
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [s]
    );

    const counts = new Map<string, number>();
    for (const row of result.rows) {
      const tableName = row.table_name;
      const countResult = await pool.query(`SELECT COUNT(*) as cnt FROM "${s}"."${tableName}"`);
      counts.set(tableName, parseInt(countResult.rows[0].cnt, 10));
    }
    return counts;
  }

  async Close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

/** Query result shape used by mssql driver */
interface MSSQLQueryResult {
  recordset: Record<string, unknown>[];
}

/** Pool-like interface for mssql */
interface MSSQLPool {
  query(sql: string): Promise<MSSQLQueryResult>;
  close(): Promise<void>;
}

/**
 * SQL Server database auditor.
 * Uses information_schema queries compatible with mssql module.
 */
class MSSQLAuditor implements IDatabaseAuditor {
  private connectionString: string;
  private pool: MSSQLPool | null = null;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private async getPool(): Promise<MSSQLPool> {
    if (!this.pool) {
      const mssql = await import('mssql');
      this.pool = await mssql.default.connect(this.connectionString) as unknown as MSSQLPool;
    }
    return this.pool;
  }

  async GetInventory(schema?: string): Promise<DatabaseInventory> {
    const pool = await this.getPool();
    const s = schema ?? 'dbo';

    const [tables, views, functions, triggers, indexes] = await Promise.all([
      pool.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${s}' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`),
      pool.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = '${s}' ORDER BY TABLE_NAME`),
      pool.query(`SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = '${s}' ORDER BY ROUTINE_NAME`),
      pool.query(`SELECT name AS TRIGGER_NAME FROM sys.triggers WHERE parent_id IN (SELECT object_id FROM sys.tables WHERE schema_id = SCHEMA_ID('${s}')) ORDER BY name`),
      pool.query(`SELECT i.name AS INDEX_NAME FROM sys.indexes i JOIN sys.tables t ON i.object_id = t.object_id WHERE t.schema_id = SCHEMA_ID('${s}') AND i.name IS NOT NULL ORDER BY i.name`),
    ]);

    return {
      tables: tables.recordset.map((r) => r.TABLE_NAME as string),
      views: views.recordset.map((r) => r.TABLE_NAME as string),
      functions: functions.recordset.map((r) => r.ROUTINE_NAME as string),
      triggers: triggers.recordset.map((r) => r.TRIGGER_NAME as string),
      indexes: indexes.recordset.map((r) => r.INDEX_NAME as string),
    };
  }

  async GetRowCounts(schema?: string): Promise<Map<string, number>> {
    const pool = await this.getPool();
    const s = schema ?? 'dbo';
    const result = await pool.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${s}' AND TABLE_TYPE = 'BASE TABLE'`
    );

    const counts = new Map<string, number>();
    for (const row of result.recordset) {
      const tableName = row.TABLE_NAME as string;
      const countResult = await pool.query(`SELECT COUNT(*) AS cnt FROM [${s}].[${tableName}]`);
      counts.set(tableName, countResult.recordset[0].cnt as number);
    }
    return counts;
  }

  async Close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
