/**
 * The `?form=standard` record deep link (MJ#4755). The router, the shell's
 * history path and the record resource all read the tab's `form` query param
 * through this one reader, so they agree on what counts as "standard".
 */
import { describe, it, expect } from 'vitest';
import { ReadStandardFormQuery, RecordTabQueryParams } from '../record-open-style';

describe('ReadStandardFormQuery', () => {
  it('reads the exact value', () => {
    expect(ReadStandardFormQuery({ form: 'standard' })).toBe('standard');
  });

  it('is case-insensitive', () => {
    expect(ReadStandardFormQuery({ form: 'STANDARD' })).toBe('standard');
  });

  it('takes the first value of a repeated param', () => {
    expect(ReadStandardFormQuery({ form: ['standard'] })).toBe('standard');
  });

  it('ignores any other value', () => {
    expect(ReadStandardFormQuery({ form: 'custom' })).toBeUndefined();
  });

  it('is undefined when the param is absent', () => {
    expect(ReadStandardFormQuery({})).toBeUndefined();
  });

  it('is undefined for a null param', () => {
    expect(ReadStandardFormQuery({ form: null })).toBeUndefined();
  });
});

// The record routes build the tab's queryParams from the URL. The key is
// present even without `form`, so a plain record URL CLEARS an open tab's
// standard mode (WorkspaceStateManager.OpenTab merges over an existing tab).
describe('RecordTabQueryParams (router)', () => {
  it('form=standard gives the standard param', () => {
    expect(RecordTabQueryParams({ form: 'standard' })).toEqual({ queryParams: { form: 'standard' } });
  });

  it('no form gives the clearing value (present key, undefined)', () => {
    const result = RecordTabQueryParams({});
    expect('queryParams' in result).toBe(true);
    expect(result.queryParams).toBeUndefined();
  });

  it('a non-standard form gives the clearing value', () => {
    const result = RecordTabQueryParams({ form: 'custom' });
    expect('queryParams' in result).toBe(true);
    expect(result.queryParams).toBeUndefined();
  });

  it('ignores unrelated params — only form rides in a record tab', () => {
    expect(RecordTabQueryParams({ form: 'STANDARD', NewRecordValues: 'x' })).toEqual({ queryParams: { form: 'standard' } });
  });
});
