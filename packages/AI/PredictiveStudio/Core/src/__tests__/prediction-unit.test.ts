import { describe, it, expect } from 'vitest';
import { PredictionUnit, type PredictionUnitColumns } from '../prediction-unit';

/** The C1 renewal unit as the truth-suite fixture stores it (person × dues period, next period within 400 days). */
function c1Row(overrides: Partial<PredictionUnitColumns> = {}): PredictionUnitColumns {
  return {
    ID: '7B0C2A55-1E0B-4E5B-9E43-3E9C3C1D0001',
    LineageRootID: '7B0C2A55-1E0B-4E5B-9E43-3E9C3C1D0001',
    Version: 1,
    Name: 'Member renewal (person x dues period)',
    UnitRows: JSON.stringify({ kind: 'grain-x-periods', grainEntity: 'PS Truth: C1 People', childEntity: 'PS Truth: C1 Dues Periods', foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [] }),
    LabelRule: JSON.stringify({ kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 }),
    LabelWindowDays: 400,
    LabelGapDays: 0,
    TaskType: JSON.stringify({ kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }),
    LabelVersion: 1,
    Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'PS Truth: C1 Order Headers', field: 'OrderDate' } }),
    ChangeHistoryPolicy: JSON.stringify({ onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }),
    GroupKey: null,
    TemporalSpec: null,
    DecisionSpec: JSON.stringify({ action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: 150, period: 'month' }),
    IncumbentHeuristic: JSON.stringify({ kind: 'none' }),
    AuthoredBy: JSON.stringify({ kind: 'human', userId: '3B0F6C59-0000-4000-8000-000000000001' }),
    ...overrides,
  };
}

describe('ParsePredictionUnitRow', () => {
  it('parses the C1 renewal unit', () => {
    const r = PredictionUnit.ParsePredictionUnitRow(c1Row());
    expect(r.Ok).toBe(true);
    if (r.Ok) {
      expect(r.Value.rows.kind).toBe('grain-x-periods');
      expect(r.Value.label.rule).toEqual({ kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 });
      expect(r.Value.label.outcome.kind).toBe('binary');
      expect(PredictionUnit.UnitRowEntityName(r.Value.rows)).toBe('PS Truth: C1 Dues Periods');
      expect(PredictionUnit.DescribeLabelRule(r.Value)).toBe('next period (PeriodIndex + 1) within 400 days');
    }
  });
  it('refuses a next-period label on a grain unit', () => {
    const r = PredictionUnit.ParsePredictionUnitRow(c1Row({ UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'X', decisionDate: { kind: 'column', column: 'D' }, filter: [] }) }));
    expect(r.Ok).toBe(false);
    if (!r.Ok) expect(r.Errors).toContain('LabelRule next-period requires UnitRows kind grain-x-periods');
  });
  it('refuses a forecast without a Temporal Spec and a lag inside the horizon', () => {
    const noSpec = PredictionUnit.ParsePredictionUnitRow(c1Row({ TaskType: JSON.stringify({ kind: 'forecast', valueKind: 'continuous' }) }));
    expect(noSpec.Ok).toBe(false);
    const lagInside = PredictionUnit.ParsePredictionUnitRow(c1Row({
      TaskType: JSON.stringify({ kind: 'forecast', valueKind: 'continuous' }),
      TemporalSpec: JSON.stringify({ timeColumn: 'T', horizonPeriods: 3, lags: [1, 12], rollingWindows: [{ endLag: 2, periods: 3, aggregate: 'mean' }], period: 'month', seasonality: 12 }),
    }));
    expect(lagInside.Ok).toBe(false);
    if (!lagInside.Ok) {
      expect(lagInside.Errors).toContain('TemporalSpec lag 1 is inside the horizon of 3 periods (lag-inside-horizon)');
      expect(lagInside.Errors).toContain('TemporalSpec rolling window endLag 2 is inside the horizon of 3 periods (rolling-window-inside-horizon)');
    }
  });
  it('refuses a version-1 row whose lineage root is not itself, and a LabelVersion above Version', () => {
    const r = PredictionUnit.ParsePredictionUnitRow(c1Row({ LineageRootID: '00000000-0000-0000-0000-000000000009', LabelVersion: 2 }));
    expect(r.Ok).toBe(false);
    if (!r.Ok) {
      expect(r.Errors).toContain('Version 1 must be its own lineage root (LineageRootID = ID)');
      expect(r.Errors).toContain('LabelVersion must be between 1 and Version (2 > 1)');
    }
  });
  it('reads a fixed decision date that advances each run and refuses any other advance value', () => {
    const grain = (decisionDate: object): string => JSON.stringify({ kind: 'grain', grainEntity: 'X', decisionDate, filter: [] });
    const column = JSON.stringify({ kind: 'column', column: 'Y' });
    const ok = PredictionUnit.ParsePredictionUnitRow(c1Row({ UnitRows: grain({ kind: 'fixed', date: '2026-10-20', advance: 'each-run' }), LabelRule: column }));
    expect(ok.Ok && ok.Value.rows.kind === 'grain' && ok.Value.rows.decisionDate).toEqual({ kind: 'fixed', date: '2026-10-20', advance: 'each-run' });
    const plain = PredictionUnit.ParsePredictionUnitRow(c1Row({ UnitRows: grain({ kind: 'fixed', date: '2026-10-20' }), LabelRule: column }));
    expect(plain.Ok && plain.Value.rows.kind === 'grain' && plain.Value.rows.decisionDate).toEqual({ kind: 'fixed', date: '2026-10-20' });
    const bad = PredictionUnit.ParsePredictionUnitRow(c1Row({ UnitRows: grain({ kind: 'fixed', date: '2026-10-20', advance: 'daily' }), LabelRule: column }));
    expect(bad.Ok).toBe(false);
  });
});

describe('LabelDefinitionChanged', () => {
  it('is true when the outcome window changes and false when only the name changes', () => {
    const a = PredictionUnit.ParsePredictionUnitRow(c1Row());
    const b = PredictionUnit.ParsePredictionUnitRow(c1Row({ ID: 'X2', LineageRootID: '7B0C2A55-1E0B-4E5B-9E43-3E9C3C1D0001', Version: 2, LabelWindowDays: 365 }));
    const c = PredictionUnit.ParsePredictionUnitRow(c1Row({ ID: 'X3', LineageRootID: '7B0C2A55-1E0B-4E5B-9E43-3E9C3C1D0001', Version: 2, Name: 'Renamed' }));
    if (!a.Ok || !b.Ok || !c.Ok) throw new Error('fixture must parse');
    expect(PredictionUnit.LabelDefinitionChanged(a.Value, b.Value)).toBe(true);
    expect(PredictionUnit.LabelDefinitionChanged(a.Value, c.Value)).toBe(false);
  });
});
