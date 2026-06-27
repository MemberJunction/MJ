import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { MJPostgresTranspiler } from '../MJPostgresTranspiler.js';

/**
 * Integration tests for MJPostgresTranspiler (one-shot mj_postgres.py invocation).
 * Require Python 3 with sqlglot installed; skipped (with a warning) otherwise.
 */

let pythonAvailable = false;
const pythonPath = process.env.MJ_SQLGLOT_PYTHON ?? 'python3';

beforeAll(() => {
  try {
    execSync(`${pythonPath} -c "import sqlglot"`, { stdio: 'pipe' });
    pythonAvailable = true;
  } catch {
    console.warn('Skipping MJPostgresTranspiler tests: Python/sqlglot not available');
  }
});

describe('MJPostgresTranspiler', () => {
  it('transpiles a CREATE TABLE with MJ type mappings', async () => {
    if (!pythonAvailable) return;
    const t = new MJPostgresTranspiler({ pythonPath });
    const result = await t.transpile(
      'CREATE TABLE [${flyway:defaultSchema}].[Widget] ([ID] UNIQUEIDENTIFIER NOT NULL, [Name] NVARCHAR(100) NOT NULL);',
    );
    expect(result.unhandled).toHaveLength(0);
    expect(result.sql.join('\n')).toContain('UUID');
    expect(result.sql.join('\n')).toContain('${flyway:defaultSchema}');
  }, 30000);

  it('reports unhandled statements instead of dropping them', async () => {
    if (!pythonAvailable) return;
    const t = new MJPostgresTranspiler({ pythonPath });
    const result = await t.transpile('DECLARE @x INT = 5;');
    expect(result.unhandled.length).toBeGreaterThan(0);
    expect(result.unhandled[0]).toHaveProperty('kind');
    expect(result.unhandled[0]).toHaveProperty('snippet');
  }, 30000);

  it('collects BIT columns for the cross-file registry', async () => {
    if (!pythonAvailable) return;
    const t = new MJPostgresTranspiler({ pythonPath });
    const cols = await t.collectBitColumns(
      'CREATE TABLE [${flyway:defaultSchema}].[U] ([IsActive] BIT NOT NULL DEFAULT ((1)));',
    );
    expect(cols.length).toBeGreaterThan(0);
  }, 30000);

  it('coerces seed INSERT 1/0 to TRUE/FALSE via extraBitColumns', async () => {
    if (!pythonAvailable) return;
    const reg = new MJPostgresTranspiler({ pythonPath });
    const cols = await reg.collectBitColumns(
      'CREATE TABLE [${flyway:defaultSchema}].[U] ([ID] INT NOT NULL, [IsActive] BIT NOT NULL);',
    );
    const t = new MJPostgresTranspiler({ pythonPath, extraBitColumns: cols });
    const result = await t.transpile("INSERT INTO [${flyway:defaultSchema}].[U] ([ID], [IsActive]) VALUES (1, 1);");
    expect(result.sql.join('\n')).toMatch(/TRUE/i);
  }, 30000);

  it('fails with actionable guidance for a missing interpreter', async () => {
    const t = new MJPostgresTranspiler({ pythonPath: '/nonexistent/python3' });
    await expect(t.transpile('SELECT 1;')).rejects.toThrow(/interpreter.*not found|MJ_SQLGLOT_PYTHON/);
  }, 10000);
});
