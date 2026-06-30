import { describe, it, expect } from 'vitest';
import type { FeatureStepGraph, SourceBinding, AsOfStrategy, LeakageGuard } from '@memberjunction/predictive-studio-core';
import {
  FeatureAssemblyExecutor,
  type FeatureAssemblyParams,
  type IFeatureDataAccess,
  type FetchRowsParams,
  type FetchRowsResult,
  type SourceRow,
  type DatedSourceSpec,
  detectSingleFeatureDominance,
  LeakageGuardEnforcer,
  resolveAsOfDate,
  daysSinceLastActivityAsOf,
} from '../feature-assembly';

/**
 * Unit tests for the FeatureAssembly executor + as-of / leakage primitives.
 * NO live DB — all data access is an in-memory fixture implementing
 * {@link IFeatureDataAccess}.
 */

/**
 * In-memory data-access fixture. Rows are keyed by entity name; embeddings are
 * keyed by `entity|recordId`. This replaces RunView/the database entirely.
 */
class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(
    private readonly rowsByEntity: Record<string, SourceRow[]>,
    private readonly embeddings: Record<string, number[]> = {},
  ) {}

  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    const rows = this.rowsByEntity[params.EntityName];
    if (!rows) {
      return { Success: false, Rows: [], ErrorMessage: `No fixture for ${params.EntityName}` };
    }
    return { Success: true, Rows: rows };
  }

  async fetchEmbedding(entity: string, recordId: string, _embeddingModelRef: string, _dims: number): Promise<number[] | null> {
    return this.embeddings[`${entity}|${recordId}`] ?? null;
  }
}

const noLeakGuard: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 };
const sources: SourceBinding[] = [{ Kind: 'Entity', Ref: 'Members' }];

describe('FeatureAssemblyExecutor — member retention assembly', () => {
  it('assembles a raw matrix + schema + preprocessing ops (preprocessing NOT applied)', async () => {
    const members: SourceRow[] = [
      { ID: 'm1', tenure: 12, events_at_signup: 3, city: 'NYC', Renewed: 1 },
      { ID: 'm2', tenure: 3, events_at_signup: 1, city: 'LA', Renewed: 0 },
    ];
    const embeddings = {
      'Members|m1': [0.1, 0.2],
      'Members|m2': [0.3, 0.4],
    };
    const dataAccess = new InMemoryDataAccess({ Members: members }, embeddings);

    const steps: FeatureStepGraph = {
      Steps: [
        { Id: 's1', Kind: 'select', Columns: ['tenure', 'events_at_signup', 'city'] },
        { Id: 's2', Kind: 'embedding', Entity: 'Members', EmbeddingModelRef: 'minilm', Dims: 2 },
        // Preprocessing steps → must become ops, NOT transform values.
        { Id: 's3', Kind: 'impute', Column: 'tenure', Strategy: 'mean' },
        { Id: 's4', Kind: 'standardize', Columns: ['tenure', 'events_at_signup'] },
        { Id: 's5', Kind: 'onehot', Column: 'city' },
      ],
    };

    const params: FeatureAssemblyParams = {
      targetEntityName: 'Members',
      records: members,
      sources,
      steps,
      asOf: { Mode: 'none' },
      leakageGuard: noLeakGuard,
      targetVariable: 'Renewed',
      dataAccess,
      context: 'train',
    };

    const result = await new FeatureAssemblyExecutor().assemble(params);

    // Schema order: select cols, then embedding dims (target NOT in schema).
    expect(result.featureSchema.map((s) => s.Name)).toEqual(['tenure', 'events_at_signup', 'city', 'emb_0', 'emb_1']);
    expect(result.featureSchema.find((s) => s.Name === 'emb_0')?.Kind).toBe('embedding');
    expect(result.featureSchema.find((s) => s.Name === 'city')?.Kind).toBe('numeric');

    // Matrix columns = schema + target variable last.
    expect(result.matrix.columns).toEqual(['tenure', 'events_at_signup', 'city', 'emb_0', 'emb_1', 'Renewed']);

    // RAW values — city stays 'NYC' (NOT one-hot expanded), tenure unscaled.
    expect(result.matrix.rows[0]).toEqual([12, 3, 'NYC', 0.1, 0.2, 1]);
    expect(result.matrix.rows[1]).toEqual([3, 1, 'LA', 0.3, 0.4, 0]);

    // Preprocessing EMITTED (not applied) and ordered.
    expect(result.preprocessing).toEqual([
      { op: 'impute', col: 'tenure', strategy: 'mean', fillValue: undefined },
      { op: 'standardize', cols: ['tenure', 'events_at_signup'] },
      { op: 'onehot', col: 'city' },
    ]);

    expect(result.assembledAsOf).toBeDefined();
  });

  it('emits a bin op carrying the configured bin count (NOT the sidecar default)', async () => {
    const members: SourceRow[] = [{ ID: 'm1', score: 5, Renewed: 1 }];
    const dataAccess = new InMemoryDataAccess({ Members: members });
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      records: members,
      sources,
      steps: {
        Steps: [
          { Id: 's', Kind: 'select', Columns: ['score'] },
          { Id: 'b', Kind: 'bin', Column: 'score', Bins: 7 },
        ],
      },
      asOf: { Mode: 'none' },
      leakageGuard: noLeakGuard,
      targetVariable: 'Renewed',
      dataAccess,
    });
    // The configured count (7) must travel in `bins` — the sidecar otherwise defaults to 4.
    expect(result.preprocessing).toEqual([{ op: 'bin', col: 'score', bins: 7 }]);
  });

  it('zero-fills embedding dims when no persisted vector exists (never regenerates)', async () => {
    const members: SourceRow[] = [{ ID: 'm1', tenure: 5 }];
    const dataAccess = new InMemoryDataAccess({ Members: members }, {}); // no embeddings
    const steps: FeatureStepGraph = {
      Steps: [{ Id: 'e', Kind: 'embedding', Entity: 'Members', EmbeddingModelRef: 'minilm', Dims: 3 }],
    };
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      records: members,
      sources,
      steps,
      asOf: { Mode: 'none' },
      leakageGuard: noLeakGuard,
      dataAccess,
    });
    expect(result.matrix.rows[0]).toEqual([0, 0, 0]);
  });

  it('fetches records via the recordSet descriptor when records are not inline', async () => {
    const members: SourceRow[] = [{ ID: 'm1', tenure: 9 }];
    const dataAccess = new InMemoryDataAccess({ Members: members });
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      recordSet: { EntityName: 'Members' },
      sources,
      steps: { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure'] }] },
      asOf: { Mode: 'none' },
      leakageGuard: noLeakGuard,
      dataAccess,
    });
    expect(result.matrix.rows).toEqual([[9]]);
  });
});

describe('FeatureAssemblyExecutor — golden as-of test (no future leakage)', () => {
  it('offset mode reflects ONLY pre-decision activity and differs from computed-at-now', async () => {
    // Decision date anchor: label event at 2026-06-01; offset 30 days → as-of 2026-05-02.
    const labelEvent = new Date('2026-06-01T00:00:00Z');
    const members: SourceRow[] = [{ ID: 'm1', tenure: 10, Renewed: 1 }];

    // Activity rows BEFORE and AFTER the as-of cutoff (2026-05-02).
    const activities: SourceRow[] = [
      { ID: 'a1', MemberID: 'm1', ActivityDate: '2026-04-10T00:00:00Z' }, // pre-cutoff
      { ID: 'a2', MemberID: 'm1', ActivityDate: '2026-04-25T00:00:00Z' }, // pre-cutoff (most recent pre)
      { ID: 'a3', MemberID: 'm1', ActivityDate: '2026-05-20T00:00:00Z' }, // POST-cutoff (must be ignored)
      { ID: 'a4', MemberID: 'm1', ActivityDate: '2026-06-15T00:00:00Z' }, // POST-cutoff (must be ignored)
    ];
    const dataAccess = new InMemoryDataAccess({ Members: members, Activities: activities });

    const datedSources: DatedSourceSpec[] = [
      {
        EntityName: 'Activities',
        ForeignKeyField: 'MemberID',
        DateField: 'ActivityDate',
        Features: [
          { OutputColumn: 'days_since_last_activity_asof', Aggregate: 'days_since_last_activity' },
          { OutputColumn: 'activity_count_asof', Aggregate: 'activity_count' },
        ],
      },
    ];

    const asOf: AsOfStrategy = { Mode: 'offset', OffsetDays: 30 };
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      records: members,
      sources,
      steps: { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure'] }] },
      asOf,
      leakageGuard: noLeakGuard,
      datedSources,
      labelEventDates: { m1: labelEvent },
      targetVariable: 'Renewed',
      dataAccess,
      context: 'train',
    });

    // Columns: tenure, days_since..., activity_count..., Renewed
    const recencyIdx = result.matrix.columns.indexOf('days_since_last_activity_asof');
    const countIdx = result.matrix.columns.indexOf('activity_count_asof');

    // As-of cutoff = 2026-05-02. Most recent PRE-decision activity = 2026-04-25.
    // days(2026-05-02 - 2026-04-25) = 7.
    expect(result.matrix.rows[0][recencyIdx]).toBe(7);
    // Only the 2 pre-cutoff activities counted (a3, a4 excluded).
    expect(result.matrix.rows[0][countIdx]).toBe(2);

    // PROVE no future leakage: a naive "computed-at-now" recency (no as-of filter)
    // would use the post-decision activity a4 (2026-06-15) and produce a different,
    // smaller number. Assert the as-of value differs from the naive value.
    const allDated = activities.map((a) => ({ Date: new Date(a.ActivityDate as string), Row: a }));
    const naiveRecency = daysSinceLastActivityAsOf(allDated, null); // measured from "now"
    expect(naiveRecency).not.toBe(7);

    // And the as-of recency, recomputed directly, excludes the post-cutoff rows.
    const cutoff = resolveAsOfDate(asOf, members[0], labelEvent);
    expect(daysSinceLastActivityAsOf(allDated, cutoff)).toBe(7);
  });

  it('column mode resolves the as-of date from a per-record decision-date column', () => {
    const record: SourceRow = { ID: 'm1', DecisionDate: '2026-03-15T00:00:00Z' };
    const asOf: AsOfStrategy = { Mode: 'column', Column: 'DecisionDate' };
    const resolved = resolveAsOfDate(asOf, record, null);
    expect(resolved?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('none mode applies no point-in-time filtering (null cutoff)', () => {
    expect(resolveAsOfDate({ Mode: 'none' }, { ID: 'm1' }, null)).toBeNull();
  });
});

describe('LeakageGuard', () => {
  it('excludes deny-listed fields from the matrix (case/whitespace-insensitive)', async () => {
    const members: SourceRow[] = [{ ID: 'm1', tenure: 5, cancelled_flag: 1, Renewed: 0 }];
    const dataAccess = new InMemoryDataAccess({ Members: members });
    const guard: LeakageGuard = {
      DenyFields: [' Cancelled_Flag '], // different case + whitespace
      SingleFeatureDominanceThreshold: 0.6,
    };
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      records: members,
      sources,
      steps: { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure', 'cancelled_flag'] }] },
      asOf: { Mode: 'none' },
      leakageGuard: guard,
      targetVariable: 'Renewed',
      dataAccess,
    });
    expect(result.matrix.columns).toEqual(['tenure', 'Renewed']);
    expect(result.featureSchema.map((s) => s.Name)).toEqual(['tenure']);
  });

  it('also drops deny-listed columns from preprocessing ops (defense in depth)', async () => {
    const members: SourceRow[] = [{ ID: 'm1', tenure: 5, leaky: 9 }];
    const dataAccess = new InMemoryDataAccess({ Members: members });
    const guard: LeakageGuard = { DenyFields: ['leaky'], SingleFeatureDominanceThreshold: 0.6 };
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      records: members,
      sources,
      steps: {
        Steps: [
          { Id: 's', Kind: 'select', Columns: ['tenure', 'leaky'] },
          { Id: 'p', Kind: 'standardize', Columns: ['tenure', 'leaky'] },
        ],
      },
      asOf: { Mode: 'none' },
      leakageGuard: guard,
      dataAccess,
    });
    expect(result.preprocessing).toEqual([{ op: 'standardize', cols: ['tenure'] }]);
  });

  it('LeakageGuardEnforcer partitions columns', () => {
    const enforcer = new LeakageGuardEnforcer({ DenyFields: ['x'], SingleFeatureDominanceThreshold: 0.6 });
    expect(enforcer.partitionColumns(['x', 'y'])).toEqual({ allowed: ['y'], denied: ['x'] });
    expect(enforcer.isSourceAllowed('AnySource')).toBe(true);
  });

  it('detectSingleFeatureDominance flags importance over threshold', () => {
    const dominant = detectSingleFeatureDominance({ a: 0.8, b: 0.1, c: 0.1 }, 0.6);
    expect(dominant.Dominant).toBe(true);
    expect(dominant.TopFeature).toBe('a');
    expect(dominant.TopShare).toBeCloseTo(0.8, 5);
  });

  it('detectSingleFeatureDominance does not flag a balanced model', () => {
    const balanced = detectSingleFeatureDominance({ a: 0.34, b: 0.33, c: 0.33 }, 0.6);
    expect(balanced.Dominant).toBe(false);
  });

  it('detectSingleFeatureDominance handles signed importances via magnitude and empty maps', () => {
    expect(detectSingleFeatureDominance({ a: -0.9, b: 0.1 }, 0.6).Dominant).toBe(true);
    expect(detectSingleFeatureDominance({}, 0.6).Dominant).toBe(false);
  });
});
