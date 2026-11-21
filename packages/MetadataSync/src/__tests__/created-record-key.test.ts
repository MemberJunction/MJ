/**
 * SameKeyValue: whether the database kept the key value a created record had before its save.
 */
import { describe, it, expect } from 'vitest';
import type { EntityFieldInfo } from '@memberjunction/core';
import { SameKeyValue } from '../lib/created-record-key';

const uuidKey = { Name: 'ID', IsUniqueIdentifier: true } as EntityFieldInfo;
const codeKey = { Name: 'Code', IsUniqueIdentifier: false } as EntityFieldInfo;

describe('SameKeyValue', () => {
  it('compares UUID keys without case', () => {
    expect(SameKeyValue(uuidKey, 'B0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001')).toBe(true);
  });

  it('matches a padded fixed-width saved key to the value before the save', () => {
    expect(SameKeyValue(codeKey, 'abc   ', 'abc')).toBe(true);
  });

  it('compares non-UUID string keys with case', () => {
    expect(SameKeyValue(codeKey, 'ABC', 'abc')).toBe(false);
  });

  it('compares non-string keys as text', () => {
    expect(SameKeyValue(codeKey, 42, '42')).toBe(true);
    expect(SameKeyValue(codeKey, 42, 43)).toBe(false);
  });
});
