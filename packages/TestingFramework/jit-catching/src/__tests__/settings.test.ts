import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LoadSettings, DEFAULT_SETTINGS } from '../settings';
import { UnpricedModel } from '../backtest/Backtest';

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
  it('measures coverage by default and a settings file can turn it off', () => {
    expect(LoadSettings(undefined).Coverage).toBe(true);
    const p = join(mkdtempSync(join(tmpdir(), 'jit-')), 's.json');
    writeFileSync(p, JSON.stringify({ Coverage: false }));
    expect(LoadSettings(p).Coverage).toBe(false);
  });
  it('does not echo the content of a settings file that is not valid JSON', () => {
    const token = 'ghp_' + 'A1b2C3d4'.repeat(5);
    const p = join(mkdtempSync(join(tmpdir(), 'jit-')), 's.json'); writeFileSync(p, `${token} is not json`);
    const err = (() => { try { LoadSettings(p); return null; } catch (e) { return e as Error; } })();
    expect(err?.message).toBe(`settings file is not valid JSON: ${p}`);
  });
  it('has a price for every model the default settings call', () => {
    const s = DEFAULT_SETTINGS;
    const models = [s.GeneratorModel, s.AnalyzerModel, s.Judges.TpProbModel, ...s.Judges.BucketModels.map((b) => b.Model)];
    expect(models.filter((m) => !s.Prices[m])).toEqual([]);
  });
  it('prices the gemini-4-hydrogen generator', () => {
    expect(UnpricedModel(DEFAULT_SETTINGS.Prices, 'gemini-4-hydrogen')).toBeNull();
  });
});
