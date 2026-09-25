/**
 * The `?form=standard` record deep link (MJ#4755). The router, the shell's
 * history path and the record resource all read the tab's `form` query param
 * through this one reader, so they agree on what counts as "standard".
 */
import { describe, it, expect } from 'vitest';
import { ReadStandardFormQuery } from '../record-open-style';

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
