/**
 * Threshold-mode batch separation must never let one batch redeclare a variable.
 *
 * Save-call variable suffixes are deterministic per record (allocateSaveCallSuffix), so the same
 * record saved twice produces identical DECLARE lists. In threshold mode (Explorer SQL logging,
 * `mj sync watch`) statements accumulate into one batch until the variable count reaches the
 * threshold; SQL Server rejects a redeclared variable inside a batch, so without a name-aware
 * guard the capture fails on replay. These tests drive the REAL SqlLoggingSessionImpl through
 * initialize() → logSqlStatement() → dispose() against a temp file and read the file back.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SqlLoggingSessionImpl } from '../SqlLogger';
import type { SqlLoggingOptions } from '../types';

const SAVE_A = [
  'DECLARE @Name_6679d1fd77d5 NVARCHAR(100), @IsActive_6679d1fd77d5 BIT, @ID_6679d1fd77d5 UNIQUEIDENTIFIER',
  "SET @Name_6679d1fd77d5 = N'Once'",
  'SET @IsActive_6679d1fd77d5 = 1',
  "SET @ID_6679d1fd77d5 = 'w-0001'",
  'EXEC [dbo].spUpdateWidget @Name = @Name_6679d1fd77d5, @IsActive = @IsActive_6679d1fd77d5, @ID = @ID_6679d1fd77d5',
].join('\n');

const SAVE_B = SAVE_A.replace(/6679d1fd77d5/g, '0badf00d1234').replace("N'Once'", "N'Other'");

/** Same declarations as SAVE_A but with the variable names upper-cased — T-SQL treats them as the same variables. */
const SAVE_A_UPPER = SAVE_A.replace(/@(\w+)_6679d1fd77d5/g, (_m, field: string) => `@${field.toUpperCase()}_6679D1FD77D5`);

const EXPLORER_DEFAULTS: SqlLoggingOptions = {
  batchSeparator: 'GO',
  variableBatchThreshold: 200,
  logRecordChangeMetadata: false,
  statementTypes: 'both',
};

describe('SqlLoggingSessionImpl threshold mode — redeclaration guard', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sql-logger-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function capture(statements: string[], options: SqlLoggingOptions): Promise<string> {
    const file = path.join(dir, 'capture.sql');
    const session = new SqlLoggingSessionImpl('redeclare-guard', file, options);
    await session.initialize();
    for (const sql of statements) {
      await session.logSqlStatement(sql, undefined, 'Save Widgets', true);
    }
    await session.dispose();
    return fs.readFileSync(file, 'utf8');
  }

  /** Body lines between the header and the footer, so separator positions can be asserted relative to statements. */
  function bodyLines(text: string): string[] {
    return text.split('\n').filter((line) => line.trim().length > 0 && !line.startsWith('--'));
  }

  function separatorCount(text: string): number {
    return (text.match(/^GO\s*$/gm) ?? []).length;
  }

  it('emits the separator between two saves of the same record (identical DECLARE lists)', async () => {
    const text = await capture([SAVE_A, SAVE_A], EXPLORER_DEFAULTS);
    expect(separatorCount(text)).toBe(1);
    const lines = bodyLines(text);
    const firstDeclare = lines.findIndex((l) => l.startsWith('DECLARE'));
    const go = lines.indexOf('GO');
    const secondDeclare = lines.findIndex((l, i) => i > firstDeclare && l.startsWith('DECLARE'));
    expect(firstDeclare).toBeGreaterThanOrEqual(0);
    expect(go).toBeGreaterThan(firstDeclare);
    expect(secondDeclare).toBeGreaterThan(go);
    // The second batch must not contain a name from the first — that is the property SQL Server enforces.
    const batches = text.split(/^GO\s*$/m);
    for (const batch of batches) {
      const declared = [...batch.matchAll(/DECLARE\s+(@\w+)/g)].map((m) => m[1].toLowerCase());
      expect(new Set(declared).size).toBe(declared.length);
    }
  });

  it('does not separate saves of different records below the threshold', async () => {
    const text = await capture([SAVE_A, SAVE_B], EXPLORER_DEFAULTS);
    expect(separatorCount(text)).toBe(0);
  });

  it('treats variable names case-insensitively, as T-SQL does', async () => {
    const text = await capture([SAVE_A, SAVE_A_UPPER], EXPLORER_DEFAULTS);
    expect(separatorCount(text)).toBe(1);
  });

  it('starts a fresh name set after each separator (A, B, A → one separator; A, A, A → two)', async () => {
    expect(separatorCount(await capture([SAVE_A, SAVE_B, SAVE_A], EXPLORER_DEFAULTS))).toBe(1);
    expect(separatorCount(await capture([SAVE_A, SAVE_A, SAVE_A], EXPLORER_DEFAULTS))).toBe(2);
    // After the redeclaration separator the batch holds only A, so B joins it without another separator.
    expect(separatorCount(await capture([SAVE_A, SAVE_A, SAVE_B], EXPLORER_DEFAULTS))).toBe(1);
  });

  it('keeps the count-based separator: distinct names still split at the threshold', async () => {
    // Each save declares 3 variables; threshold 7 → A+B = 6 fit, C (6+3 >= 7) starts a new batch.
    const saveC = SAVE_A.replace(/6679d1fd77d5/g, 'c0ffee000001');
    const text = await capture([SAVE_A, SAVE_B, saveC], { ...EXPLORER_DEFAULTS, variableBatchThreshold: 7 });
    expect(separatorCount(text)).toBe(1);
  });

  it('legacy mode (no threshold) is unchanged: one separator after every statement', async () => {
    const text = await capture([SAVE_A, SAVE_A], { batchSeparator: 'GO', logRecordChangeMetadata: false });
    expect(separatorCount(text)).toBe(2);
  });
});
