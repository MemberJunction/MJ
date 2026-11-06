/**
 * SqlLoggingOptions.TransformStatement runs on every statement before the session reads it,
 * so nothing it removes reaches the log file or the verbose console output.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ApplyStatementTransforms,
  SqlLoggingSessionImpl,
  TRANSFORM_FAILED_LINE,
  TRANSFORM_FAILED_PLACEHOLDER,
} from '../SqlLogger';
import type { SqlLoggingOptions } from '../types';

const SECRET = 'super-secret-123';
const SAVE = [
  'DECLARE @Token_6679d1fd77d5 NVARCHAR(100), @ID_6679d1fd77d5 UNIQUEIDENTIFIER',
  `SET @Token_6679d1fd77d5 = N'${SECRET}'`,
  "SET @ID_6679d1fd77d5 = 'w-0001'",
  'EXEC [dbo].spUpdateWidget @Token = @Token_6679d1fd77d5, @ID = @ID_6679d1fd77d5',
].join('\n');

const redact = (sql: string): string => sql.split(SECRET).join('<removed>');

describe('SqlLoggingSessionImpl — TransformStatement', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sql-transform-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function capture(options: SqlLoggingOptions, query: string, fallback?: string): Promise<string> {
    const file = path.join(dir, 'capture.sql');
    const session = new SqlLoggingSessionImpl('transform', file, options);
    await session.initialize();
    await session.LogSqlStatement(query, undefined, 'Save Widgets', true, fallback);
    await session.dispose();
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  }

  it('writes the transformed statement', async () => {
    const text = await capture({ TransformStatement: redact, logRecordChangeMetadata: true }, SAVE);
    expect(text).toContain("SET @Token_6679d1fd77d5 = N'<removed>'");
    expect(text).not.toContain(SECRET);
  });

  it('transforms the simple-SQL fallback that the session logs', async () => {
    const text = await capture({ TransformStatement: redact }, `${SAVE}\n-- record change`, SAVE);
    expect(text).toContain('<removed>');
    expect(text).not.toContain(SECRET);
  });

  it('applies the pattern filter to the transformed text', async () => {
    const text = await capture(
      { TransformStatement: redact, logRecordChangeMetadata: true, filterPatterns: [`*${SECRET}*`], filterType: 'exclude' },
      SAVE
    );
    expect(text).toContain('spUpdateWidget');
  });

  it('prints only the transformed text in verbose output', async () => {
    const printed: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(' '));
    });
    await capture({ TransformStatement: redact, logRecordChangeMetadata: true, verboseOutput: true }, `SET @T_6679d1fd77d5 = N'${SECRET}'`);
    expect(printed.join('\n')).toContain('<removed>');
    expect(printed.join('\n')).not.toContain(SECRET);
  });

  it('writes a fixed line and resolves when the transform throws', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    const failing = (sql: string): string => {
      throw new Error(`cannot transform ${sql}`);
    };
    const text = await capture({ TransformStatement: failing, logRecordChangeMetadata: true }, SAVE);
    expect(text).toContain(TRANSFORM_FAILED_LINE);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('spUpdateWidget');
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain(SECRET);
    expect(errors[0]).not.toContain('spUpdateWidget');
  });

  it('tags the description by comparing the SQL that ran, not the transformed text', async () => {
    const dropTail = (sql: string): string => sql.replace('\n-- record change', '');
    const text = await capture({ TransformStatement: dropTail }, `${SAVE}\n-- record change`, SAVE);
    expect(text).toContain('-- Save Widgets (core SP call only)');
  });

  it('logs the statement unchanged without a transform', async () => {
    const text = await capture({ logRecordChangeMetadata: true }, SAVE);
    expect(text).toContain(SECRET);
  });
});

describe('SqlLoggingSessionImpl — TransformStatement on the parameter and description comments', () => {
  const MARKER = 'marker-value-789';
  const drop = (sql: string): string => sql.split(MARKER).join('<removed>');
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sql-transform-comments-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function captureWith(options: SqlLoggingOptions, parameters: unknown): Promise<string> {
    const file = path.join(dir, 'capture.sql');
    const session = new SqlLoggingSessionImpl('comments', file, options);
    await session.initialize();
    await session.LogSqlStatement('SELECT 1', parameters, `Save Widget ${MARKER}`, true);
    await session.dispose();
    return fs.readFileSync(file, 'utf8');
  }

  it('transforms the array parameter comment and the description', async () => {
    const text = await captureWith({ TransformStatement: drop }, [MARKER, 'plain']);
    expect(text).toContain("-- Parameters: @p0='<removed>', @p1='plain'");
    expect(text).toContain('-- Save Widget <removed>');
    expect(text).not.toContain(MARKER);
  });

  it('transforms the object parameter comment', async () => {
    const text = await captureWith({ TransformStatement: drop }, { Token: MARKER });
    expect(text).toContain("-- Parameters: @Token='<removed>'");
    expect(text).not.toContain(MARKER);
  });

  it('writes both comments unchanged without a transform', async () => {
    const text = await captureWith({}, { Token: MARKER });
    expect(text).toContain(`-- Parameters: @Token='${MARKER}'`);
    expect(text).toContain(`-- Save Widget ${MARKER}`);
  });
});

describe('ApplyStatementTransforms', () => {
  it('runs the transform of each session in turn and keeps the text for sessions without one', () => {
    const sessions = [
      { options: { TransformStatement: (sql: string) => sql.replace('a', 'b') } },
      { options: {} },
      { options: { TransformStatement: (sql: string) => sql.replace('b', 'c') } },
    ];
    expect(ApplyStatementTransforms('a-a', sessions)).toBe('c-a');
    expect(ApplyStatementTransforms('x', [])).toBe('x');
  });

  it('returns the fixed placeholder when a transform throws', () => {
    const sessions = [
      { options: { TransformStatement: (): string => { throw new Error('boom'); } } },
    ];
    expect(ApplyStatementTransforms(`SET @T = N'${SECRET}'`, sessions)).toBe(TRANSFORM_FAILED_PLACEHOLDER);
  });
});
