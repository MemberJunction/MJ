import { describe, it, expect } from 'vitest';
import { RunWithConcurrency } from '../pipeline/concurrency';

describe('RunWithConcurrency', () => {
  it('runs at most n at once and keeps the input order in the results', async () => {
    let inFlight = 0; let peak = 0;
    const delays = [30, 5, 20, 1, 10, 2];
    const out = await RunWithConcurrency(delays, 2, async (ms, i) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--; return `${i}:${ms}`;
    });
    expect(peak).toBe(2);
    expect(out).toEqual(['0:30', '1:5', '2:20', '3:1', '4:10', '5:2']);
  });
  it('rejects when one call rejects', async () => {
    await expect(RunWithConcurrency([1, 2], 2, async (x) => { if (x === 2) throw new Error('boom'); return x; })).rejects.toThrow('boom');
  });
});
