import { describe, it, expect } from 'vitest';
import { parseCheckResults } from '../lib/custom/Tests/test-run-checks';

describe('parseCheckResults', () => {
  it('maps the engine bare OracleResult[] array (oracleType → name, passed/message carried)', () => {
    // This is the exact shape TestEngine.updateTestRun persists into ResultDetails.
    const resultDetails = [
      {
        oracleType: 'aggregates-cache.AGG1',
        passed: true,
        score: 1,
        message: 'AGG1: Aggregates[] participates in the cache fingerprint',
        details: { DurationMs: 1, runViewCacheSets: 4 }
      },
      {
        oracleType: 'aggregates-cache.AGG2',
        passed: false,
        score: 0,
        message: 'CACHE BUG: warm hit dropped AggregateResults',
        details: { DurationMs: 4 }
      }
    ];

    const checks = parseCheckResults(resultDetails);

    expect(checks).toHaveLength(2);
    expect(checks[0]).toEqual({
      name: 'aggregates-cache.AGG1',
      passed: true,
      message: 'AGG1: Aggregates[] participates in the cache fingerprint'
    });
    expect(checks[1]).toEqual({
      name: 'aggregates-cache.AGG2',
      passed: false,
      message: 'CACHE BUG: warm hit dropped AggregateResults'
    });
  });

  it('treats any non-boolean-true passed value as failed', () => {
    const checks = parseCheckResults([
      { oracleType: 'x.A', passed: 'true', message: 'truthy-but-not-boolean' },
      { oracleType: 'x.B', passed: 1, message: 'one' },
      { oracleType: 'x.C', message: 'missing passed' }
    ]);
    expect(checks.map(c => c.passed)).toEqual([false, false, false]);
  });

  it('does not crash on elements missing a message (message stays undefined)', () => {
    const checks = parseCheckResults([{ oracleType: 'x.A', passed: true }]);
    expect(checks).toHaveLength(1);
    expect(checks[0].name).toBe('x.A');
    expect(checks[0].passed).toBe(true);
    expect(checks[0].message).toBeUndefined();
  });

  it('falls back to an empty name when oracleType is absent', () => {
    const checks = parseCheckResults([{ passed: true, message: 'no type' }]);
    expect(checks[0].name).toBe('');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a plain object', { checkResults: [{ name: 'legacy', passed: true }] }],
    ['a string', 'not json'],
    ['a number', 42]
  ])('returns [] for non-array ResultDetails (%s)', (_label, input) => {
    expect(parseCheckResults(input)).toEqual([]);
  });
});
