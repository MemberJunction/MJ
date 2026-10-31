/**
 * @module migration/legacy-pipeline-migration
 *
 * Gives a pipeline its version-1 Prediction Unit and Evaluation Protocol from its legacy columns, archives it, or holds
 * it — each with the reason recorded in the report and on the pipeline. Every decision is made from what the pipeline
 * declares and what its rows hold before anything is written. The writes are ordered so a failure leaves no orphan and
 * a re-run finishes the job: the unit is saved and bound to the pipeline first (a failed binding deletes the unit),
 * then the protocol is saved and bound (a failed binding deletes the protocol), and a pipeline that already has its
 * unit gets only the protocol. A pipeline bound to both is skipped. Used by the Action, by the Pipeline Builder (unit
 * only), by the truth-suite harness and by the release step.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity, MJMLModelEntity, MJMLTrainingPipelineEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDSet } from '@memberjunction/global';
import {
  LegacyPipelines, PredictionUnit, TaskTypeRules,
  type Actor, type CellValue, type LegacyProtocolOutcome, type LegacyUnitCreator, type LegacyStop, type PredictionUnitSpec, type UnitDraft,
} from '@memberjunction/predictive-studio-core';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { CompleteReader } from '../feature-assembly/read-policy';
import { ProviderAssemblyMetadata, type AssemblyEntityInfo, type IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { PredictionUnitVersioning } from '../prediction-unit/unit-versioning';
import { EvaluationProtocolVersioning } from '../protocol/protocol-versioning';
import type { IEntityFactory } from '../training/types';

/** The author recorded on every unit and protocol the migration creates. */
export const MIGRATION_ACTOR: Actor = { kind: 'system', component: 'pipeline-migration' };
/** The prefix of the line a held pipeline's description gains. */
export const HELD_MARKER_PREFIX = 'Held by the Prediction Unit migration on ';

/** One pipeline's outcome, as the report and the Action's output carry it. */
export interface MigrationReportRow {
  readonly PipelineID: string;
  readonly PipelineName: string;
  readonly Action: 'migrated' | 'would-migrate' | 'archived' | 'would-archive' | 'held' | 'would-hold' | 'skipped' | 'failed';
  readonly Reason: string | null;
  /** The pipeline's unit as saved (as it was, for a dry run or a row that changed nothing). */
  readonly PredictionUnitID: string | null;
  /** The pipeline's protocol as saved. */
  readonly EvaluationProtocolID: string | null;
  /** The date-carved cutoff; null for a seeded-random holdout and for rows that were not migrated. */
  readonly Cutoff: string | null;
  readonly Notes: readonly string[];
}

/** The reads the migration makes; the default reads through the provider, a test supplies its own. */
export interface IPipelineMigrationReads {
  /** Every non-null value of one column of an entity, as text, read completely (a truncated read throws). */
  ColumnValues(entity: AssemblyEntityInfo, field: string): Promise<string[]>;
  /**
   * Every non-empty value of a target column as a class label, in the form the unit row reader labels rows
   * (`TaskTypeRules.ClassLabel`, the rule `PredictionUnitRowReader.CanonicalLabel` reads classes by: a bit reads
   * `'1'`/`'0'`), read completely.
   */
  LabelValues(entity: AssemblyEntityInfo, field: string): Promise<string[]>;
  /** `Lineage` of the pipeline's newest Published model, else its newest model; null when it has none. */
  NewestModelLineage(pipelineId: string): Promise<string | null>;
  /** The unit version row with this ID, or null. */
  LoadUnit(unitId: string): Promise<MJPredictionUnitEntity | null>;
}

export interface MigrationDeps {
  readonly Provider: IMetadataProvider;
  readonly User: UserInfo;
  readonly EntityFactory: IEntityFactory;
  /** UTC day of the migration (yyyy-mm-dd); injected for deterministic tests. */
  readonly Today: string;
  /** Defaults to reads through `Provider`. */
  readonly Reads?: IPipelineMigrationReads;
  /** Defaults to `Provider`'s entity metadata. */
  readonly Metadata?: IAssemblyMetadata;
}

/** One run over the pipelines: the per-pipeline rows and their counts (the Action's outputs). */
export interface MigrationRun {
  readonly Report: readonly MigrationReportRow[];
  readonly MigratedCount: number;
  readonly ArchivedCount: number;
  readonly HeldCount: number;
  readonly SkippedCount: number;
  readonly FailedCount: number;
}

/** The unit a migrated pipeline trains under: the one it is bound to, or version 1 still to be created. */
type PlannedUnit =
  | { readonly Kind: 'bound'; readonly Spec: PredictionUnitSpec }
  | { readonly Kind: 'new'; readonly Draft: UnitDraft };

/** Everything a migration writes, decided before the first write. */
interface MigrationPlan {
  readonly Unit: PlannedUnit;
  /** Whether the unit's decision date came from the pipeline's AsOfStrategy (which then moves into the unit). */
  readonly MovesAsOf: boolean;
  readonly Protocol: Extract<LegacyProtocolOutcome, { readonly Kind: 'protocol' }>;
  readonly Notes: readonly string[];
}

/** A new pipeline's unit as the builder binds it: the unit's ID, or why the pipeline gets none. */
export type UnitBinding = { readonly Ok: true; readonly UnitID: string } | { readonly Ok: false; readonly Reason: string };

type ReportBase = Omit<MigrationReportRow, 'Action' | 'Reason'>;

/** The legacy-pipeline data migration. */
export class PipelineMigration {
  /** One pipeline: migrate, archive or hold it, with the reason; skipped when archived or already bound to both. */
  public static async EnsurePipelineUnitAndProtocol(p: MJMLTrainingPipelineEntity, deps: MigrationDeps, dryRun: boolean): Promise<MigrationReportRow> {
    const base = PipelineMigration.reportBase(p);
    if (p.Status === 'Archived') return { ...base, Action: 'skipped', Reason: 'archived' };
    if (p.PredictionUnitID !== null && p.EvaluationProtocolID !== null) return { ...base, Action: 'skipped', Reason: 'already-migrated' };
    const entity = PipelineMigration.metadataOf(deps).Entity(p.TargetEntity);
    if (entity === null) return { ...base, Action: 'failed', Reason: `target entity "${p.TargetEntity}" is not registered or has a composite key` };
    const plan = await PipelineMigration.planPipeline(p, entity, deps);
    if (plan.Kind === 'failed') return { ...base, Action: 'failed', Reason: plan.Reason };
    if (plan.Kind === 'archive') return PipelineMigration.archive(p, plan.Reason, deps, dryRun, base);
    if (plan.Kind === 'hold') return PipelineMigration.hold(p, plan.Reason, deps, dryRun, base);
    const cutoff = plan.Plan.Protocol.Holdout.kind === 'date-carved' ? plan.Plan.Protocol.Holdout.cutoff : null;
    const planned: ReportBase = { ...base, Cutoff: cutoff, Notes: plan.Plan.Notes };
    if (dryRun) return { ...planned, Action: 'would-migrate', Reason: null };
    return PipelineMigration.applyPlan(p, plan.Plan, deps, planned);
  }

  /**
   * Every pipeline (or the listed ones) through `EnsurePipelineUnitAndProtocol`; the Action and the release step call
   * this. Sequential on purpose: each pipeline's rows are validated by the server entities as they save, and the
   * report keeps the pipelines' name order.
   */
  public static async MigratePipelines(deps: MigrationDeps, dryRun: boolean, onlyIds: readonly string[]): Promise<MigrationRun> {
    const pipelines = await RunView.FromMetadataProvider(deps.Provider).RunView<MJMLTrainingPipelineEntity>(
      { EntityName: 'MJ: ML Training Pipelines', OrderBy: 'Name', ResultType: 'entity_object' }, deps.User);
    if (!pipelines.Success) throw new Error(`Loading pipelines failed: ${pipelines.ErrorMessage}`);
    const report: MigrationReportRow[] = [];
    const only = new UUIDSet(onlyIds);
    for (const p of pipelines.Results) {
      if (onlyIds.length > 0 && !only.Has(p.ID)) continue;
      report.push(await PipelineMigration.ensureOrReportFailure(p, deps, dryRun));
    }
    return PipelineMigration.RunOf(report);
  }

  /** The counts of a report (a dry run's predictions count with their applied form). */
  public static RunOf(report: readonly MigrationReportRow[]): MigrationRun {
    const count = (...actions: MigrationReportRow['Action'][]): number => report.filter((r) => actions.includes(r.Action)).length;
    return {
      Report: report,
      MigratedCount: count('migrated', 'would-migrate'),
      ArchivedCount: count('archived', 'would-archive'),
      HeldCount: count('held', 'would-hold'),
      SkippedCount: count('skipped'),
      FailedCount: count('failed'),
    };
  }

  /**
   * A new pipeline's version-1 unit, bound and saved (the Pipeline Builder's path: the builder then binds its own
   * protocol for its search). A pipeline already bound to a unit keeps it. Archive and hold outcomes bind nothing and
   * return their reason.
   */
  public static async BindMigratedUnit(p: MJMLTrainingPipelineEntity, deps: MigrationDeps): Promise<UnitBinding> {
    if (p.PredictionUnitID !== null) return { Ok: true, UnitID: p.PredictionUnitID };
    const entity = PipelineMigration.metadataOf(deps).Entity(p.TargetEntity);
    if (entity === null) return { Ok: false, Reason: `target entity "${p.TargetEntity}" is not registered or has a composite key` };
    const mapped = await PipelineMigration.mapNewUnit(p, entity, deps, 'builder');
    if (mapped.Kind !== 'unit') return { Ok: false, Reason: mapped.Reason };
    const bound = await PipelineMigration.bindNewUnit(p, mapped.Draft, mapped.DateColumn !== null, deps);
    return bound.Ok === false ? { Ok: false, Reason: bound.Reason } : { Ok: true, UnitID: bound.UnitID };
  }

  private static async ensureOrReportFailure(p: MJMLTrainingPipelineEntity, deps: MigrationDeps, dryRun: boolean): Promise<MigrationReportRow> {
    try {
      return await PipelineMigration.EnsurePipelineUnitAndProtocol(p, deps, dryRun);
    } catch (e) {
      return { ...PipelineMigration.reportBase(p), Action: 'failed', Reason: e instanceof Error ? e.message : String(e) };
    }
  }

  private static reportBase(p: MJMLTrainingPipelineEntity): ReportBase {
    return { PipelineID: p.ID, PipelineName: p.Name, PredictionUnitID: p.PredictionUnitID, EvaluationProtocolID: p.EvaluationProtocolID, Cutoff: null, Notes: [] };
  }

  private static metadataOf(deps: MigrationDeps): IAssemblyMetadata {
    return deps.Metadata || new ProviderAssemblyMetadata(deps.Provider);
  }

  private static readsOf(deps: MigrationDeps): IPipelineMigrationReads {
    return deps.Reads || new ProviderMigrationReads(deps.Provider, deps.User);
  }

  // region: planning (reads only) --------------------------------------------------------------------------------

  /** What the pipeline maps to, decided from its columns and its rows; nothing is written here. */
  private static async planPipeline(
    p: MJMLTrainingPipelineEntity, entity: AssemblyEntityInfo, deps: MigrationDeps,
  ): Promise<{ readonly Kind: 'plan'; readonly Plan: MigrationPlan } | LegacyStop | { readonly Kind: 'failed'; readonly Reason: string }> {
    const unit = await PipelineMigration.planUnit(p, entity, deps);
    if (unit.Kind !== 'planned') return unit;
    const reads = PipelineMigration.readsOf(deps);
    const dates = unit.DateColumn === null ? [] : await reads.ColumnValues(entity, unit.DateColumn);
    const protocol = LegacyPipelines.LegacyProtocolInputs(p.ValidationStrategy, p.LeakageGuard, unit.DateColumn, dates);
    if (protocol.Kind !== 'protocol') return protocol;
    return { Kind: 'plan', Plan: { Unit: unit.Unit, MovesAsOf: unit.MovesAsOf, Protocol: protocol, Notes: [...unit.Notes, ...protocol.Notes] } };
  }

  /** The pipeline's bound unit, or version 1 mapped from its legacy columns. */
  private static async planUnit(
    p: MJMLTrainingPipelineEntity, entity: AssemblyEntityInfo, deps: MigrationDeps,
  ): Promise<{ readonly Kind: 'planned'; readonly Unit: PlannedUnit; readonly DateColumn: string | null; readonly MovesAsOf: boolean; readonly Notes: readonly string[] } | LegacyStop | { readonly Kind: 'failed'; readonly Reason: string }> {
    if (p.PredictionUnitID !== null) {
      const row = await PipelineMigration.readsOf(deps).LoadUnit(p.PredictionUnitID);
      const parsed = row === null ? null : PredictionUnit.ParsePredictionUnitRow(row);
      if (parsed === null || parsed.Ok === false) return { Kind: 'failed', Reason: `Prediction Unit ${p.PredictionUnitID} not found or unreadable` };
      const rows = parsed.Value.rows;
      const dateColumn = rows.kind === 'grain' && rows.decisionDate.kind === 'column' ? rows.decisionDate.column : null;
      return { Kind: 'planned', Unit: { Kind: 'bound', Spec: parsed.Value }, DateColumn: dateColumn, MovesAsOf: false, Notes: [] };
    }
    const mapped = await PipelineMigration.mapNewUnit(p, entity, deps, 'migration');
    if (mapped.Kind !== 'unit') return mapped;
    return { Kind: 'planned', Unit: { Kind: 'new', Draft: mapped.Draft }, DateColumn: mapped.DateColumn, MovesAsOf: mapped.DateColumn !== null, Notes: mapped.Notes };
  }

  /** Version 1 of the pipeline's unit from its legacy columns, its target's observed classes and its declared outcome semantics. */
  private static async mapNewUnit(p: MJMLTrainingPipelineEntity, entity: AssemblyEntityInfo, deps: MigrationDeps, creator: LegacyUnitCreator): Promise<ReturnType<typeof LegacyPipelines.LegacyUnitInputs>> {
    const reads = PipelineMigration.readsOf(deps);
    const [labels, lineage] = await Promise.all([reads.LabelValues(entity, p.TargetVariable), reads.NewestModelLineage(p.ID)]);
    const outcome = LegacyPipelines.LegacyOutcomeCandidates({
      FeatureSteps: p.FeatureSteps, Hyperparameters: p.Hyperparameters, ModelLineage: lineage, TargetVariable: p.TargetVariable, ProblemType: p.ProblemType,
    });
    return LegacyPipelines.LegacyUnitInputs(p, labels, deps.Today, outcome, creator);
  }

  // region: writes ------------------------------------------------------------------------------------------------

  /** Writes a plan: the unit first (unless bound), then the protocol; the row reports the saved state. */
  private static async applyPlan(p: MJMLTrainingPipelineEntity, plan: MigrationPlan, deps: MigrationDeps, base: ReportBase): Promise<MigrationReportRow> {
    const unit = await PipelineMigration.ensureUnit(p, plan, deps);
    if (unit.Ok === false) return { ...base, Action: 'failed', Reason: unit.Reason, PredictionUnitID: p.PredictionUnitID };
    const protocol = await PipelineMigration.bindProtocol(p, unit.Spec, plan.Protocol, deps);
    const saved = { ...base, PredictionUnitID: p.PredictionUnitID, EvaluationProtocolID: p.EvaluationProtocolID };
    return protocol.Ok === false ? { ...saved, Action: 'failed', Reason: protocol.Reason } : { ...saved, Action: 'migrated', Reason: null };
  }

  /** The planned unit: the bound one as it is, or version 1 saved and bound now. */
  private static async ensureUnit(
    p: MJMLTrainingPipelineEntity, plan: MigrationPlan, deps: MigrationDeps,
  ): Promise<{ readonly Ok: true; readonly Spec: PredictionUnitSpec } | { readonly Ok: false; readonly Reason: string }> {
    if (plan.Unit.Kind === 'bound') return { Ok: true, Spec: plan.Unit.Spec };
    return PipelineMigration.bindNewUnit(p, plan.Unit.Draft, plan.MovesAsOf, deps);
  }

  /**
   * Saves unit version 1 and binds it to the pipeline (with the derived target columns; an AsOfStrategy the unit now
   * carries as its decision date is reset to none). A pipeline that fails to save is restored in memory and the unit is
   * deleted, so nothing points at a unit no pipeline uses.
   */
  private static async bindNewUnit(
    p: MJMLTrainingPipelineEntity, draft: UnitDraft, movesAsOf: boolean, deps: MigrationDeps,
  ): Promise<{ readonly Ok: true; readonly UnitID: string; readonly Spec: PredictionUnitSpec } | { readonly Ok: false; readonly Reason: string }> {
    const row = await PredictionUnitVersioning.CreatePredictionUnitV1(draft, MIGRATION_ACTOR, deps.EntityFactory, deps.User);
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (parsed.Ok === false) return PipelineMigration.undo(row, `migrated unit does not parse: ${parsed.Errors.join('; ')}`);
    const before = { PredictionUnitID: p.PredictionUnitID, TargetEntityID: p.TargetEntityID, TargetVariable: p.TargetVariable, ProblemType: p.ProblemType, AsOfStrategy: p.AsOfStrategy };
    RunViewPredictionUnitStore.ApplyUnitToPipeline(p, row.ID, parsed.Value, PipelineMigration.metadataOf(deps));
    if (movesAsOf) p.AsOfStrategy = JSON.stringify({ Mode: 'none' });
    if (await p.Save()) return { Ok: true, UnitID: row.ID, Spec: parsed.Value };
    const message = `binding the unit: ${p.LatestResult?.CompleteMessage || 'save failed'}`;
    Object.assign(p, before);
    return PipelineMigration.undo(row, message);
  }

  /** Saves protocol version 1 from the legacy inputs and binds it; a failed binding deletes the protocol again. */
  private static async bindProtocol(
    p: MJMLTrainingPipelineEntity, unit: PredictionUnitSpec, proto: MigrationPlan['Protocol'], deps: MigrationDeps,
  ): Promise<{ readonly Ok: true } | { readonly Ok: false; readonly Reason: string }> {
    const draft = LegacyPipelines.LegacyProtocolDraft(unit, proto, `${p.Name} — migrated protocol`);
    const row = await EvaluationProtocolVersioning.CreateEvaluationProtocolV1(draft, MIGRATION_ACTOR, deps.EntityFactory, deps.User);
    p.EvaluationProtocolID = row.ID;
    if (await p.Save()) return { Ok: true };
    const message = `binding the protocol: ${p.LatestResult?.CompleteMessage || 'save failed'}`;
    p.EvaluationProtocolID = null;
    return PipelineMigration.undo(row, message);
  }

  /** Deletes a row the migration just created after a later write failed; the reason names both failures when the delete fails too. */
  private static async undo(row: MJPredictionUnitEntity | MJEvaluationProtocolEntity, reason: string): Promise<{ readonly Ok: false; readonly Reason: string }> {
    if (await row.Delete()) return { Ok: false, Reason: reason };
    return { Ok: false, Reason: `${reason}; deleting the unbound ${row.EntityInfo?.Name || 'row'} ${row.ID} also failed: ${row.LatestResult?.CompleteMessage || 'delete failed'}` };
  }

  private static async archive(p: MJMLTrainingPipelineEntity, reason: string, deps: MigrationDeps, dryRun: boolean, base: ReportBase): Promise<MigrationReportRow> {
    if (dryRun) return { ...base, Action: 'would-archive', Reason: reason };
    p.Status = 'Archived';
    p.Description = `${p.Description ? `${p.Description}\n` : ''}Archived by the Prediction Unit migration on ${deps.Today}: ${reason}.`;
    if (!(await p.Save())) return { ...base, Action: 'failed', Reason: `archive: ${p.LatestResult?.CompleteMessage || 'save failed'}` };
    return { ...base, Action: 'archived', Reason: reason };
  }

  /** Whether the description already holds a held line for this reason (from any earlier run's day). */
  public static HasHeldLine(description: string | null, reason: string): boolean {
    return (description || '').split('\n').some((line) => line.startsWith(HELD_MARKER_PREFIX) && line.endsWith(`: ${reason}.`));
  }

  /** Held: Status unchanged, published models keep scoring, training refused (`unit-required`) until a later run migrates it. */
  private static async hold(p: MJMLTrainingPipelineEntity, reason: string, deps: MigrationDeps, dryRun: boolean, base: ReportBase): Promise<MigrationReportRow> {
    if (dryRun) return { ...base, Action: 'would-hold', Reason: reason };
    if (!PipelineMigration.HasHeldLine(p.Description, reason)) {
      p.Description = `${p.Description ? `${p.Description}\n` : ''}${HELD_MARKER_PREFIX}${deps.Today}: ${reason}.`;
      if (!(await p.Save())) return { ...base, Action: 'failed', Reason: `hold: ${p.LatestResult?.CompleteMessage || 'save failed'}` };
    }
    return { ...base, Action: 'held', Reason: reason };
  }
}

/** The migration's reads through the request's provider (never the global one). */
export class ProviderMigrationReads implements IPipelineMigrationReads {
  constructor(private readonly provider: IMetadataProvider, private readonly user: UserInfo) {}

  public async ColumnValues(entity: AssemblyEntityInfo, field: string): Promise<string[]> {
    return (await this.readColumn(entity, field)).flatMap((v) => {
      if (v === null || v === undefined) return [];
      return [v instanceof Date ? v.toISOString() : String(v)];
    });
  }

  public async LabelValues(entity: AssemblyEntityInfo, field: string): Promise<string[]> {
    return (await this.readColumn(entity, field)).flatMap((v) => {
      const label = TaskTypeRules.ClassLabel(v);
      return label === null ? [] : [label];
    });
  }

  /** One column of every row, read completely (a truncated read throws: the mapping must see every row). */
  private async readColumn(entity: AssemblyEntityInfo, field: string): Promise<CellValue[]> {
    const read = await CompleteReader.ReadCompletely(new RunViewDataAccess(this.user, this.provider), { EntityName: entity.Name, KeyField: entity.PrimaryKey, Fields: [field] }, { mode: 'paged', pageSize: 50_000 });
    if (read.Status === 'refused') throw new Error(`Reading ${entity.Name}.${field} was truncated: ${JSON.stringify(read.Refusal)}`);
    return read.Rows.map((r) => r[field]);
  }

  public async NewestModelLineage(pipelineId: string): Promise<string | null> {
    const rv = RunView.FromMetadataProvider(this.provider);
    const id = EscapeSQLString(pipelineId);
    for (const filter of [`PipelineID='${id}' AND Status='Published'`, `PipelineID='${id}'`]) {   // the second read only when the first finds nothing
      const r = await rv.RunView<Pick<MJMLModelEntity, 'Lineage'>>(
        { EntityName: 'MJ: ML Models', ExtraFilter: filter, OrderBy: '__mj_CreatedAt DESC', MaxRows: 1, Fields: ['Lineage'], ResultType: 'simple' }, this.user);
      if (!r.Success) throw new Error(`Loading the models of pipeline ${pipelineId} failed: ${r.ErrorMessage}`);
      const row = r.Results[0];
      if (row !== undefined) return row.Lineage;
    }
    return null;
  }

  public LoadUnit(unitId: string): Promise<MJPredictionUnitEntity | null> {
    return new RunViewPredictionUnitStore(this.provider, this.user).Load(unitId);
  }
}
