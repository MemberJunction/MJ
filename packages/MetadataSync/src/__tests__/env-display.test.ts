import { describe, it, expect } from 'vitest';
import { ENV_HIDDEN_VALUE, EnvDisplayMask, EnvSourceLabel, MIN_MASKED_VALUE_LENGTH } from '../lib/env-display';

const SECRET = 'super-secret-123';

describe('EnvSourceLabel', () => {
  it('names one or more variables, sorted and without repeats', () => {
    expect(EnvSourceLabel(['A'])).toBe('<from @env:A>');
    expect(EnvSourceLabel(['B', 'A', 'B'])).toBe('<from @env:A, @env:B>');
  });
});

describe('EnvDisplayMask', () => {
  const fields = new Map([['Token', new Set(['MJ_TOKEN'])], ['ID', new Set(['MJ_ID'])]]);
  const env = { MJ_TOKEN: SECRET, MJ_ID: 'B0000000-0000-4000-8000-000000000001', MJ_SHORT: 'abc' };

  it('masks the old and new value of an env-sourced field only', () => {
    const mask = new EnvDisplayMask(fields, env);
    expect(mask.OldValue('Token', SECRET)).toBe(ENV_HIDDEN_VALUE);
    expect(mask.NewValue('Token', SECRET)).toBe('<from @env:MJ_TOKEN>');
    expect(mask.OldValue('Name', 'n')).toBe('n');
    expect(mask.NewValue('Name', 'n')).toBe('n');
    expect(mask.IsEnvField('Token')).toBe(true);
    expect(mask.IsEnvField('Name')).toBe(false);
  });

  it('replaces the values of its variables inside free text', () => {
    const mask = new EnvDisplayMask(fields, env);
    expect(mask.MaskText(`Violation of key ${env.MJ_ID}; value '${SECRET}'`)).toBe(
      "Violation of key <from @env:MJ_ID>; value '<from @env:MJ_TOKEN>'"
    );
  });

  it('replaces a value written with doubled quotes', () => {
    const quoted = new EnvDisplayMask(new Map([['Token', new Set(['MJ_Q'])]]), { MJ_Q: "it's-a-secret" });
    expect(quoted.MaskText("N'it''s-a-secret'")).toBe("N'<from @env:MJ_Q>'");
  });

  it('replaces a value written JSON-escaped', () => {
    const value = 'pa"ss\\word';
    const escaped = new EnvDisplayMask(new Map([['Token', new Set(['MJ_J'])]]), { MJ_J: value });
    const text = JSON.stringify({ Token: value });
    expect(text).not.toContain(value);
    expect(escaped.MaskText(text)).toBe('{"Token":"<from @env:MJ_J>"}');
  });

  it('masks the longer of two overlapping values first, in either field order', () => {
    const overlapEnv = { MJ_A: 'secret-token', MJ_B: 'secret-token-extended' };
    const aFirst = new EnvDisplayMask(new Map([['A', new Set(['MJ_A'])], ['B', new Set(['MJ_B'])]]), overlapEnv);
    const bFirst = new EnvDisplayMask(new Map([['B', new Set(['MJ_B'])], ['A', new Set(['MJ_A'])]]), overlapEnv);
    const text = 'k=secret-token-extended; j=secret-token';
    expect(aFirst.MaskText(text)).toBe('k=<from @env:MJ_B>; j=<from @env:MJ_A>');
    expect(bFirst.MaskText(text)).toBe('k=<from @env:MJ_B>; j=<from @env:MJ_A>');
  });

  it('masks the doubled-quote form of a value before its raw form', () => {
    const quoted = new EnvDisplayMask(new Map([['Token', new Set(['MJ_A'])]]), { MJ_A: "'abcdef" });
    expect(quoted.MaskText("N'''abcdef'")).toBe("N'<from @env:MJ_A>'");
  });

  it('masks a value printed in a different case', () => {
    const id = 'b0000000-0000-4000-8000-00000000000a';
    const mask = new EnvDisplayMask(new Map([['ID', new Set(['MJ_ID'])]]), { MJ_ID: id });
    expect(mask.MaskText(`key (${id.toUpperCase()})`)).toBe('key (<from @env:MJ_ID>)');
  });

  it('matches a value made of regular expression characters literally', () => {
    const value = '.*+?()[]$^|\\';
    const mask = new EnvDisplayMask(new Map([['Token', new Set(['MJ_R'])]]), { MJ_R: value });
    expect(mask.MaskText(`x ${value} y`)).toBe('x <from @env:MJ_R> y');
    expect(mask.MaskText('x abcdefghijklmn y')).toBe('x abcdefghijklmn y');
  });

  it('finds a field when the name case differs', () => {
    const mask = new EnvDisplayMask(new Map([['Token', new Set(['MJ_TOKEN'])]]), env);
    expect(mask.IsEnvField('token')).toBe(true);
    expect(mask.OldValue('TOKEN', SECRET)).toBe(ENV_HIDDEN_VALUE);
    expect(mask.NewValue('token', SECRET)).toBe('<from @env:MJ_TOKEN>');
    expect(mask.IsEnvField('Other')).toBe(false);
  });

  it('masks the JSON-escaped form with doubled single quotes', () => {
    const value = `it's "quoted"`;
    const mask = new EnvDisplayMask(new Map([['Token', new Set(['MJ_Q'])]]), { MJ_Q: value });
    const sql = `N'${JSON.stringify({ Token: value }).replace(/'/g, "''")}'`;
    expect(mask.MaskText(sql)).toBe(`N'{"Token":"<from @env:MJ_Q>"}'`);
  });

  it('masks a value of 6 characters and not one of 5', () => {
    const mask = new EnvDisplayMask(new Map([['A', new Set(['MJ_5'])], ['B', new Set(['MJ_6'])]]), { MJ_5: 'abcde', MJ_6: 'uvwxyz' });
    expect(mask.MaskText('abcde uvwxyz')).toBe('abcde <from @env:MJ_6>');
  });

  it('masks the trimmed form and does not search for a value of only spaces', () => {
    const fieldMap = new Map([['A', new Set(['MJ_T'])], ['B', new Set(['MJ_S'])]]);
    const mask = new EnvDisplayMask(fieldMap, { MJ_T: '  padded-value  ', MJ_S: '      ' });
    expect(mask.MaskText("v='padded-value' w='      '")).toBe("v='<from @env:MJ_T>' w='      '");
  });

  it('leaves no part of two values that overlap in the text', () => {
    const pair = new Map([['A', new Set(['MJ_X'])], ['B', new Set(['MJ_Y'])]]);
    const mask = new EnvDisplayMask(pair, { MJ_X: 'xx-secret-aaa', MJ_Y: 'aaa-hidden-y' });
    expect(mask.MaskText('v=xx-secret-aaa-hidden-y;')).toBe('v=<from @env:MJ_X, @env:MJ_Y>;');
  });

  it('masks values next to each other when a value holds label text', () => {
    const names = new Map([['A', new Set(['MJ_A'])], ['B', new Set(['MJ_B'])], ['C', new Set(['MJ_C'])]]);
    const mask = new EnvDisplayMask(names, { MJ_A: 'MJ_B>secr', MJ_B: 'secret-b-value', MJ_C: 'secret-c' });
    const masked = mask.MaskText('v=secret-b-valuesecret-c');
    expect(masked).toBe('v=<from @env:MJ_B><from @env:MJ_C>');
  });

  it('masks the doubled-quote and the JSON form of one value on their own', () => {
    const value = `it's "q" value`;
    const mask = new EnvDisplayMask(new Map([['Token', new Set(['MJ_Q'])]]), { MJ_Q: value });
    expect(mask.MaskText(`N'${value.replace(/'/g, "''")}'`)).toBe(`N'<from @env:MJ_Q>'`);
    expect(mask.MaskText(JSON.stringify({ t: value }))).toBe('{"t":"<from @env:MJ_Q>"}');
  });

  it('prints a variable name with $ literally', () => {
    const mask = new EnvDisplayMask(new Map([['Token', new Set(['MJ$&X'])]]), { 'MJ$&X': 'dollar-secret' });
    expect(mask.MaskText('a dollar-secret b')).toBe('a <from @env:MJ$&X> b');
  });

  it('skips an unset variable', () => {
    const mask = new EnvDisplayMask(new Map([['A', new Set(['MJ_UNSET'])], ['B', new Set(['MJ_TOKEN'])]]), env);
    expect(mask.MaskText(`a ${SECRET}`)).toBe('a <from @env:MJ_TOKEN>');
  });

  it('does not search for short values', () => {
    const short = new EnvDisplayMask(new Map([['Code', new Set(['MJ_SHORT'])]]), env);
    expect('abc'.length).toBeLessThan(MIN_MASKED_VALUE_LENGTH);
    expect(short.MaskText('abc def')).toBe('abc def');
  });

  it('is empty and changes nothing without fields', () => {
    const mask = new EnvDisplayMask(undefined, env);
    expect(mask.IsEmpty).toBe(true);
    expect(mask.MaskText(SECRET)).toBe(SECRET);
    expect(mask.NewValue('Token', 'x')).toBe('x');
  });
});

describe('EnvDisplayMask.ForVariables', () => {
  it('masks the values of the named variables in text and marks no field as env-sourced', () => {
    const mask = EnvDisplayMask.ForVariables(['MJ_FOR_VARS'], { MJ_FOR_VARS: 'for-vars-secret' });

    expect(mask.MaskText("bad value 'for-vars-secret'")).toBe("bad value '<from @env:MJ_FOR_VARS>'");
    expect(mask.IsEnvField('MJ_FOR_VARS')).toBe(false);
    expect(mask.NewValue('Token', '"x"')).toBe('"x"');
  });
});
