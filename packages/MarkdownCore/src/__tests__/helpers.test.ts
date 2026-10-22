import { describe, it, expect } from 'vitest';
import { FormatLanguageName } from '../helpers/language.js';
import { EscapeHtml } from '../helpers/escape.js';

describe('formatLanguageName', () => {
  it('maps known aliases to display names', () => {
    expect(FormatLanguageName('ts')).toBe('TypeScript');
    expect(FormatLanguageName('js')).toBe('JavaScript');
    expect(FormatLanguageName('py')).toBe('Python');
    expect(FormatLanguageName('cs')).toBe('C#');
    expect(FormatLanguageName('graphql')).toBe('GraphQL');
  });

  it('is case-insensitive', () => {
    expect(FormatLanguageName('TS')).toBe('TypeScript');
    expect(FormatLanguageName('JSON')).toBe('JSON');
  });

  it('uppercases unknown languages', () => {
    expect(FormatLanguageName('zig')).toBe('ZIG');
  });

  it('normalizes secondary aliases to a single display name', () => {
    expect(FormatLanguageName('yml')).toBe('YAML');
    expect(FormatLanguageName('yaml')).toBe('YAML');
    expect(FormatLanguageName('sh')).toBe('Shell');
    expect(FormatLanguageName('gql')).toBe('GraphQL');
    expect(FormatLanguageName('ps1')).toBe('PowerShell');
    expect(FormatLanguageName('c++')).toBe('C++');
    expect(FormatLanguageName('cpp')).toBe('C++');
    expect(FormatLanguageName('dockerfile')).toBe('Dockerfile');
    expect(FormatLanguageName('mermaid')).toBe('Mermaid');
    expect(FormatLanguageName('text')).toBe('Plain Text');
  });

  it('handles arbitrary mixed casing', () => {
    expect(FormatLanguageName('PyThOn')).toBe('Python');
    expect(FormatLanguageName('MarkDown')).toBe('Markdown');
  });

  it('returns empty string for empty input', () => {
    // languageMap[''] is undefined → ''.toUpperCase() === ''
    expect(FormatLanguageName('')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes the five core entities', () => {
    expect(EscapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('escapes each entity individually', () => {
    expect(EscapeHtml('&')).toBe('&amp;');
    expect(EscapeHtml('<')).toBe('&lt;');
    expect(EscapeHtml('>')).toBe('&gt;');
    expect(EscapeHtml('"')).toBe('&quot;');
    expect(EscapeHtml("'")).toBe('&#39;');
  });

  it('escapes & before other entities (no double-encoding)', () => {
    expect(EscapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(EscapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
    expect(EscapeHtml('a & b & c')).toBe('a &amp; b &amp; c');
  });

  it('leaves plain text untouched', () => {
    expect(EscapeHtml('hello world')).toBe('hello world');
  });

  it('returns empty string for empty input', () => {
    expect(EscapeHtml('')).toBe('');
  });

  it('re-escapes already-escaped markup (the & is encoded again)', () => {
    // By design: escapeHtml is a raw entity replacer, not an idempotent sanitizer.
    expect(EscapeHtml('&amp;')).toBe('&amp;amp;');
  });
});
