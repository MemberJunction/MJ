import { describe, expect, it } from 'vitest';
import { SanitizeAxisSlug } from './events';

describe('SanitizeAxisSlug', () => {
  it('keeps a valid slug and trims it', () => {
    expect(SanitizeAxisSlug('  elevated ', 'base')).toBe('elevated');
  });

  it('falls back on a malformed slug', () => {
    expect(SanitizeAxisSlug('bad slug!', 'base')).toBe('base');
  });

  it('falls back when the value is missing, as it is after a Custom Element attribute is removed', () => {
    expect(SanitizeAxisSlug(undefined, 'base')).toBe('base');
    expect(SanitizeAxisSlug(null, 'neutral')).toBe('neutral');
  });
});
