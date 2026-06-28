import { describe, it, expect } from 'vitest';
import {
  PS_FEATURE_DOMINANCE_THRESHOLD,
  algoStyle,
  bestIterationScore,
  buildActivityFeed,
  buildCompareMetricRows,
  canonicalMetricKey,
  coerceFiniteNumber,
  computeHomeKpis,
  deriveCompareColumns,
  deriveLeaderboard,
  deriveModelEvents,
  formatMetricValue,
  groupIterationsToKanban,
  maxFeatureImportance,
  metricsToDisplay,
  overfitGap,
  parseFeatureImportance,
  parseMetrics,
  primaryAuc,
  relativeTime,
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
    expect(parseMetrics('{"AUC":0.86,"F1":0.75}')).toEqual({ AUC: 0.86, F1: 0.75 });
  });

  it('parses common aliases case-insensitively', () => {
    expect(parseMetrics('{"auc":0.8,"f1_score":0.7,"log_loss":0.2}')).toEqual({ AUC: 0.8, F1: 0.7, LogLoss: 0.2 });
  });

  it('coerces numeric strings and ignores non-numeric values', () => {
    expect(parseMetrics('{"AUC":"0.9","Note":"hello","Recall":null}')).toEqual({ AUC: 0.9 });
  });

  it('returns {} for null/empty/invalid/array input (never throws)', () => {
    expect(parseMetrics(null)).toEqual({});
    expect(parseMetrics('')).toEqual({});
    expect(parseMetrics('not json')).toEqual({});
    expect(parseMetrics('[1,2,3]')).toEqual({});
    expect(parseMetrics('42')).toEqual({});
  });

  it('keeps the first value when duplicate-mapping keys collide', () => {
    // both 'AUC' and 'auc' map to AUC — first wins, no throw
    const result = parseMetrics('{"AUC":0.9,"auc":0.1}');
    expect(result.AUC).toBe(0.9);
  });
});

describe('canonicalMetricKey', () => {
  it('resolves exact and alias keys, null otherwise', () => {
    expect(canonicalMetricKey('AUC')).toBe('AUC');
    expect(canonicalMetricKey('roc_auc')).toBe('AUC');
    expect(canonicalMetricKey('  F1_Score ')).toBe('F1');
    expect(canonicalMetricKey('unknown')).toBeNull();
  });
});

describe('primaryAuc', () => {
  it('prefers holdout AUC over training AUC', () => {
    expect(primaryAuc(model({ Metrics: '{"AUC":0.9}', HoldoutMetrics: '{"AUC":0.85}' }))).toBe(0.85);
  });
  it('falls back to training AUC when holdout absent', () => {
    expect(primaryAuc(model({ Metrics: '{"AUC":0.9}', HoldoutMetrics: null }))).toBe(0.9);
  });
  it('returns null when neither present', () => {
    expect(primaryAuc(model({}))).toBeNull();
  });
});

describe('metricsToDisplay', () => {
  it('orders canonically, excludes AUC by default, only present keys', () => {
    const display = metricsToDisplay(parseMetrics('{"F1":0.75,"Precision":0.8,"AUC":0.9}'));
    expect(display.map((d) => d.key)).toEqual(['Precision', 'F1']);
    expect(display.find((d) => d.key === 'Precision')?.value).toBe('0.80');
  });
  it('can include AUC when asked', () => {
    const display = metricsToDisplay(parseMetrics('{"AUC":0.9}'), { excludeAuc: false });
    expect(display.map((d) => d.key)).toEqual(['AUC']);
  });
  it('returns [] for empty metrics', () => {
    expect(metricsToDisplay({})).toEqual([]);
  });
});

describe('formatMetricValue', () => {
  it('uses 3 decimals for ratio metrics, 2 otherwise', () => {
    expect(formatMetricValue('AUC', 0.8642)).toBe('0.864');
    expect(formatMetricValue('Precision', 0.789)).toBe('0.79');
  });
});

describe('overfitGap', () => {
  it('computes train - holdout, null when either missing', () => {
    expect(overfitGap(model({ Metrics: '{"AUC":0.9}', HoldoutMetrics: '{"AUC":0.86}' }))).toBeCloseTo(0.04, 5);
    expect(overfitGap(model({ Metrics: '{"AUC":0.9}' }))).toBeNull();
    expect(overfitGap(model({}))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// feature importance
// ---------------------------------------------------------------------------

describe('parseFeatureImportance', () => {
  it('sorts by |value| desc, normalizes, flags dominance, caps at topN', () => {
    const json = '{"a":0.2,"b":0.7,"c":0.1,"d":0.05,"e":0.4,"f":0.02,"g":0.01}';
    const bars = parseFeatureImportance(json, 3);
    expect(bars.map((b) => b.name)).toEqual(['b', 'e', 'a']);
    expect(bars[0].pct).toBe(100); // largest fills the track
    expect(bars[0].warning).toBe(true); // 0.7 >= 0.6
    expect(bars[1].warning).toBe(false); // 0.4 < 0.6
  });

  it('handles negative importances by absolute value', () => {
    const bars = parseFeatureImportance('{"a":-0.8,"b":0.3}', 2);
    expect(bars[0].name).toBe('a');
    expect(bars[0].warning).toBe(true);
  });

  it('accepts the array-of-objects shape', () => {
    const bars = parseFeatureImportance('[{"feature":"x","importance":0.5},{"name":"y","value":0.9}]', 5);
    expect(bars[0].name).toBe('y');
    expect(bars[1].name).toBe('x');
  });

  it('returns [] for null/invalid/empty (never throws)', () => {
    expect(parseFeatureImportance(null)).toEqual([]);
    expect(parseFeatureImportance('garbage')).toEqual([]);
    expect(parseFeatureImportance('{}')).toEqual([]);
  });
});

describe('maxFeatureImportance', () => {
  it('returns the largest absolute importance or null', () => {
    expect(maxFeatureImportance('{"a":0.2,"b":-0.7}')).toBe(0.7);
    expect(maxFeatureImportance(null)).toBeNull();
    expect(maxFeatureImportance('{}')).toBeNull();
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
    const k = groupIterationsToKanban(rows);
    expect(k.running.length).toBe(2); // Running + Pending
    expect(k.completed.length).toBe(2);
    expect(k.pruned.length).toBe(2); // Pruned + Failed
  });

  it('badges the single best completed iteration', () => {
    const k = groupIterationsToKanban(rows);
    const best = k.completed.filter((c) => c.status === 'Best');
    expect(best.length).toBe(1);
    expect(best[0].score).toBe(0.86);
  });

  it('computes Δ-from-best for non-best completed', () => {
    const k = groupIterationsToKanban(rows);
    const challenger = k.completed.find((c) => c.score === 0.84);
    expect(challenger?.scoreDelta).toBe('Δ −0.020');
  });

  it('handles an empty set', () => {
    expect(groupIterationsToKanban([])).toEqual({ running: [], completed: [], pruned: [] });
  });
});

describe('bestIterationScore', () => {
  it('returns the max completed score, null when none', () => {
    expect(bestIterationScore([iteration({ Status: 'Completed', Score: 0.8 }), iteration({ Status: 'Completed', Score: 0.9 })])).toBe(0.9);
    expect(bestIterationScore([iteration({ Status: 'Running', Score: 0.99 })])).toBeNull();
    expect(bestIterationScore([])).toBeNull();
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
    const lb = deriveLeaderboard(rows);
    expect(lb.length).toBe(3);
    expect(lb[0].auc).toBe(0.86);
    expect(lb[0].best).toBe(true);
    expect(lb.find((e) => e.algorithm === 'MLP')?.pruned).toBe(true);
  });

  it('caps at topN and returns [] for no scores', () => {
    expect(deriveLeaderboard([], 5)).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => iteration({ ID: `i${i}`, Status: 'Completed', Score: i / 10 }));
    expect(deriveLeaderboard(many, 4).length).toBe(4);
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
    const kpis = computeHomeKpis(models, 2, runs, 14);
    expect(kpis.publishedCount).toBe(2);
    expect(kpis.activeExperiments).toBe(2);
    expect(kpis.bestHoldout).toBe('0.910');
    expect(kpis.scoredThisWeek).toBe((1500).toLocaleString());
    expect(kpis.experimentRuns).toBe(14);
  });

  it('degrades gracefully with no data', () => {
    const kpis = computeHomeKpis([], 0, [], 0);
    expect(kpis.bestHoldout).toBe('—');
    expect(kpis.scoredThisWeek).toBe('0');
    expect(kpis.publishedCount).toBe(0);
  });
});

describe('deriveModelEvents', () => {
  it('projects published/validated→promote, archived→archive, ordered by time', () => {
    const sources: PSModelEventSource[] = [
      { Name: 'A', Algorithm: 'XGBoost', Status: 'Published', Metrics: null, HoldoutMetrics: '{"AUC":0.8}', UpdatedAt: new Date('2026-06-20') },
      { Name: 'B', Algorithm: 'LightGBM', Status: 'Archived', Metrics: null, HoldoutMetrics: null, UpdatedAt: new Date('2026-06-25') },
      { Name: 'C', Algorithm: 'RF', Status: 'Draft', Metrics: null, HoldoutMetrics: null, UpdatedAt: new Date('2026-06-26') },
    ];
    const events = deriveModelEvents(sources);
    expect(events.length).toBe(2); // Draft excluded
    expect(events[0].name).toBe('B'); // most recent first
    expect(events[0].kind).toBe('archive');
    expect(events[1].kind).toBe('promote');
  });
});

describe('buildActivityFeed', () => {
  const now = new Date('2026-06-26T12:00:00Z');
  it('merges runs + model events, newest first, capped', () => {
    const runs = [
      processRun({ ID: 'r1', Status: 'Completed', SuccessCount: 200, StartTime: new Date('2026-06-26T11:30:00Z') }),
      processRun({ ID: 'r2', Status: 'Failed', StartTime: new Date('2026-06-25T11:30:00Z') }),
    ];
    const events = deriveModelEvents([
      { Name: 'A', Algorithm: 'XGBoost', Status: 'Published', Metrics: null, HoldoutMetrics: '{"AUC":0.86}', UpdatedAt: new Date('2026-06-26T11:00:00Z') },
    ]);
    const feed = buildActivityFeed(runs, events, now, 6);
    expect(feed.length).toBe(3);
    expect(feed[0].kind).toBe('run'); // 11:30 most recent
    expect(feed.find((f) => f.kind === 'warn')).toBeTruthy(); // failed run
    expect(feed.find((f) => f.kind === 'promote')?.title).toContain('promoted to Published');
  });

  it('respects the limit and handles empty', () => {
    expect(buildActivityFeed([], [], now)).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => processRun({ ID: `r${i}`, StartTime: new Date(now.getTime() - i * 60000) }));
    expect(buildActivityFeed(many, [], now, 3).length).toBe(3);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-06-26T12:00:00Z');
  it('formats minutes/hours/days', () => {
    expect(relativeTime(new Date('2026-06-26T11:59:30Z'), now)).toBe('just now');
    expect(relativeTime(new Date('2026-06-26T11:38:00Z'), now)).toBe('22 minutes ago');
    expect(relativeTime(new Date('2026-06-26T09:00:00Z'), now)).toBe('3 hours ago');
    expect(relativeTime(new Date('2026-06-25T12:00:00Z'), now)).toBe('Yesterday');
    expect(relativeTime(new Date('2026-06-23T12:00:00Z'), now)).toBe('3 days ago');
  });
  it('handles future timestamps as just now', () => {
    expect(relativeTime(new Date('2026-06-26T13:00:00Z'), now)).toBe('just now');
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
    const cols = deriveCompareColumns(rows, 2);
    expect(cols.length).toBe(2);
    expect(cols[0].holdoutAuc).toBe(0.86);
    expect(cols[0].isBest).toBe(true);
    expect(cols[0].label).toBe('Run 1');
  });
  it('returns [] when nothing scored', () => {
    expect(deriveCompareColumns([iteration({ Status: 'Running', Score: null })])).toEqual([]);
  });
});

describe('buildCompareMetricRows', () => {
  it('builds holdout (max-best) + cost (min-best) rows with formatted values', () => {
    const cols = deriveCompareColumns([
      iteration({ ID: 'a', Status: 'Completed', Score: 0.86, ComputeCost: 10 }),
      iteration({ ID: 'b', Status: 'Completed', Score: 0.8, ComputeCost: 3 }),
    ]);
    const rows = buildCompareMetricRows(cols);
    const auc = rows.find((r) => r.label === 'Holdout score')!;
    const cost = rows.find((r) => r.label === 'Compute cost')!;
    expect(auc.values).toEqual(['0.860', '0.800']);
    expect(auc.bestIndex).toBe(0); // higher AUC
    expect(cost.bestIndex).toBe(1); // lower cost
  });

  it('formats missing values as — and yields no best index', () => {
    const cols = deriveCompareColumns([iteration({ ID: 'a', Status: 'Completed', Score: 0.8, ComputeCost: null })]);
    const rows = buildCompareMetricRows(cols);
    expect(rows.find((r) => r.label === 'Compute cost')!.values).toEqual(['—']);
    expect(rows.find((r) => r.label === 'Compute cost')!.bestIndex).toBe(-1);
  });

  it('returns [] for empty columns', () => {
    expect(buildCompareMetricRows([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// shared coercion
// ---------------------------------------------------------------------------

describe('coerceFiniteNumber', () => {
  it('accepts numbers + numeric strings, rejects junk/NaN/Infinity', () => {
    expect(coerceFiniteNumber(3.14)).toBe(3.14);
    expect(coerceFiniteNumber('2.5')).toBe(2.5);
    expect(coerceFiniteNumber('  ')).toBeNull();
    expect(coerceFiniteNumber('abc')).toBeNull();
    expect(coerceFiniteNumber(NaN)).toBeNull();
    expect(coerceFiniteNumber(Infinity)).toBeNull();
    expect(coerceFiniteNumber(null)).toBeNull();
    expect(coerceFiniteNumber({})).toBeNull();
  });
});
