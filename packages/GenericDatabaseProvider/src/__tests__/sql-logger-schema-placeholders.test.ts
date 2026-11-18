/**
 * #3618: `formatAsMigration` could emit only `${flyway:defaultSchema}`. In an Open App, Skyway binds
 * that placeholder to the app schema and `${mjSchema}` to core, so captured core calls pointed at
 * the app schema. `SqlLoggingOptions.schemaPlaceholders` supplies per-schema rules instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SqlLoggingSessionImpl } from '../SqlLogger';
import type { SqlLoggingOptions, SqlSchemaPlaceholder } from '../types';

const APP_SCHEMA = '__mj_BizAppsAccounting';
const CORE_SCHEMA = '__mj';
const OPEN_APP_RULES: SqlSchemaPlaceholder[] = [
  { schema: APP_SCHEMA, placeholder: '${flyway:defaultSchema}' },
  { schema: CORE_SCHEMA, placeholder: '${mjSchema}' },
];

describe('SqlLoggingSessionImpl — schemaPlaceholders', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sql-placeholders-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Logs each statement in one session and returns the file's statement lines (no comments). */
  async function capture(options: SqlLoggingOptions, statements: string[]): Promise<string> {
    const file = path.join(dir, 'capture.sql');
    const session = new SqlLoggingSessionImpl('placeholders', file, options);
    await session.initialize();
    for (const sql of statements) {
      await session.LogSqlStatement(sql, undefined, undefined, true);
    }
    await session.dispose();
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0 && !line.startsWith('--'))
      .join('\n');
  }

  const migration = (rules: SqlSchemaPlaceholder[]): SqlLoggingOptions => ({
    formatAsMigration: true,
    defaultSchemaName: CORE_SCHEMA,
    schemaPlaceholders: rules,
  });

  it('maps the app schema and the core schema to their own placeholders', async () => {
    const out = await capture(migration(OPEN_APP_RULES), [
      `EXEC [${CORE_SCHEMA}].spCreateAIPrompt @Name = N'Test'`,
      `EXEC [${APP_SCHEMA}].spCreateInvoice @Number = N'INV-1'`,
    ]);
    expect(out).toContain('EXEC [${mjSchema}].spCreateAIPrompt');
    expect(out).toContain('EXEC [${flyway:defaultSchema}].spCreateInvoice');
    expect(out).not.toContain(`[${CORE_SCHEMA}].`);
    expect(out).not.toContain(`[${APP_SCHEMA}].`);
  });

  it('matches the longest schema first in either declared order', async () => {
    for (const rules of [OPEN_APP_RULES, [...OPEN_APP_RULES].reverse()]) {
      const out = await capture(migration(rules), [`EXEC [${APP_SCHEMA}].spCreateInvoice`]);
      expect(out).toBe('EXEC [${flyway:defaultSchema}].spCreateInvoice;');
    }
  });

  it('rewrites bare schema references and keeps them bare', async () => {
    const out = await capture(migration(OPEN_APP_RULES), [
      `INSERT INTO ${APP_SCHEMA}.Invoice (ID) SELECT ID FROM ${CORE_SCHEMA}.Entity`,
    ]);
    expect(out).toBe('INSERT INTO ${flyway:defaultSchema}.Invoice (ID) SELECT ID FROM ${mjSchema}.Entity;');
  });

  it('leaves names that only share a prefix or suffix alone', async () => {
    const out = await capture(migration(OPEN_APP_RULES), [
      'EXEC [__mj_BizAppsAccountingArchive].spCreateThing',
      'SELECT 1 FROM x__mj.Thing',
    ]);
    expect(out).toContain('EXEC [__mj_BizAppsAccountingArchive].spCreateThing');
    expect(out).toContain('FROM x__mj.Thing');
  });

  it('leaves a schema name in string data alone when no "." follows it', async () => {
    const out = await capture(migration(OPEN_APP_RULES), [
      `EXEC [${CORE_SCHEMA}].spUpdateEntity @Description = N'Lives in the ${CORE_SCHEMA} schema'`,
    ]);
    expect(out).toContain(`N'Lives in the ${CORE_SCHEMA} schema'`);
    expect(out).toContain('EXEC [${mjSchema}].spUpdateEntity');
  });

  it('matches schema names literally, not as regex', async () => {
    const out = await capture(migration([{ schema: 'a.b', placeholder: '${mjSchema}' }]), [
      'SELECT 1 FROM [a.b].T JOIN [axb].U ON 1 = 1',
    ]);
    expect(out).toBe('SELECT 1 FROM [${mjSchema}].T JOIN [axb].U ON 1 = 1;');
  });

  it('uses the first rule when a schema is declared twice', async () => {
    const out = await capture(
      migration([
        { schema: CORE_SCHEMA, placeholder: '${mjSchema}' },
        { schema: CORE_SCHEMA, placeholder: '${other}' },
      ]),
      [`EXEC [${CORE_SCHEMA}].spDeleteThing`],
    );
    expect(out).toBe('EXEC [${mjSchema}].spDeleteThing;');
  });

  it('is byte-identical to the defaultSchemaName rewrite when no rules are given', async () => {
    const statements = [
      `EXEC [${CORE_SCHEMA}].spCreateAIPrompt @Name = N'Test'`,
      `SELECT * FROM ${CORE_SCHEMA}.vwEntities WHERE Name = N'${CORE_SCHEMA}.Entity'`,
      `SELECT 1 FROM x${CORE_SCHEMA}.Thing`,
    ];
    const legacy = await capture({ formatAsMigration: true, defaultSchemaName: CORE_SCHEMA }, statements);
    const emptyRules = await capture(migration([]), statements);
    const blankRules = await capture(migration([{ schema: '', placeholder: '${mjSchema}' }]), statements);
    expect(legacy).toBe(
      [
        "EXEC [${flyway:defaultSchema}].spCreateAIPrompt @Name = N'Test';",
        "SELECT * FROM ${flyway:defaultSchema}.vwEntities WHERE Name = N'${flyway:defaultSchema}.Entity';",
        'SELECT 1 FROM x${flyway:defaultSchema}.Thing;',
      ].join('\n'),
    );
    expect(emptyRules).toBe(legacy);
    expect(blankRules).toBe(legacy);
  });

  it('ignores the rules when formatAsMigration is off', async () => {
    const out = await capture({ schemaPlaceholders: OPEN_APP_RULES }, [`EXEC [${APP_SCHEMA}].spCreateInvoice`]);
    expect(out).toBe(`EXEC [${APP_SCHEMA}].spCreateInvoice;`);
  });
});

describe('SqlLoggingSessionImpl — escapeFlywaySyntax', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sql-escape-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function capture(options: SqlLoggingOptions, sql: string): Promise<string> {
    const file = path.join(dir, 'capture.sql');
    const session = new SqlLoggingSessionImpl('escape', file, options);
    await session.initialize();
    await session.LogSqlStatement(sql, undefined, undefined, true);
    await session.dispose();
    return fs.readFileSync(file, 'utf8');
  }

  const WITH_TEMPLATE = `EXEC [${CORE_SCHEMA}].spCreateTemplate @Text = N'Hello \${userName}'`;

  it('escapes ${...} in string literals without migration formatting', async () => {
    const out = await capture({ escapeFlywaySyntax: true }, WITH_TEMPLATE);
    expect(out).not.toContain(`N'Hello \${userName}'`);
    // No schema rewrite without formatAsMigration
    expect(out).toContain(`[${CORE_SCHEMA}].spCreateTemplate`);
  });

  it('escapes the same way as formatAsMigration does', async () => {
    const escaped = await capture({ escapeFlywaySyntax: true }, WITH_TEMPLATE);
    const migration = await capture({ formatAsMigration: true }, WITH_TEMPLATE);
    const literal = (text: string): string | undefined => /@Text = (.*);/.exec(text)?.[1];
    expect(literal(escaped)).toBeDefined();
    expect(literal(escaped)).toBe(literal(migration));
  });

  it('does not escape when neither option is set', async () => {
    const out = await capture({}, WITH_TEMPLATE);
    expect(out).toContain(`N'Hello \${userName}'`);
  });
});

describe('SqlLoggingSessionImpl — TransformStatement runs before the schema rewrite', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sql-order-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rewrites schema names the transform adds, and the transform sees the real schema', async () => {
    const seen: string[] = [];
    const toSubquery = (sql: string): string => {
      seen.push(sql);
      return sql.replace(
        "SET @ID_abc = 'E1'",
        `SET @ID_abc = (SELECT ID FROM [${CORE_SCHEMA}].[Entity] WHERE Name = N'Users')`,
      );
    };
    const file = path.join(dir, 'capture.sql');
    const session = new SqlLoggingSessionImpl('order', file, {
      formatAsMigration: true,
      defaultSchemaName: CORE_SCHEMA,
      schemaPlaceholders: OPEN_APP_RULES,
      TransformStatement: toSubquery,
    });
    await session.initialize();
    await session.LogSqlStatement(
      `SET @ID_abc = 'E1'\nEXEC [${CORE_SCHEMA}].spUpdateEntity @ID = @ID_abc`,
      undefined,
      undefined,
      true,
    );
    await session.dispose();
    const out = fs.readFileSync(file, 'utf8');

    expect(seen[0]).toContain(`EXEC [${CORE_SCHEMA}].spUpdateEntity`);
    expect(out).toContain("SET @ID_abc = (SELECT ID FROM [${mjSchema}].[Entity] WHERE Name = N'Users')");
    expect(out).toContain('EXEC [${mjSchema}].spUpdateEntity');
    expect(out).not.toContain(`[${CORE_SCHEMA}].`);
  });

  it('keeps the same order with the defaultSchemaName rewrite', async () => {
    const file = path.join(dir, 'capture.sql');
    const session = new SqlLoggingSessionImpl('order-default', file, {
      formatAsMigration: true,
      defaultSchemaName: CORE_SCHEMA,
      TransformStatement: (sql) => sql.replace("'E1'", `(SELECT ID FROM [${CORE_SCHEMA}].[Entity])`),
    });
    await session.initialize();
    await session.LogSqlStatement("SET @ID_abc = 'E1'", undefined, undefined, true);
    await session.dispose();
    expect(fs.readFileSync(file, 'utf8')).toContain('SET @ID_abc = (SELECT ID FROM [${flyway:defaultSchema}].[Entity]);');
  });
});
