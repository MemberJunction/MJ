import { describe, it, expect, vi } from 'vitest';
import {
  GetGlobalObjectStore,
  CleanJSON,
  SafeJSONParse,
  CleanAndParseJSON,
  CopyScalarsAndArrays,
  ConvertCamelCaseToHaveSpaces,
  CreateDisplayName,
  GeneratePluralName,
  GetIrregularPlural,
  StripWhitespace,
  Uuidv4,
  StripTrailingChars,
  ReplaceAllSpaces,
  IsOnlyTimezoneShift,
  EscapeHTML,
  EscapeSQLString,
  HighlightSearchMatches,
} from '../util';

describe('GetGlobalObjectStore', () => {
  it('should return a non-null object in Node environment', () => {
    const store = GetGlobalObjectStore();
    expect(store).not.toBeNull();
  });

  it('should return the global object', () => {
    const store = GetGlobalObjectStore();
    expect(store).toBeDefined();
  });

  it('should allow setting and reading arbitrary keys', () => {
    const store = GetGlobalObjectStore();
    if (store) {
      const testKey = '__test_key_' + Date.now();
      store[testKey] = 'test-value';
      expect(store[testKey]).toBe('test-value');
      delete store[testKey];
    }
  });

  // The three cases above predate the memoised `typeof` probe and pass either way: they assert
  // the result is non-null, defined, and writable. The ones below pin what actually changed.

  it('resolves to Node\'s global object, not merely something non-null', () => {
    expect(GetGlobalObjectStore()).toBe(global);
  });

  it('is memoised — every call returns the identical reference', () => {
    const first = GetGlobalObjectStore();
    const second = GetGlobalObjectStore();
    expect(second).toBe(first);
    expect(GetGlobalObjectStore()).toBe(first);
  });

  it('answers from the memo after the environment changes, by design', async () => {
    // The environment is fixed at startup, which is what makes memoising sound. Stated as a test
    // because it is the one surprise the memo introduces: a caller that installs a `window`
    // mid-process still gets the answer computed on first call. If this ever needs to change,
    // it is a deliberate decision, not an accident.
    const before = GetGlobalObjectStore();
    const g = globalThis as unknown as { window?: unknown };
    g.window = { installed: 'later' };
    try {
      expect(GetGlobalObjectStore()).toBe(before);
    } finally {
      delete g.window;
    }
  });

  it('treats a declared-but-null window as absent and falls through to global', async () => {
    // `typeof null === 'object'`, so a bare `typeof window !== 'undefined'` probe would accept a
    // null window and memoise it as the store — permanently, for the life of the process. SSR
    // shims that null out `window` exist in the wild, and MJ is embedded by callers whose
    // environment we do not control. Needs a fresh module so the memo is unset.
    const g = globalThis as unknown as { window?: unknown };
    g.window = null;
    vi.resetModules();
    try {
      const fresh = await import('../util');
      expect(fresh.GetGlobalObjectStore()).toBe(global);
    } finally {
      delete g.window;
      vi.resetModules();
    }
  });
});

describe('CleanJSON', () => {
  it('should return null for null input', () => {
    expect(CleanJSON(null)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(CleanJSON('')).toBeNull();
  });

  it('should return formatted JSON for valid JSON input', () => {
    const input = '{"name":"test","value":123}';
    const result = CleanJSON(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.name).toBe('test');
    expect(parsed.value).toBe(123);
  });

  it('should handle already-formatted JSON', () => {
    const input = '{\n  "name": "test"\n}';
    const result = CleanJSON(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.name).toBe('test');
  });

  it('should extract JSON from markdown code blocks', () => {
    const input = 'Some text ```json\n{"extracted": true}\n``` more text';
    const result = CleanJSON(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.extracted).toBe(true);
  });

  it('should handle JSON arrays', () => {
    const input = '[1, 2, 3]';
    const result = CleanJSON(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual([1, 2, 3]);
  });

  it('should extract JSON object from mixed content', () => {
    const input = 'Here is the result: {"status": "ok"} and some trailing text';
    const result = CleanJSON(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.status).toBe('ok');
  });

  it('should handle double-escaped JSON', () => {
    const input = '{\\"name\\": \\"test\\"}';
    const result = CleanJSON(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.name).toBe('test');
  });

  it('should throw when input has braces but invalid JSON', () => {
    expect(() => CleanJSON('{not valid json}')).toThrow(
      /Failed to find a path to CleanJSON/
    );
  });

  it('should return processed string when no braces or brackets present', () => {
    const result = CleanJSON('not json at all without braces');
    expect(result).toBe('not json at all without braces');
  });

  it('should handle nested objects', () => {
    const input = '{"outer": {"inner": "value"}}';
    const result = CleanJSON(input);
    const parsed = JSON.parse(result!);
    expect(parsed.outer.inner).toBe('value');
  });

  it('should handle JSON with trailing extra brace by removing it', () => {
    const input = '{"name": "test"}}';
    const result = CleanJSON(input);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.name).toBe('test');
  });
});

describe('SafeJSONParse', () => {
  it('should parse valid JSON', () => {
    const result = SafeJSONParse<{ name: string }>('{"name": "hello"}');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('hello');
  });

  it('should return null for invalid JSON', () => {
    const result = SafeJSONParse('not json');
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(SafeJSONParse('')).toBeNull();
  });

  it('should return null for null input', () => {
    expect(SafeJSONParse(null as unknown as string)).toBeNull();
  });

  it('should parse arrays', () => {
    const result = SafeJSONParse<number[]>('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('should parse primitive types', () => {
    expect(SafeJSONParse<number>('42')).toBe(42);
    expect(SafeJSONParse<boolean>('true')).toBe(true);
    expect(SafeJSONParse<string>('"hello"')).toBe('hello');
  });

  it('should log errors when logErrors is true', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    SafeJSONParse('invalid', true);
    expect(errorSpy).toHaveBeenCalledWith(
      'Error parsing JSON string:',
      expect.objectContaining({ message: expect.stringContaining('') })
    );
  });

  it('should not log errors when logErrors is false', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    SafeJSONParse('invalid', false);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('CleanAndParseJSON', () => {
  it('should clean and parse valid JSON', () => {
    const result = CleanAndParseJSON<{ key: string }>('{"key": "value"}');
    expect(result).not.toBeNull();
    expect(result!.key).toBe('value');
  });

  it('should handle markdown-wrapped JSON', () => {
    const input = '```json\n{"id": 123}\n```';
    const result = CleanAndParseJSON<{ id: number }>(input);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(123);
  });

  it('should return null for null input', () => {
    expect(CleanAndParseJSON(null)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(CleanAndParseJSON('')).toBeNull();
  });

  it('should handle double-escaped JSON', () => {
    const input = '{\\"name\\": \\"test\\"}';
    const result = CleanAndParseJSON<{ name: string }>(input);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('test');
  });
});

describe('CopyScalarsAndArrays', () => {
  it('should copy scalar properties', () => {
    const input = { name: 'test', count: 42, flag: true };
    const result = CopyScalarsAndArrays(input);
    expect(result.name).toBe('test');
    expect(result.count).toBe(42);
    expect(result.flag).toBe(true);
  });

  it('should copy array properties', () => {
    const input = { items: [1, 2, 3], tags: ['a', 'b'] };
    const result = CopyScalarsAndArrays(input);
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.tags).toEqual(['a', 'b']);
    // Verify arrays are copied, not referenced
    expect(result.items).not.toBe(input.items);
  });

  it('should copy function properties as scalars (typeof function !== object)', () => {
    const input = { name: 'test', method: () => 'hello' };
    const result = CopyScalarsAndArrays(input);
    expect(result.name).toBe('test');
    // Without circular ref mode, functions pass typeof !== 'object' check and are copied
    expect('method' in result).toBe(true);
  });

  it('should copy null values', () => {
    const input = { nullVal: null, name: 'test' };
    const result = CopyScalarsAndArrays(input);
    expect(result.nullVal).toBeNull();
    expect(result.name).toBe('test');
  });

  it('should recursively copy plain nested objects', () => {
    const input = { outer: { inner: 'deep' } };
    const result = CopyScalarsAndArrays(input);
    expect(result.outer).toBeDefined();
    expect((result.outer as { inner: string }).inner).toBe('deep');
  });

  it('should skip non-plain object instances', () => {
    class Custom {
      Value = 42;
    }
    const input = { data: new Custom(), name: 'test' };
    const result = CopyScalarsAndArrays(input);
    expect(result.name).toBe('test');
    // Custom class instances are not plain objects, so skipped
    expect('data' in result).toBe(false);
  });

  it('should respect toJSON() on class instances', () => {
    class Serializable {
      toJSON() {
        return { Kind: 'custom', N: 7 };
      }
    }
    const input = { item: new Serializable(), name: 'test' };
    const result = CopyScalarsAndArrays(input);
    expect(result.name).toBe('test');
    expect(result.item).toEqual({ Kind: 'custom', N: 7 });
  });

  it('should recurse into array items and honor toJSON()', () => {
    class Node {
      constructor(public n: number) {}
      toJSON() {
        return { N: this.n };
      }
    }
    const input = { items: [new Node(1), new Node(2)], scalars: [10, 20] };
    const result = CopyScalarsAndArrays(input);
    expect(result.items).toEqual([{ N: 1 }, { N: 2 }]);
    expect(result.scalars).toEqual([10, 20]);
  });

  describe('with resolveCircularReferences', () => {
    it('should handle circular references', () => {
      const obj: Record<string, unknown> = { name: 'root' };
      obj['self'] = obj;
      const result = CopyScalarsAndArrays(obj, true);
      expect(result.name).toBe('root');
      expect(result.self).toBe('[Circular Reference]');
    });

    it('should handle Date objects', () => {
      const input = { date: new Date('2025-01-01T00:00:00Z') };
      const result = CopyScalarsAndArrays(input, true);
      expect(result.date).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should handle Error objects', () => {
      const input = { error: new Error('test error') };
      const result = CopyScalarsAndArrays(input, true) as { error: { name: string; message: string } };
      expect(result.error.name).toBe('Error');
      expect(result.error.message).toBe('test error');
    });

    it('should replace functions with [Function] marker', () => {
      const input = { fn: () => 'hello' };
      const result = CopyScalarsAndArrays(input, true);
      expect(result.fn).toBe('[Function]');
    });

    it('should respect maxDepth', () => {
      const input = { a: { b: { c: { d: 'deep' } } } };
      const result = CopyScalarsAndArrays(input, true, 2) as Record<string, unknown>;
      // At depth 2 we should hit max depth
      expect(result.a).toBeDefined();
    });
  });
});

describe('convertCamelCaseToHaveSpaces', () => {
  it('should convert simple camelCase', () => {
    expect(ConvertCamelCaseToHaveSpaces('DatabaseVersion')).toBe('Database Version');
  });

  it('should handle consecutive uppercase letters (acronyms)', () => {
    expect(ConvertCamelCaseToHaveSpaces('AIAgentLearningCycle')).toBe('AI Agent Learning Cycle');
  });

  it('should return single word unchanged', () => {
    expect(ConvertCamelCaseToHaveSpaces('Database')).toBe('Database');
  });

  it('should handle all uppercase', () => {
    expect(ConvertCamelCaseToHaveSpaces('ABC')).toBe('ABC');
  });

  it('should handle single character', () => {
    expect(ConvertCamelCaseToHaveSpaces('A')).toBe('A');
  });

  it('should handle empty string', () => {
    expect(ConvertCamelCaseToHaveSpaces('')).toBe('');
  });

  it('should handle lowercase only', () => {
    expect(ConvertCamelCaseToHaveSpaces('hello')).toBe('hello');
  });

  it('should handle multiple words', () => {
    expect(ConvertCamelCaseToHaveSpaces('FirstNameLastName')).toBe('First Name Last Name');
  });

  it('should handle acronym at the end', () => {
    expect(ConvertCamelCaseToHaveSpaces('GetHTMLParser')).toBe('Get HTML Parser');
  });

  it('should handle acronym at the beginning', () => {
    expect(ConvertCamelCaseToHaveSpaces('HTMLParser')).toBe('HTML Parser');
  });
});

describe('createDisplayName', () => {
  it('should convert snake_case to title case with spaces', () => {
    expect(CreateDisplayName('organization_email')).toBe('Organization Email');
  });

  it('should handle single-word snake_case', () => {
    expect(CreateDisplayName('name')).toBe('name');
  });

  it('should handle multiple underscores', () => {
    expect(CreateDisplayName('source_created_at')).toBe('Source Created At');
  });

  it('should handle mixed snake_case and camelCase segments', () => {
    expect(CreateDisplayName('org_emailAddress')).toBe('Org Email Address');
  });

  it('should pass through PascalCase unchanged (delegates to convertCamelCaseToHaveSpaces)', () => {
    expect(CreateDisplayName('OrganizationEmail')).toBe('Organization Email');
  });

  it('should handle leading/trailing underscores', () => {
    expect(CreateDisplayName('_private_field')).toBe('Private Field');
  });

  it('should handle consecutive underscores', () => {
    expect(CreateDisplayName('field__name')).toBe('Field Name');
  });

  it('should handle empty string', () => {
    expect(CreateDisplayName('')).toBe('');
  });

  it('should handle acronyms in PascalCase', () => {
    expect(CreateDisplayName('AIAgentLearningCycle')).toBe('AI Agent Learning Cycle');
  });
});

describe('generatePluralName', () => {
  it('should handle regular plurals by adding s', () => {
    expect(GeneratePluralName('dog')).toBe('dogs');
    expect(GeneratePluralName('cat')).toBe('cats');
    expect(GeneratePluralName('book')).toBe('books');
  });

  it('should handle irregular plurals', () => {
    expect(GeneratePluralName('child')).toBe('children');
    expect(GeneratePluralName('person')).toBe('people');
    expect(GeneratePluralName('mouse')).toBe('mice');
    expect(GeneratePluralName('foot')).toBe('feet');
    expect(GeneratePluralName('tooth')).toBe('teeth');
    expect(GeneratePluralName('man')).toBe('men');
    expect(GeneratePluralName('woman')).toBe('women');
  });

  it('should handle words ending in consonant + y', () => {
    expect(GeneratePluralName('party')).toBe('parties');
    expect(GeneratePluralName('city')).toBe('cities');
    expect(GeneratePluralName('baby')).toBe('babies');
  });

  it('should handle words ending in vowel + y by just adding s', () => {
    expect(GeneratePluralName('day')).toBe('days');
    expect(GeneratePluralName('boy')).toBe('boys');
    expect(GeneratePluralName('key')).toBe('keys');
  });

  it('should handle words ending in ch, sh, x, z by adding es', () => {
    expect(GeneratePluralName('match')).toBe('matches');
    expect(GeneratePluralName('wish')).toBe('wishes');
    expect(GeneratePluralName('box')).toBe('boxes');
    expect(GeneratePluralName('buzz')).toBe('buzzes');
  });

  it('should treat words ending in s as already plural (getSingularForm detects singular)', () => {
    // 'bus' ends in 's', getSingularForm returns 'bu' (different from 'bus'),
    // so generatePluralName considers 'bus' already plural
    expect(GeneratePluralName('bus')).toBe('bus');
  });

  it('should detect already-plural words and return them unchanged', () => {
    expect(GeneratePluralName('dogs')).toBe('dogs');
    expect(GeneratePluralName('customers')).toBe('customers');
  });

  it('should handle capitalizeFirstLetterOnly option', () => {
    expect(GeneratePluralName('dog', { capitalizeFirstLetterOnly: true })).toBe('Dogs');
  });

  it('should handle capitalizeEntireWord option', () => {
    expect(GeneratePluralName('dog', { capitalizeEntireWord: true })).toBe('DOGS');
  });
});

describe('getIrregularPlural', () => {
  it('should return irregular plural for known words', () => {
    expect(GetIrregularPlural('child')).toBe('children');
    expect(GetIrregularPlural('knife')).toBe('knives');
    expect(GetIrregularPlural('leaf')).toBe('leaves');
  });

  it('should be case-insensitive', () => {
    expect(GetIrregularPlural('Child')).toBe('children');
    expect(GetIrregularPlural('MOUSE')).toBe('mice');
  });

  it('should return null for regular words', () => {
    expect(GetIrregularPlural('dog')).toBeNull();
    expect(GetIrregularPlural('table')).toBeNull();
  });
});

describe('stripWhitespace', () => {
  it('should remove all spaces', () => {
    expect(StripWhitespace('Hello World')).toBe('HelloWorld');
  });

  it('should remove tabs and newlines', () => {
    expect(StripWhitespace('\tExample\nString ')).toBe('ExampleString');
  });

  it('should handle empty string', () => {
    expect(StripWhitespace('')).toBe('');
  });

  it('should return null or undefined as-is', () => {
    expect(StripWhitespace(null as unknown as string)).toBeNull();
    expect(StripWhitespace(undefined as unknown as string)).toBeUndefined();
  });

  it('should handle string with only whitespace', () => {
    expect(StripWhitespace('   \t\n  ')).toBe('');
  });

  it('should handle string with no whitespace', () => {
    expect(StripWhitespace('NoSpaces')).toBe('NoSpaces');
  });

  it('should handle multiple consecutive whitespace types', () => {
    expect(StripWhitespace('  a  b  c  ')).toBe('abc');
  });
});

describe('uuidv4', () => {
  it('should return a string', () => {
    expect(typeof Uuidv4()).toBe('string');
  });

  it('should match UUID v4 format', () => {
    const uuid = Uuidv4();
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidV4Regex);
  });

  it('should generate unique values', () => {
    const uuid1 = Uuidv4();
    const uuid2 = Uuidv4();
    const uuid3 = Uuidv4();
    expect(uuid1).not.toBe(uuid2);
    expect(uuid2).not.toBe(uuid3);
    expect(uuid1).not.toBe(uuid3);
  });

  it('should have the correct length', () => {
    const uuid = Uuidv4();
    expect(uuid.length).toBe(36);
  });
});

describe('stripTrailingChars', () => {
  it('should strip matching trailing characters', () => {
    expect(StripTrailingChars('example.txt', '.txt', false)).toBe('example');
  });

  it('should not strip when suffix does not match', () => {
    expect(StripTrailingChars('example.csv', '.txt', false)).toBe('example.csv');
  });

  it('should skip stripping on exact match when skipIfExactMatch is true', () => {
    expect(StripTrailingChars('.txt', '.txt', true)).toBe('.txt');
  });

  it('should strip exact match when skipIfExactMatch is false', () => {
    expect(StripTrailingChars('.txt', '.txt', false)).toBe('');
  });

  it('should return input when input is empty', () => {
    expect(StripTrailingChars('', '.txt', false)).toBe('');
  });

  it('should return input when charsToStrip is empty', () => {
    expect(StripTrailingChars('test', '', false)).toBe('test');
  });
});

describe('replaceAllSpaces', () => {
  it('should remove all spaces', () => {
    expect(ReplaceAllSpaces('Hello World')).toBe('HelloWorld');
  });

  it('should handle multiple spaces', () => {
    expect(ReplaceAllSpaces('  Leading spaces')).toBe('Leadingspaces');
  });

  it('should handle string with no spaces', () => {
    expect(ReplaceAllSpaces('NoSpaces')).toBe('NoSpaces');
  });

  it('should handle empty string', () => {
    expect(ReplaceAllSpaces('')).toBe('');
  });
});

describe('IsOnlyTimezoneShift', () => {
  it('should return true for a 6-hour timezone shift', () => {
    const d1 = new Date('2025-12-25T10:30:45.123Z');
    const d2 = new Date('2025-12-25T16:30:45.123Z');
    expect(IsOnlyTimezoneShift(d1, d2)).toBe(true);
  });

  it('should return false when milliseconds differ', () => {
    const d1 = new Date('2025-12-25T10:30:45.123Z');
    const d2 = new Date('2025-12-25T16:30:45.124Z');
    expect(IsOnlyTimezoneShift(d1, d2)).toBe(false);
  });

  it('should return false for identical dates', () => {
    const d1 = new Date('2025-12-25T10:30:45.123Z');
    const d2 = new Date('2025-12-25T10:30:45.123Z');
    expect(IsOnlyTimezoneShift(d1, d2)).toBe(false);
  });

  it('should return true for a 1-hour shift', () => {
    const d1 = new Date('2025-12-25T10:00:00.000Z');
    const d2 = new Date('2025-12-25T11:00:00.000Z');
    expect(IsOnlyTimezoneShift(d1, d2)).toBe(true);
  });

  it('should return false for a 24-hour shift', () => {
    const d1 = new Date('2025-12-25T00:00:00.000Z');
    const d2 = new Date('2025-12-26T00:00:00.000Z');
    expect(IsOnlyTimezoneShift(d1, d2)).toBe(false);
  });
});

describe('EscapeHTML', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(EscapeHTML('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(EscapeHTML(`Tom & Jerry's`)).toBe('Tom &amp; Jerry&#039;s');
  });

  it('passes through empty/falsy values unchanged', () => {
    expect(EscapeHTML('')).toBe('');
    // Matches the existing contract: falsy passthrough.
    expect(EscapeHTML(null as unknown as string)).toBe(null);
    expect(EscapeHTML(undefined as unknown as string)).toBe(undefined);
  });
});

describe('HighlightSearchMatches', () => {
  it('wraps a single case-insensitive match in <mark>', () => {
    expect(HighlightSearchMatches('Hello World', 'world')).toBe('Hello <mark>World</mark>');
  });

  it('preserves the original casing of the source text inside the highlight', () => {
    expect(HighlightSearchMatches('Hello World', 'hello')).toBe('<mark>Hello</mark> World');
  });

  it('highlights every occurrence (not just the first)', () => {
    expect(HighlightSearchMatches('abc abc abc', 'abc')).toBe(
      '<mark>abc</mark> <mark>abc</mark> <mark>abc</mark>'
    );
  });

  it('treats the query as a literal string, not a regex', () => {
    // `.` and `$` would have special meaning if this were regex-based.
    expect(HighlightSearchMatches('Price: $10.00', '$10')).toBe('Price: <mark>$10</mark>.00');
    expect(HighlightSearchMatches('a.b.c', '.')).toBe('a<mark>.</mark>b<mark>.</mark>c');
  });

  it('applies the optional CSS class to every <mark>', () => {
    expect(HighlightSearchMatches('hi hi', 'hi', 'search-hit')).toBe(
      '<mark class="search-hit">hi</mark> <mark class="search-hit">hi</mark>'
    );
  });

  it('escapes the supplied CSS class to prevent attribute injection', () => {
    // A malicious class name must not break out of the attribute.
    const out = HighlightSearchMatches('hi', 'hi', '" onclick="alert(1)');
    expect(out).not.toContain('onclick="alert(1)"');
    expect(out).toContain('class="&quot; onclick=&quot;alert(1)"');
  });

  // ---- The behavior that motivates this helper: XSS safety on `[innerHTML]` bindings. ----

  it('escapes raw HTML in the source text when the query does not match', () => {
    expect(HighlightSearchMatches('<script>alert(1)</script>', 'nope')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('escapes raw HTML in the source text when the query is empty', () => {
    expect(HighlightSearchMatches('<img src=x onerror=alert(1)>', '')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
    expect(HighlightSearchMatches('<b>bold</b>', '   ')).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('escapes raw HTML in segments around a real match (XSS regression)', () => {
    // The match is "danger". The surrounding `<script>` tags must be escaped, NOT live HTML.
    const result = HighlightSearchMatches('<script>danger</script>', 'danger');
    expect(result).toBe('&lt;script&gt;<mark>danger</mark>&lt;/script&gt;');
    // Sanity: the result must never contain a live <script> open or close tag.
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
  });

  it('escapes a raw match that itself contains HTML', () => {
    // The query matches a substring that includes `<`. That match must be escaped inside <mark>.
    const result = HighlightSearchMatches('a<b>c', '<b>');
    expect(result).toBe('a<mark>&lt;b&gt;</mark>c');
  });

  it('does NOT corrupt the output when the search term overlaps an entity name', () => {
    // The motivating "entity-corruption" failure mode: searching for "amp" in a string
    // containing `&` must not wrap part of `&amp;`. Because we escape AFTER matching,
    // the literal source `&` is matched safely and rendered as `&amp;`.
    const result = HighlightSearchMatches('Tom & Jerry', 'amp');
    // No match in the source text "Tom & Jerry" — `amp` is not present, so the whole
    // string is escaped and returned untouched.
    expect(result).toBe('Tom &amp; Jerry');
    expect(result).not.toContain('<mark>');
  });

  it('returns the input unchanged when text is falsy', () => {
    expect(HighlightSearchMatches('', 'anything')).toBe('');
    expect(HighlightSearchMatches(null as unknown as string, 'x')).toBe(null);
    expect(HighlightSearchMatches(undefined as unknown as string, 'x')).toBe(undefined);
  });

  it('returns escaped text when query is whitespace-only', () => {
    expect(HighlightSearchMatches('<i>x</i>', '   ')).toBe('&lt;i&gt;x&lt;/i&gt;');
  });
});

describe('EscapeSQLString', () => {
  it('escapes single quotes by doubling them', () => {
    expect(EscapeSQLString("O'Brien")).toBe("O''Brien");
    expect(EscapeSQLString("user's 'name'")).toBe("user''s ''name''");
  });

  it('strips null bytes to prevent injection', () => {
    expect(EscapeSQLString("test\0injection")).toBe("testinjection");
    expect(EscapeSQLString("user\0' OR '1'='1")).toBe("user'' OR ''1''=''1");
  });

  it('handles null and undefined safely', () => {
    expect(EscapeSQLString(null)).toBe('');
    expect(EscapeSQLString(undefined)).toBe('');
  });

  it('handles empty string and clean strings', () => {
    expect(EscapeSQLString('')).toBe('');
    expect(EscapeSQLString('plain.email@example.com')).toBe('plain.email@example.com');
  });
});

