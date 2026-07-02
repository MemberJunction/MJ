import { describe, it, expect } from 'vitest';
import { formatLanguageName } from '../helpers/language';
import { escapeHtml } from '../helpers/escape';

describe('formatLanguageName', () => {
  it('maps known aliases to display names', () => {
    expect(formatLanguageName('ts')).toBe('TypeScript');
    expect(formatLanguageName('js')).toBe('JavaScript');
    expect(formatLanguageName('py')).toBe('Python');
    expect(formatLanguageName('cs')).toBe('C#');
    expect(formatLanguageName('graphql')).toBe('GraphQL');
  });

  it('is case-insensitive', () => {
    expect(formatLanguageName('TS')).toBe('TypeScript');
    expect(formatLanguageName('JSON')).toBe('JSON');
  });

  it('uppercases unknown languages', () => {
    expect(formatLanguageName('zig')).toBe('ZIG');
  });
});

describe('escapeHtml', () => {
  it('escapes the five core entities', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('escapes & before other entities (no double-encoding)', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});
