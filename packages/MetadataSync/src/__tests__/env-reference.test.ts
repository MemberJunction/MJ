import { describe, it, expect } from 'vitest';
import {
  ParseEnvReference,
  IsEnvFlagTrue,
  OptionalEnvMissingError,
  OptionalEnvSkipMessage,
  KeepEnvReference,
} from '../lib/env-reference';

describe('ParseEnvReference', () => {
  it('parses a plain reference', () => {
    expect(ParseEnvReference('@env:API_KEY')).toEqual({ VariableName: 'API_KEY', Optional: false });
  });

  it('parses an optional reference', () => {
    expect(ParseEnvReference('@env:API_KEY?optional')).toEqual({ VariableName: 'API_KEY', Optional: true });
  });

  it('rejects an unknown modifier', () => {
    expect(ParseEnvReference('@env:API_KEY?bogus')).toBeNull();
  });

  it('rejects a bare prefix, other keywords and non-strings', () => {
    expect(ParseEnvReference('@env:')).toBeNull();
    expect(ParseEnvReference('@file:a.md')).toBeNull();
    expect(ParseEnvReference('plain')).toBeNull();
    expect(ParseEnvReference(42)).toBeNull();
    expect(ParseEnvReference(null)).toBeNull();
  });
});

describe('IsEnvFlagTrue', () => {
  it('accepts true and 1, ignoring case and spaces', () => {
    for (const value of ['true', 'TRUE', ' True ', '1', ' 1 ']) {
      expect(IsEnvFlagTrue(value)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const value of [undefined, '', ' ', 'false', '0', 'yes', 'on', '2']) {
      expect(IsEnvFlagTrue(value)).toBe(false);
    }
  });
});

describe('OptionalEnvMissingError', () => {
  it('carries the variable name and no value', () => {
    const error = new OptionalEnvMissingError('API_KEY');
    expect(error).toBeInstanceOf(Error);
    expect(error.VariableName).toBe('API_KEY');
    expect(error.message).toBe('Optional environment variable not set: API_KEY');
  });
});

describe('OptionalEnvSkipMessage', () => {
  it('names the entity, field and variable', () => {
    expect(OptionalEnvSkipMessage('MJ: Tags', 'Description', 'API_KEY')).toBe(
      'MJ: Tags.Description was not pushed: optional variable API_KEY is not set'
    );
  });
});

describe('KeepEnvReference', () => {
  const env = { API_KEY: 'secret-1', PADDED: '  secret-2  ' };

  it('returns null when the existing value is not an @env: reference', () => {
    expect(KeepEnvReference('plain', 'secret-1', env)).toBeNull();
    expect(KeepEnvReference(undefined, 'secret-1', env)).toBeNull();
    expect(KeepEnvReference('@env:API_KEY?bogus', 'secret-1', env)).toBeNull();
  });

  it('reports Match when the variable equals the database value', () => {
    expect(KeepEnvReference('@env:API_KEY', 'secret-1', env)).toEqual({
      Reference: '@env:API_KEY',
      VariableName: 'API_KEY',
      Check: 'Match',
    });
  });

  it('compares trimmed values', () => {
    expect(KeepEnvReference('@env:PADDED', 'secret-2', env)?.Check).toBe('Match');
  });

  it('compares numbers and booleans by their text', () => {
    expect(KeepEnvReference('@env:N', 5, { N: '5' })?.Check).toBe('Match');
    expect(KeepEnvReference('@env:B', true, { B: 'true' })?.Check).toBe('Match');
  });

  it('reports Drift when the variable differs from the database value', () => {
    expect(KeepEnvReference('@env:API_KEY', 'other', env)?.Check).toBe('Drift');
    expect(KeepEnvReference('@env:API_KEY', null, env)?.Check).toBe('Drift');
  });

  it('reports Unset when the variable is not set', () => {
    expect(KeepEnvReference('@env:MISSING', 'secret-1', env)?.Check).toBe('Unset');
  });

  it('keeps the ?optional suffix as written', () => {
    expect(KeepEnvReference('@env:API_KEY?optional', 'secret-1', env)?.Reference).toBe('@env:API_KEY?optional');
  });
});
