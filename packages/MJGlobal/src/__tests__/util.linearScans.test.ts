import { describe, it, expect } from 'vitest';
import { CleanJavaScript, IsEmailShaped, TrimChars, TrimLeadingChars, TrimTrailingChars } from '../util';
import { ExtractJavaScriptFences, FindJsonFence } from '../util/MarkdownFences';

/** Every string of length 0..maxLength over `alphabet` (tokens may be several characters long). */
function allStrings(alphabet: string[], maxLength: number): string[] {
  let level = [''];
  const all = [''];
  for (let len = 1; len <= maxLength; len++) {
    level = level.flatMap((prefix) => alphabet.map((token) => prefix + token));
    all.push(...level);
  }
  return all;
}

/** Runs `work` and returns its result, failing the test when it takes longer than the ceiling. */
function inBoundedTime<T>(work: () => T, ceilingMs = 2500): T {
  const started = performance.now();
  const result = work();
  expect(performance.now() - started).toBeLessThan(ceilingMs);
  return result;
}

describe('TrimTrailingChars / TrimLeadingChars / TrimChars', () => {
  it('strips only the listed characters, only at the edges', () => {
    expect(TrimTrailingChars('abc===', '=')).toBe('abc');
    expect(TrimTrailingChars('a=b', '=')).toBe('a=b');
    expect(TrimTrailingChars('a-b-_-', '-_')).toBe('a-b');
    expect(TrimLeadingChars('//a/b/', '/')).toBe('a/b/');
    expect(TrimChars('//a//b//', '/')).toBe('a//b');
    expect(TrimChars('----', '-')).toBe('');
    expect(TrimChars('', '-')).toBe('');
  });

  it('matches the end-anchored regexes it replaces', () => {
    for (const s of allStrings(['/', 'a', '='], 6)) {
      expect(TrimTrailingChars(s, '/')).toBe(s.replace(/\/+$/, ''));
      expect(TrimTrailingChars(s, '=')).toBe(s.replace(/=+$/, ''));
      expect(TrimChars(s, '/')).toBe(s.replace(/^\/+|\/+$/g, ''));
    }
  });

  it('stays linear on input that makes /=+$/ backtrack', () => {
    const hostile = '='.repeat(200_000) + 'x';
    expect(inBoundedTime(() => TrimTrailingChars(hostile, '='))).toBe(hostile);
    expect(inBoundedTime(() => TrimChars(hostile, '-'))).toBe(hostile);
  });
});

describe('IsEmailShaped', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it.each([
    ['a@b.co', true],
    ['first.last@sub.example.org', true],
    ['a@.b.c', true],
    ['a@.co', false],
    ['a@b.', false],
    ['a@bco', false],
    ['@b.co', false],
    ['a@b@c.co', false],
    ['a b@c.co', false],
    ['a@b.c\to', false],
    ['', false],
  ])('treats %j as email-shaped: %s', (value, expected) => {
    expect(IsEmailShaped(value)).toBe(expected);
  });

  it('accepts exactly what the regex it replaces accepts', () => {
    for (const s of allStrings(['a', '@', '.', ' '], 7)) {
      expect(IsEmailShaped(s)).toBe(emailRegex.test(s));
    }
  });

  it('rejects a long crafted value in linear time', () => {
    const crafted = '!@!.' + '!.'.repeat(100_000) + ' ';
    expect(inBoundedTime(() => IsEmailShaped(crafted))).toBe(false);
  });
});

describe('ExtractJavaScriptFences / CleanJavaScript', () => {
  const oldFenceRegex = /```(?:js|javascript)?\s*([\s\S]*?)```/gi;
  const oldBlocks = (s: string) => Array.from(s.matchAll(oldFenceRegex)).map((m) => m[1].trim());

  it('returns the body of each tagged or untagged fence', () => {
    expect(CleanJavaScript('```js\nconst a = 1;\n```')).toBe('const a = 1;');
    expect(CleanJavaScript('```JavaScript\nx()\n```\ntext\n```\ny()\n```')).toBe('x()\ny()');
    expect(CleanJavaScript('  plain code  ')).toBe('plain code');
  });

  it('finds the same blocks as the regex it replaces', () => {
    for (const s of allStrings(['```', '`', 'js', 'JavaScript', ' ', '\n', 'x'], 5)) {
      expect(ExtractJavaScriptFences(s)).toEqual(oldBlocks(s));
    }
  });

  it('stays linear on many unclosed fences', () => {
    const hostile = '``` ' + 'x'.repeat(200_000);
    const manyOpeners = '```js '.repeat(50_000);
    inBoundedTime(() => CleanJavaScript(hostile));
    inBoundedTime(() => CleanJavaScript(manyOpeners));
  });
});

describe('FindJsonFence', () => {
  const oldJsonRegex = /```json\s*\n([\s\S]*?)\n```/;
  const oldMatch = (s: string) => {
    const m = s.match(oldJsonRegex);
    return m ? { Whole: m[0], Body: m[1] } : null;
  };

  it('returns the block and its body', () => {
    expect(FindJsonFence('see\n```json\n{"a":1}\n```\nend')).toEqual({ Whole: '```json\n{"a":1}\n```', Body: '{"a":1}' });
    expect(FindJsonFence('```json {"a":1}```')).toBeNull();
  });

  it('matches the regex it replaces', () => {
    for (const s of allStrings(['```json', '```', '\n', ' ', 'x'], 6)) {
      expect(FindJsonFence(s)).toEqual(oldMatch(s));
    }
  });

  it('stays linear on many json fences with no closing fence', () => {
    const hostile = '```json\n{'.repeat(50_000);
    expect(inBoundedTime(() => FindJsonFence(hostile))).toBeNull();
  });
});
