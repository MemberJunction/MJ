import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { SnapshotRowKey } from '@memberjunction/predictive-studio-core';
import { EvaluationProtocolGates, type NewEntityReport } from '../ps-gate-evaluation-protocols';

const sha = (keys: readonly string[]): string => createHash('sha256').update([...keys].sort().join('\n'), 'utf8').digest('hex');

/** Five members over 2021–2024, one row a year from their first year: m4 is the newest (first seen 2023), m3 next (2022). */
function manifest(): SnapshotRowKey[] {
  const first: Record<string, number> = { m0: 2021, m1: 2021, m2: 2021, m3: 2022, m4: 2023 };
  const rows: SnapshotRowKey[] = [];
  for (const [m, y0] of Object.entries(first)) {
    for (let y = y0; y <= 2024; y++) {
      rows.push({ rowId: `${m}:${y}`, entityKey: `${m}:${y}`, decisionDate: `${y}-06-01`, groupKey: m, period: null, role: y >= 2024 ? 'locked-holdout' : 'development' });
    }
  }
  return rows;
}

/** The report a correct carve stores for `manifest()` at cutoff 2024-01-01 and fraction 0.4 (m3, m4 held). */
function report(over: Partial<NewEntityReport> = {}): NewEntityReport {
  return {
    holdoutEntityKeys: 2, trainingRowCount: 9, holdoutRowCount: 2, excludedRowCount: 6, sharedEntityKeys: 0,
    heldGroupKeysSha256: sha(['m3', 'm4']), trainingGroupKeysSha256: sha(['m0', 'm1', 'm2']), ...over,
  };
}

describe('EvaluationProtocolGates.MeasureNewEntityFromManifest', () => {
  it('verifies a correct report: both memberships match, 0 shared keys, the counts agree, and it passes', () => {
    const rows = manifest();
    const m = EvaluationProtocolGates.MeasureNewEntityFromManifest(rows, '2024-01-01', 0.4, report());
    expect(m).toMatchObject({ Groups: 5, HeldGroups: 2, TrainingRows: 9, HoldoutRows: 2, ExcludedRows: 6, HeldMembershipMatches: true, TrainingMembershipMatches: true, SharedEntityKeys: 0, CountsMatch: true });
    expect(EvaluationProtocolGates.NewEntityPassed(m, report(), rows.length)).toBe(true);
  });

  it('fails when the stored held set differs from the one the manifest gives, even with equal counts', () => {
    const swapped = report({ heldGroupKeysSha256: sha(['m2', 'm4']) });
    const m = EvaluationProtocolGates.MeasureNewEntityFromManifest(manifest(), '2024-01-01', 0.4, swapped);
    expect(m.HeldMembershipMatches).toBe(false);
    expect(m.SharedEntityKeys).toBe(-1);
    expect(EvaluationProtocolGates.NewEntityPassed(m, swapped, manifest().length)).toBe(false);
  });

  it('fails when the run trained on a held group: the stored training membership names it', () => {
    const leaked = report({ trainingGroupKeysSha256: sha(['m0', 'm1', 'm2', 'm3']), sharedEntityKeys: 1 });
    const m = EvaluationProtocolGates.MeasureNewEntityFromManifest(manifest(), '2024-01-01', 0.4, leaked);
    expect(m.TrainingMembershipMatches).toBe(false);
    expect(EvaluationProtocolGates.NewEntityPassed(m, leaked, manifest().length)).toBe(false);
  });

  it('fails when a row of a held group carries the development role while its group is outside the training set: the counts disagree', () => {
    const rows = manifest().map((k) => (k.rowId === 'm4:2024' ? { ...k, decisionDate: '2023-12-01', role: 'development' as const } : k));
    const m = EvaluationProtocolGates.MeasureNewEntityFromManifest(rows, '2024-01-01', 0.4, report());
    expect(m.CountsMatch).toBe(false);
    expect(EvaluationProtocolGates.NewEntityPassed(m, report(), rows.length)).toBe(false);
  });

  it('fails when the report claims 0 shared keys but its stored sets cannot be verified', () => {
    const unverified = report({ heldGroupKeysSha256: null, trainingGroupKeysSha256: null });
    const m = EvaluationProtocolGates.MeasureNewEntityFromManifest(manifest(), '2024-01-01', 0.4, unverified);
    expect(m.SharedEntityKeys).toBe(-1);
    expect(EvaluationProtocolGates.NewEntityPassed(m, unverified, manifest().length)).toBe(false);
  });
});
