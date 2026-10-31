import { describe, it, expect } from 'vitest';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { DecisionDateRule, PredictionUnitColumns, PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { DecisionDateAdvance } from '../decision-date-advance';
import { InMemoryUnitVersions, UnitVersionFactory } from './unit-version-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';

const unit = (decisionDate: DecisionDateRule, windowDays = 1, gapDays = 0): PredictionUnitSpec => ({
  id: 'U1', lineageRootId: 'U1', version: 1, name: 'migrated',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays, gapDays, outcome: { kind: 'continuous' }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-10-21' } },
  history: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' }, groupKey: null, temporal: null,
  decision: { action: 'review', actorRole: 'analyst', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'system', component: 'pipeline-migration' },
});

describe('DecisionDateAdvanceChanges', () => {
  it('moves an advancing fixed date and its censoring cutoff to the run day', () => {
    expect(DecisionDateAdvance.DecisionDateAdvanceChanges(unit({ kind: 'fixed', date: '2026-10-20', advance: 'each-run' }), '2026-11-02')).toEqual({
      UnitRows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'fixed', date: '2026-11-02', advance: 'each-run' }, filter: [] },
      Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-11-03' } },
    });
  });
  it('moves the censoring cutoff by the whole label window: gap plus window days after the run day', () => {
    const changes = DecisionDateAdvance.DecisionDateAdvanceChanges(unit({ kind: 'fixed', date: '2026-10-20', advance: 'each-run' }, 30, 7), '2026-11-02');
    expect(changes?.Censoring).toEqual({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-12-09' } });
  });
  it('leaves a date already on the run day, a non-advancing fixed date and a column date alone', () => {
    expect(DecisionDateAdvance.DecisionDateAdvanceChanges(unit({ kind: 'fixed', date: '2026-11-02', advance: 'each-run' }), '2026-11-02')).toBeNull();
    expect(DecisionDateAdvance.DecisionDateAdvanceChanges(unit({ kind: 'fixed', date: '2020-01-01' }), '2026-11-02')).toBeNull();
    expect(DecisionDateAdvance.DecisionDateAdvanceChanges(unit({ kind: 'column', column: 'StartDate' }), '2026-11-02')).toBeNull();
  });
  it('refuses a run day that is not a calendar day', () => {
    expect(() => DecisionDateAdvance.DecisionDateAdvanceChanges(unit({ kind: 'fixed', date: '2026-10-20', advance: 'each-run' }), '2026-02-30')).toThrow(/not yyyy-mm-dd/);
  });
});

/** A pipeline double: the columns the advance writes and a save that counts (one deliberate cast at the seam). */
class AdvancePipeline {
  public ID = 'P-1';
  public PredictionUnitID: string | null = 'V1';
  public TargetEntityID = '';
  public TargetVariable = '';
  public ProblemType: 'classification' | 'regression' = 'regression';
  public Saves = 0;
  public SaveOk = true;
  public LatestResult: { CompleteMessage: string } | null = null;
  public async Save(): Promise<boolean> {
    this.Saves++;
    if (!this.SaveOk) this.LatestResult = { CompleteMessage: 'pipeline save refused' };
    return this.SaveOk;
  }
  public get Entity(): MJMLTrainingPipelineEntity {
    return this as unknown as MJMLTrainingPipelineEntity;
  }
}

const v1Columns = (date: string, advance: boolean): PredictionUnitColumns => ({
  ...UnitYearsWorld.UnitColumns(), ID: 'V1', LineageRootID: 'V1', LabelWindowDays: 1,
  UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: advance ? { kind: 'fixed', date, advance: 'each-run' } : { kind: 'fixed', date }, filter: [] }),
  Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-10-21' } }),
});

describe('AdvanceFixedDecisionDate', () => {
  it('saves version 2 dated the run day, authored by the advance, and binds the pipeline to it once per day', async () => {
    const units = new InMemoryUnitVersions();
    units.Seed(v1Columns('2026-10-20', true));
    const pipeline = new AdvancePipeline();
    const deps = { Store: units, RunDay: '2026-11-02', Metadata: UnitYearsWorld.Metadata(), EntityFactory: new UnitVersionFactory(units) };
    const id = await DecisionDateAdvance.AdvanceFixedDecisionDate(pipeline.Entity, deps);
    const v2 = units.Rows.find((r) => r.Version === 2);
    expect(v2 && [id, v2.LineageRootID, JSON.parse(v2.UnitRows).decisionDate.date, JSON.parse(v2.AuthoredBy).component]).toEqual([v2?.ID, 'V1', '2026-11-02', 'decision-date-advance']);
    expect([pipeline.PredictionUnitID, pipeline.Saves]).toEqual([id, 1]);
    expect(await DecisionDateAdvance.AdvanceFixedDecisionDate(pipeline.Entity, deps)).toBe(id);
    expect([units.Rows.length, pipeline.Saves]).toEqual([2, 1]);
  });
  it('deletes the new version and puts the pipeline back when binding the pipeline to it fails', async () => {
    const units = new InMemoryUnitVersions();
    units.Seed(v1Columns('2026-10-20', true));
    const pipeline = new AdvancePipeline();
    pipeline.SaveOk = false;
    pipeline.TargetVariable = 'Renewed';
    const deps = { Store: units, RunDay: '2026-11-02', Metadata: UnitYearsWorld.Metadata(), EntityFactory: new UnitVersionFactory(units) };
    await expect(DecisionDateAdvance.AdvanceFixedDecisionDate(pipeline.Entity, deps)).rejects.toThrow(/Binding pipeline P-1 to unit .* failed: pipeline save refused$/);
    expect([units.Rows.map((r) => r.ID), pipeline.PredictionUnitID, pipeline.TargetEntityID, pipeline.TargetVariable]).toEqual([['V1'], 'V1', '', 'Renewed']);
  });
  it('keeps a pipeline bound to an older version of the lineage, and a date that does not advance', async () => {
    const units = new InMemoryUnitVersions();
    units.Seed(v1Columns('2026-10-20', true));
    units.Seed({ ...v1Columns('2026-10-25', true), ID: 'V2', Version: 2 });
    const pipeline = new AdvancePipeline();
    const deps = { Store: units, RunDay: '2026-11-02', Metadata: UnitYearsWorld.Metadata(), EntityFactory: new UnitVersionFactory(units) };
    expect(await DecisionDateAdvance.AdvanceFixedDecisionDate(pipeline.Entity, deps)).toBe('V1');
    const still = new InMemoryUnitVersions();
    still.Seed(v1Columns('2026-10-20', false));
    expect(await DecisionDateAdvance.AdvanceFixedDecisionDate(pipeline.Entity, { ...deps, Store: still, EntityFactory: new UnitVersionFactory(still) })).toBe('V1');
    expect([units.Rows.length, still.Rows.length, pipeline.Saves]).toEqual([2, 1, 0]);
  });
});
