import { describe, it, expect } from 'vitest';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import type { EntityInfo } from '../generic/entityInfo';

/**
 * Minimal EntityInfo stand-in - `FromRecordID`/`FromLegacyRecordID` read only the primary-key
 * metadata, and validating against it is the whole point of the two functions.
 */
function mockEntity(name: string, ...pkNames: string[]): EntityInfo {
  const keys = pkNames.map((Name) => ({ Name }));
  return { Name: name, FirstPrimaryKey: keys[0], PrimaryKeys: keys } as unknown as EntityInfo;
}

const person = mockEntity('Persons', 'ID');
const orderLine = mockEntity('Order Lines', 'OrderID', 'LineNo');
const codeKeyed = mockEntity('Widgets', 'Code');

const GUID = '38CB433E-F36B-1410-8DA0-00021F8B792E';

describe('CompositeKey.ToRecordID', () => {
  it('emits the field-prefixed form for a single-column key', () => {
    expect(CompositeKey.FromID(GUID).ToRecordID()).toBe(`ID|${GUID}`);
  });

  it('emits every field for a composite key', () => {
    const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('OrderID', '11055'), new KeyValuePair('LineNo', 3)]);
    expect(key.ToRecordID()).toBe('OrderID|11055||LineNo|3');
  });

  it('prefixes even when the key column is not called ID', () => {
    expect(CompositeKey.FromKeyValuePair('Code', 'ABC').ToRecordID()).toBe('Code|ABC');
  });

  it('throws on an empty key rather than emitting an empty pointer', () => {
    expect(() => new CompositeKey().ToRecordID()).toThrow(/empty CompositeKey/i);
  });

  it('throws when a value contains the value delimiter, instead of emitting an unparseable string', () => {
    // This is the whole reason ToRecordID exists rather than callers using ToConcatenatedString:
    // "Code|a|b" would re-split at the wrong boundary on the way back in.
    expect(() => CompositeKey.FromKeyValuePair('Code', 'a|b').ToRecordID()).toThrow(/would not round-trip/i);
  });

  it('throws when a value contains the field delimiter', () => {
    expect(() => CompositeKey.FromKeyValuePair('Code', 'a||b').ToRecordID()).toThrow(/would not round-trip/i);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('throws when a key component is %s rather than emitting that word as text', (_label, value) => {
    expect(() => CompositeKey.FromKeyValuePair('ID', value).ToRecordID()).toThrow(/has no value/i);
  });
});

describe('CompositeKey.FromRecordID', () => {
  it('reads back the canonical single-column form', () => {
    const key = CompositeKey.FromRecordID(person, `ID|${GUID}`);
    expect(key.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: GUID }]);
  });

  it('reads back the canonical composite form', () => {
    const key = CompositeKey.FromRecordID(orderLine, 'OrderID|11055||LineNo|3');
    expect(key.KeyValuePairs).toEqual([
      { FieldName: 'OrderID', Value: '11055' },
      { FieldName: 'LineNo', Value: '3' },
    ]);
  });

  it('accepts a bare value for a single-column key, naming the field from the entity', () => {
    // Matches the LoadFromURLSegment fallback - unambiguous when there is only one key column.
    const key = CompositeKey.FromRecordID(codeKeyed, 'ABC');
    expect(key.KeyValuePairs).toEqual([{ FieldName: 'Code', Value: 'ABC' }]);
  });

  it('rejects a legacy bare composite instead of building phantom field names', () => {
    // 'val1||val2' parses cleanly as a *shape*, so only the field-name check catches it. This is the
    // live defect in recent-access.service.ts that FromRecordID exists to make impossible.
    expect(() => CompositeKey.FromRecordID(orderLine, 'val1||val2')).toThrow(/FromLegacyRecordID/);
  });

  it('rejects a bare value for a composite key rather than guessing', () => {
    expect(() => CompositeKey.FromRecordID(orderLine, GUID)).toThrow(/carries no field names/i);
  });

  it('rejects a field name the entity does not have', () => {
    expect(() => CompositeKey.FromRecordID(person, `PersonID|${GUID}`)).toThrow(/not a primary key/i);
  });

  it('rejects the wrong number of fields', () => {
    expect(() => CompositeKey.FromRecordID(orderLine, 'OrderID|11055')).toThrow(/1 field\(s\)/);
  });

  it('rejects the same primary key field named twice', () => {
    expect(() => CompositeKey.FromRecordID(orderLine, 'OrderID|1||OrderID|2')).toThrow(/more than once/i);
  });

  it('matches field names case-insensitively', () => {
    const key = CompositeKey.FromRecordID(person, `id|${GUID}`);
    expect(key.KeyValuePairs[0].Value).toBe(GUID);
  });

  it('does not require the stored field order to match the entity', () => {
    // The field names travel with the value, so a key written before a column reorder is still valid.
    const key = CompositeKey.FromRecordID(orderLine, 'LineNo|3||OrderID|11055');
    expect(key.GetValueByFieldName('OrderID')).toBe('11055');
    expect(key.GetValueByFieldName('LineNo')).toBe('3');
  });

  it('keeps a value that contains the value delimiter intact', () => {
    // ToRecordID refuses to WRITE this, but rows written before that guard must still read back.
    const key = CompositeKey.FromRecordID(codeKeyed, 'Code|a|b');
    expect(key.KeyValuePairs).toEqual([{ FieldName: 'Code', Value: 'a|b' }]);
  });

  it.each([
    ['empty string', ''],
    ['null', null as unknown as string],
    ['undefined', undefined as unknown as string],
  ])('throws on %s rather than returning an empty key', (_label, value) => {
    expect(() => CompositeKey.FromRecordID(person, value)).toThrow(/empty RecordID/i);
  });

  it('throws without an entity, since validation is the point', () => {
    expect(() => CompositeKey.FromRecordID(null as unknown as EntityInfo, `ID|${GUID}`)).toThrow(/requires an EntityInfo/i);
  });

  it('round-trips ToRecordID for both single and composite keys', () => {
    const single = CompositeKey.FromID(GUID);
    expect(CompositeKey.FromRecordID(person, single.ToRecordID()).Equals(single)).toBe(true);

    const composite = CompositeKey.FromKeyValuePairs([new KeyValuePair('OrderID', '11055'), new KeyValuePair('LineNo', '3')]);
    expect(CompositeKey.FromRecordID(orderLine, composite.ToRecordID()).Equals(composite)).toBe(true);
  });
});

describe('CompositeKey.FromLegacyRecordID', () => {
  it('reads the bare single value RecordGeoCode writes', () => {
    const key = CompositeKey.FromLegacyRecordID(person, GUID);
    expect(key.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: GUID }]);
  });

  it('reads a bare composite positionally', () => {
    const key = CompositeKey.FromLegacyRecordID(orderLine, '11055||3');
    expect(key.KeyValuePairs).toEqual([
      { FieldName: 'OrderID', Value: '11055' },
      { FieldName: 'LineNo', Value: '3' },
    ]);
  });

  it('rejects a value count that does not match the entity', () => {
    expect(() => CompositeKey.FromLegacyRecordID(orderLine, '11055')).toThrow(/1 value\(s\)/);
  });

  it('throws on an empty value', () => {
    expect(() => CompositeKey.FromLegacyRecordID(person, '')).toThrow(/empty legacy RecordID/i);
  });

  it('reads a canonical string as legacy data when asked to, proving the two are not interchangeable', () => {
    // Called on canonical input the legacy parser takes the whole thing as one positional value -
    // which is exactly why the encoding is a decision at the call site, not a guess in the parser.
    const key = CompositeKey.FromLegacyRecordID(person, `ID|${GUID}`);
    expect(key.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: `ID|${GUID}` }]);
  });
});
