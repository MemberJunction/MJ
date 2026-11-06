import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LoadSettings, DEFAULT_SETTINGS } from '../settings';

describe('LoadSettings', () => {
  it('returns defaults when no file is given', () => {
    const s = LoadSettings(undefined);
    expect(s.Limits.TestsPerPackage).toBe(5);
    expect(s.Repeats).toBe(3);
    expect(s.Thresholds.Label).toEqual({ MinMedian: 'Medium', MaxReported: 3 });
  });
  it('merges a partial file over the defaults and validates it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jit-'));
    const p = join(dir, 's.json');
    writeFileSync(p, JSON.stringify({ GeneratorModel: 'claude-haiku-5-5', Limits: { TurnsPerSession: 10 } }));
    const s = LoadSettings(p);
    expect(s.GeneratorModel).toBe('claude-haiku-5-5');
    expect(s.Limits.TurnsPerSession).toBe(10);
    expect(s.Limits.TestsPerPackage).toBe(DEFAULT_SETTINGS.Limits.TestsPerPackage);
    writeFileSync(p, JSON.stringify({ Repeats: 0 }));
    expect(() => LoadSettings(p)).toThrow(/Repeats/);
  });
});
