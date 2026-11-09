import { describe, it, expect } from 'vitest';
import { HasNestedEnvReference, IsJsonContainer, KeepNestedEnvReferences } from '../lib/env-reference';

const SECRET = 'super-secret-123';

describe('HasNestedEnvReference', () => {
  it('finds a reference at any depth in objects and arrays', () => {
    expect(HasNestedEnvReference({ a: { b: '@env:K' } })).toBe(true);
    expect(HasNestedEnvReference([{ x: 1 }, ['@env:K?optional']])).toBe(true);
  });

  it('is false for containers without a valid reference and for non-containers', () => {
    expect(HasNestedEnvReference({ a: 'plain', b: '@env:K?bad', c: 3 })).toBe(false);
    expect(HasNestedEnvReference('@env:K')).toBe(false);
    expect(HasNestedEnvReference(null)).toBe(false);
  });
});

describe('IsJsonContainer', () => {
  it('accepts plain objects and arrays only', () => {
    expect(IsJsonContainer({})).toBe(true);
    expect(IsJsonContainer([])).toBe(true);
    expect(IsJsonContainer(new Date())).toBe(false);
    expect(IsJsonContainer('x')).toBe(false);
    expect(IsJsonContainer(null)).toBe(false);
  });
});

describe('KeepNestedEnvReferences', () => {
  const env = { API_KEY: SECRET, PORT: '8080' };

  it('returns null when the existing value is not a container or holds no reference', () => {
    expect(KeepNestedEnvReferences('@env:API_KEY', '{}', env)).toBeNull();
    expect(KeepNestedEnvReferences({ a: 'plain' }, '{"a":"x"}', env)).toBeNull();
    expect(KeepNestedEnvReferences({ a: '@env:API_KEY?bad' }, '{"a":"x"}', env)).toBeNull();
  });

  it('puts the reference back and takes every other leaf from the database (Match)', () => {
    const result = KeepNestedEnvReferences(
      { auth: { apiKey: '@env:API_KEY' }, region: 'eu' },
      JSON.stringify({ auth: { apiKey: SECRET }, region: 'us' }),
      env
    );
    expect(result).toEqual({
      Value: { auth: { apiKey: '@env:API_KEY' }, region: 'us' },
      Kept: [{ Path: 'auth.apiKey', Reference: '@env:API_KEY', VariableName: 'API_KEY', Check: 'Match' }],
      KeptFileValue: false,
      LeftValueVariables: [],
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('reports Drift without holding either value', () => {
    const result = KeepNestedEnvReferences({ auth: { apiKey: '@env:API_KEY' } }, { auth: { apiKey: 'other' } }, env);
    expect(result?.Kept).toEqual([{ Path: 'auth.apiKey', Reference: '@env:API_KEY', VariableName: 'API_KEY', Check: 'Drift' }]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain('"other"');
  });

  it('reports Unset when the variable is not set', () => {
    const result = KeepNestedEnvReferences({ token: '@env:MISSING' }, { token: SECRET }, env);
    expect(result?.Value).toEqual({ token: '@env:MISSING' });
    expect(result?.Kept[0].Check).toBe('Unset');
  });

  it('matches arrays by index and prints index paths', () => {
    const result = KeepNestedEnvReferences(
      { items: [{ token: 'a' }, { token: '@env:API_KEY' }] },
      { items: [{ token: 'a2' }, { token: SECRET }] },
      env
    );
    expect(result?.Value).toEqual({ items: [{ token: 'a2' }, { token: '@env:API_KEY' }] });
    expect(result?.Kept[0].Path).toBe('items[1].token');
  });

  it('quotes keys that are not plain names', () => {
    const result = KeepNestedEnvReferences({ 'x.y': '@env:API_KEY' }, { 'x.y': SECRET }, env);
    expect(result?.Kept[0].Path).toBe('["x.y"]');
  });

  it('does not add back a key the database removed, and keeps a key the database added', () => {
    const result = KeepNestedEnvReferences({ token: '@env:API_KEY', old: 'o' }, { added: 'n' }, env);
    expect(result?.Value).toEqual({ added: 'n' });
    expect(result?.Kept).toEqual([]);
  });

  it('does not add an array item the database removed', () => {
    const result = KeepNestedEnvReferences(['a', '@env:API_KEY'], ['a'], env);
    expect(result?.Value).toEqual(['a']);
  });

  it('gives the same result for a JSON string and a parsed object, and does not change the input', () => {
    const dbObject = { auth: { apiKey: SECRET } };
    const fromString = KeepNestedEnvReferences({ auth: { apiKey: '@env:API_KEY' } }, JSON.stringify(dbObject), env);
    const fromObject = KeepNestedEnvReferences({ auth: { apiKey: '@env:API_KEY' } }, dbObject, env);
    expect(fromObject).toEqual(fromString);
    expect(dbObject.auth.apiKey).toBe(SECRET);
  });

  it('keeps the file value when the database value is not a JSON container', () => {
    const existing = { token: '@env:API_KEY' };
    for (const dbValue of [null, undefined, 'not json', '"just a string"', '42', 7]) {
      const result = KeepNestedEnvReferences(existing, dbValue, env);
      expect(result).toEqual({ Value: existing, Kept: [], KeptFileValue: true, LeftValueVariables: [] });
      expect(result?.Value).not.toBe(existing);
    }
  });

  it('keeps a ?optional suffix and treats an invalid modifier as data', () => {
    const result = KeepNestedEnvReferences(
      { a: '@env:API_KEY?optional', b: '@env:API_KEY?bad' },
      { a: SECRET, b: 'db-b' },
      env
    );
    expect(result?.Value).toEqual({ a: '@env:API_KEY?optional', b: 'db-b' });
  });

  it('compares a number in the database with the variable text', () => {
    expect(KeepNestedEnvReferences({ port: '@env:PORT' }, { port: 8080 }, env)?.Kept[0].Check).toBe('Match');
  });

  it('works when the root is an array', () => {
    const result = KeepNestedEnvReferences(['@env:API_KEY'], [SECRET], env);
    expect(result?.Value).toEqual(['@env:API_KEY']);
    expect(result?.Kept[0].Path).toBe('[0]');
  });

  it('puts the reference in place of a database object at the same path', () => {
    const result = KeepNestedEnvReferences({ cfg: '@env:API_KEY' }, { cfg: { k: SECRET } }, env);
    expect(result?.Value).toEqual({ cfg: '@env:API_KEY' });
    expect(result?.Kept[0].Check).toBe('Drift');
    expect(result?.KeptFileValue).toBe(false);
  });

  it('keeps database array items past the end of the file array', () => {
    const result = KeepNestedEnvReferences(['@env:API_KEY'], [SECRET, 'extra'], env);
    expect(result?.Value).toEqual(['@env:API_KEY', 'extra']);
    expect(result?.LeftValueVariables).toEqual([]);
  });

  it('drops a reference under a path that the database holds as a primitive', () => {
    const result = KeepNestedEnvReferences({ auth: { apiKey: '@env:API_KEY' } }, { auth: 'none' }, env);
    expect(result).toEqual({ Value: { auth: 'none' }, Kept: [], KeptFileValue: false, LeftValueVariables: [] });
  });
});

describe('KeepNestedEnvReferences left-over value check', () => {
  const OTHER = 'other-secret-456';
  const env = { API_KEY: SECRET, OTHER_KEY: OTHER, SHORT: 'abcde', SIX: 'abcdef', QUOTED: 'pa"ss\\word' };

  function expectFileValueKept(existing: object, dbValue: unknown, names: string[]): void {
    const result = KeepNestedEnvReferences(existing, dbValue, env);
    expect(result).toEqual({ Value: existing, Kept: [], KeptFileValue: true, LeftValueVariables: names });
    expect(result?.Value).not.toBe(existing);
    const text = JSON.stringify(result);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(OTHER);
  }

  it('keeps the file value when array items moved in the database', () => {
    expectFileValueKept(['@env:API_KEY', '@env:OTHER_KEY'], ['new', SECRET, OTHER], ['OTHER_KEY']);
  });

  it('keeps the file value when the database holds a primitive above a reference', () => {
    expectFileValueKept({ auth: { apiKey: '@env:API_KEY' } }, { auth: SECRET }, ['API_KEY']);
    expectFileValueKept({ auth: { apiKey: '@env:API_KEY' } }, { auth: JSON.stringify({ apiKey: SECRET }) }, ['API_KEY']);
  });

  it('keeps the file value when the root types differ', () => {
    expectFileValueKept({ apiKey: '@env:API_KEY' }, [SECRET], ['API_KEY']);
    expectFileValueKept(['@env:API_KEY'], { 0: SECRET }, ['API_KEY']);
  });

  it('keeps the file value when the database renamed the key', () => {
    expectFileValueKept({ apiKey: '@env:API_KEY' }, { api_key: SECRET }, ['API_KEY']);
  });

  it('names each variable once, sorted', () => {
    expectFileValueKept(
      { b: '@env:OTHER_KEY', a: ['@env:API_KEY', '@env:OTHER_KEY'] },
      { x: [OTHER, SECRET] },
      ['API_KEY', 'OTHER_KEY']
    );
  });

  it('checks only values of 6 or more characters', () => {
    const short = KeepNestedEnvReferences({ a: { b: '@env:SHORT' } }, { a: 'abcde' }, env);
    expect(short).toEqual({ Value: { a: 'abcde' }, Kept: [], KeptFileValue: false, LeftValueVariables: [] });
    expectFileValueKept({ a: { b: '@env:SIX' } }, { a: 'abcdef' }, ['SIX']);
  });

  it('finds a JSON-escaped value inside a database string', () => {
    const escaped = JSON.stringify(env.QUOTED).slice(1, -1);
    const result = KeepNestedEnvReferences({ a: { b: '@env:QUOTED' } }, { a: `x ${env.QUOTED} y` }, env);
    expect(result?.KeptFileValue).toBe(true);
    expect(result?.LeftValueVariables).toEqual(['QUOTED']);
    expect(JSON.stringify(result)).not.toContain(escaped);
  });

  it('finds a value inside a JSON string that the database stores above a reference', () => {
    const database = { auth: JSON.stringify({ apiKey: env.QUOTED }) };
    const result = KeepNestedEnvReferences({ auth: { apiKey: '@env:QUOTED' } }, database, env);
    expect(result?.KeptFileValue).toBe(true);
    expect(result?.LeftValueVariables).toEqual(['QUOTED']);
    expect(result?.Value).toEqual({ auth: { apiKey: '@env:QUOTED' } });
  });

  it('compares the trimmed variable value', () => {
    const padded = { PADDED: '  abcdefg  ' };
    const result = KeepNestedEnvReferences({ a: { b: '@env:PADDED' } }, { a: 'abcdefg' }, padded);
    expect(result?.LeftValueVariables).toEqual(['PADDED']);
  });
});
