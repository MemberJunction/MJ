import { describe, it, expect } from 'vitest';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';

import { parseVector } from '../reuse-finder';

/**
 * Reuse-by-meaning is only half a search. A semantically perfect component is useless if it cannot
 * legally go where the caller wants to put it, and a component whose stored vector is unreadable
 * must be SKIPPED rather than coerced into one that would rank wrongly. These tests pin the two
 * pure pieces plus the ranking behavior the finder relies on.
 */

describe('parseVector', () => {
  it('parses a stored vector', () => {
    expect(parseVector('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
  });

  it('treats absence as absence', () => {
    expect(parseVector(null)).toBeNull();
    expect(parseVector(undefined)).toBeNull();
    expect(parseVector('   ')).toBeNull();
  });

  it('refuses anything that is not a non-empty numeric array', () => {
    // A vector we cannot read is skipped. Coercing it would place a component in the ranking at a
    // distance that means nothing — worse than leaving it out.
    for (const bad of ['[]', '{"a":1}', '"text"', '[1,"two",3]', '[1,null]', 'not json', '[1,2,NaN]']) {
      expect(parseVector(bad), bad).toBeNull();
    }
  });

  it('accepts negative and fractional components', () => {
    expect(parseVector('[-0.5,0,0.25]')).toEqual([-0.5, 0, 0.25]);
  });
});

describe('cosine ranking (the platform primitive the finder uses)', () => {
  /** Three stories in an easily-reasoned 2-D space. */
  const service = new SimpleVectorService<{ ID: string; Name: string }>();
  service.LoadVectors([
    { key: 'recency', vector: [1, 0], metadata: { ID: 'recency', Name: 'Activity recency' } },
    { key: 'nearly', vector: [0.98, 0.2], metadata: { ID: 'nearly', Name: 'Days since last login' } },
    { key: 'unrelated', vector: [0, 1], metadata: { ID: 'unrelated', Name: 'Billing plan tier' } },
  ]);

  it('ranks the closest meaning first', () => {
    const results = service.FindNearest([1, 0], 3, undefined, 'cosine');
    expect(results.map((r) => r.key)).toEqual(['recency', 'nearly', 'unrelated']);
    expect(results[0].score).toBeCloseTo(1, 6);
  });

  it('honors a similarity floor, so a weak match is not dressed up as a recommendation', () => {
    const results = service.FindNearest([1, 0], 10, 0.9, 'cosine');
    expect(results.map((r) => r.key)).toEqual(['recency', 'nearly']);
  });

  it('carries the metadata through, so a match renders without a second read', () => {
    const [top] = service.FindNearest([1, 0], 1, undefined, 'cosine');
    expect(top.metadata?.Name).toBe('Activity recency');
  });
});
