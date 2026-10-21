/**
 * FormatChangeValue: change history and restore preview values.
 *
 * TZ is pinned west of Greenwich: a SQL `date` arrives as UTC midnight, and at UTC a local-zone
 * formatter lands on the right day by accident, so none of the date-only tests could fail there.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntityFieldTSType, type EntityFieldInfo } from '@memberjunction/core';
import { ChangeValuesMatch, FormatChangeValue } from '../format-change-value';

const field = (Type: string, TSType: EntityFieldTSType): EntityFieldInfo => ({ Type, TSType }) as unknown as EntityFieldInfo;
const dateOnly = field('date', EntityFieldTSType.Date);
const timestamp = field('datetimeoffset', EntityFieldTSType.Date);

describe('FormatChangeValue', () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
  });
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it('shows a date-only change as its stored day, with no invented time', () => {
    // The defect: "Sep 30, 2026, 7:00 PM" for a stored 2026-10-01.
    expect(FormatChangeValue('2026-10-01T00:00:00.000Z', dateOnly)).toBe('Oct 1, 2026');
    expect(FormatChangeValue('2026-01-01', dateOnly)).toBe('Jan 1, 2026');
  });

  it('shows a live record date-only value (a Date) as its stored day, not blank', () => {
    expect(FormatChangeValue(new Date('2026-10-01T00:00:00.000Z'), dateOnly)).toBe('Oct 1, 2026');
  });

  it('keeps a timestamp in the reader zone with its time', () => {
    expect(FormatChangeValue('2026-10-01T02:30:00.000Z', timestamp)).toBe('Sep 30, 2026, 9:30 PM');
  });

  it('leaves non-date values as before', () => {
    expect(FormatChangeValue(null, dateOnly)).toBe('');
    expect(FormatChangeValue('not a date', dateOnly)).toBe('not a date');
    expect(FormatChangeValue({ a: 1 }, undefined)).toBe('{"a":1}');
    expect(FormatChangeValue({}, undefined)).toBe('');
    expect(FormatChangeValue(42, field('int', EntityFieldTSType.Number))).toBe('42');
  });
});

describe('ChangeValuesMatch', () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
  });
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it('compares a timestamp by instant, not by its minute-precision display', () => {
    expect(ChangeValuesMatch('2026-10-01T14:00:00.000Z', new Date('2026-10-01T14:00:30.000Z'), timestamp)).toBe(false);
    expect(ChangeValuesMatch('2026-10-01T14:00:30.000Z', new Date('2026-10-01T14:00:30.000Z'), timestamp)).toBe(true);
  });

  it('compares a date-only value by the calendar day it stores', () => {
    expect(ChangeValuesMatch('2026-10-01', new Date('2026-10-01T00:00:00.000Z'), dateOnly)).toBe(true);
    expect(ChangeValuesMatch('2026-09-30', new Date('2026-10-01T00:00:00.000Z'), dateOnly)).toBe(false);
  });

  it('falls back to the display strings for empty, unparseable and non-date values', () => {
    expect(ChangeValuesMatch(null, undefined, timestamp)).toBe(true);
    expect(ChangeValuesMatch(null, new Date('2026-10-01T00:00:00.000Z'), dateOnly)).toBe(false);
    expect(ChangeValuesMatch('not a date', 'not a date', dateOnly)).toBe(true);
    expect(ChangeValuesMatch('a', 'b', undefined)).toBe(false);
    expect(ChangeValuesMatch(42, '42', field('int', EntityFieldTSType.Number))).toBe(true);
  });
});

describe('binary fields in change history and restore preview', () => {
  const binary = { Type: 'varbinary', TSType: EntityFieldTSType.String, IsBinaryFieldType: true } as unknown as EntityFieldInfo;
  const text = { Type: 'nvarchar', TSType: EntityFieldTSType.String, IsBinaryFieldType: false } as unknown as EntityFieldInfo;

  it('shows a snapshot value (base64) as its size, never the text', () => {
    expect(FormatChangeValue('AQIDBA==', binary)).toBe('[binary: 4 bytes]');
    expect(FormatChangeValue('A'.repeat(8192), binary)).toBe('[binary: 6,144 bytes]');
  });

  it('shows a diff value that already is the size text as-is', () => {
    expect(FormatChangeValue('[binary: 6,144 bytes]', binary)).toBe('[binary: 6,144 bytes]');
    expect(FormatChangeValue('[binary: invalid base64]', binary)).toBe('[binary: invalid base64]');
  });

  it('leaves null and non-binary fields exactly as before', () => {
    expect(FormatChangeValue(null, binary)).toBe('');
    expect(FormatChangeValue('AQIDBA==', text)).toBe('AQIDBA==');
    expect(FormatChangeValue('AQIDBA==', undefined)).toBe('AQIDBA==');
  });

  it('compares binary values by content, so equal sizes are not mistaken for equal bytes', () => {
    expect(ChangeValuesMatch('AQIDBA==', 'AQIDBA==', binary)).toBe(true);
    expect(ChangeValuesMatch('AQIDBA==', 'BAMCAQ==', binary)).toBe(false); // same 4 bytes, different content
    expect(ChangeValuesMatch(null, undefined, binary)).toBe(true);
    expect(ChangeValuesMatch(null, 'AQ==', binary)).toBe(false);
  });
});
