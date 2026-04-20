import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectCache } from '../ObjectCache';

describe('ObjectCache', () => {
  let cache: ObjectCache;

  beforeEach(() => {
    cache = new ObjectCache();
  });

  describe('Add and Find', () => {
    it('should add and find an object by key', () => {
      cache.Add<string>('greeting', 'hello');
      const result = cache.Find<string>('greeting');
      expect(result).toBe('hello');
    });

    it('should add and find a number', () => {
      cache.Add<number>('count', 42);
      expect(cache.Find<number>('count')).toBe(42);
    });

    it('should add and find a complex object', () => {
      const obj = { name: 'Test', value: 123, nested: { flag: true } };
      cache.Add('config', obj);
      const result = cache.Find<{ name: string; value: number; nested: { flag: boolean } }>('config');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Test');
      expect(result!.nested.flag).toBe(true);
    });

    it('should return null when key is not found', () => {
      const result = cache.Find<string>('nonexistent');
      expect(result).toBeNull();
    });

    it('should store multiple entries independently', () => {
      cache.Add<string>('key1', 'value1');
      cache.Add<string>('key2', 'value2');
      cache.Add<string>('key3', 'value3');
      expect(cache.Find<string>('key1')).toBe('value1');
      expect(cache.Find<string>('key2')).toBe('value2');
      expect(cache.Find<string>('key3')).toBe('value3');
    });
  });

  describe('Duplicate key handling', () => {
    it('should throw an error when adding a duplicate key', () => {
      cache.Add<string>('dupe', 'first');
      expect(() => cache.Add<string>('dupe', 'second')).toThrowError(
        /already exists in the cache/
      );
    });

    it('should throw on duplicate key regardless of case', () => {
      cache.Add<string>('MyKey', 'first');
      expect(() => cache.Add<string>('mykey', 'second')).toThrowError(
        /already exists in the cache/
      );
    });

    it('should throw on duplicate key with leading/trailing whitespace', () => {
      cache.Add<string>('  key  ', 'first');
      expect(() => cache.Add<string>('key', 'second')).toThrowError(
        /already exists in the cache/
      );
    });
  });

  describe('Case-insensitive key matching', () => {
    it('should find entries regardless of key case', () => {
      cache.Add<string>('MyCacheKey', 'value');
      expect(cache.Find<string>('mycachekey')).toBe('value');
      expect(cache.Find<string>('MYCACHEKEY')).toBe('value');
      expect(cache.Find<string>('myCacheKey')).toBe('value');
    });

    it('should remove entries regardless of key case', () => {
      cache.Add<string>('TestKey', 'value');
      cache.Remove('testkey');
      expect(cache.Find<string>('TestKey')).toBeNull();
    });

    it('should replace entries regardless of key case', () => {
      cache.Add<string>('TestKey', 'original');
      cache.Replace<string>('testkey', 'replaced');
      expect(cache.Find<string>('TestKey')).toBe('replaced');
    });
  });

  describe('Remove', () => {
    it('should remove an existing entry', () => {
      cache.Add<string>('removeMe', 'value');
      cache.Remove('removeMe');
      expect(cache.Find<string>('removeMe')).toBeNull();
    });

    it('should not throw when removing a non-existent key', () => {
      expect(() => cache.Remove('doesNotExist')).not.toThrow();
    });

    it('should only remove the targeted entry', () => {
      cache.Add<string>('keep', 'kept');
      cache.Add<string>('remove', 'removed');
      cache.Remove('remove');
      expect(cache.Find<string>('keep')).toBe('kept');
      expect(cache.Find<string>('remove')).toBeNull();
    });

    it('should allow re-adding after removal', () => {
      cache.Add<string>('reuse', 'first');
      cache.Remove('reuse');
      cache.Add<string>('reuse', 'second');
      expect(cache.Find<string>('reuse')).toBe('second');
    });
  });

  describe('Replace', () => {
    it('should replace an existing entry', () => {
      cache.Add<string>('key', 'original');
      cache.Replace<string>('key', 'updated');
      expect(cache.Find<string>('key')).toBe('updated');
    });

    it('should add a new entry if key does not exist', () => {
      cache.Replace<string>('newKey', 'newValue');
      expect(cache.Find<string>('newKey')).toBe('newValue');
    });

    it('should handle replacing with a different type', () => {
      cache.Add<string>('flexible', 'text');
      cache.Replace<number>('flexible', 999);
      expect(cache.Find<number>('flexible')).toBe(999);
    });
  });

  describe('Clear', () => {
    it('should remove all entries', () => {
      cache.Add<string>('a', '1');
      cache.Add<string>('b', '2');
      cache.Add<string>('c', '3');
      cache.Clear();
      expect(cache.Find<string>('a')).toBeNull();
      expect(cache.Find<string>('b')).toBeNull();
      expect(cache.Find<string>('c')).toBeNull();
    });

    it('should allow adding entries after clearing', () => {
      cache.Add<string>('key', 'value');
      cache.Clear();
      cache.Add<string>('key', 'new-value');
      expect(cache.Find<string>('key')).toBe('new-value');
    });

    it('should not throw when clearing an empty cache', () => {
      expect(() => cache.Clear()).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string as key', () => {
      cache.Add<string>('', 'empty-key-value');
      expect(cache.Find<string>('')).toBe('empty-key-value');
    });

    it('should handle null as a cached value', () => {
      cache.Add<null>('nullValue', null);
      const result = cache.Find<null>('nullValue');
      expect(result).toBeNull();
    });

    it('should handle undefined as a cached value', () => {
      cache.Add<undefined>('undefValue', undefined);
      const result = cache.Find<undefined>('undefValue');
      expect(result).toBeUndefined();
    });

    it('should handle boolean false as a cached value', () => {
      cache.Add<boolean>('flag', false);
      expect(cache.Find<boolean>('flag')).toBe(false);
    });

    it('should handle zero as a cached value', () => {
      cache.Add<number>('zero', 0);
      expect(cache.Find<number>('zero')).toBe(0);
    });
  });
});
