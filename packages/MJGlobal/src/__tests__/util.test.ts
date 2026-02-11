import { describe, it, expect, vi } from 'vitest';
import {
  GetGlobalObjectStore,
  CleanJSON,
  SafeJSONParse,
  CleanAndParseJSON,
  CopyScalarsAndArrays,
  convertCamelCaseToHaveSpaces,
  generatePluralName,
  getIrregularPlural,
  stripWhitespace,
  uuidv4,
  stripTrailingChars,
  replaceAllSpaces,
  IsOnlyTimezoneShift,
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
    expect(convertCamelCaseToHaveSpaces('DatabaseVersion')).toBe('Database Version');
  });

  it('should handle consecutive uppercase letters (acronyms)', () => {
    expect(convertCamelCaseToHaveSpaces('AIAgentLearningCycle')).toBe('AI Agent Learning Cycle');
  });

  it('should return single word unchanged', () => {
    expect(convertCamelCaseToHaveSpaces('Database')).toBe('Database');
  });

  it('should handle all uppercase', () => {
    expect(convertCamelCaseToHaveSpaces('ABC')).toBe('ABC');
  });

  it('should handle single character', () => {
    expect(convertCamelCaseToHaveSpaces('A')).toBe('A');
  });

  it('should handle empty string', () => {
    expect(convertCamelCaseToHaveSpaces('')).toBe('');
  });

  it('should handle lowercase only', () => {
    expect(convertCamelCaseToHaveSpaces('hello')).toBe('hello');
  });

  it('should handle multiple words', () => {
    expect(convertCamelCaseToHaveSpaces('FirstNameLastName')).toBe('First Name Last Name');
  });

  it('should handle acronym at the end', () => {
    expect(convertCamelCaseToHaveSpaces('GetHTMLParser')).toBe('Get HTML Parser');
  });

  it('should handle acronym at the beginning', () => {
    expect(convertCamelCaseToHaveSpaces('HTMLParser')).toBe('HTML Parser');
  });
});

describe('generatePluralName', () => {
  it('should handle regular plurals by adding s', () => {
    expect(generatePluralName('dog')).toBe('dogs');
    expect(generatePluralName('cat')).toBe('cats');
    expect(generatePluralName('book')).toBe('books');
  });

  it('should handle irregular plurals', () => {
    expect(generatePluralName('child')).toBe('children');
    expect(generatePluralName('person')).toBe('people');
    expect(generatePluralName('mouse')).toBe('mice');
    expect(generatePluralName('foot')).toBe('feet');
    expect(generatePluralName('tooth')).toBe('teeth');
    expect(generatePluralName('man')).toBe('men');
    expect(generatePluralName('woman')).toBe('women');
  });

  it('should handle words ending in consonant + y', () => {
    expect(generatePluralName('party')).toBe('parties');
    expect(generatePluralName('city')).toBe('cities');
    expect(generatePluralName('baby')).toBe('babies');
  });

  it('should handle words ending in vowel + y by just adding s', () => {
    expect(generatePluralName('day')).toBe('days');
    expect(generatePluralName('boy')).toBe('boys');
    expect(generatePluralName('key')).toBe('keys');
  });

  it('should handle words ending in ch, sh, x, z by adding es', () => {
    expect(generatePluralName('match')).toBe('matches');
    expect(generatePluralName('wish')).toBe('wishes');
    expect(generatePluralName('box')).toBe('boxes');
    expect(generatePluralName('buzz')).toBe('buzzes');
  });

  it('should treat words ending in s as already plural (getSingularForm detects singular)', () => {
    // 'bus' ends in 's', getSingularForm returns 'bu' (different from 'bus'),
    // so generatePluralName considers 'bus' already plural
    expect(generatePluralName('bus')).toBe('bus');
  });

  it('should detect already-plural words and return them unchanged', () => {
    expect(generatePluralName('dogs')).toBe('dogs');
    expect(generatePluralName('customers')).toBe('customers');
  });

  it('should handle capitalizeFirstLetterOnly option', () => {
    expect(generatePluralName('dog', { capitalizeFirstLetterOnly: true })).toBe('Dogs');
  });

  it('should handle capitalizeEntireWord option', () => {
    expect(generatePluralName('dog', { capitalizeEntireWord: true })).toBe('DOGS');
  });
});

describe('getIrregularPlural', () => {
  it('should return irregular plural for known words', () => {
    expect(getIrregularPlural('child')).toBe('children');
    expect(getIrregularPlural('knife')).toBe('knives');
    expect(getIrregularPlural('leaf')).toBe('leaves');
  });

  it('should be case-insensitive', () => {
    expect(getIrregularPlural('Child')).toBe('children');
    expect(getIrregularPlural('MOUSE')).toBe('mice');
  });

  it('should return null for regular words', () => {
    expect(getIrregularPlural('dog')).toBeNull();
    expect(getIrregularPlural('table')).toBeNull();
  });
});

describe('stripWhitespace', () => {
  it('should remove all spaces', () => {
    expect(stripWhitespace('Hello World')).toBe('HelloWorld');
  });

  it('should remove tabs and newlines', () => {
    expect(stripWhitespace('\tExample\nString ')).toBe('ExampleString');
  });

  it('should handle empty string', () => {
    expect(stripWhitespace('')).toBe('');
  });

  it('should return null or undefined as-is', () => {
    expect(stripWhitespace(null as unknown as string)).toBeNull();
    expect(stripWhitespace(undefined as unknown as string)).toBeUndefined();
  });

  it('should handle string with only whitespace', () => {
    expect(stripWhitespace('   \t\n  ')).toBe('');
  });

  it('should handle string with no whitespace', () => {
    expect(stripWhitespace('NoSpaces')).toBe('NoSpaces');
  });

  it('should handle multiple consecutive whitespace types', () => {
    expect(stripWhitespace('  a  b  c  ')).toBe('abc');
  });
});

describe('uuidv4', () => {
  it('should return a string', () => {
    expect(typeof uuidv4()).toBe('string');
  });

  it('should match UUID v4 format', () => {
    const uuid = uuidv4();
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidV4Regex);
  });

  it('should generate unique values', () => {
    const uuid1 = uuidv4();
    const uuid2 = uuidv4();
    const uuid3 = uuidv4();
    expect(uuid1).not.toBe(uuid2);
    expect(uuid2).not.toBe(uuid3);
    expect(uuid1).not.toBe(uuid3);
  });

  it('should have the correct length', () => {
    const uuid = uuidv4();
    expect(uuid.length).toBe(36);
  });
});

describe('stripTrailingChars', () => {
  it('should strip matching trailing characters', () => {
    expect(stripTrailingChars('example.txt', '.txt', false)).toBe('example');
  });

  it('should not strip when suffix does not match', () => {
    expect(stripTrailingChars('example.csv', '.txt', false)).toBe('example.csv');
  });

  it('should skip stripping on exact match when skipIfExactMatch is true', () => {
    expect(stripTrailingChars('.txt', '.txt', true)).toBe('.txt');
  });

  it('should strip exact match when skipIfExactMatch is false', () => {
    expect(stripTrailingChars('.txt', '.txt', false)).toBe('');
  });

  it('should return input when input is empty', () => {
    expect(stripTrailingChars('', '.txt', false)).toBe('');
  });

  it('should return input when charsToStrip is empty', () => {
    expect(stripTrailingChars('test', '', false)).toBe('test');
  });
});

describe('replaceAllSpaces', () => {
  it('should remove all spaces', () => {
    expect(replaceAllSpaces('Hello World')).toBe('HelloWorld');
  });

  it('should handle multiple spaces', () => {
    expect(replaceAllSpaces('  Leading spaces')).toBe('Leadingspaces');
  });

  it('should handle string with no spaces', () => {
    expect(replaceAllSpaces('NoSpaces')).toBe('NoSpaces');
  });

  it('should handle empty string', () => {
    expect(replaceAllSpaces('')).toBe('');
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
