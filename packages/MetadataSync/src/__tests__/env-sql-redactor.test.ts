import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EnvSqlRedactor } from '../lib/env-sql-redactor';

const SECRET = 'super-secret-123';
const env = { MJ_TOKEN: SECRET, MJ_QUOTE: "it's-secret-1", MJ_FLAG: 'true', MJ_COUNT: '42', MJ_ID: 'B0000000-0000-4000-8000-000000000001' };
const vars = (...names: string[]): ReadonlySet<string> => new Set(names);

function save(suffix: string, token: string): string {
  return [
    `DECLARE @Token_${suffix} NVARCHAR(100), @Name_${suffix} NVARCHAR(100), @ID_${suffix} UNIQUEIDENTIFIER`,
    '',
    `SET @Token_${suffix} = N'${token}'`,
    `SET @Name_${suffix} = N'Visible'`,
    `SET @ID_${suffix} = 'w-0001'`,
    '',
    `EXEC [dbo].spUpdateWidget @Token=@Token_${suffix}, @Name=@Name_${suffix}, @ID=@ID_${suffix}`,
  ].join('\n');
}

describe('EnvSqlRedactor', () => {
  let dir: string;

  /** Writes the text as the SQL log and returns its path. */
  const writeLog = (text: string): string => {
    const logPath = path.join(dir, 'push.sql');
    fs.writeFileSync(logPath, text, 'utf8');
    return logPath;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-env-sql-redactor-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('replaces the SET line of a registered field and keeps the DECLARE, the EXEC and other fields', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN'), env);
    redactor.Register('MJ: Widgets', 'Token', 'Token', SECRET, vars('MJ_TOKEN'));

    const sql = redactor.Transform(save('6679d1fd77d5', SECRET));

    expect(sql).toContain('-- MJ: Widgets.Token: not recorded, value comes from @env:MJ_TOKEN');
    expect(sql).toContain('DECLARE @Token_6679d1fd77d5 NVARCHAR(100)');
    expect(sql).toContain('@Token=@Token_6679d1fd77d5');
    expect(sql).toContain("SET @Name_6679d1fd77d5 = N'Visible'");
    expect(sql).not.toContain(SECRET);
    expect(redactor.Warnings(writeLog(sql))).toEqual([]);
  });

  it('does not touch the same field of a record with a literal value', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN'), env);
    redactor.Register('MJ: Widgets', 'Token', 'Token', SECRET, vars('MJ_TOKEN'));

    const other = save('0badf00d1234', 'other-value');
    expect(redactor.Transform(other)).toBe(other);
  });

  it('matches a numbered suffix, an upper-case suffix and an indented line', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN'), env);
    redactor.Register('MJ: Widgets', 'Token', 'Token', SECRET, vars('MJ_TOKEN'));

    expect(redactor.Transform(`  SET @Token_6679D1FD77D5_2 = N'${SECRET}'`)).toBe(
      '  -- MJ: Widgets.Token: not recorded, value comes from @env:MJ_TOKEN'
    );
  });

  it('matches doubled quotes, a non-unicode literal, a bit and a number', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_QUOTE', 'MJ_FLAG', 'MJ_COUNT', 'MJ_ID'), env);
    redactor.Register('MJ: Widgets', 'Note', 'Note', env.MJ_QUOTE, vars('MJ_QUOTE'));
    redactor.Register('MJ: Widgets', 'IsActive', 'IsActive', env.MJ_FLAG, vars('MJ_FLAG'));
    redactor.Register('MJ: Widgets', 'Count', 'Count', env.MJ_COUNT, vars('MJ_COUNT'));
    redactor.Register('MJ: Widgets', 'OwnerID', 'OwnerID', env.MJ_ID, vars('MJ_ID'));

    const sql = redactor.Transform(
      [
        "SET @Note_6679d1fd77d5 = N'it''s-secret-1'",
        'SET @IsActive_6679d1fd77d5 = 1',
        'SET @Count_6679d1fd77d5 = 42',
        `SET @OwnerID_6679d1fd77d5 = '${env.MJ_ID}'`,
      ].join('\n')
    );

    expect(sql.split('\n')).toEqual([
      '-- MJ: Widgets.Note: not recorded, value comes from @env:MJ_QUOTE',
      '-- MJ: Widgets.IsActive: not recorded, value comes from @env:MJ_FLAG',
      '-- MJ: Widgets.Count: not recorded, value comes from @env:MJ_COUNT',
      '-- MJ: Widgets.OwnerID: not recorded, value comes from @env:MJ_ID',
    ]);
  });

  it('matches a JSON object value and names every variable of the field', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN', 'MJ_COUNT'), env);
    const value = { key: SECRET, n: "a'b" };
    redactor.Register('MJ: Widgets', 'Config', 'Config', value, vars('MJ_TOKEN', 'MJ_COUNT'));

    const sql = redactor.Transform(`SET @Config_6679d1fd77d5 = N'{"key":"${SECRET}","n":"a''b"}'`);

    expect(sql).toBe('-- MJ: Widgets.Config: not recorded, value comes from @env:MJ_COUNT, @env:MJ_TOKEN');
  });

  it('gives the same result when the same statement is transformed more than once', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN'), env);
    redactor.Register('MJ: Widgets', 'Token', 'Token', SECRET, vars('MJ_TOKEN'));

    const first = redactor.Transform(save('6679d1fd77d5', SECRET));
    expect(redactor.Transform(save('6679d1fd77d5', SECRET))).toBe(first);
    expect(redactor.Transform(first)).toBe(first);
    redactor.Transform('SELECT 1');

    expect(redactor.Warnings(writeLog(first))).toEqual([]);
  });

  it('warns, with names only, for a field whose line was never found', () => {
    const redactor = new EnvSqlRedactor(vars(), env);
    redactor.Register('MJ: Widgets', 'Token', 'Token', SECRET, vars('MJ_TOKEN'));

    const logPath = writeLog('');
    const warnings = redactor.Warnings(logPath);

    expect(warnings).toEqual([
      `SQL log ${logPath}: the line for MJ: Widgets.Token (from @env:MJ_TOKEN) was not found, so its value may be in the log. Check the log before you share it.`,
    ]);
  });

  it('warns for an env-sourced primary key and does not repeat it as a found value', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_ID'), env);
    redactor.RegisterPrimaryKey('MJ: Widgets', 'ID', vars('MJ_ID'));
    redactor.RegisterPrimaryKey('MJ: Widgets', 'ID', vars('MJ_ID'));

    const sql = redactor.Transform(`SET @ID_6679d1fd77d5 = '${env.MJ_ID}'`);
    const logPath = writeLog(sql);

    expect(redactor.Warnings(logPath)).toEqual([
      `SQL log ${logPath}: MJ: Widgets.ID is a primary key from @env:MJ_ID. The log holds its value. Check the log before you share it.`,
    ]);
  });

  it('warns when the value of a resolved variable is still in the log file', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN', 'MJ_FLAG'), env);

    const sql = `INSERT INTO RecordChange (ChangesJSON) VALUES (N'{"Token":"${SECRET.toUpperCase()}"}')`;
    expect(redactor.Transform(sql)).toBe(sql);
    const logPath = writeLog(sql);

    const warnings = redactor.Warnings(logPath);
    expect(warnings).toEqual([
      `SQL log ${logPath}: the value of @env:MJ_TOKEN appears in the log. Check the log before you share it.`,
    ]);
    expect(warnings.join('\n').toLowerCase()).not.toContain(SECRET);
  });

  it('finds a value with doubled quotes and a JSON-escaped value in the log file', () => {
    const quoteEnv = { MJ_QUOTE: "it's-secret-1", MJ_PATH: 'C:\\keys\\"main"' };
    const redactor = new EnvSqlRedactor(vars('MJ_QUOTE', 'MJ_PATH'), quoteEnv);
    const logPath = writeLog(`N'it''s-secret-1' and N'{"p":"C:\\\\keys\\\\\\"main\\""}'`);

    expect(redactor.Warnings(logPath)).toEqual([
      `SQL log ${logPath}: the value of @env:MJ_PATH appears in the log. Check the log before you share it.`,
      `SQL log ${logPath}: the value of @env:MJ_QUOTE appears in the log. Check the log before you share it.`,
    ]);
  });

  it('does not warn for a value that was only in transformed text that the log does not hold', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN'), env);

    redactor.Transform(`SELECT * FROM Widgets WHERE Token = N'${SECRET}'`);

    expect(redactor.Warnings(writeLog('-- nothing written\n'))).toEqual([]);
  });

  it('reads the variable names at Warnings time', () => {
    const names = new Set<string>();
    const redactor = new EnvSqlRedactor(names, env);
    const logPath = writeLog(`N'${SECRET}'`);
    expect(redactor.Warnings(logPath)).toEqual([]);

    names.add('MJ_TOKEN');

    expect(redactor.Warnings(logPath)).toEqual([
      `SQL log ${logPath}: the value of @env:MJ_TOKEN appears in the log. Check the log before you share it.`,
    ]);
  });

  it('gives one names-only warning when the log cannot be read', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN'), env);
    const logPath = path.join(dir, 'missing.sql');

    expect(redactor.Warnings(logPath)).toEqual([
      `SQL log ${logPath}: the log could not be read to check for env values. Check the log before you share it.`,
    ]);
  });

  it('replaces only the SET lines of the registered save call', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_FLAG'), env);
    redactor.Register('MJ: Widgets', 'IsActive', 'IsActive', true, vars('MJ_FLAG'), 'AAAAAAAAAAAA');

    const other = ['SET @IsActive_0badf00d1234 = 1', 'SET @IsActive_0badf00d1234_2 = 1'].join('\n');
    expect(redactor.Transform(other)).toBe(other);

    const comment = '-- MJ: Widgets.IsActive: not recorded, value comes from @env:MJ_FLAG';
    expect(redactor.Transform('SET @IsActive_aaaaaaaaaaaa = 1')).toBe(comment);
    expect(redactor.Transform('SET @IsActive_aaaaaaaaaaaa_2 = 1')).toBe(comment);
  });

  it('replaces a multi-line literal whole and keeps the real SET line after it', () => {
    const value = "line one\nit's here\nSET @Name_aaaaaaaaaaaa = N'x'\nend";
    const redactor = new EnvSqlRedactor(vars('MJ_NOTE'), { MJ_NOTE: value });
    redactor.Register('MJ: Widgets', 'Note', 'Note', value, vars('MJ_NOTE'), 'aaaaaaaaaaaa');

    const sql = redactor.Transform(
      [
        "SET @Note_aaaaaaaaaaaa = N'line one",
        "it''s here",
        "SET @Name_aaaaaaaaaaaa = N''x''",
        "end'",
        "SET @Name_aaaaaaaaaaaa = N'Visible'",
      ].join('\n')
    );

    expect(sql.split('\n')).toEqual([
      '-- MJ: Widgets.Note: not recorded, value comes from @env:MJ_NOTE',
      "SET @Name_aaaaaaaaaaaa = N'Visible'",
    ]);
  });

  it('replaces SET lines in the record-change wrapper, where only the first SET line is indented', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN', 'MJ_COUNT'), env);
    redactor.Register('MJ: Widgets', 'Token', 'Token', SECRET, vars('MJ_TOKEN'), 'aaaaaaaaaaaa');
    redactor.Register('MJ: Widgets', 'Count', 'Count', env.MJ_COUNT, vars('MJ_COUNT'), 'aaaaaaaaaaaa');
    const indent = ' '.repeat(20);

    const sql = redactor.Transform(
      [
        '',
        `${indent}DECLARE @Token_aaaaaaaaaaaa NVARCHAR(100),`,
        '        @Count_aaaaaaaaaaaa INT,',
        '        @Name_aaaaaaaaaaaa NVARCHAR(100)',
        '',
        `${indent}DECLARE @ResultTable TABLE (`,
        `${indent}    [ID] UNIQUEIDENTIFIER`,
        `${indent});`,
        '',
        `${indent}SET @Token_aaaaaaaaaaaa = N'${SECRET}'`,
        'SET @Count_aaaaaaaaaaaa = 42',
        "SET @Name_aaaaaaaaaaaa = N'Visible'",
        '',
        `${indent}INSERT INTO @ResultTable`,
        `${indent}EXEC [dbo].spCreateWidget @Token=@Token_aaaaaaaaaaaa,`,
        '                @Count=@Count_aaaaaaaaaaaa,',
        '                @Name=@Name_aaaaaaaaaaaa;',
      ].join('\n')
    );

    const lines = sql.split('\n');
    expect(lines[9]).toBe(`${indent}-- MJ: Widgets.Token: not recorded, value comes from @env:MJ_TOKEN`);
    expect(lines[10]).toBe('-- MJ: Widgets.Count: not recorded, value comes from @env:MJ_COUNT');
    expect(lines[11]).toBe("SET @Name_aaaaaaaaaaaa = N'Visible'");
    expect(sql).not.toContain(SECRET);
  });

  it('does not register a null or undefined value', () => {
    const redactor = new EnvSqlRedactor(vars(), env);
    redactor.Register('MJ: Widgets', 'Token', 'Token', null, vars('MJ_TOKEN'), 'aaaaaaaaaaaa');
    redactor.Register('MJ: Widgets', 'Note', 'Note', undefined, vars('MJ_QUOTE'), 'aaaaaaaaaaaa');

    expect(redactor.Warnings(writeLog(''))).toEqual([]);
  });

  it('matches the ISO literal of a Date value', () => {
    const redactor = new EnvSqlRedactor(vars(), env);
    redactor.Register('MJ: Widgets', 'StartAt', 'StartAt', new Date('2024-05-01T10:00:00Z'), vars('MJ_START'), 'aaaaaaaaaaaa');

    expect(redactor.Transform("SET @StartAt_aaaaaaaaaaaa = '2024-05-01T10:00:00.000Z'")).toBe(
      '-- MJ: Widgets.StartAt: not recorded, value comes from @env:MJ_START'
    );
  });

  it('merges the variables of a primary key registered more than once', () => {
    const redactor = new EnvSqlRedactor(vars(), env);
    redactor.RegisterPrimaryKey('MJ: Widgets', 'ID', vars('MJ_ID'));
    redactor.RegisterPrimaryKey('MJ: Widgets', 'ID', vars('MJ_OTHER_ID'));

    const logPath = writeLog('');
    expect(redactor.Warnings(logPath)).toEqual([
      `SQL log ${logPath}: MJ: Widgets.ID is a primary key from @env:MJ_ID, @env:MJ_OTHER_ID. The log holds its value. Check the log before you share it.`,
    ]);
  });

  it('warns, with names only, for a resolved variable that is not set when the log is checked', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_GONE'), env);
    const logPath = writeLog('SELECT 1');

    expect(redactor.Warnings(logPath)).toEqual([
      `SQL log ${logPath}: @env:MJ_GONE is not set now, so the log could not be checked for its value. Check the log before you share it.`,
    ]);
  });

  it('returns a comment for a statement it cannot transform and warns about it', () => {
    const redactor = new EnvSqlRedactor(vars(), env);
    redactor.Register('MJ: Widgets', 'Token', 'Token', SECRET, vars('MJ_TOKEN'), 'aaaaaaaaaaaa');
    const spy = vi.spyOn(String.prototype, 'matchAll').mockImplementation(() => {
      throw new Error('boom');
    });
    let sql: string;
    try {
      sql = redactor.Transform(`SET @Token_aaaaaaaaaaaa = N'${SECRET}'`);
    } finally {
      spy.mockRestore();
    }

    expect(sql).toBe('-- Statement not logged: env values could not be left out');
    const logPath = writeLog(sql);
    expect(redactor.Warnings(logPath)[0]).toBe(
      `SQL log ${logPath}: env values could not be left out of a statement. Check the log before you share it.`
    );
  });

  it('leaves statements alone when nothing is registered and no value appears', () => {
    const redactor = new EnvSqlRedactor(vars('MJ_TOKEN'), env);
    const sql = save('6679d1fd77d5', 'other-value');
    expect(redactor.Transform(sql)).toBe(sql);
    expect(redactor.Warnings(writeLog(sql))).toEqual([]);
  });
});
