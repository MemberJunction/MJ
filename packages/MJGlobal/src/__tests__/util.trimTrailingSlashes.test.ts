import { describe, it, expect } from 'vitest';
import { TrimTrailingSlashes } from '../util';

describe('TrimTrailingSlashes', () => {
  it('removes every trailing slash', () => {
    expect(TrimTrailingSlashes('http://localhost:4000///')).toBe('http://localhost:4000');
    expect(TrimTrailingSlashes('https://api.example.com/graphql/')).toBe('https://api.example.com/graphql');
  });

  it('leaves a string without a trailing slash unchanged, inner slashes included', () => {
    expect(TrimTrailingSlashes('http://a//b')).toBe('http://a//b');
    expect(TrimTrailingSlashes('')).toBe('');
  });

  it('reduces a string of only slashes to empty', () => {
    expect(TrimTrailingSlashes('/')).toBe('');
    expect(TrimTrailingSlashes('////')).toBe('');
  });

  it('stays linear on input that makes /\\/+$/ backtrack', () => {
    const hostile = '/'.repeat(200_000) + 'x';
    const started = performance.now();
    expect(TrimTrailingSlashes(hostile)).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
