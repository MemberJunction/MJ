import { describe, it, expect } from 'vitest';
import { PredictionUnit, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { ProtocolDefaults } from '../protocol-defaults';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { TableDataAccess } from '../../__tests__/fakes/table-data-access';

function worldUnit(): PredictionUnitSpec {
  const parsed = PredictionUnit.ParsePredictionUnitRow(UnitYearsWorld.UnitColumns());
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

/** Read deps whose every read fails the test: the branches that need no rows must never read. */
const noReads = { DataAccess: new TableDataAccess({}), Metadata: { Entity: () => { throw new Error('no read expected'); } }, Now: new Date('2026-10-12T00:00:00Z') };

describe('ProtocolDefaults', () => {
  const unit = worldUnit();

  it('gives a forecast the last rolling origins, a fixed-date grain a seeded row hash, and leaves a dated unit to its rows', () => {
    const forecast: PredictionUnitSpec = {
      ...unit, label: { ...unit.label, outcome: { kind: 'forecast', valueKind: 'continuous' } },
      temporal: { timeColumn: 'Month', horizonPeriods: 3, lags: [3], rollingWindows: [], period: 'month', seasonality: 12 },
    };
    expect(ProtocolDefaults.HoldoutWithoutRows(forecast)).toEqual({ kind: 'rolling-origin', origins: 5, horizonPeriods: 3, gapPeriods: 0, minTrainPeriods: 12, window: 'expanding' });
    const fixed: PredictionUnitSpec = { ...unit, rows: { kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] } };
    expect(ProtocolDefaults.HoldoutWithoutRows(fixed)).toEqual({ kind: 'seeded-random', fraction: 0.25 });
    expect(ProtocolDefaults.HoldoutWithoutRows(unit)).toBeNull();
  });

  it('carves a dated unit on its decision dates at the year cutoff, reading its rows the way training does', async () => {
    const holdout = await ProtocolDefaults.DefaultHoldoutFor(unit, { DataAccess: new TableDataAccess(UnitYearsWorld.Tables()), Metadata: UnitYearsWorld.Metadata(), Now: new Date('2026-10-12T00:00:00Z') });
    // The 2024 and 2025 cycles resolve; the 2026 cycle is decided after the corpus end and is censored.
    expect(holdout).toEqual({ kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2025-01-01', holdoutEnd: null, newEntityReport: null });
  });

  it('reads no row for a unit whose default holdout needs none', async () => {
    const fixed: PredictionUnitSpec = { ...unit, rows: { kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] } };
    await expect(ProtocolDefaults.DefaultHoldoutFor(fixed, noReads)).resolves.toEqual({ kind: 'seeded-random', fraction: 0.25 });
  });

  it('takes the year cutoff that leaves at most a quarter of the dates in the holdout', () => {
    expect(ProtocolDefaults.DateCarvedHoldout(['2023-03-01', '2023-05-01', '2024-02-01', '2025-01-15'])).toEqual({ kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2025-01-01', holdoutEnd: null, newEntityReport: null });
  });
});
