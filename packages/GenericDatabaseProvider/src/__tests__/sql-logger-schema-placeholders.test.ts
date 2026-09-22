/**
 * Regression tests for MJ#3618 — `formatAsMigration` produced an unusable migration for Open Apps.
 *
 * A captured Open App migration runs under Skyway with `${flyway:defaultSchema}` bound to the APP
 * schema and `${mjSchema}` bound to MJ core. The single-schema rewrite could only ever emit
 * `${flyway:defaultSchema}`, and `CreateSqlLogger` fed it the CORE schema — so every core CRUD call
 * was redirected into the app schema, and the app's own schema was hardcoded literally.
 *
 * These tests exercise the real `SqlLoggingSessionImpl` end-to-end (open file, log, dispose, read
 * back the emitted file) rather than a unit of the rewrite in isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SqlLoggingSessionImpl } from '../SqlLogger.js';
import type { SqlLoggingOptions } from '../types.js';

const APP_SCHEMA = '__mj_BizAppsAccounting';
const CORE_SCHEMA = '__mj';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mj-sqllogger-3618-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

/** Runs a logging session over the given statements and returns the emitted file contents. */
async function capture(options: SqlLoggingOptions, statements: string[]): Promise<string> {
  const filePath = path.join(tmpDir, `capture-${Math.random().toString(36).slice(2)}.sql`);
  const session = new SqlLoggingSessionImpl('test-session', filePath, options);
  await session.initialize();
  for (const sql of statements) {
    await session.logSqlStatement(sql, undefined, undefined, true);
  }
  await session.dispose();
  return fs.promises.readFile(filePath, 'utf8');
}

describe('SqlLogger — Open App schema placeholders (MJ#3618)', () => {
  const openAppPlaceholders = [
    // Specific app schema first, generic core second — the ordering hazard the issue calls out.
    { schema: APP_SCHEMA, placeholder: '${flyway:defaultSchema}' },
    { schema: CORE_SCHEMA, placeholder: '${mjSchema}' },
  ];

  it('maps the app schema to ${flyway:defaultSchema} and core to ${mjSchema}', async () => {
    const out = await capture(
      { formatAsMigration: true, defaultSchemaName: CORE_SCHEMA, schemaPlaceholders: openAppPlaceholders },
      [
        `EXEC [${CORE_SCHEMA}].spCreateAIPrompt @Name='Test'`,
        `EXEC [${APP_SCHEMA}].spCreateInvoice @Number='INV-1'`,
      ],
    );

    expect(out).toContain('EXEC [${mjSchema}].spCreateAIPrompt');
    expect(out).toContain('EXEC [${flyway:defaultSchema}].spCreateInvoice');
    // The bug: a core call rewritten to the app-bound placeholder resolves to a procedure that
    // does not exist on a host.
    expect(out).not.toContain('EXEC [${flyway:defaultSchema}].spCreateAIPrompt');
    // And no literal schema name may survive into a shippable migration.
    expect(out).not.toContain(`[${CORE_SCHEMA}].`);
    expect(out).not.toContain(`[${APP_SCHEMA}].`);
  });

  it('does not let the generic core rule eat the app schema prefix, in either config order', async () => {
    const reversed = [...openAppPlaceholders].reverse();
    for (const placeholders of [openAppPlaceholders, reversed]) {
      const out = await capture(
        { formatAsMigration: true, defaultSchemaName: CORE_SCHEMA, schemaPlaceholders: placeholders },
        [`EXEC [${APP_SCHEMA}].spCreateInvoice`],
      );
      expect(out).toContain('EXEC [${flyway:defaultSchema}].spCreateInvoice');
      expect(out).not.toContain('${mjSchema}_BizAppsAccounting');
    }
  });

  it('rewrites unbracketed schema references too', async () => {
    const out = await capture(
      { formatAsMigration: true, defaultSchemaName: CORE_SCHEMA, schemaPlaceholders: openAppPlaceholders },
      [`INSERT INTO ${APP_SCHEMA}.Invoice (ID) SELECT ID FROM ${CORE_SCHEMA}.Entity`],
    );
    expect(out).toContain('INSERT INTO ${flyway:defaultSchema}.Invoice');
    expect(out).toContain('FROM ${mjSchema}.Entity');
  });

  it('leaves a similarly-named sibling schema alone', async () => {
    const out = await capture(
      { formatAsMigration: true, defaultSchemaName: CORE_SCHEMA, schemaPlaceholders: openAppPlaceholders },
      [`EXEC [__mj_BizAppsAccountingArchive].spCreateThing`],
    );
    expect(out).toContain('EXEC [__mj_BizAppsAccountingArchive].spCreateThing');
  });

  it('falls back to the single-schema behaviour when no placeholders are supplied (MJ core)', async () => {
    const out = await capture({ formatAsMigration: true, defaultSchemaName: CORE_SCHEMA }, [
      `EXEC [${CORE_SCHEMA}].spCreateAIPrompt @Name='Test'`,
    ]);
    expect(out).toContain('EXEC [${flyway:defaultSchema}].spCreateAIPrompt');
  });

  it('ignores schemaPlaceholders when formatAsMigration is off', async () => {
    const out = await capture({ formatAsMigration: false, schemaPlaceholders: openAppPlaceholders }, [
      `EXEC [${APP_SCHEMA}].spCreateInvoice`,
    ]);
    expect(out).toContain(`EXEC [${APP_SCHEMA}].spCreateInvoice`);
    expect(out).not.toContain('${flyway:defaultSchema}');
  });
});

describe('SqlLogger — Flyway string escaping is independent of migration formatting (MJ#3618)', () => {
  const contentWithDollarBrace = `EXEC [${CORE_SCHEMA}].spCreateAIPrompt @TemplateText='Hello \${userName}'`;

  it('escapes ${...} inside string literals when formatAsMigration is on', async () => {
    const out = await capture({ formatAsMigration: true, defaultSchemaName: CORE_SCHEMA }, [contentWithDollarBrace]);
    expect(out).not.toContain(`'Hello \${userName}'`);
  });

  it('can escape ${...} without turning on migration formatting', async () => {
    const out = await capture({ formatAsMigration: false, escapeFlywaySyntax: true }, [contentWithDollarBrace]);
    // Schema names are untouched (no migration formatting) but the placeholder is neutralised.
    expect(out).toContain(`[${CORE_SCHEMA}]`);
    expect(out).not.toContain(`'Hello \${userName}'`);
  });
});
