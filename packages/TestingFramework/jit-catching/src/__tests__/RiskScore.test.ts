import { describe, it, expect } from 'vitest';
import { ComputeRiskScore } from '../analyzer/RiskScore';
import { DEFAULT_SETTINGS } from '../settings';

const base = { IntentType: 'feature' as const, CommitPrefix: 'feat', ChangedSourceLines: 0, PackageCount: 1, RiskPaths: DEFAULT_SETTINGS.RiskPaths };
describe('ComputeRiskScore (§6)', () => {
  it('adds 3 once for a risky path', () => {
    expect(ComputeRiskScore({ ...base, ChangedPaths: ['packages/MJServer/src/a.ts', 'packages/GenericDatabaseProvider/src/b.ts'] })).toBe(3.5);
  });
  it('adds 2 for refactor, perf or dead-code intent, from the analyzer or the prefix', () => {
    expect(ComputeRiskScore({ ...base, ChangedPaths: ['packages/X/src/a.ts'], IntentType: 'refactor' })).toBe(2.5);
    expect(ComputeRiskScore({ ...base, ChangedPaths: ['packages/X/src/a.ts'], CommitPrefix: 'perf' })).toBe(2.5);
  });
  it('size adds lines/500 capped at 2, and packages add 0.5 each capped at 2', () => {
    expect(ComputeRiskScore({ ...base, ChangedPaths: [], ChangedSourceLines: 250 })).toBe(1);
    expect(ComputeRiskScore({ ...base, ChangedPaths: [], ChangedSourceLines: 5000 })).toBe(2.5);
    expect(ComputeRiskScore({ ...base, ChangedPaths: [], PackageCount: 9 })).toBe(2);
  });
});
