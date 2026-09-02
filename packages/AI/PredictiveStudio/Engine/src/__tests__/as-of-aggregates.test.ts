/**
 * The widened as-of aggregate vocabulary (ported from Sonar) — pure window/aggregate semantics
 * plus the executor's presence mask and legacy-alias behavior. The NULL rules mirror SQL (and
 * Sonar's runViewFactor reference): empty set → count 0 / exists 0 / everything else null;
 * NULLs excluded from field aggregates; Rolling lower bound exclusive; 31 Jul − 1 month = 30 Jun.
 */
import { describe, expect, it } from 'vitest';
import type { AsOfStrategy, LeakageGuard, SourceBinding } from '@memberjunction/predictive-studio-core';
import {
  DatedRow,
  aggregateAsOf,
  calendarPeriodStart,
  filterWindow,
  subtractMonthsClamped,
} from '../feature-assembly/as-of';
import {
  DatedSourceSpec,
  FeatureAssemblyExecutor,
  IFeatureDataAccess,
  SourceRow,
  FetchRowsRequest,
  FetchRowsResult,
} from '../feature-assembly';

const ASOF = new Date('2026-06-01T00:00:00Z');

function rows(...dates: Array<[string, Record<string, unknown>?]>): DatedRow[] {
  return dates.map(([d, extra]) => ({ Date: new Date(d), Row: { ID: d, ...(extra ?? {}) } as SourceRow }));
}

describe('subtractMonthsClamped', () => {
  it('clamps 31 Jul − 1 month to 30 Jun (never rolls into July)', () => {
    expect(subtractMonthsClamped(new Date('2026-07-31T12:00:00Z'), 1).toISOString()).toMatch(/^2026-06-30/);
  });
  it('is exact when the target month has the day', () => {
    expect(subtractMonthsClamped(new Date('2026-07-15T00:00:00Z'), 2).toISOString()).toMatch(/^2026-05-15/);
  });
});

describe('calendarPeriodStart', () => {
  it('month / quarter / year starts', () => {
    const d = new Date('2026-08-20T10:00:00Z');
    expect(calendarPeriodStart(d, 'month').toISOString()).toMatch(/^2026-08-01/);
    expect(calendarPeriodStart(d, 'quarter').toISOString()).toMatch(/^2026-07-01/);
    expect(calendarPeriodStart(d, 'year').toISOString()).toMatch(/^2026-01-01/);
  });
});

describe('filterWindow', () => {
  const record: SourceRow = { ID: 'm1', JoinedAt: '2026-05-10T00:00:00Z', RenewsAt: '2026-05-20T00:00:00Z' };

  it('Rolling: the lower bound is EXCLUSIVE (a row exactly length-days ago is out)', () => {
    const exactly30 = '2026-05-02T00:00:00Z';
    const inside = '2026-05-02T00:00:01Z';
    const surviving = filterWindow(rows([exactly30], [inside]), { Kind: 'Rolling', LengthDays: 30 }, ASOF, record);
    expect(surviving.map((r) => r.Date.toISOString())).toEqual([new Date(inside).toISOString()]);
  });

  it('Calendar: the period start is INCLUSIVE', () => {
    const surviving = filterWindow(
      rows(['2026-06-01T00:00:00Z'], ['2026-05-31T23:59:59Z']),
      { Kind: 'Calendar', Period: 'month' },
      ASOF,
      record,
    );
    expect(surviving).toHaveLength(1);
  });

  it('SinceEvent starts at the per-record anchor date', () => {
    const surviving = filterWindow(
      rows(['2026-05-09T00:00:00Z'], ['2026-05-11T00:00:00Z']),
      { Kind: 'SinceEvent', AnchorDateField: 'JoinedAt' },
      ASOF,
      record,
    );
    expect(surviving.map((r) => r.Date.toISOString())).toEqual([new Date('2026-05-11T00:00:00Z').toISOString()]);
  });

  it('RenewalRelative ends at the anchor: rows after it are out', () => {
    const surviving = filterWindow(
      rows(['2026-05-19T00:00:00Z'], ['2026-05-21T00:00:00Z']),
      { Kind: 'RenewalRelative', AnchorDateField: 'RenewsAt', OffsetDays: -30 },
      ASOF,
      record,
    );
    expect(surviving.map((r) => r.Date.toISOString())).toEqual([new Date('2026-05-19T00:00:00Z').toISOString()]);
  });

  it('a missing per-record anchor yields NO rows (no data, not an error)', () => {
    expect(filterWindow(rows(['2026-05-01T00:00:00Z']), { Kind: 'SinceEvent', AnchorDateField: 'Ghost' }, ASOF, {
      ID: 'm1',
    })).toEqual([]);
  });
});

describe('aggregateAsOf — SQL NULL rules', () => {
  const record: SourceRow = { ID: 'm1' };
  const valued = rows(
    ['2026-05-10T00:00:00Z', { amount: 10 }],
    ['2026-05-12T00:00:00Z', { amount: null }], // NULL excluded from field aggregates
    ['2026-05-14T00:00:00Z', { amount: 30 }],
  );

  it('count / exists over an empty set are 0, not null', () => {
    expect(aggregateAsOf([], 'count', null, null, ASOF, record)).toBe(0);
    expect(aggregateAsOf([], 'exists', null, null, ASOF, record)).toBe(0);
  });

  it('sum/avg/min/max over an empty set are null; recency too', () => {
    for (const kind of ['sum', 'avg', 'min', 'max'] as const) {
      expect(aggregateAsOf([], kind, 'amount', null, ASOF, record)).toBeNull();
    }
    expect(aggregateAsOf([], 'recency', null, null, ASOF, record)).toBeNull();
  });

  it('NULL field values are excluded from sum/avg/min/max', () => {
    expect(aggregateAsOf(valued, 'sum', 'amount', null, ASOF, record)).toBe(40);
    expect(aggregateAsOf(valued, 'avg', 'amount', null, ASOF, record)).toBe(20);
    expect(aggregateAsOf(valued, 'min', 'amount', null, ASOF, record)).toBe(10);
    expect(aggregateAsOf(valued, 'max', 'amount', null, ASOF, record)).toBe(30);
  });

  it('distinct_count counts distinct non-null values', () => {
    const dup = rows(
      ['2026-05-10T00:00:00Z', { kind: 'call' }],
      ['2026-05-11T00:00:00Z', { kind: 'call' }],
      ['2026-05-12T00:00:00Z', { kind: 'email' }],
    );
    expect(aggregateAsOf(dup, 'distinct_count', 'kind', null, ASOF, record)).toBe(2);
  });

  it('recency is the whole-day gap from the as-of date to the last surviving row', () => {
    expect(aggregateAsOf(valued, 'recency', null, null, ASOF, record)).toBe(18); // Jun 1 − May 14
  });

  it('a field-taking aggregate without a Field fails loud', () => {
    expect(() => aggregateAsOf(valued, 'sum', null, null, ASOF, record)).toThrow(/requires a Field/);
  });

  it('rate_per_period is the per-30-day rate over the window; null for AllTime', () => {
    const window = { Kind: 'Rolling', LengthDays: 60 } as const;
    const inWindow = rows(['2026-05-10T00:00:00Z'], ['2026-05-20T00:00:00Z'], ['2026-05-30T00:00:00Z']);
    expect(aggregateAsOf(inWindow, 'rate_per_period', null, window, ASOF, record)).toBeCloseTo(1.5);
    expect(aggregateAsOf(inWindow, 'rate_per_period', null, null, ASOF, record)).toBeNull();
  });

  it('trend_slope is positive for accelerating activity and negative for fading', () => {
    const window = { Kind: 'Rolling', LengthDays: 90 } as const;
    const accelerating = rows(
      ['2026-03-10T00:00:00Z'],
      ['2026-04-15T00:00:00Z'], ['2026-04-20T00:00:00Z'],
      ['2026-05-10T00:00:00Z'], ['2026-05-15T00:00:00Z'], ['2026-05-25T00:00:00Z'],
    );
    const fading = rows(
      ['2026-03-05T00:00:00Z'], ['2026-03-10T00:00:00Z'], ['2026-03-15T00:00:00Z'],
      ['2026-04-15T00:00:00Z'], ['2026-04-20T00:00:00Z'],
      ['2026-05-25T00:00:00Z'],
    );
    expect(aggregateAsOf(accelerating, 'trend_slope', null, window, ASOF, record) as number).toBeGreaterThan(0);
    expect(aggregateAsOf(fading, 'trend_slope', null, window, ASOF, record) as number).toBeLessThan(0);
    expect(aggregateAsOf(accelerating, 'trend_slope', null, { Kind: 'Rolling', LengthDays: 30 }, ASOF, record)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Executor integration: windowed aggregates + the presence mask, end to end
// ---------------------------------------------------------------------------

class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(private tables: Record<string, SourceRow[]>) {}
  async fetchRows(req: FetchRowsRequest): Promise<FetchRowsResult> {
    const rows = this.tables[req.EntityName];
    return rows ? { Success: true, Rows: rows } : { Success: false, Rows: [], ErrorMessage: `no table ${req.EntityName}` };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

const noLeakGuard: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 };
const sources: SourceBinding[] = [{ Kind: 'Entity', Ref: 'Members' }];

describe('FeatureAssemblyExecutor — widened as-of features', () => {
  it('computes a windowed sum and the hadData presence mask per record', async () => {
    const members: SourceRow[] = [
      { ID: 'active', tenure: 4, DecidedAt: '2026-06-01T00:00:00Z' },
      { ID: 'silent', tenure: 9, DecidedAt: '2026-06-01T00:00:00Z' },
    ];
    const payments: SourceRow[] = [
      { ID: 'p1', MemberID: 'active', PaidAt: '2026-05-10T00:00:00Z', Amount: 100 },
      { ID: 'p2', MemberID: 'active', PaidAt: '2026-05-20T00:00:00Z', Amount: 50 },
      { ID: 'p3', MemberID: 'active', PaidAt: '2025-01-01T00:00:00Z', Amount: 999 }, // outside the window
      { ID: 'p4', MemberID: 'active', PaidAt: '2026-06-15T00:00:00Z', Amount: 777 }, // AFTER as-of: leakage-filtered
    ];
    const datedSources: DatedSourceSpec[] = [
      {
        EntityName: 'Payments',
        ForeignKeyField: 'MemberID',
        DateField: 'PaidAt',
        Features: [
          {
            OutputColumn: 'paid_90d',
            Aggregate: 'sum',
            Field: 'Amount',
            Window: { Kind: 'Rolling', LengthDays: 90 },
            EmitPresence: true,
          },
        ],
      },
    ];
    const asOf: AsOfStrategy = { Mode: 'column', Column: 'DecidedAt' };
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      records: members,
      sources,
      steps: { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure'] }] },
      asOf,
      leakageGuard: noLeakGuard,
      datedSources,
      dataAccess: new InMemoryDataAccess({ Members: members, Payments: payments }),
    });

    const cols = result.matrix.columns;
    expect(cols).toEqual(expect.arrayContaining(['paid_90d', 'paid_90d__present']));
    const paid = cols.indexOf('paid_90d');
    const present = cols.indexOf('paid_90d__present');
    // active: only p1+p2 inside (window excludes p3; as-of excludes p4) → 150, present 1
    expect(result.matrix.rows[0][paid]).toBe(150);
    expect(result.matrix.rows[0][present]).toBe(1);
    // silent: no rows → sum null, present 0 — a real zero and absence are DIFFERENT cells
    expect(result.matrix.rows[1][paid]).toBeNull();
    expect(result.matrix.rows[1][present]).toBe(0);

    // ...and the schema SAYS so. A mask typed `numeric` would let the rubric's MissingDataPolicy
    // and the statistics pass treat "we never knew" as a measured zero.
    const kinds = new Map(result.featureSchema.map((f) => [f.Name, f.Kind]));
    expect(kinds.get('paid_90d__present')).toBe('presence');
    expect(kinds.get('paid_90d')).toBe('numeric');
  });

  it('legacy aliases still assemble identically (count/recency spelling)', async () => {
    const members: SourceRow[] = [{ ID: 'm1', tenure: 1, DecidedAt: '2026-06-01T00:00:00Z' }];
    const acts: SourceRow[] = [
      { ID: 'a1', MemberID: 'm1', At: '2026-05-25T00:00:00Z' },
      { ID: 'a2', MemberID: 'm1', At: '2026-05-28T00:00:00Z' },
    ];
    const datedSources: DatedSourceSpec[] = [
      {
        EntityName: 'Acts',
        ForeignKeyField: 'MemberID',
        DateField: 'At',
        Features: [
          { OutputColumn: 'legacy_count', Aggregate: 'activity_count' },
          { OutputColumn: 'new_count', Aggregate: 'count' },
          { OutputColumn: 'legacy_recency', Aggregate: 'days_since_last_activity' },
          { OutputColumn: 'new_recency', Aggregate: 'recency' },
        ],
      },
    ];
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      records: members,
      sources,
      steps: { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure'] }] },
      asOf: { Mode: 'column', Column: 'DecidedAt' },
      leakageGuard: noLeakGuard,
      datedSources,
      dataAccess: new InMemoryDataAccess({ Members: members, Acts: acts }),
    });
    const cols = result.matrix.columns;
    const row = result.matrix.rows[0];
    expect(row[cols.indexOf('legacy_count')]).toBe(row[cols.indexOf('new_count')]);
    expect(row[cols.indexOf('legacy_recency')]).toBe(row[cols.indexOf('new_recency')]);
    expect(row[cols.indexOf('new_count')]).toBe(2);
    expect(row[cols.indexOf('new_recency')]).toBe(4);
  });
});
