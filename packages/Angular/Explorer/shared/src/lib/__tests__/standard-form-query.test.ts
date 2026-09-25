/**
 * The `?form=standard` record deep link (MJ#4755). The router reads it into
 * the tab's Configuration.FormMode and the shell writes it back when it
 * rebuilds the URL from that config, so the two halves must agree exactly or
 * the link is dropped the first time the shell syncs the URL.
 */
import { describe, it, expect } from 'vitest';
import { FORM_MODE_QUERY_PARAM, ReadStandardFormQuery, StandardFormQueryParams } from '../record-open-style';

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

describe('StandardFormQueryParams (the shell writer)', () => {
  it('writes the param for a standard-form tab', () => {
    expect(StandardFormQueryParams({ FormMode: 'standard' })).toEqual({ [FORM_MODE_QUERY_PARAM]: 'standard' });
  });

  it('writes nothing for a normal tab', () => {
    expect(StandardFormQueryParams({})).toEqual({});
    expect(StandardFormQueryParams({ FormMode: 'default' })).toEqual({});
    expect(StandardFormQueryParams(undefined)).toEqual({});
  });

  it('round-trips through the reader', () => {
    const written = StandardFormQueryParams({ FormMode: 'standard' });
    expect(ReadStandardFormQuery(written)).toBe('standard');
  });
});
