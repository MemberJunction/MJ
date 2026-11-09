/**
 * Schema placeholder rules for a captured push log (#3618): where they come from, and the rewrite
 * the MetadataSync `SQLLogger` applies with them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { MJConfig, SyncConfig } from '../config';
import { ApplySchemaPlaceholders, ResolveSchemaPlaceholders } from '../lib/schema-placeholders';
import { SQLLogger } from '../lib/sql-logger';

const APP_RULES = [
  { schema: '__mj', placeholder: '${mjSchema}' },
  { schema: '__mj_BizAppsCommon', placeholder: '${flyway:defaultSchema}' },
];

function syncConfig(sqlLogging: Record<string, unknown>): SyncConfig {
  return { version: '1.0.0', sqlLogging } as SyncConfig;
}

function mjConfig(sqlOutput: unknown): MJConfig {
  return { dbHost: 'h', dbDatabase: 'd', dbUsername: 'u', dbPassword: 'p', SQLOutput: sqlOutput } as MJConfig;
}

describe('ResolveSchemaPlaceholders', () => {
  it('uses .mj-sync.json sqlLogging.schemaPlaceholders first', () => {
    const fromMj = mjConfig({ schemaPlaceholders: [{ schema: '__x', placeholder: '${x}' }] });
    expect(ResolveSchemaPlaceholders(syncConfig({ schemaPlaceholders: APP_RULES }), fromMj)).toEqual(APP_RULES);
  });

  it('falls back to mj.config.cjs SQLOutput.schemaPlaceholders', () => {
    expect(ResolveSchemaPlaceholders(syncConfig({ enabled: true }), mjConfig({ schemaPlaceholders: APP_RULES }))).toEqual(APP_RULES);
    expect(ResolveSchemaPlaceholders(syncConfig({ schemaPlaceholders: [] }), mjConfig({ schemaPlaceholders: APP_RULES }))).toEqual(APP_RULES);
  });

  it('is undefined when neither has a rule, and drops malformed entries', () => {
    expect(ResolveSchemaPlaceholders(null, null)).toBeUndefined();
    expect(ResolveSchemaPlaceholders(syncConfig({}), mjConfig({ outputDir: 'x' }))).toBeUndefined();
    expect(ResolveSchemaPlaceholders(null, mjConfig('not-an-object'))).toBeUndefined();
    const mixed = [{ schema: '', placeholder: '${a}' }, { schema: '__mj' }, 'text', { schema: '__mj', placeholder: '${mjSchema}' }];
    expect(ResolveSchemaPlaceholders(null, mjConfig({ schemaPlaceholders: mixed }))).toEqual([{ schema: '__mj', placeholder: '${mjSchema}' }]);
  });
});

describe('ApplySchemaPlaceholders', () => {
  it('rewrites the longest schema first whatever the declared order, keeping brackets', () => {
    const sql = 'EXEC [__mj].spCreateAIPrompt; EXEC [__mj_BizAppsCommon].spCreateWidget; SELECT 1 FROM __mj.Entity';
    expect(ApplySchemaPlaceholders(sql, APP_RULES)).toBe(
      'EXEC [${mjSchema}].spCreateAIPrompt; EXEC [${flyway:defaultSchema}].spCreateWidget; SELECT 1 FROM ${mjSchema}.Entity'
    );
  });

  it('leaves a bare schema name, and one that ends a longer word, alone', () => {
    const sql = "SET @Description_abc = N'Tables live in the __mj schema; see my__mj.notes'";
    expect(ApplySchemaPlaceholders(sql, APP_RULES)).toBe(sql);
  });

  it('rewrites `schema.` inside string data too, since it does not tell code from data', () => {
    expect(ApplySchemaPlaceholders("SET @Description_abc = N'see __mj.Entity'", APP_RULES)).toBe("SET @Description_abc = N'see ${mjSchema}.Entity'");
  });

  it('matches the provider logger: a name after `@` or `#` is a variable or temp table, not a schema', () => {
    const sql = 'SELECT @__mj.x, #__mj.y';
    expect(ApplySchemaPlaceholders(sql, APP_RULES)).toBe(sql);
  });
});

describe('SQLLogger migration output', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-sql-logger-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  async function writeWith(rules?: typeof APP_RULES): Promise<string> {
    const logger = new SQLLogger(syncConfig({ enabled: true, formatAsMigration: true, outputDirectory: dir }), rules);
    logger.LogStatement("EXEC [__mj].spUpdateEntity @Description = N'in __mj today'");
    logger.LogStatement('EXEC [__mj_BizAppsCommon].spCreateWidget');
    const file = await logger.WriteLog();
    return fs.readFile(file as string, 'utf8');
  }

  it('applies the configured rules', async () => {
    const text = await writeWith(APP_RULES);
    expect(text).toContain("EXEC [${mjSchema}].spUpdateEntity @Description = N'in __mj today'");
    expect(text).toContain('EXEC [${flyway:defaultSchema}].spCreateWidget');
  });

  it('defaults to __mj → ${flyway:defaultSchema}, keeping brackets and leaving an app schema alone', async () => {
    const text = await writeWith();
    expect(text).toContain('EXEC [${flyway:defaultSchema}].spUpdateEntity');
    expect(text).toContain('EXEC [__mj_BizAppsCommon].spCreateWidget');
  });
});
