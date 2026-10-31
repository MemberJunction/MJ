import { describe, it, expect } from 'vitest';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { ADVERSE_CLASS_HOLD_REASON } from '@memberjunction/predictive-studio-core';
import { PipelineMigration, type IPipelineMigrationReads, type MigrationDeps } from '../legacy-pipeline-migration';
import type { AssemblyEntityInfo } from '../../feature-assembly/assembly-metadata';
import type { IEntityFactory } from '../../training/types';
import { InMemoryUnitVersions, UnitVersionFactory } from '../../prediction-unit/__tests__/unit-version-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { fakeProvider, fakeUser } from '../../__tests__/fakes/training-fakes';

/** A protocol version row double: saved into `rows`, deletable. */
class FakeProtocolRow {
  public ID = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  public EntityInfo = { Name: 'MJ: Evaluation Protocols' };
  public Holdout = '';
  public InnerValidation = '';
  public Exclusions = '';
  public Budgets = '';
  constructor(private readonly rows: FakeProtocolRow[]) {}
  public async Save(): Promise<boolean> {
    if (!this.ID) this.ID = `EP-${this.rows.length + 1}`;
    this.rows.push(this);
    return true;
  }
  public async Delete(): Promise<boolean> {
    this.rows.splice(this.rows.indexOf(this), 1);
    return true;
  }
}

/** Units into an in-memory store, protocols into a list (one deliberate test-double cast at the seam). */
class MigrationFactory implements IEntityFactory {
  public readonly Units = new InMemoryUnitVersions();
  public readonly Protocols: FakeProtocolRow[] = [];
  private readonly units = new UnitVersionFactory(this.Units);
  public async getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
    if (entityName === 'MJ: Evaluation Protocols') return new FakeProtocolRow(this.Protocols) as unknown as T;
    return this.units.getEntityObject<T>(entityName, contextUser);
  }
}

/** A legacy pipeline double over the `Years` world; `failSaves` lists the save calls (1-based) that fail. */
class LegacyPipeline {
  public ID = 'P-1';
  public Name = 'Renewal';
  public Status: 'Active' | 'Archived' | 'Draft' = 'Draft';
  public Description: string | null = 'Truth fixture';
  public TargetEntity = 'Years';
  public TargetEntityID = 'E-YEARS';
  public TargetVariable = 'Renewed';
  public ProblemType: 'classification' | 'regression' = 'classification';
  public AsOfStrategy: string | null = JSON.stringify({ Mode: 'column', Column: 'StartDate' });
  public ValidationStrategy: string | null = JSON.stringify({ Strategy: 'kfold', K: 4, LockedHoldoutFraction: 0.25 });
  public LeakageGuard: string | null = JSON.stringify({ DenyFields: ['ID'] });
  public FeatureSteps: string | null = null;
  public Hyperparameters: string | null = null;
  public PredictionUnitID: string | null = null;
  public EvaluationProtocolID: string | null = null;
  public LatestResult: { CompleteMessage: string } | null = null;
  public Saves = 0;
  constructor(private readonly failSaves: readonly number[] = []) {}
  public async Save(): Promise<boolean> {
    this.Saves++;
    if (this.failSaves.includes(this.Saves)) {
      this.LatestResult = { CompleteMessage: `save ${this.Saves} refused` };
      return false;
    }
    return true;
  }
  public get Entity(): MJMLTrainingPipelineEntity {
    return this as unknown as MJMLTrainingPipelineEntity;
  }
}

/** Column reads from fixed values; the unit store answers unit loads. */
class FixedReads implements IPipelineMigrationReads {
  public Reads = 0;
  constructor(private readonly columns: Record<string, string[]>, private readonly units: InMemoryUnitVersions) {}
  public async ColumnValues(_entity: AssemblyEntityInfo, field: string): Promise<string[]> {
    this.Reads++;
    return this.columns[field] || [];
  }
  public async NewestModelLineage(): Promise<string | null> {
    return null;
  }
  public LoadUnit(unitId: string): Promise<MJPredictionUnitEntity | null> {
    return this.units.Load(unitId);
  }
}

const DATES = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01'];

function setup(columns: Record<string, string[]> = { Renewed: ['true', 'false', 'true', 'true'], StartDate: DATES }): { deps: MigrationDeps; factory: MigrationFactory } {
  const factory = new MigrationFactory();
  const deps: MigrationDeps = {
    Provider: fakeProvider, User: fakeUser, EntityFactory: factory, Today: '2026-10-20',
    Reads: new FixedReads(columns, factory.Units), Metadata: UnitYearsWorld.Metadata(),
  };
  return { deps, factory };
}

describe('PipelineMigration.EnsurePipelineUnitAndProtocol', () => {
  it('predicts in a dry run exactly what the real run then saves, and writes nothing in the dry run', async () => {
    const { deps, factory } = setup();
    const p = new LegacyPipeline();
    const dry = await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, true);
    expect([dry.Action, dry.Cutoff, factory.Units.Rows.length, factory.Protocols.length, p.Saves]).toEqual(['would-migrate', '2024-04-01', 0, 0, 0]);
    const real = await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false);
    expect([real.Action, real.Cutoff, real.Notes]).toEqual(['migrated', dry.Cutoff, dry.Notes]);
    expect([real.PredictionUnitID, real.EvaluationProtocolID]).toEqual([p.PredictionUnitID, p.EvaluationProtocolID]);
    expect(JSON.parse(factory.Units.Rows[0].TaskType)).toEqual({ kind: 'binary', classOrder: ['false', 'true'], adverseIndex: 0 });
    expect(JSON.parse(factory.Protocols[0].InnerValidation)).toEqual({ kind: 'repeated-stratified-kfold', folds: 4, repeats: 3 });
    expect(JSON.parse(factory.Protocols[0].Exclusions)).toEqual({ denyFields: ['ID'], denySources: [] });
    expect(JSON.parse(factory.Protocols[0].Budgets).maxCandidates).toBe(1);
    // The as-of column moved into the unit's decision date.
    expect(p.AsOfStrategy).toBe(JSON.stringify({ Mode: 'none' }));
    expect((await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false)).Reason).toBe('already-migrated');
  });

  it('archives a pipeline whose protocol has no form before anything is written, and never binds a unit to it', async () => {
    const { deps, factory } = setup({ Renewed: ['true', 'false'], StartDate: ['2024-01-01', '2024-01-01'] });
    const p = new LegacyPipeline();
    const r = await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false);
    expect([r.Action, r.Reason]).toEqual(['archived', 'every row has the same StartDate (2024-01-01): no date cutoff leaves development rows']);
    expect([p.Status, p.PredictionUnitID, factory.Units.Rows.length, factory.Protocols.length, p.Saves]).toEqual(['Archived', null, 0, 0, 1]);
    expect(p.Description).toBe('Truth fixture\nArchived by the Prediction Unit migration on 2026-10-20: every row has the same StartDate (2024-01-01): no date cutoff leaves development rows.');
  });

  it('holds an undeclared binary target once, in the decision form, whatever day it runs again', async () => {
    const { deps, factory } = setup({ Segment: ['A', 'B'] });
    const p = new LegacyPipeline();
    p.TargetVariable = 'Segment';
    p.AsOfStrategy = null;
    expect((await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, true)).Action).toBe('would-hold');
    expect(p.Saves).toBe(0);
    const first = await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false);
    const again = await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, { ...deps, Today: '2026-10-21' }, false);
    expect([first.Action, first.Reason, again.Action, p.Saves, factory.Units.Rows.length]).toEqual(['held', ADVERSE_CLASS_HOLD_REASON, 'held', 1, 0]);
    expect(p.Description).toBe(`Truth fixture\nHeld by the Prediction Unit migration on 2026-10-20: ${ADVERSE_CLASS_HOLD_REASON}.`);
  });

  it('deletes the unit and restores the pipeline when binding the unit fails, so a re-run creates exactly one unit', async () => {
    const { deps, factory } = setup();
    const p = new LegacyPipeline([1]);
    const failed = await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false);
    expect([failed.Action, failed.Reason, failed.PredictionUnitID, p.PredictionUnitID, p.TargetVariable, factory.Units.Rows.length]).toEqual(['failed', 'binding the unit: save 1 refused', null, null, 'Renewed', 0]);
    expect(p.AsOfStrategy).toBe(JSON.stringify({ Mode: 'column', Column: 'StartDate' }));
    expect((await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false)).Action).toBe('migrated');
    expect([factory.Units.Rows.length, factory.Protocols.length]).toEqual([1, 1]);
  });

  it('keeps the bound unit and deletes the protocol when binding the protocol fails; a re-run adds only the protocol', async () => {
    const { deps, factory } = setup();
    const p = new LegacyPipeline([2]);
    const failed = await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false);
    expect([failed.Action, failed.Reason, failed.PredictionUnitID, failed.EvaluationProtocolID, factory.Protocols.length]).toEqual(['failed', 'binding the protocol: save 2 refused', p.PredictionUnitID, null, 0]);
    const unitId = p.PredictionUnitID;
    const rerun = await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false);
    expect([rerun.Action, rerun.PredictionUnitID, factory.Units.Rows.length, factory.Protocols.length]).toEqual(['migrated', unitId, 1, 1]);
    expect(JSON.parse(factory.Protocols[0].Holdout)).toEqual({ kind: 'date-carved', dateColumn: 'StartDate', cutoff: '2024-04-01', holdoutEnd: null, newEntityReport: null });
  });

  it('gives a fixed-date unit a seeded-random holdout and skips archived pipelines', async () => {
    const { deps, factory } = setup();
    const p = new LegacyPipeline();
    p.AsOfStrategy = null;
    expect((await PipelineMigration.EnsurePipelineUnitAndProtocol(p.Entity, deps, false)).Cutoff).toBeNull();
    expect(JSON.parse(factory.Protocols[0].Holdout)).toEqual({ kind: 'seeded-random', fraction: 0.25 });
    expect(JSON.parse(factory.Units.Rows[0].UnitRows).decisionDate).toEqual({ kind: 'fixed', date: '2026-10-20', advance: 'each-run' });
    const archived = new LegacyPipeline();
    archived.Status = 'Archived';
    expect((await PipelineMigration.EnsurePipelineUnitAndProtocol(archived.Entity, deps, false)).Reason).toBe('archived');
  });
});

describe('PipelineMigration.BindMigratedUnit', () => {
  it('binds only the unit of a new pipeline and refuses a pipeline it would hold', async () => {
    const { deps, factory } = setup();
    const p = new LegacyPipeline();
    p.AsOfStrategy = JSON.stringify({ Mode: 'none' });
    const bound = await PipelineMigration.BindMigratedUnit(p.Entity, deps);
    expect([bound.Ok, p.PredictionUnitID === null, p.EvaluationProtocolID, factory.Protocols.length]).toEqual([true, false, null, 0]);
    const neutral = new LegacyPipeline();
    neutral.TargetVariable = 'Segment';
    const { deps: d2 } = setup({ Segment: ['A', 'B'] });
    expect(await PipelineMigration.BindMigratedUnit(neutral.Entity, d2)).toEqual({ Ok: false, Reason: ADVERSE_CLASS_HOLD_REASON });
  });
});

describe('PipelineMigration.RunOf', () => {
  it('counts a dry run prediction with its applied form', () => {
    const row = { PipelineID: 'P', PipelineName: 'P', Reason: null, PredictionUnitID: null, EvaluationProtocolID: null, Cutoff: null, Notes: [] };
    const run = PipelineMigration.RunOf([{ ...row, Action: 'would-migrate' }, { ...row, Action: 'held' }, { ...row, Action: 'would-archive' }, { ...row, Action: 'skipped' }, { ...row, Action: 'failed' }]);
    expect([run.MigratedCount, run.HeldCount, run.ArchivedCount, run.SkippedCount, run.FailedCount]).toEqual([1, 1, 1, 1, 1]);
  });
});
