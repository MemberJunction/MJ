import { describe, it, expect } from 'vitest';
import {
  isRebindable,
  isResolutionError,
  parseSignalSpec,
  resolveSignal,
  type StoredSignalSpec,
} from '../signal-binding';

/**
 * The rules that decide what a rebound signal actually measures. These matter more than most
 * pure-function tests: getting one wrong computes a real number under the wrong name, and a reuse
 * library whose parts quietly mean something else is worse than no library.
 */

const COUNT_SPEC: StoredSignalSpec = {
  aggregate: 'count',
  source: 'Activities',
  foreignKey: 'MemberID',
  dateField: 'ActivityDate',
  window: { Kind: 'Rolling', LengthDays: 90 },
};

const ok = <T>(r: T | { Error: string }): T => {
  if (isResolutionError(r as never)) throw new Error(`unexpected error: ${(r as { Error: string }).Error}`);
  return r as T;
};

describe('parseSignalSpec', () => {
  it('reads a stored spec', () => {
    expect(parseSignalSpec(JSON.stringify(COUNT_SPEC)).aggregate).toBe('count');
  });
  it('treats absent or malformed storage as an empty spec rather than throwing', () => {
    expect(parseSignalSpec(null)).toEqual({});
    expect(parseSignalSpec('{not json')).toEqual({});
    expect(parseSignalSpec('[]')).toEqual({});
  });
});

describe('resolveSignal — as-of aggregates', () => {
  it('uses the stored binding when nothing is overridden', () => {
    const r = ok(resolveSignal('asof_count', COUNT_SPEC, 'acts_90d'));
    expect(r.Kind).toBe('as-of');
    if (r.Kind !== 'as-of') return;
    expect(r.DatedSource.EntityName).toBe('Activities');
    expect(r.DatedSource.Features[0].Aggregate).toBe('count');
  });

  it('substitutes only what the caller overrides', () => {
    // The whole point: point a proven member measure at donations without editing anything.
    const r = ok(resolveSignal('asof_count', COUNT_SPEC, 'gifts_90d', {
      SourceEntity: 'Donations',
      ForeignKeyField: 'DonorID',
      DateField: 'GiftDate',
    }));
    if (r.Kind !== 'as-of') throw new Error('expected as-of');
    expect(r.DatedSource.EntityName).toBe('Donations');
    expect(r.DatedSource.ForeignKeyField).toBe('DonorID');
    expect(r.DatedSource.DateField).toBe('GiftDate');
    // Meaning is untouched.
    expect(r.DatedSource.Features[0].Aggregate).toBe('count');
    expect(r.DatedSource.Features[0].Window).toEqual({ Kind: 'Rolling', LengthDays: 90 });
  });

  it('carries the window with the MEANING, not the binding', () => {
    // A "90-day count" rebound to donations is still a 90-day count. Silently widening it would
    // change what the signal claims to measure while keeping its name and its evidence.
    const r = ok(resolveSignal('asof_count', COUNT_SPEC, 'x', { SourceEntity: 'Donations' }));
    if (r.Kind !== 'as-of') throw new Error('expected as-of');
    expect(r.DatedSource.Features[0].Window).toEqual({ Kind: 'Rolling', LengthDays: 90 });
  });

  it('lets the window be changed only when asked explicitly', () => {
    const r = ok(resolveSignal('asof_count', COUNT_SPEC, 'x', { Window: { Kind: 'Rolling', LengthDays: 30 } }));
    if (r.Kind !== 'as-of') throw new Error('expected as-of');
    expect(r.DatedSource.Features[0].Window).toEqual({ Kind: 'Rolling', LengthDays: 30 });
  });

  it('refuses a value aggregate with no value field', () => {
    // A sum over nothing is not a sum. Better to refuse than to return zeros.
    const spec = { ...COUNT_SPEC, aggregate: 'sum', field: undefined };
    const r = resolveSignal('asof_sum', spec, 'spend');
    expect(isResolutionError(r) && r.Error).toContain('value field');
  });

  it('accepts a value aggregate once the value field is supplied', () => {
    const r = ok(resolveSignal('asof_sum', { ...COUNT_SPEC, aggregate: 'sum' }, 'gifts', { ValueField: 'Amount' }));
    if (r.Kind !== 'as-of') throw new Error('expected as-of');
    expect(r.DatedSource.Features[0].Field).toBe('Amount');
  });

  it('names every missing part of the binding, not just that it failed', () => {
    const r = resolveSignal('asof_count', { aggregate: 'count' }, 'x');
    expect(isResolutionError(r)).toBe(true);
    if (!isResolutionError(r)) return;
    expect(r.Error).toContain('source entity');
    expect(r.Error).toContain('foreign key');
    expect(r.Error).toContain('date field');
  });

  it('refuses when the driver and the stored aggregate disagree', () => {
    // This is the dangerous case: it would compute a sum and label it with a count's story,
    // evidence and reuse note.
    const r = resolveSignal('asof_count', { ...COUNT_SPEC, aggregate: 'sum', field: 'Amount' }, 'x');
    expect(isResolutionError(r) && r.Error).toContain('does not match');
  });
});

describe('resolveSignal — plain columns', () => {
  it('resolves to the stored column', () => {
    const r = ok(resolveSignal('select', {}, 'MembershipTenureMonths'));
    expect(r).toEqual({ Kind: 'column', OutputColumn: 'MembershipTenureMonths', Column: 'MembershipTenureMonths' });
  });
  it('can be pointed at a different column', () => {
    const r = ok(resolveSignal('select', {}, 'tenure', { Column: 'YearsActive' }));
    if (r.Kind !== 'column') throw new Error('expected column');
    expect(r.Column).toBe('YearsActive');
  });
});

describe('resolveSignal — what cannot be rebound', () => {
  it('refuses kinds that are not an entity plus column names', () => {
    // Embeddings, LLM-derived values, vision and forecasts each carry their own execution path.
    // Pretending would compute something and label it with this signal's meaning.
    for (const driver of ['embedding', 'llm-derived', 'vision-llm', 'action', 'forecast']) {
      const r = resolveSignal(driver, {}, 'x');
      expect(isResolutionError(r), driver).toBe(true);
    }
  });

  it('refuses a signal with no driver at all', () => {
    expect(isResolutionError(resolveSignal(null, COUNT_SPEC, 'x'))).toBe(true);
    expect(isResolutionError(resolveSignal('   ', COUNT_SPEC, 'x'))).toBe(true);
  });

  it('isRebindable agrees with what resolveSignal accepts', () => {
    expect(isRebindable('select')).toBe(true);
    expect(isRebindable('asof_recency')).toBe(true);
    expect(isRebindable('forecast')).toBe(false);
    expect(isRebindable(null)).toBe(false);
  });
});
