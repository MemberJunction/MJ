import { describe, it, expect } from 'vitest';
import type { WindowedAggregateSource } from '@memberjunction/predictive-studio-core';
import { WindowedAggregates, type ChildRowIndex } from '../windowed-aggregate';
import { AssemblyRefused } from '../refusal';

const lines = [
  { ID: 'l1', PersonID: 'A', OrderDate: '2023-03-01', LineTotalNet: 100, ReversedOn: null, __mj_UpdatedAt: '2023-03-01T00:00:00Z' },
  { ID: 'l2', PersonID: 'A', OrderDate: '2023-12-31', LineTotalNet: 50, ReversedOn: '2024-02-01', __mj_UpdatedAt: '2024-02-01T00:00:00Z' },
  { ID: 'l3', PersonID: 'A', OrderDate: '2024-01-15', LineTotalNet: 25, ReversedOn: '2024-01-20', __mj_UpdatedAt: '2024-01-20T00:00:00Z' },
  { ID: 'l4', PersonID: 'A', OrderDate: '2024-01-31', LineTotalNet: 10, ReversedOn: null, __mj_UpdatedAt: '2024-01-31T00:00:00Z' },
];
const spend: WindowedAggregateSource = { kind: 'windowed-aggregate', childEntity: 'Lines', foreignKey: 'PersonID', ownerKeyField: null, dateField: 'OrderDate', endDateField: null, voidedAtField: 'ReversedOn', aggregate: 'sum', valueField: 'LineTotalNet', windowDays: 365, filter: [] };

describe('ComputeWindowedAggregate', () => {
  const index = WindowedAggregates.BuildChildRowIndex(lines, spend, 'ID');
  const d = new Date('2024-01-31T00:00:00Z');
  it('sums the window (d − 365, d] and keeps a line whose reversal is dated after d (as-of reversal status)', () => {
    // l1 (2023-03-01) in, l2 (reversed 2024-02-01 > d) in, l3 (reversed 2024-01-20 <= d) out, l4 (on d) in
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, spend).Value).toBe(160);
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, spend).Contributors.map((c) => [c.Id, c.UpdatedAt])).toEqual([
      ['l1', '2023-03-01T00:00:00Z'], ['l2', '2024-02-01T00:00:00Z'], ['l4', '2024-01-31T00:00:00Z'],
    ]);
  });
  it('counts, averages and measures days since the latest row', () => {
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, { ...spend, aggregate: 'count' }).Value).toBe(3);
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, { ...spend, aggregate: 'mean' }).Value).toBeCloseTo(160 / 3, 12);
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, { ...spend, aggregate: 'days-since' }).Value).toBe(0);
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'Z', d, { ...spend, aggregate: 'days-since' }).Value).toBeNull();
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'Z', d, { ...spend, aggregate: 'count' }).Value).toBe(0);
  });
  it('counts rows active on d for active-at (e.g. certifications held)', () => {
    const certs = [{ ID: 'c1', PersonID: 'A', AwardedOn: '2020-01-01', ExpiresOn: '2024-01-31', __mj_UpdatedAt: 'x' }, { ID: 'c2', PersonID: 'A', AwardedOn: '2024-02-01', ExpiresOn: null, __mj_UpdatedAt: 'x' }];
    const spec: WindowedAggregateSource = { ...spend, childEntity: 'Certs', dateField: 'AwardedOn', endDateField: 'ExpiresOn', voidedAtField: null, aggregate: 'active-at', valueField: null, windowDays: null };
    expect(WindowedAggregates.ComputeWindowedAggregate(WindowedAggregates.BuildChildRowIndex(certs, spec, 'ID'), 'A', d, spec).Value).toBe(1);
  });
});

describe('ComputeWindowedAggregate — missing and non-numeric child values', () => {
  const d = new Date('2024-01-31T00:00:00Z');
  const row = (id: string, value: string | number | boolean | Date | null) => ({ ID: id, PersonID: 'A', OrderDate: '2024-01-10', LineTotalNet: value, ReversedOn: null, __mj_UpdatedAt: '2024-01-10T00:00:00Z' });
  it('leaves a missing value out of the sum and out of the mean\'s denominator', () => {
    const index = WindowedAggregates.BuildChildRowIndex([row('a', 30), row('b', null), row('c', ' '), row('d', 60)], spend, 'ID');
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, spend).Value).toBe(90);
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, { ...spend, aggregate: 'mean' }).Value).toBe(45);
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, { ...spend, aggregate: 'count' }).Value).toBe(4);
    const allMissing = WindowedAggregates.BuildChildRowIndex([row('e', null), row('f', '')], spend, 'ID');
    expect(WindowedAggregates.ComputeWindowedAggregate(allMissing, 'A', d, spend).Value).toBe(0);
    expect(WindowedAggregates.ComputeWindowedAggregate(allMissing, 'A', d, { ...spend, aggregate: 'mean' }).Value).toBeNull();
  });
  const refusalOf = (index: ChildRowIndex, spec: WindowedAggregateSource): AssemblyRefused['Refusal'] | null => {
    try {
      WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, spec);
    } catch (e) {
      if (e instanceof AssemblyRefused) return e.Refusal;
      throw e;
    }
    return null;
  };
  it('refuses a text value in a summed column instead of dropping it', () => {
    const index = WindowedAggregates.BuildChildRowIndex([row('a', 30), row('b', 'R7')], spend, 'ID');
    for (const aggregate of ['sum', 'mean'] as const) {
      expect(refusalOf(index, { ...spend, aggregate })).toEqual({ kind: 'non-numeric-in-numeric-column', column: 'Lines.LineTotalNet', sampleValue: 'R7' });
    }
  });
  it('refuses a date or a boolean in a summed column instead of reading it as a number', () => {
    const when = new Date('2024-01-05T00:00:00Z');
    expect(refusalOf(WindowedAggregates.BuildChildRowIndex([row('a', 30), row('b', when)], spend, 'ID'), spend))
      .toEqual({ kind: 'non-numeric-in-numeric-column', column: 'Lines.LineTotalNet', sampleValue: String(when) });
    expect(refusalOf(WindowedAggregates.BuildChildRowIndex([row('a', 30), row('b', true)], spend, 'ID'), { ...spend, aggregate: 'mean' }))
      .toEqual({ kind: 'non-numeric-in-numeric-column', column: 'Lines.LineTotalNet', sampleValue: 'true' });
  });
  it('sums a numeric string as its number', () => {
    const index = WindowedAggregates.BuildChildRowIndex([row('a', 30), row('b', '12.5')], spend, 'ID');
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', d, spend).Value).toBe(42.5);
  });
});

describe('ComputeWindowedAggregate — distinct values and the decision day', () => {
  it('counts each distinct value in the window once', () => {
    const visits = ['North', 'South', 'North', 'East', 'South'].map((v, i) => ({ ID: `v${i}`, PersonID: 'A', OrderDate: `2024-01-0${i + 1}`, Branch: v, ReversedOn: null, __mj_UpdatedAt: 'x' }));
    const spec: WindowedAggregateSource = { ...spend, childEntity: 'Visits', aggregate: 'distinct', valueField: 'Branch' };
    expect(WindowedAggregates.ComputeWindowedAggregate(WindowedAggregates.BuildChildRowIndex(visits, spec, 'ID'), 'A', new Date('2024-01-31T00:00:00Z'), spec).Value).toBe(3);
  });
  it('reads a decision date with a time of day as its UTC day', () => {
    const afternoon = new Date('2024-01-31T15:00:00Z');
    const index = WindowedAggregates.BuildChildRowIndex(lines, spend, 'ID');
    expect(WindowedAggregates.ComputeWindowedAggregate(index, 'A', afternoon, { ...spend, aggregate: 'days-since' }).Value).toBe(0);
    const certs = [{ ID: 'c1', PersonID: 'A', AwardedOn: '2020-01-01', ExpiresOn: '2024-01-31', __mj_UpdatedAt: 'x' }];
    const spec: WindowedAggregateSource = { ...spend, childEntity: 'Certs', dateField: 'AwardedOn', endDateField: 'ExpiresOn', voidedAtField: null, aggregate: 'active-at', valueField: null, windowDays: null };
    expect(WindowedAggregates.ComputeWindowedAggregate(WindowedAggregates.BuildChildRowIndex(certs, spec, 'ID'), 'A', afternoon, spec).Value).toBe(1);
  });
});
