import { describe, it, expect } from 'vitest';
import {
  buildDistribution,
  humanizeCron,
  modelLabel,
  modeBadgeClass,
  runStatusVariant,
  summarizeRun,
  PRODUCTION_SAMPLE_CAP,
} from '../PredictiveStudio/production-distribution';

/**
 * Tests for the pure, entity-agnostic logic behind the "Models in Production" panel:
 *  - distribution bucketing (numeric → neutral terciles; categorical → group-by-value, capped tail)
 *  - cron → human phrase
 *  - binding → view-model mapping (model label, mode/status badges)
 *  - last-run summarization
 *
 * None of this touches an entity, column, or domain — it operates on raw value arrays + plain inputs,
 * so it stays 100% entity-agnostic and trivially testable without a metadata provider.
 */

describe('buildDistribution — numeric (neutral terciles)', () => {
  it('returns three neutral bands with no moral direction', () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const d = buildDistribution(values, true);
    expect(d.kind).toBe('numeric');
    expect(d.buckets).toHaveLength(3);
    // Labels are neutral "Lower/Middle/Upper third" — never "good/bad", "risk", etc.
    expect(d.buckets[0].label).toMatch(/^Lower third/);
    expect(d.buckets[1].label).toMatch(/^Middle third/);
    expect(d.buckets[2].label).toMatch(/^Upper third/);
    expect(d.buckets.some((b) => /risk|good|bad|high risk/i.test(b.label))).toBe(false);
  });

  it('bands a uniform 0..9 spread roughly evenly across thirds', () => {
    const d = buildDistribution([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], true);
    // boundaries at 3 and 6: [0,3) low, [3,6) mid, [6,9] high
    const [low, mid, high] = d.buckets;
    expect(low.count).toBe(3); // 0,1,2
    expect(mid.count).toBe(3); // 3,4,5
    expect(high.count).toBe(4); // 6,7,8,9
    expect(low.count + mid.count + high.count).toBe(10);
  });

  it('percentages within each band sum to ~100', () => {
    const d = buildDistribution([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], true);
    const total = d.buckets.reduce((s, b) => s + b.pct, 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  it('collapses a degenerate (all-identical) range into a single band at 100%', () => {
    const d = buildDistribution([0.5, 0.5, 0.5, 0.5], true);
    expect(d.kind).toBe('numeric');
    expect(d.buckets).toHaveLength(1);
    expect(d.buckets[0].pct).toBe(100);
    expect(d.buckets[0].count).toBe(4);
  });

  it('parses numeric strings (probabilities stored as text)', () => {
    const d = buildDistribution(['0.1', '0.5', '0.9'], true);
    expect(d.kind).toBe('numeric');
    expect(d.buckets).toHaveLength(3);
    expect(d.sampled).toBe(3);
  });

  it('falls back to categorical when a "numeric" column has no parseable values', () => {
    const d = buildDistribution(['low', 'high', 'low'], true);
    expect(d.kind).toBe('categorical');
    expect(d.buckets.find((b) => b.label === 'low')?.count).toBe(2);
  });
});

describe('buildDistribution — categorical (group-by-value)', () => {
  it('groups class labels biggest-first', () => {
    const d = buildDistribution(['A', 'B', 'A', 'A', 'C', 'B'], false);
    expect(d.kind).toBe('categorical');
    expect(d.buckets[0]).toMatchObject({ label: 'A', count: 3 });
    expect(d.buckets[1]).toMatchObject({ label: 'B', count: 2 });
    expect(d.buckets[2]).toMatchObject({ label: 'C', count: 1 });
  });

  it('handles booleans by stringifying the value', () => {
    const d = buildDistribution([true, false, true, true], false);
    expect(d.buckets[0]).toMatchObject({ label: 'true', count: 3 });
    expect(d.buckets[1]).toMatchObject({ label: 'false', count: 1 });
  });

  it('folds the long tail beyond 8 buckets into "Other"', () => {
    // 10 distinct classes — biggest 7 kept, remaining folded into "Other".
    const values: string[] = [];
    for (let i = 0; i < 10; i++) {
      const reps = 10 - i; // class0 most frequent, class9 least
      for (let r = 0; r < reps; r++) values.push(`class${i}`);
    }
    const d = buildDistribution(values, false);
    expect(d.buckets).toHaveLength(8); // 7 top + Other
    expect(d.buckets[d.buckets.length - 1].label).toBe('Other');
    const total = d.buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(values.length);
  });

  it('does NOT add "Other" when classes fit within the cap', () => {
    const d = buildDistribution(['A', 'B', 'C'], false);
    expect(d.buckets.some((b) => b.label === 'Other')).toBe(false);
  });
});

describe('buildDistribution — edges', () => {
  it('drops null/undefined/empty values before bucketing', () => {
    const d = buildDistribution([null, undefined, '', 'A', 'A'], false);
    expect(d.sampled).toBe(2);
    expect(d.buckets[0]).toMatchObject({ label: 'A', count: 2 });
  });

  it('returns an empty distribution when there is nothing to summarize', () => {
    const d = buildDistribution([null, undefined, ''], false);
    expect(d.sampled).toBe(0);
    expect(d.buckets).toHaveLength(0);
    expect(d.capped).toBe(false);
  });

  it('flags a capped sample when the population hits the sample cap', () => {
    const values = new Array(PRODUCTION_SAMPLE_CAP).fill('A');
    const d = buildDistribution(values, false);
    expect(d.capped).toBe(true);
    expect(d.sampled).toBe(PRODUCTION_SAMPLE_CAP);
  });

  it('does NOT flag capped just below the cap', () => {
    const values = new Array(PRODUCTION_SAMPLE_CAP - 1).fill('A');
    const d = buildDistribution(values, false);
    expect(d.capped).toBe(false);
  });
});

describe('humanizeCron', () => {
  it('returns null for empty/blank input', () => {
    expect(humanizeCron(null)).toBeNull();
    expect(humanizeCron(undefined)).toBeNull();
    expect(humanizeCron('   ')).toBeNull();
  });

  it('describes a daily schedule with time', () => {
    expect(humanizeCron('0 6 * * *')).toBe('Daily at 06:00');
  });

  it('describes a monthly schedule on a day-of-month', () => {
    expect(humanizeCron('0 0 1 * *')).toBe('Monthly on day 1 at 00:00');
  });

  it('describes a weekly schedule on a day-of-week', () => {
    expect(humanizeCron('0 9 * * 1')).toBe('Weekly on Mon at 09:00');
  });

  it('describes hourly and every-minute schedules', () => {
    expect(humanizeCron('0 * * * *')).toBe('Hourly');
    expect(humanizeCron('* * * * *')).toBe('Every minute');
  });

  it('describes an N-minute interval', () => {
    expect(humanizeCron('*/15 * * * *')).toBe('Every 15 minutes');
  });

  it('drops a leading seconds field for 6-part (Quartz-style) expressions', () => {
    expect(humanizeCron('0 0 6 * * *')).toBe('Daily at 06:00');
  });

  it('treats ? as a wildcard in day fields (Quartz convention)', () => {
    expect(humanizeCron('0 6 ? * *')).toBe('Daily at 06:00');
  });

  it('falls back to the raw expression for unrecognized patterns', () => {
    expect(humanizeCron('0 6 1-5 * 2')).toBe('0 6 1-5 * 2');
  });

  it('falls back to raw for non-5/6-field strings', () => {
    expect(humanizeCron('not a cron')).toBe('not a cron');
  });
});

describe('modelLabel', () => {
  it('uses "<Pipeline> v<Version>" when a pipeline name is present', () => {
    expect(modelLabel('Member Retention', 3)).toBe('Member Retention v3');
  });

  it('falls back to "Model v<Version>" when pipeline name is blank/whitespace', () => {
    expect(modelLabel('', 2)).toBe('Model v2');
    expect(modelLabel('   ', 2)).toBe('Model v2');
    expect(modelLabel(null, 2)).toBe('Model v2');
  });

  it('returns "Unknown model" when the version is missing (dangling binding)', () => {
    expect(modelLabel('Anything', null)).toBe('Unknown model');
    expect(modelLabel(null, undefined)).toBe('Unknown model');
  });
});

describe('runStatusVariant', () => {
  it('maps known statuses to their pill colours', () => {
    expect(runStatusVariant('Completed')).toBe('green');
    expect(runStatusVariant('Running')).toBe('blue');
    expect(runStatusVariant('Pending')).toBe('blue');
    expect(runStatusVariant('Paused')).toBe('amber');
    expect(runStatusVariant('Failed')).toBe('red');
    expect(runStatusVariant('Cancelled')).toBe('gray');
  });

  it('falls back to gray for unknown/empty status', () => {
    expect(runStatusVariant('SomethingNew')).toBe('gray');
    expect(runStatusVariant(null)).toBe('gray');
    expect(runStatusVariant(undefined)).toBe('gray');
  });
});

describe('modeBadgeClass', () => {
  it('maps scoring modes to badge colours', () => {
    expect(modeBadgeClass('Scheduled')).toBe('blue');
    expect(modeBadgeClass('Materialized')).toBe('green');
    expect(modeBadgeClass('OnDemand')).toBe('gray');
    expect(modeBadgeClass(null)).toBe('gray');
  });
});

describe('summarizeRun', () => {
  it('returns null when there is no run (binding never ran)', () => {
    expect(summarizeRun(null)).toBeNull();
    expect(summarizeRun(undefined)).toBeNull();
  });

  it('prefers EndTime, then StartTime, then CreatedAt for "when"', () => {
    const end = new Date('2026-06-01T10:00:00Z');
    const start = new Date('2026-06-01T09:00:00Z');
    const created = new Date('2026-06-01T08:00:00Z');
    expect(summarizeRun({ Status: 'Completed', EndTime: end, StartTime: start, CreatedAt: created })?.when).toBe(end);
    expect(summarizeRun({ Status: 'Completed', StartTime: start, CreatedAt: created })?.when).toBe(start);
    expect(summarizeRun({ Status: 'Completed', CreatedAt: created })?.when).toBe(created);
    expect(summarizeRun({ Status: 'Completed' })?.when).toBeNull();
  });

  it('coerces nullable counts to 0 and totalCount to null', () => {
    const s = summarizeRun({ Status: 'Failed' });
    expect(s).toMatchObject({ status: 'Failed', statusVariant: 'red', successCount: 0, errorCount: 0, totalCount: null });
  });

  it('passes through counts and derives the status variant', () => {
    const s = summarizeRun({ Status: 'Completed', SuccessCount: 1200, ErrorCount: 3, TotalItemCount: 1203 });
    expect(s).toMatchObject({
      status: 'Completed',
      statusVariant: 'green',
      successCount: 1200,
      errorCount: 3,
      totalCount: 1203,
    });
  });
});
