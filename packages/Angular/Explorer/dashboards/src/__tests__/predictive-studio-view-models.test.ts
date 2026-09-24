import { describe, it, expect } from 'vitest';
import {
  PS_FEATURE_DOMINANCE_THRESHOLD,
  algoStyle,
  BestIterationScore,
  BuildActivityFeed,
  BuildCompareMetricRows,
  CanonicalMetricKey,
  CoerceFiniteNumber,
  ComputeHomeKpis,
  DeriveCompareColumns,
  DeriveLeaderboard,
  DeriveModelEvents,
  FormatMetricValue,
  GroupIterationsToKanban,
  MaxFeatureImportance,
  MetricsToDisplay,
  OverfitGap,
  ParseFeatureImportance,
  ParseMetrics,
  PrimaryAuc,
  RelativeTime,
  ToDate,
  PSIterationRow,
  PSModelRow,
  PSModelEventSource,
  PSProcessRunRow,
} from '../PredictiveStudio/predictive-studio.view-models';

// ---------------------------------------------------------------------------
// test fixtures
// ---------------------------------------------------------------------------

function model(overrides: Partial<PSModelRow>): PSModelRow {
  return {
    ID: 'm1',
    Version: 1,
    Status: 'Published',
    AlgorithmID: 'a1',
    PipelineID: 'p1',
    Metrics: null,
    HoldoutMetrics: null,
    FeatureImportance: null,
    TargetVariable: null,
    ProblemType: 'classification',
    ...overrides,
  };
}

function iteration(overrides: Partial<PSIterationRow>): PSIterationRow {
  return {
    ID: 'i1',
    ExperimentSessionID: 's1',
    Sequence: 1,
    Label: null,
    Status: 'Completed',
    Score: null,
    ComputeCost: null,
    TokensUsed: null,
    Rationale: null,
    ...overrides,
  };
}

function processRun(overrides: Partial<PSProcessRunRow>): PSProcessRunRow {
  return {
    ID: 'r1',
    Status: 'Completed',
    StartTime: new Date('2026-06-20T10:00:00Z'),
    CreatedAt: new Date('2026-06-20T10:00:00Z'),
    SuccessCount: 100,
    TotalItemCount: 100,
    ProcessName: 'Score Renewals',
    EntityName: 'Members',
    DryRun: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// metric parsing
// ---------------------------------------------------------------------------

describe('parseMetrics', () => {
  it('parses canonical keys', () => {
    expect(ParseMetrics('{"AUC":0.86,"F1":0.75}')).toEqual({ AUC: 0.86, F1: 0.75 });
  });

  it('parses common aliases case-insensitively', () => {
    expect(ParseMetrics('{"auc":0.8,"f1_score":0.7,"log_loss":0.2}')).toEqual({ AUC: 0.8, F1: 0.7, LogLoss: 0.2 });
  });

  it('coerces numeric strings and ignores non-numeric values', () => {
    expect(ParseMetrics('{"AUC":"0.9","Note":"hello","Recall":null}')).toEqual({ AUC: 0.9 });
  });

  it('returns {} for null/empty/invalid/array input (never throws)', () => {
    expect(ParseMetrics(null)).toEqual({});
    expect(ParseMetrics('')).toEqual({});
    expect(ParseMetrics('not json')).toEqual({});
    expect(ParseMetrics('[1,2,3]')).toEqual({});
    expect(ParseMetrics('42')).toEqual({});
  });

  it('keeps the first value when duplicate-mapping keys collide', () => {
    // both 'AUC' and 'auc' map to AUC — first wins, no throw
    const result = ParseMetrics('{"AUC":0.9,"auc":0.1}');
    expect(result.AUC).toBe(0.9);
  });
});

describe('canonicalMetricKey', () => {
  it('resolves exact and alias keys, null otherwise', () => {
    expect(CanonicalMetricKey('AUC')).toBe('AUC');
    expect(CanonicalMetricKey('roc_auc')).toBe('AUC');
    expect(CanonicalMetricKey('  F1_Score ')).toBe('F1');
    expect(CanonicalMetricKey('unknown')).toBeNull();
  });
});

describe('primaryAuc', () => {
  it('prefers holdout AUC over training AUC', () => {
    expect(PrimaryAuc(model({ Metrics: '{"AUC":0.9}', HoldoutMetrics: '{"AUC":0.85}' }))).toBe(0.85);
  });
  it('falls back to training AUC when holdout absent', () => {
    expect(PrimaryAuc(model({ Metrics: '{"AUC":0.9}', HoldoutMetrics: null }))).toBe(0.9);
  });
  it('returns null when neither present', () => {
    expect(PrimaryAuc(model({}))).toBeNull();
  });
});

describe('metricsToDisplay', () => {
  it('orders canonically, excludes AUC by default, only present keys', () => {
    const display = MetricsToDisplay(ParseMetrics('{"F1":0.75,"Precision":0.8,"AUC":0.9}'));
    expect(display.map((d) => d.key)).toEqual(['Precision', 'F1']);
    expect(display.find((d) => d.key === 'Precision')?.value).toBe('0.80');
  });
  it('can include AUC when asked', () => {
    const display = MetricsToDisplay(ParseMetrics('{"AUC":0.9}'), { excludeAuc: false });
    expect(display.map((d) => d.key)).toEqual(['AUC']);
  });
  it('returns [] for empty metrics', () => {
    expect(MetricsToDisplay({})).toEqual([]);
  });
});

describe('formatMetricValue', () => {
  it('uses 3 decimals for ratio metrics, 2 otherwise', () => {
    expect(FormatMetricValue('AUC', 0.8642)).toBe('0.864');
    expect(FormatMetricValue('Precision', 0.789)).toBe('0.79');
  });
});

describe('overfitGap', () => {
  it('computes train - holdout, null when either missing', () => {
    expect(OverfitGap(model({ Metrics: '{"AUC":0.9}', HoldoutMetrics: '{"AUC":0.86}' }))).toBeCloseTo(0.04, 5);
    expect(OverfitGap(model({ Metrics: '{"AUC":0.9}' }))).toBeNull();
    expect(OverfitGap(model({}))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// feature importance
// ---------------------------------------------------------------------------

describe('parseFeatureImportance', () => {
  it('sorts by |value| desc, normalizes, flags dominance, caps at topN', () => {
    const json = '{"a":0.2,"b":0.7,"c":0.1,"d":0.05,"e":0.4,"f":0.02,"g":0.01}';
    const bars = ParseFeatureImportance(json, 3);
    expect(bars.map((b) => b.name)).toEqual(['b', 'e', 'a']);
    expect(bars[0].pct).toBe(100); // largest fills the track
    expect(bars[0].warning).toBe(true); // 0.7 >= 0.6
    expect(bars[1].warning).toBe(false); // 0.4 < 0.6
  });

  it('handles negative importances by absolute value', () => {
    const bars = ParseFeatureImportance('{"a":-0.8,"b":0.3}', 2);
    expect(bars[0].name).toBe('a');
    expect(bars[0].warning).toBe(true);
  });

  it('accepts the array-of-objects shape', () => {
    const bars = ParseFeatureImportance('[{"feature":"x","importance":0.5},{"name":"y","value":0.9}]', 5);
    expect(bars[0].name).toBe('y');
    expect(bars[1].name).toBe('x');
  });

  it('returns [] for null/invalid/empty (never throws)', () => {
    expect(ParseFeatureImportance(null)).toEqual([]);
    expect(ParseFeatureImportance('garbage')).toEqual([]);
    expect(ParseFeatureImportance('{}')).toEqual([]);
  });
});

describe('maxFeatureImportance', () => {
  it('returns the largest absolute importance or null', () => {
    expect(MaxFeatureImportance('{"a":0.2,"b":-0.7}')).toBe(0.7);
    expect(MaxFeatureImportance(null)).toBeNull();
    expect(MaxFeatureImportance('{}')).toBeNull();
  });
  it('threshold constant is 0.6', () => {
    expect(PS_FEATURE_DOMINANCE_THRESHOLD).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// algorithm styling
// ---------------------------------------------------------------------------

describe('algoStyle', () => {
  it('maps known algorithms to distinct icons', () => {
    expect(algoStyle('XGBoost').icon).toContain('bolt');
    expect(algoStyle('LightGBM').icon).toContain('feather');
    expect(algoStyle('Random Forest').icon).toContain('tree');
    expect(algoStyle('Logistic Regression').icon).toContain('wave-square');
  });
  it('falls back for unknown/empty', () => {
    expect(algoStyle('Quantum Magic').icon).toContain('cube');
    expect(algoStyle(null).icon).toContain('cube');
  });
});

// ---------------------------------------------------------------------------
// experiments — kanban + leaderboard
// ---------------------------------------------------------------------------

describe('groupIterationsToKanban', () => {
  const rows: PSIterationRow[] = [
    iteration({ ID: 'a', Sequence: 1, Status: 'Completed', Score: 0.86, AlgorithmName: 'XGBoost' }),
    iteration({ ID: 'b', Sequence: 2, Status: 'Completed', Score: 0.84, AlgorithmName: 'LightGBM' }),
    iteration({ ID: 'c', Sequence: 3, Status: 'Running', AlgorithmName: 'CatBoost' }),
    iteration({ ID: 'd', Sequence: 4, Status: 'Pending', AlgorithmName: 'MLP' }),
    iteration({ ID: 'e', Sequence: 5, Status: 'Pruned', Score: 0.7, AlgorithmName: 'XGBoost' }),
    iteration({ ID: 'f', Sequence: 6, Status: 'Failed', AlgorithmName: 'MLP' }),
  ];

  it('buckets by status; Pending→running, Failed→pruned', () => {
    const k = GroupIterationsToKanban(rows);
    expect(k.Running.length).toBe(2); // Running + Pending
    expect(k.Completed.length).toBe(2);
    expect(k.Pruned.length).toBe(2); // Pruned + Failed
  });

  it('badges the single best completed iteration', () => {
    const k = GroupIterationsToKanban(rows);
    const best = k.Completed.filter((c) => c.Status === 'Best');
    expect(best.length).toBe(1);
    expect(best[0].score).toBe(0.86);
  });

  it('computes Δ-from-best for non-best completed', () => {
    const k = GroupIterationsToKanban(rows);
    const challenger = k.Completed.find((c) => c.score === 0.84);
    expect(challenger?.ScoreDelta).toBe('Δ −0.020');
  });

  it('handles an empty set', () => {
    expect(GroupIterationsToKanban([])).toEqual({ Running: [], Completed: [], Pruned: [] });
  });
});

describe('bestIterationScore', () => {
  it('returns the max completed score, null when none', () => {
    expect(BestIterationScore([iteration({ Status: 'Completed', Score: 0.8 }), iteration({ Status: 'Completed', Score: 0.9 })])).toBe(0.9);
    expect(BestIterationScore([iteration({ Status: 'Running', Score: 0.99 })])).toBeNull();
    expect(BestIterationScore([])).toBeNull();
  });
});

describe('deriveLeaderboard', () => {
  it('ranks scored iterations desc, flags best + pruned, omits unscored', () => {
    const rows = [
      iteration({ ID: 'a', Status: 'Completed', Score: 0.8, AlgorithmName: 'XGBoost', Label: 'engagement' }),
      iteration({ ID: 'b', Status: 'Completed', Score: 0.86, AlgorithmName: 'LightGBM' }),
      iteration({ ID: 'c', Status: 'Pruned', Score: 0.6, AlgorithmName: 'MLP' }),
      iteration({ ID: 'd', Status: 'Running', Score: null }),
    ];
    const lb = DeriveLeaderboard(rows);
    expect(lb.length).toBe(3);
    expect(lb[0].auc).toBe(0.86);
    expect(lb[0].best).toBe(true);
    expect(lb.find((e) => e.algorithm === 'MLP')?.pruned).toBe(true);
  });

  it('caps at topN and returns [] for no scores', () => {
    expect(DeriveLeaderboard([], 5)).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => iteration({ ID: `i${i}`, Status: 'Completed', Score: i / 10 }));
    expect(DeriveLeaderboard(many, 4).length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// home — KPIs + activity feed
// ---------------------------------------------------------------------------

describe('computeHomeKpis', () => {
  it('counts published, best holdout, scored-this-week', () => {
    const models = [
      model({ ID: 'm1', Status: 'Published', HoldoutMetrics: '{"AUC":0.86}' }),
      model({ ID: 'm2', Status: 'Published', HoldoutMetrics: '{"AUC":0.91}' }),
      model({ ID: 'm3', Status: 'Draft' }),
    ];
    const runs = [processRun({ SuccessCount: 1000 }), processRun({ SuccessCount: 500 })];
    const kpis = ComputeHomeKpis(models, 2, runs, 14);
    expect(kpis.PublishedCount).toBe(2);
    expect(kpis.ActiveExperiments).toBe(2);
    expect(kpis.BestHoldout).toBe('0.910');
    expect(kpis.ScoredThisWeek).toBe((1500).toLocaleString());
    expect(kpis.ExperimentRuns).toBe(14);
  });

  it('degrades gracefully with no data', () => {
    const kpis = ComputeHomeKpis([], 0, [], 0);
    expect(kpis.BestHoldout).toBe('—');
    expect(kpis.ScoredThisWeek).toBe('0');
    expect(kpis.PublishedCount).toBe(0);
  });
});

describe('deriveModelEvents', () => {
  it('projects published/validated→promote, archived→archive, ordered by time', () => {
    const sources: PSModelEventSource[] = [
      { Name: 'A', Algorithm: 'XGBoost', Status: 'Published', Metrics: null, HoldoutMetrics: '{"AUC":0.8}', UpdatedAt: new Date('2026-06-20') },
      { Name: 'B', Algorithm: 'LightGBM', Status: 'Archived', Metrics: null, HoldoutMetrics: null, UpdatedAt: new Date('2026-06-25') },
      { Name: 'C', Algorithm: 'RF', Status: 'Draft', Metrics: null, HoldoutMetrics: null, UpdatedAt: new Date('2026-06-26') },
    ];
    const events = DeriveModelEvents(sources);
    expect(events.length).toBe(2); // Draft excluded
    expect(events[0].name).toBe('B'); // most recent first
    expect(events[0].Kind).toBe('archive');
    expect(events[1].Kind).toBe('promote');
  });
});

describe('buildActivityFeed', () => {
  const now = new Date('2026-06-26T12:00:00Z');
  it('merges runs + model events, newest first, capped', () => {
    const runs = [
      processRun({ ID: 'r1', Status: 'Completed', SuccessCount: 200, StartTime: new Date('2026-06-26T11:30:00Z') }),
      processRun({ ID: 'r2', Status: 'Failed', StartTime: new Date('2026-06-25T11:30:00Z') }),
    ];
    const events = DeriveModelEvents([
      { Name: 'A', Algorithm: 'XGBoost', Status: 'Published', Metrics: null, HoldoutMetrics: '{"AUC":0.86}', UpdatedAt: new Date('2026-06-26T11:00:00Z') },
    ]);
    const feed = BuildActivityFeed(runs, events, now, 6);
    expect(feed.length).toBe(3);
    expect(feed[0].Kind).toBe('run'); // 11:30 most recent
    expect(feed.find((f) => f.Kind === 'warn')).toBeTruthy(); // failed run
    expect(feed.find((f) => f.Kind === 'promote')?.title).toContain('promoted to Published');
  });

  it('respects the limit and handles empty', () => {
    expect(BuildActivityFeed([], [], now)).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => processRun({ ID: `r${i}`, StartTime: new Date(now.getTime() - i * 60000) }));
    expect(BuildActivityFeed(many, [], now, 3).length).toBe(3);
  });

  it('does not crash on a run with no usable timestamp (null StartTime + CreatedAt)', () => {
    // A just-created run can transiently arrive with no usable date — must not crash the whole feed.
    const runs = [processRun({ ID: 'r-nodate', Status: 'Completed', SuccessCount: 5, StartTime: null, CreatedAt: null })];
    let feed: ReturnType<typeof BuildActivityFeed> = [];
    expect(() => { feed = BuildActivityFeed(runs, [], now, 6); }).not.toThrow();
    expect(feed.length).toBe(1);
    expect(feed[0].When).toBe('just now'); // falls back to `now`
    expect(Number.isNaN(feed[0].SortMs)).toBe(false);
  });
});

describe('toDate', () => {
  it('coerces Date / ISO-string and rejects null / undefined / invalid', () => {
    const d = new Date('2026-06-26T12:00:00Z');
    expect(ToDate(d)).toBe(d);
    expect(ToDate('2026-06-26T12:00:00Z')?.getTime()).toBe(d.getTime());
    expect(ToDate(null)).toBeNull();
    expect(ToDate(undefined)).toBeNull();
    expect(ToDate('not-a-date')).toBeNull();
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-06-26T12:00:00Z');
  it('formats minutes/hours/days', () => {
    expect(RelativeTime(new Date('2026-06-26T11:59:30Z'), now)).toBe('just now');
    expect(RelativeTime(new Date('2026-06-26T11:38:00Z'), now)).toBe('22 minutes ago');
    expect(RelativeTime(new Date('2026-06-26T09:00:00Z'), now)).toBe('3 hours ago');
    expect(RelativeTime(new Date('2026-06-25T12:00:00Z'), now)).toBe('Yesterday');
    expect(RelativeTime(new Date('2026-06-23T12:00:00Z'), now)).toBe('3 days ago');
  });
  it('handles future timestamps as just now', () => {
    expect(RelativeTime(new Date('2026-06-26T13:00:00Z'), now)).toBe('just now');
  });
});

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

describe('deriveCompareColumns', () => {
  it('ranks scored iterations desc, caps at maxRuns, flags best', () => {
    const rows = [
      iteration({ ID: 'a', Status: 'Completed', Score: 0.8, AlgorithmName: 'XGBoost', ComputeCost: 10 }),
      iteration({ ID: 'b', Status: 'Completed', Score: 0.86, AlgorithmName: 'LightGBM', ComputeCost: 5 }),
      iteration({ ID: 'c', Status: 'Completed', Score: 0.7, AlgorithmName: 'RF', ComputeCost: 2 }),
      iteration({ ID: 'd', Status: 'Running', Score: null }),
    ];
    const cols = DeriveCompareColumns(rows, 2);
    expect(cols.length).toBe(2);
    expect(cols[0].holdoutAuc).toBe(0.86);
    expect(cols[0].isBest).toBe(true);
    expect(cols[0].label).toBe('Run 1');
  });
  it('returns [] when nothing scored', () => {
    expect(DeriveCompareColumns([iteration({ Status: 'Running', Score: null })])).toEqual([]);
  });
});

describe('buildCompareMetricRows', () => {
  it('builds holdout (max-best) + cost (min-best) rows with formatted values', () => {
    const cols = DeriveCompareColumns([
      iteration({ ID: 'a', Status: 'Completed', Score: 0.86, ComputeCost: 10 }),
      iteration({ ID: 'b', Status: 'Completed', Score: 0.8, ComputeCost: 3 }),
    ]);
    const rows = BuildCompareMetricRows(cols);
    const auc = rows.find((r) => r.label === 'Holdout score')!;
    const cost = rows.find((r) => r.label === 'Compute cost')!;
    expect(auc.Values).toEqual(['0.860', '0.800']);
    expect(auc.BestIndex).toBe(0); // higher AUC
    expect(cost.BestIndex).toBe(1); // lower cost
  });

  it('formats missing values as — and yields no best index', () => {
    const cols = DeriveCompareColumns([iteration({ ID: 'a', Status: 'Completed', Score: 0.8, ComputeCost: null })]);
    const rows = BuildCompareMetricRows(cols);
    expect(rows.find((r) => r.label === 'Compute cost')!.Values).toEqual(['—']);
    expect(rows.find((r) => r.label === 'Compute cost')!.BestIndex).toBe(-1);
  });

  it('returns [] for empty columns', () => {
    expect(BuildCompareMetricRows([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// shared coercion
// ---------------------------------------------------------------------------

describe('coerceFiniteNumber', () => {
  it('accepts numbers + numeric strings, rejects junk/NaN/Infinity', () => {
    expect(CoerceFiniteNumber(3.14)).toBe(3.14);
    expect(CoerceFiniteNumber('2.5')).toBe(2.5);
    expect(CoerceFiniteNumber('  ')).toBeNull();
    expect(CoerceFiniteNumber('abc')).toBeNull();
    expect(CoerceFiniteNumber(NaN)).toBeNull();
    expect(CoerceFiniteNumber(Infinity)).toBeNull();
    expect(CoerceFiniteNumber(null)).toBeNull();
    expect(CoerceFiniteNumber({})).toBeNull();
  });
});
