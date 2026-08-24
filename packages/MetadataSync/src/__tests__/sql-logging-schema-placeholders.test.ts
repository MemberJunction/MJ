/**
 * MJ#3618 — the schema-placeholder mapping a captured migration needs is already declared per repo,
 * in mj.config.cjs, for CodeGen. These tests pin the resolution order that lets `mj sync push`
 * pick it up without a second declaration.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveSqlLoggingSchemaPlaceholders } from '../config';
import type { SyncConfig } from '../config';
import { configManager } from '../lib/config-manager';

const APP_RULES = [
  { schema: '__mj_BizAppsAccounting', placeholder: '${flyway:defaultSchema}' },
  { schema: '__mj', placeholder: '${mjSchema}' },
];

let tmpDir: string;
const originalConfigFile = process.env.MJ_CONFIG_FILE;

/** Writes a real mj.config.cjs and points the config manager at it. */
function useMJConfig(config: Record<string, unknown>): void {
  const configPath = path.join(tmpDir, 'mj.config.cjs');
  fs.writeFileSync(configPath, `module.exports = ${JSON.stringify(config, null, 2)};\n`, 'utf8');
  process.env.MJ_CONFIG_FILE = configPath;
  configManager.loadMJConfig(true); // force a reload so the cached config reflects this file
}

const syncConfigWith = (sqlLogging: Record<string, unknown>): SyncConfig =>
  ({ version: '1.0.0', sqlLogging } as unknown as SyncConfig);

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sync-3618-'));
});

afterEach(() => {
  if (originalConfigFile === undefined) {
    delete process.env.MJ_CONFIG_FILE;
  } else {
    process.env.MJ_CONFIG_FILE = originalConfigFile;
  }
  configManager.loadMJConfig(true);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveSqlLoggingSchemaPlaceholders (MJ#3618)', () => {
  it('falls back to SQLOutput.schemaPlaceholders from mj.config.cjs', () => {
    useMJConfig({ dbHost: 'localhost', dbDatabase: 'test', SQLOutput: { schemaPlaceholders: APP_RULES } });
    expect(resolveSqlLoggingSchemaPlaceholders(null)).toEqual(APP_RULES);
  });

  it('prefers an explicit sqlLogging.schemaPlaceholders over the CodeGen array', () => {
    useMJConfig({ dbHost: 'localhost', dbDatabase: 'test', SQLOutput: { schemaPlaceholders: APP_RULES } });
    const override = [{ schema: '__mj_Other', placeholder: '${flyway:defaultSchema}' }];
    expect(resolveSqlLoggingSchemaPlaceholders(syncConfigWith({ schemaPlaceholders: override }))).toEqual(override);
  });

  it('returns undefined when nothing is declared, leaving the single-schema default in place', () => {
    useMJConfig({ dbHost: 'localhost', dbDatabase: 'test' });
    expect(resolveSqlLoggingSchemaPlaceholders(null)).toBeUndefined();
    expect(resolveSqlLoggingSchemaPlaceholders(syncConfigWith({ formatAsMigration: true }))).toBeUndefined();
  });

  it('treats an empty array as "not declared" at both levels', () => {
    useMJConfig({ dbHost: 'localhost', dbDatabase: 'test', SQLOutput: { schemaPlaceholders: [] } });
    expect(resolveSqlLoggingSchemaPlaceholders(syncConfigWith({ schemaPlaceholders: [] }))).toBeUndefined();
  });
});
