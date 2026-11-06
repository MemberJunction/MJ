import { describe, it, expect } from 'vitest';
import { RedactionCheck, RedactionError } from '../sandbox/Redaction';

describe('RedactionCheck', () => {
  const key = 'sk-ant-api03-' + 'A'.repeat(40);
  const check = new RedactionCheck([key, 'ghs_abcdefghijklmnopqrstuvwxyz0123456789']);
  it('finds a known secret value anywhere in the text', () => {
    expect(check.Check(`token=${key}`)?.Kind).toBe('KnownSecret');
    expect(check.Check('nothing here')).toBeNull();
  });
  it('finds common key formats even when not in the known list', () => {
    expect(check.Check('AKIAIOSFODNN7EXAMPLE')?.Kind).toBe('KeyPattern');
    expect(check.Check('sk-proj-' + 'x'.repeat(48))?.Kind).toBe('KeyPattern');
    expect(check.Check('AIza' + 'y'.repeat(35))?.Kind).toBe('KeyPattern');
    expect(check.Check('github_pat_' + 'z'.repeat(60))?.Kind).toBe('KeyPattern');
  });
  it('ignores short or empty known values so a blank env var cannot match everything', () => {
    const c = new RedactionCheck(['', 'ab']);
    expect(c.Check('abc')).toBeNull();
  });
  it('never includes the secret in the excerpt', () => {
    const m = check.Check(`x ${key} y`);
    expect(m?.Excerpt).not.toContain(key);
  });
  it('AssertClean throws a RedactionError', () => {
    expect(() => check.AssertClean(key, 'comment')).toThrow(RedactionError);
  });
});
