import { describe, it, expect } from 'vitest';
import { PredictionUnitVersioning, type PredictionUnitDraft } from '../unit-versioning';

const draft: PredictionUnitDraft = {
  Name: 'Renewal', Description: null,
  UnitRows: { kind: 'grain-x-periods', grainEntity: 'P', childEntity: 'D', foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [] },
  LabelRule: { kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 }, LabelWindowDays: 400, LabelGapDays: 0,
  TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
  Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } },
  ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  GroupKey: null, TemporalSpec: null,
  DecisionSpec: { action: 'a', actorRole: 'r', capacityPerPeriod: null, period: 'month' },
  IncumbentHeuristic: { kind: 'none' },
};

describe('BuildNextVersionColumns', () => {
  it('bumps Version and LabelVersion when the outcome window changes', () => {
    const next = PredictionUnitVersioning.BuildNextVersionColumns({ lineageRootId: 'V1', latestVersion: 1, previousLabelVersion: 1, previous: draft }, { LabelWindowDays: 365 }, { kind: 'human', userId: 'U' });
    expect(next.Version).toBe(2);
    expect(next.LabelVersion).toBe(2);
    expect(next.LineageRootID).toBe('V1');
    expect(next.LabelWindowDays).toBe(365);
  });
  it('keeps LabelVersion when only the name changes', () => {
    const next = PredictionUnitVersioning.BuildNextVersionColumns({ lineageRootId: 'V1', latestVersion: 3, previousLabelVersion: 2, previous: draft }, { Name: 'Renewal v4' }, { kind: 'human', userId: 'U' });
    expect([next.Version, next.LabelVersion]).toEqual([4, 2]);
  });
});
