import { describe, it, expect } from 'vitest';
import { parseMemoryToBytes, suggestWorkers } from '../lib/regression/docker-helpers.js';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const KiB = 1024;

describe('parseMemoryToBytes', () => {
  it('parses g / m / k suffixes', () => {
    expect(parseMemoryToBytes('8g')).toBe(8 * GiB);
    expect(parseMemoryToBytes('512m')).toBe(512 * MiB);
    expect(parseMemoryToBytes('1024k')).toBe(1024 * KiB);
  });

  it('accepts the optional trailing b and is case-insensitive', () => {
    expect(parseMemoryToBytes('4gb')).toBe(4 * GiB);
    expect(parseMemoryToBytes('8G')).toBe(8 * GiB);
    expect(parseMemoryToBytes('512MB')).toBe(512 * MiB);
  });

  it('treats a bare number as bytes (docker semantics) and allows fractions', () => {
    expect(parseMemoryToBytes('3584')).toBe(3584);
    expect(parseMemoryToBytes('1.5g')).toBe(Math.round(1.5 * GiB));
  });

  it('returns null for non-sizes so a bad flag can be rejected', () => {
    expect(parseMemoryToBytes('big')).toBeNull();
    expect(parseMemoryToBytes('8gb!')).toBeNull();
    expect(parseMemoryToBytes('')).toBeNull();
    expect(parseMemoryToBytes('g')).toBeNull();
  });
});

describe('suggestWorkers — worker formula', () => {
  it('derives (mem - 1GiB reserve) / 1.5GiB per worker, floored', () => {
    expect(suggestWorkers(7 * GiB)).toBe(4); // (7-1)/1.5 = 4
    expect(suggestWorkers(4 * GiB)).toBe(2); // (3)/1.5 = 2
    expect(suggestWorkers(10 * GiB)).toBe(6); // (9)/1.5 = 6
  });

  it('never suggests below 1, even when memory is below one worker + reserve', () => {
    expect(suggestWorkers(2 * GiB)).toBe(1); // usable 1GiB < 1.5GiB per worker
    expect(suggestWorkers(1 * GiB)).toBe(1);
    expect(suggestWorkers(0)).toBe(1);
  });

  it('clamps to a sane upper bound (12)', () => {
    expect(suggestWorkers(100 * GiB)).toBe(12);
  });

  it('honors custom per-worker / reserve budgets', () => {
    // 8GiB, reserve 0, 2GiB per worker → 4
    expect(suggestWorkers(8 * GiB, 2 * GiB, 0)).toBe(4);
  });
});
