import { describe, it, expect } from 'vitest';
import { formatLanguageName } from '../helpers/language.js';
import { escapeHtml } from '../helpers/escape.js';

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

  it('normalizes secondary aliases to a single display name', () => {
    expect(formatLanguageName('yml')).toBe('YAML');
    expect(formatLanguageName('yaml')).toBe('YAML');
    expect(formatLanguageName('sh')).toBe('Shell');
    expect(formatLanguageName('gql')).toBe('GraphQL');
    expect(formatLanguageName('ps1')).toBe('PowerShell');
    expect(formatLanguageName('c++')).toBe('C++');
    expect(formatLanguageName('cpp')).toBe('C++');
    expect(formatLanguageName('dockerfile')).toBe('Dockerfile');
    expect(formatLanguageName('mermaid')).toBe('Mermaid');
    expect(formatLanguageName('text')).toBe('Plain Text');
  });

  it('handles arbitrary mixed casing', () => {
    expect(formatLanguageName('PyThOn')).toBe('Python');
    expect(formatLanguageName('MarkDown')).toBe('Markdown');
  });

  it('returns empty string for empty input', () => {
    // languageMap[''] is undefined → ''.toUpperCase() === ''
    expect(formatLanguageName('')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes the five core entities', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('escapes each entity individually', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('escapes & before other entities (no double-encoding)', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
    expect(escapeHtml('a & b & c')).toBe('a &amp; b &amp; c');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('re-escapes already-escaped markup (the & is encoded again)', () => {
    // By design: escapeHtml is a raw entity replacer, not an idempotent sanitizer.
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});
