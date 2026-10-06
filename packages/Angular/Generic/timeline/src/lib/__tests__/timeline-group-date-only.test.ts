/**
 * TimelineGroup.GetDate on a SQL `date` field (a calendar day).
 *
 * TZ is pinned west of Greenwich: a calendar day arrives as UTC midnight, and at UTC the timeline's
 * local-getter grouping lands on the right day by accident, so these could not fail there.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { TimelineGroup } from '../timeline-group';

/** A record shaped like a BaseEntity: `Get()` for values, `EntityInfo` for metadata. */
function entityRecord(fieldType: string, value: unknown) {
  const entityInfo = { Fields: [{ Name: 'DueDate', Type: fieldType }] } as unknown as EntityInfo;
  return { EntityInfo: entityInfo, Get: (name: string) => (name === 'DueDate' ? value : undefined) };
}

describe('TimelineGroup.GetDate', () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
  });
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  const group = () => {
    const g = new TimelineGroup<ReturnType<typeof entityRecord>>();
    g.DateFieldName = 'DueDate';
    return g;
  };

  it('reads a date-only field as its stored day in local getters', () => {
    const date = group().GetDate(entityRecord('date', new Date('2026-10-01T00:00:00.000Z')));
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 1]);
  });

  it('keeps the first of a month in its own month and year', () => {
    const date = group().GetDate(entityRecord('date', '2026-01-01T00:00:00.000Z'));
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 0, 1]);
  });

  it('reads a plain-object record by the group EntityInfo (the entity viewer timeline shape)', () => {
    // The entity viewer feeds `simple` RunView rows: plain objects with no EntityInfo of their own.
    const g = new TimelineGroup<Record<string, unknown>>();
    g.DataSourceType = 'array';
    g.DateFieldName = 'DueDate';
    g.EntityInfo = { Fields: [{ Name: 'DueDate', Type: 'date' }] } as unknown as EntityInfo;
    const date = g.GetDate({ ID: '1', DueDate: '2026-10-01T00:00:00.000Z' });
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 9, 1, 0]);
  });

  it("prefers the record's own EntityInfo over the group's", () => {
    const g = group();
    g.EntityInfo = { Fields: [{ Name: 'DueDate', Type: 'date' }] } as unknown as EntityInfo;
    const instant = new Date('2026-10-01T02:30:00.000Z');
    expect(g.GetDate(entityRecord('datetimeoffset', instant)).getTime()).toBe(instant.getTime());
  });

  it('leaves a timestamp as the instant it is', () => {
    const instant = new Date('2026-10-01T02:30:00.000Z');
    expect(group().GetDate(entityRecord('datetimeoffset', instant)).getTime()).toBe(instant.getTime());
  });
});
