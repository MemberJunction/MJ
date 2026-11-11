import { describe, it, expect } from 'vitest';
import type { UnitDraft } from '@memberjunction/predictive-studio-core';
import { PredictionUnitVersioning } from '../unit-versioning';

const draft: UnitDraft = {
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

describe('BuildNextVersion', () => {
  it('bumps Version and LabelVersion when the outcome window changes', () => {
    const next = PredictionUnitVersioning.BuildNextVersion({ lineageRootId: 'V1', latestVersion: 1, previousLabelVersion: 1, previous: draft }, { LabelWindowDays: 365 }, { kind: 'human', userId: 'U' });
    expect(next.Meta).toEqual({ ID: null, LineageRootID: 'V1', Version: 2, LabelVersion: 2, AuthoredBy: { kind: 'human', userId: 'U' } });
    expect(next.Draft.LabelWindowDays).toBe(365);
  });
  it('keeps LabelVersion when only the name changes', () => {
    const next = PredictionUnitVersioning.BuildNextVersion({ lineageRootId: 'V1', latestVersion: 3, previousLabelVersion: 2, previous: draft }, { Name: 'Renewal v4' }, { kind: 'human', userId: 'U' });
    expect([next.Meta.Version, next.Meta.LabelVersion]).toEqual([4, 2]);
  });
  it('keeps LabelVersion when the outcome rule is restated with its keys in another order', () => {
    const restated = { offset: 1, periodIndexField: 'PeriodIndex', kind: 'next-period' } as const;
    const next = PredictionUnitVersioning.BuildNextVersion({ lineageRootId: 'V1', latestVersion: 1, previousLabelVersion: 1, previous: draft }, { LabelRule: restated }, { kind: 'human', userId: 'U' });
    expect([next.Meta.Version, next.Meta.LabelVersion]).toEqual([2, 1]);
  });
});
