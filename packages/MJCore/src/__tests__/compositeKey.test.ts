import { describe, it, expect, beforeEach } from 'vitest';
import { CompositeKey, KeyValuePair, FieldValueCollection, EncodeNewRecordValuesForURL, IsNewEntityRecordUrlId, NEW_ENTITY_RECORD_URL_ID, NEW_RECORD_VALUES_QUERY_PARAM, RecordUrlMatchesTab } from '../generic/compositeKey';
import type { EntityInfo } from '../generic/entityInfo';

/**
 * Minimal EntityInfo stand-in for tests that only exercise the
 * `entity.FirstPrimaryKey.Name` lookup in `CompositeKey.LoadFromURLSegment`.
 * The cast keeps the test focused on the behavior under test without pulling
 * in the full EntityInfo construction surface.
 */
function mockEntity(pkName: string): EntityInfo {
  return { FirstPrimaryKey: { Name: pkName } } as unknown as EntityInfo;
}

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

  // Regression guard for the integer-PK back-button freeze: a loaded entity holds a raw scalar
  // PK (number 5) while a URL/tab-derived key is always a string ("5"). Equality must NOT depend
  // on that JS-type difference, or record-identity checks never converge for integer PKs and the
  // record view loops forever. UUID PKs (always strings) are unaffected.
  describe('EqualsKey — scalar type tolerance (integer-PK freeze fix)', () => {
    it('treats a numeric PK and its string form as equal (loaded number vs URL string)', () => {
      const loaded = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 5)]);      // number
      const fromUrl = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', '5')]);   // string
      expect(loaded.Equals(fromUrl)).toBe(true);
      expect(loaded.EqualsKey(fromUrl.KeyValuePairs)).toBe(true);
      expect(fromUrl.EqualsKey(loaded.KeyValuePairs)).toBe(true);
    });

    it('still reports different numeric PKs as not equal across types', () => {
      const a = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 5)]);
      const b = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', '6')]);
      expect(a.Equals(b)).toBe(false);
    });

    it('preserves case-insensitive UUID equality (string/string path unchanged)', () => {
      const upper = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890')]);
      const lower = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')]);
      expect(upper.Equals(lower)).toBe(true);
    });

    it('round-trips a numeric PK through the URL segment and still compares equal', () => {
      const loaded = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 12345)]); // number, as loaded
      const fromUrl = new CompositeKey();
      fromUrl.SimpleLoadFromURLSegment(loaded.ToURLSegment());                        // string, as from URL
      expect(loaded.Equals(fromUrl)).toBe(true);
    });
  });

  /**
   * Entity-aware URL segment parsing.
   *
   * These tests guard the contract that callers of
   * `ToURLSegment` → `LoadFromURLSegment(entity, segment)` get back what they
   * put in. The dashboard-resource navigation flow depends on this round-trip:
   * dashboard parts call `compositeKey.ToURLSegment()` to serialize the key
   * into the `OpenEntityRecordNavRequest.recordId` field, and
   * `DashboardResourceComponent.handleNavigationRequest` calls
   * `LoadFromURLSegment` to parse it back before handing off to
   * `NavigationService.OpenEntityRecord`.
   *
   * A regression here previously produced URLs like `Deals/ID|ID|11055` (a
   * double-serialized segment), which the host URL parser silently mis-read
   * as `{ FieldName: 'ID', Value: 'ID' }` and dropped the real record ID.
   */
  describe('LoadFromURLSegment (entity-aware)', () => {
    it('round-trips a single integer PK', () => {
      const entity = mockEntity('ID');
      const original = CompositeKey.FromKeyValuePairs([
        new KeyValuePair('ID', 11055),
      ]);

      const loaded = new CompositeKey();
      loaded.LoadFromURLSegment(entity, original.ToURLSegment());

      expect(loaded.KeyValuePairs).toHaveLength(1);
      expect(loaded.KeyValuePairs[0].FieldName).toBe('ID');
      // Values come back as strings — URL-segment parsing has no type info.
      expect(String(loaded.KeyValuePairs[0].Value)).toBe('11055');
    });

    it('round-trips a single UUID PK', () => {
      const entity = mockEntity('ID');
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const original = CompositeKey.FromKeyValuePairs([
        new KeyValuePair('ID', uuid),
      ]);

      const loaded = new CompositeKey();
      loaded.LoadFromURLSegment(entity, original.ToURLSegment());

      expect(loaded.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: uuid }]);
    });

    it('round-trips a composite PK', () => {
      // Composite-PK entity — FirstPrimaryKey is not used in this code path
      // because the segment contains the '||' field delimiter; the segment
      // itself carries the field names.
      const entity = mockEntity('OrgID');
      const original = CompositeKey.FromKeyValuePairs([
        new KeyValuePair('OrgID', 'org-1'),
        new KeyValuePair('UserID', 'user-2'),
      ]);

      const loaded = new CompositeKey();
      loaded.LoadFromURLSegment(entity, original.ToURLSegment());

      expect(loaded.KeyValuePairs).toEqual([
        { FieldName: 'OrgID', Value: 'org-1' },
        { FieldName: 'UserID', Value: 'user-2' },
      ]);
    });

    it('uses entity.FirstPrimaryKey.Name when segment has no delimiter', () => {
      // Bare value (no '|' in the segment). The parser must consult the
      // entity to pick a field name; this is the only code path where the
      // entity argument is actually read.
      const entity = mockEntity('BCEID');

      const loaded = new CompositeKey();
      loaded.LoadFromURLSegment(entity, '11055');

      expect(loaded.KeyValuePairs).toEqual([
        { FieldName: 'BCEID', Value: '11055' },
      ]);
    });

    it('preserves the entity PK name even when it differs from "ID"', () => {
      // Older code paths sometimes hard-coded 'ID'; this guards that
      // `LoadFromURLSegment` honors the entity's actual PK name on no-pipe
      // segments. The serialized form already carries the right name on its
      // own, but this test pins the no-pipe branch.
      const entity = mockEntity('RecordID');

      const loaded = new CompositeKey();
      loaded.LoadFromURLSegment(entity, 'rec-42');

      expect(loaded.KeyValuePairs[0].FieldName).toBe('RecordID');
      expect(loaded.KeyValuePairs[0].Value).toBe('rec-42');
    });

    it('regression: a single-PK segment must NOT double-serialize on round-trip', () => {
      // This is the exact shape that produced the `Deals/ID|ID|11055`
      // navigation bug. We assert two invariants:
      //   1. ToURLSegment produces `ID|11055` (NOT `ID|ID|11055`)
      //   2. LoadFromURLSegment parses `ID|11055` back into the original
      //      single KVP, leaving FieldName='ID' and Value='11055' — not
      //      FieldName='ID', Value='ID' with the real id silently dropped.
      const entity = mockEntity('ID');
      const original = CompositeKey.FromKeyValuePairs([
        new KeyValuePair('ID', 11055),
      ]);

      const segment = original.ToURLSegment();
      expect(segment).toBe('ID|11055');

      const loaded = new CompositeKey();
      loaded.LoadFromURLSegment(entity, segment);

      expect(loaded.KeyValuePairs).toHaveLength(1);
      expect(loaded.KeyValuePairs[0].FieldName).toBe('ID');
      expect(loaded.KeyValuePairs[0].Value).toBe('11055');
      // And explicitly: the Value must NOT carry the field-name prefix —
      // that's the symptom the dashboard-resource fix targets.
      expect(loaded.KeyValuePairs[0].Value).not.toBe('ID|11055');
      expect(loaded.KeyValuePairs[0].Value).not.toBe('ID');
    });
  });
});

describe('new-record URL helpers', () => {
  it('treats empty, missing, and the new sentinel as a create', () => {
    expect(IsNewEntityRecordUrlId(undefined)).toBe(true);
    expect(IsNewEntityRecordUrlId(null)).toBe(true);
    expect(IsNewEntityRecordUrlId('')).toBe(true);
    expect(IsNewEntityRecordUrlId('  ')).toBe(true);
    expect(IsNewEntityRecordUrlId(NEW_ENTITY_RECORD_URL_ID)).toBe(true);
    expect(IsNewEntityRecordUrlId('NEW')).toBe(true);
    expect(IsNewEntityRecordUrlId('abc')).toBe(false);
  });

  it('encodes an object as a FieldValueCollection URL segment', () => {
    expect(EncodeNewRecordValuesForURL({
      BillToPersonID: 'p1',
      ShipToPersonID: 'p1',
    })).toBe('BillToPersonID|p1||ShipToPersonID|p1');
  });

  it('passes through a non-empty string and drops empty values', () => {
    expect(EncodeNewRecordValuesForURL('BillToPersonID|p1')).toBe('BillToPersonID|p1');
    expect(EncodeNewRecordValuesForURL('  ')).toBeUndefined();
    expect(EncodeNewRecordValuesForURL(null)).toBeUndefined();
    expect(EncodeNewRecordValuesForURL({})).toBeUndefined();
    expect(EncodeNewRecordValuesForURL({ BillToPersonID: null })).toBeUndefined();
    expect(EncodeNewRecordValuesForURL(['BillToPersonID', 'p1'])).toBeUndefined();
  });

  it('keeps the query-param name stable for deeplinks', () => {
    expect(NEW_RECORD_VALUES_QUERY_PARAM).toBe('NewRecordValues');
  });
});

describe('RecordUrlMatchesTab', () => {
  it('matches a new-record URL to a tab that stored an empty recordId', () => {
    expect(RecordUrlMatchesTab(
      'MJ_BizApps_Orders: Order Headers',
      'new',
      'MJ_BizApps_Orders: Order Headers',
      '',
    )).toBe(true);
  });

  it('matches a new-record URL to a tab that also used the new sentinel', () => {
    expect(RecordUrlMatchesTab('Orders', 'NEW', 'orders', 'new')).toBe(true);
  });

  it('does not match a new URL to a saved record of the same entity', () => {
    expect(RecordUrlMatchesTab('Orders', 'new', 'Orders', 'ID|abc')).toBe(false);
  });

  it('does not match a saved URL to an unsaved tab of the same entity', () => {
    expect(RecordUrlMatchesTab('Orders', 'ID|abc', 'Orders', '')).toBe(false);
  });

  it('matches a saved record by entity and id', () => {
    expect(RecordUrlMatchesTab('Orders', 'ID|abc', 'Orders', 'ID|abc')).toBe(true);
  });

  it('does not match a different entity even when both sides are new', () => {
    expect(RecordUrlMatchesTab('Orders', 'new', 'People', '')).toBe(false);
  });
});
