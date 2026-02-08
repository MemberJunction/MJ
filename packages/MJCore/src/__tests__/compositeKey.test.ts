import { describe, it, expect, beforeEach } from 'vitest';
import { CompositeKey, KeyValuePair, FieldValueCollection } from '../generic/compositeKey';

describe('KeyValuePair', () => {
  it('should construct with field name and value', () => {
    const kvp = new KeyValuePair('ID', '123');
    expect(kvp.FieldName).toBe('ID');
    expect(kvp.Value).toBe('123');
  });

  it('should construct with defaults when no args provided', () => {
    const kvp = new KeyValuePair();
    expect(kvp.FieldName).toBe('');
    expect(kvp.Value).toBeUndefined();
  });
});

describe('FieldValueCollection', () => {
  describe('constructor', () => {
    it('should create empty collection with no args', () => {
      const fvc = new FieldValueCollection();
      expect(fvc.KeyValuePairs).toEqual([]);
    });

    it('should accept valid KeyValuePair array', () => {
      const pairs = [new KeyValuePair('ID', '1'), new KeyValuePair('Name', 'Test')];
      const fvc = new FieldValueCollection(pairs);
      expect(fvc.KeyValuePairs).toHaveLength(2);
    });

    it('should create empty collection for invalid input', () => {
      const fvc = new FieldValueCollection([]);
      expect(fvc.KeyValuePairs).toEqual([]);
    });
  });

  describe('GetValueByFieldName', () => {
    it('should return the value for a known field', () => {
      const fvc = new FieldValueCollection([
        new KeyValuePair('ID', '123'),
        new KeyValuePair('Name', 'Alice'),
      ]);
      expect(fvc.GetValueByFieldName('ID')).toBe('123');
      expect(fvc.GetValueByFieldName('Name')).toBe('Alice');
    });

    it('should return null for an unknown field', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('ID', '123')]);
      expect(fvc.GetValueByFieldName('Unknown')).toBeNull();
    });
  });

  describe('GetValueByIndex', () => {
    it('should return value at valid index', () => {
      const fvc = new FieldValueCollection([
        new KeyValuePair('A', 1),
        new KeyValuePair('B', 2),
      ]);
      expect(fvc.GetValueByIndex(0)).toBe(1);
      expect(fvc.GetValueByIndex(1)).toBe(2);
    });

    it('should return null for out-of-bounds index', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('A', 1)]);
      expect(fvc.GetValueByIndex(5)).toBeNull();
      expect(fvc.GetValueByIndex(-1)).toBeNull();
    });
  });

  describe('ToString', () => {
    it('should format as FieldName=Value AND ...', () => {
      const fvc = new FieldValueCollection([
        new KeyValuePair('ID', 1),
        new KeyValuePair('Name', 'Test'),
      ]);
      expect(fvc.ToString()).toBe('ID=1 AND Name=Test');
    });

    it('should handle null values with useIsNull', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('ID', null)]);
      // need to set it after construction since constructor checks for value
      fvc.KeyValuePairs = [{ FieldName: 'ID', Value: null }];
      expect(fvc.ToString(true)).toBe('ID IS NULL');
    });

    it('should handle single key', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('ID', '42')]);
      expect(fvc.ToString()).toBe('ID=42');
    });
  });

  describe('ToWhereClause', () => {
    it('should quote string values with single quotes by default', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('Name', 'Alice')]);
      expect(fvc.ToWhereClause()).toBe("Name='Alice'");
    });

    it('should quote with double quotes when specified', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('Name', 'Bob')]);
      expect(fvc.ToWhereClause(true, 'double')).toBe('Name="Bob"');
    });

    it('should not quote numeric values', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('ID', 42)]);
      expect(fvc.ToWhereClause()).toBe('ID=42');
    });

    it('should handle NULL values with useIsNull', () => {
      const fvc = new FieldValueCollection();
      fvc.KeyValuePairs = [{ FieldName: 'Status', Value: null }];
      expect(fvc.ToWhereClause(true)).toBe('Status IS NULL');
    });
  });

  describe('ToList', () => {
    it('should return array of FieldName=Value strings', () => {
      const fvc = new FieldValueCollection([
        new KeyValuePair('A', 1),
        new KeyValuePair('B', 2),
      ]);
      expect(fvc.ToList()).toEqual(['A=1', 'B=2']);
    });

    it('should use custom delimiter', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('A', 1)]);
      expect(fvc.ToList(':')).toEqual(['A:1']);
    });
  });

  describe('Values', () => {
    it('should return concatenated values', () => {
      const fvc = new FieldValueCollection([
        new KeyValuePair('A', 'x'),
        new KeyValuePair('B', 'y'),
      ]);
      expect(fvc.Values()).toBe('x, y');
    });

    it('should use custom delimiter', () => {
      const fvc = new FieldValueCollection([
        new KeyValuePair('A', 1),
        new KeyValuePair('B', 2),
      ]);
      expect(fvc.Values('|')).toBe('1|2');
    });
  });

  describe('HasValue', () => {
    it('should return true when values are set', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('ID', '123')]);
      expect(fvc.HasValue).toBe(true);
    });

    it('should return false when all values are null/empty', () => {
      const fvc = new FieldValueCollection();
      fvc.KeyValuePairs = [{ FieldName: 'ID', Value: null }];
      expect(fvc.HasValue).toBe(false);
    });

    it('should return false for empty collection', () => {
      const fvc = new FieldValueCollection();
      expect(fvc.HasValue).toBe(false);
    });
  });

  describe('ToConcatenatedString', () => {
    it('should format with default delimiters', () => {
      const fvc = new FieldValueCollection([
        new KeyValuePair('ID', '1'),
        new KeyValuePair('Name', 'Test'),
      ]);
      expect(fvc.ToConcatenatedString()).toBe('ID|1||Name|Test');
    });

    it('should use custom delimiters', () => {
      const fvc = new FieldValueCollection([new KeyValuePair('ID', '1')]);
      expect(fvc.ToConcatenatedString(',', ':')).toBe('ID:1');
    });
  });

  describe('LoadFromConcatenatedString', () => {
    it('should parse default delimited string', () => {
      const fvc = new FieldValueCollection();
      fvc.LoadFromConcatenatedString('ID|1||Name|Test');
      expect(fvc.KeyValuePairs).toHaveLength(2);
      expect(fvc.GetValueByFieldName('ID')).toBe('1');
      expect(fvc.GetValueByFieldName('Name')).toBe('Test');
    });

    it('should handle round-trip with ToConcatenatedString', () => {
      const original = new FieldValueCollection([
        new KeyValuePair('A', 'x'),
        new KeyValuePair('B', 'y'),
      ]);
      const str = original.ToConcatenatedString();

      const loaded = new FieldValueCollection();
      loaded.LoadFromConcatenatedString(str);

      expect(loaded.GetValueByFieldName('A')).toBe('x');
      expect(loaded.GetValueByFieldName('B')).toBe('y');
    });
  });

  describe('LoadFromList', () => {
    it('should parse FieldName=Value list', () => {
      const fvc = new FieldValueCollection();
      fvc.LoadFromList(['ID=1', 'Name=Test']);
      expect(fvc.KeyValuePairs).toHaveLength(2);
      expect(fvc.GetValueByFieldName('ID')).toBe('1');
    });

    it('should use custom delimiter', () => {
      const fvc = new FieldValueCollection();
      fvc.LoadFromList(['ID:1', 'Name:Test'], ':');
      expect(fvc.GetValueByFieldName('ID')).toBe('1');
    });
  });

  describe('Copy', () => {
    it('should create a deep copy with string values', () => {
      const original = new FieldValueCollection([
        new KeyValuePair('ID', 42),
        new KeyValuePair('Name', 'Test'),
      ]);
      const copy = original.Copy();
      expect(copy.GetValueByFieldName('ID')).toBe('42'); // converted to string
      expect(copy.GetValueByFieldName('Name')).toBe('Test');
    });
  });

  describe('FromObject', () => {
    it('should create collection from a plain object', () => {
      const fvc = FieldValueCollection.FromObject({ ID: '123', Name: 'Alice' });
      expect(fvc.GetValueByFieldName('ID')).toBe('123');
      expect(fvc.GetValueByFieldName('Name')).toBe('Alice');
    });
  });
});

describe('CompositeKey', () => {
  describe('FromID', () => {
    it('should create a key with field name ID', () => {
      const key = CompositeKey.FromID('abc-123');
      expect(key.KeyValuePairs).toHaveLength(1);
      expect(key.KeyValuePairs[0].FieldName).toBe('ID');
      expect(key.KeyValuePairs[0].Value).toBe('abc-123');
    });
  });

  describe('FromKeyValuePair', () => {
    it('should create a single-field key', () => {
      const key = CompositeKey.FromKeyValuePair('UserID', '42');
      expect(key.KeyValuePairs).toHaveLength(1);
      expect(key.GetValueByFieldName('UserID')).toBe('42');
    });
  });

  describe('FromKeyValuePairs', () => {
    it('should create a multi-field key', () => {
      const key = CompositeKey.FromKeyValuePairs([
        new KeyValuePair('DashboardID', '1'),
        new KeyValuePair('UserID', '2'),
      ]);
      expect(key.KeyValuePairs).toHaveLength(2);
    });
  });

  describe('FromObject', () => {
    it('should create from a plain object', () => {
      const key = CompositeKey.FromObject({ TableID: 'a', ColumnID: 'b' });
      expect(key.GetValueByFieldName('TableID')).toBe('a');
      expect(key.GetValueByFieldName('ColumnID')).toBe('b');
    });
  });

  describe('Equals', () => {
    it('should return true for identical keys', () => {
      const key1 = CompositeKey.FromID('abc');
      const key2 = CompositeKey.FromID('abc');
      expect(key1.Equals(key2)).toBe(true);
    });

    it('should return false for different values', () => {
      const key1 = CompositeKey.FromID('abc');
      const key2 = CompositeKey.FromID('xyz');
      expect(key1.Equals(key2)).toBe(false);
    });

    it('should return false for different field counts', () => {
      const key1 = CompositeKey.FromID('abc');
      const key2 = CompositeKey.FromKeyValuePairs([
        new KeyValuePair('ID', 'abc'),
        new KeyValuePair('Extra', 'val'),
      ]);
      expect(key1.Equals(key2)).toBe(false);
    });

    it('should return false for null input', () => {
      const key = CompositeKey.FromID('abc');
      expect(key.Equals(null as unknown as CompositeKey)).toBe(false);
    });
  });

  describe('EqualsEx', () => {
    it('should compare single keys', () => {
      const key1 = CompositeKey.FromID('abc');
      const key2 = CompositeKey.FromID('abc');
      expect(CompositeKey.EqualsEx(key1, key2)).toBe(true);
    });

    it('should compare arrays of keys', () => {
      const arr1 = [CompositeKey.FromID('a'), CompositeKey.FromID('b')];
      const arr2 = [CompositeKey.FromID('a'), CompositeKey.FromID('b')];
      expect(CompositeKey.EqualsEx(arr1, arr2)).toBe(true);
    });

    it('should return false for mismatched array lengths', () => {
      const arr1 = [CompositeKey.FromID('a')];
      const arr2 = [CompositeKey.FromID('a'), CompositeKey.FromID('b')];
      expect(CompositeKey.EqualsEx(arr1, arr2)).toBe(false);
    });

    it('should return false for type mismatch (single vs array)', () => {
      const single = CompositeKey.FromID('a');
      const arr = [CompositeKey.FromID('a')];
      expect(CompositeKey.EqualsEx(single, arr)).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(CompositeKey.EqualsEx(null, null)).toBe(true);
      expect(CompositeKey.EqualsEx(null, CompositeKey.FromID('a'))).toBe(false);
      expect(CompositeKey.EqualsEx(CompositeKey.FromID('a'), undefined)).toBe(false);
    });
  });

  describe('Validate', () => {
    it('should return valid for a well-formed key', () => {
      const key = CompositeKey.FromID('abc-123');
      const result = key.Validate();
      expect(result.IsValid).toBe(true);
    });

    it('should return invalid for empty KeyValuePairs', () => {
      const key = new CompositeKey();
      const result = key.Validate();
      expect(result.IsValid).toBe(false);
      expect(result.ErrorMessage).toContain('null or empty');
    });

    it('should return invalid for null value', () => {
      const key = new CompositeKey();
      key.KeyValuePairs = [{ FieldName: 'ID', Value: null }];
      const result = key.Validate();
      expect(result.IsValid).toBe(false);
      expect(result.ErrorMessage).toContain('null or undefined');
    });

    it('should return invalid for empty field name', () => {
      const key = new CompositeKey();
      key.KeyValuePairs = [{ FieldName: '', Value: '123' }];
      const result = key.Validate();
      expect(result.IsValid).toBe(false);
      expect(result.ErrorMessage).toContain('FieldName');
    });
  });

  describe('URL segment round-trip', () => {
    it('should convert to and from URL segment', () => {
      const original = CompositeKey.FromKeyValuePairs([
        new KeyValuePair('ID', 'abc'),
        new KeyValuePair('Type', 'user'),
      ]);

      const segment = original.ToURLSegment();
      expect(segment).toBe('ID|abc||Type|user');

      const loaded = new CompositeKey();
      loaded.SimpleLoadFromURLSegment(segment);
      expect(loaded.Equals(original)).toBe(true);
    });
  });
});
