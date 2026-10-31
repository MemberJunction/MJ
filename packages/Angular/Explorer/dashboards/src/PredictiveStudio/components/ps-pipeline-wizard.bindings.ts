/**
 * The Prediction Unit and Evaluation Protocol a pipeline the wizard creates is bound to, so it can train: version 1 of
 * each, mapped from the wizard's target the way the pipeline migration maps an existing pipeline
 * (`LegacyPipelines`), written with Core's row writer (`ProtocolRows`) through the caller's provider. The pipeline row
 * is saved last, already bound, so no unbound pipeline is left behind; when it fails to save, the unit and protocol it
 * would have pointed at are deleted again. Browser-safe (L0): no router, no Explorer import.
 */
import { RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity, MJMLTrainingPipelineEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import {
  LegacyPipelines, PredictionUnit, ProtocolRows, TaskTypeRules, UtcDay,
  type Actor, type LegacyProtocolOutcome, type LegacyStop, type PredictionUnitSpec, type UnitDraft,
} from '@memberjunction/predictive-studio-core';

/** Rows per label page: an explicit page size, since a client view without one returns only the entity's default page. */
const LABEL_PAGE_ROWS = 50_000;

/** The unit draft and protocol inputs a new pipeline maps to. */
export interface WizardBindingPlan {
  readonly Kind: 'plan';
  readonly Unit: UnitDraft;
  readonly Protocol: Extract<LegacyProtocolOutcome, { readonly Kind: 'protocol' }>;
}

/** The pipeline columns the mapping reads, plus the target entity's name. */
export type WizardPipelineFields = Pick<MJMLTrainingPipelineEntity, 'Name' | 'TargetVariable' | 'ProblemType' | 'AsOfStrategy' | 'ValidationStrategy' | 'LeakageGuard' | 'FeatureSteps' | 'Hyperparameters'> & {
  readonly TargetEntity: string;
};

/** Saving a pipeline with its bindings: success, or why it was not saved. */
export type WizardSaveResult = { readonly Ok: true } | { readonly Ok: false; readonly Reason: string };

/** Binding the pipelines the wizard creates. */
export class PipelineWizardBindings {
  /** Pure: the unit and protocol a new pipeline maps to, or why it gets none (an undeclared binary target is held). */
  public static Plan(p: WizardPipelineFields, labels: readonly string[], today: string): WizardBindingPlan | LegacyStop {
    const outcome = LegacyPipelines.LegacyOutcomeCandidates({
      FeatureSteps: p.FeatureSteps, Hyperparameters: p.Hyperparameters, ModelLineage: null, TargetVariable: p.TargetVariable, ProblemType: p.ProblemType,
    });
    const unit = LegacyPipelines.LegacyUnitInputs(p, labels, today, outcome);
    if (unit.Kind !== 'unit') return unit;
    const protocol = LegacyPipelines.LegacyProtocolInputs(p.ValidationStrategy, p.LeakageGuard, unit.DateColumn, []);
    if (protocol.Kind === 'archive') return protocol;
    return { Kind: 'plan', Unit: unit.Draft, Protocol: protocol };
  }

  /**
   * The target's class labels for a classification (none for a regression), every row read in pages ordered by the
   * primary key (a client view returns at most a page of rows); a read that ends short of the row count is refused
   * rather than mapped from a sample.
   */
  public static async ReadClassLabels(p: WizardPipelineFields, provider: IMetadataProvider, user: UserInfo | undefined): Promise<string[]> {
    if (p.ProblemType !== 'classification') return [];
    const entity = provider.EntityByName(p.TargetEntity);
    if (!entity) throw new Error(`Target entity "${p.TargetEntity}" is not registered`);
    const orderBy = entity.PrimaryKeys.map((k) => k.Name).join(', ');
    const labels: string[] = [];
    for (let read = 0, total = 1; read < total;) {
      const page = await PipelineWizardBindings.readLabelPage(p, provider, user, orderBy, read);
      if (page.Rows === 0) throw new Error(`Reading ${p.TargetEntity}.${p.TargetVariable} returned ${read} of ${page.Total} rows`);
      labels.push(...page.Labels);
      read += page.Rows;
      total = page.Total;
    }
    return labels;
  }

  /** One page of the target column from `startRow`: its class labels, its row count and the view's total. */
  private static async readLabelPage(
    p: WizardPipelineFields, provider: IMetadataProvider, user: UserInfo | undefined, orderBy: string, startRow: number,
  ): Promise<{ readonly Labels: string[]; readonly Rows: number; readonly Total: number }> {
    const r = await RunView.FromMetadataProvider(provider).RunView<Record<string, string | number | boolean | Date | null>>(
      { EntityName: p.TargetEntity, Fields: [p.TargetVariable], OrderBy: orderBy, StartRow: startRow, MaxRows: LABEL_PAGE_ROWS, ResultType: 'simple' }, user);
    if (!r.Success) throw new Error(`Reading ${p.TargetEntity}.${p.TargetVariable} failed: ${r.ErrorMessage}`);
    const labels = r.Results.flatMap((row) => {
      const label = LegacyPipelines.ClassLabel(row[p.TargetVariable]);
      return label === null ? [] : [label];
    });
    // A view that reports no total has returned every row it holds.
    return { Labels: labels, Rows: r.Results.length, Total: typeof r.TotalRowCount === 'number' ? r.TotalRowCount : startRow + r.Results.length };
  }

  /**
   * Saves a new pipeline bound to version 1 of its unit and protocol. Archive and hold outcomes save nothing and
   * return the reason; a failed save deletes whatever this call created.
   */
  public static async SaveWithBindings(pipeline: MJMLTrainingPipelineEntity, targetEntity: string, provider: IMetadataProvider, user: UserInfo | undefined): Promise<WizardSaveResult> {
    const fields: WizardPipelineFields = {
      Name: pipeline.Name, TargetVariable: pipeline.TargetVariable, ProblemType: pipeline.ProblemType, AsOfStrategy: pipeline.AsOfStrategy,
      ValidationStrategy: pipeline.ValidationStrategy, LeakageGuard: pipeline.LeakageGuard, FeatureSteps: pipeline.FeatureSteps,
      Hyperparameters: pipeline.Hyperparameters, TargetEntity: targetEntity,
    };
    const plan = PipelineWizardBindings.Plan(fields, await PipelineWizardBindings.ReadClassLabels(fields, provider, user), UtcDay.UtcDayIso(new Date()));
    if (plan.Kind !== 'plan') return { Ok: false, Reason: `${plan.Kind === 'hold' ? 'the pipeline cannot be bound to a Prediction Unit yet' : 'the pipeline has no Prediction Unit form'}: ${plan.Reason}` };
    const author: Actor = { kind: 'human', userId: user ? user.ID : provider.CurrentUser.ID };
    const unit = await PipelineWizardBindings.saveUnit(plan.Unit, author, provider, user);
    if (unit.Ok === false) return unit;
    const protocol = await PipelineWizardBindings.saveProtocol(unit.Spec, plan.Protocol, `${fields.Name} — protocol`, author, provider, user);
    if (protocol.Ok === false) return PipelineWizardBindings.undo([unit.Row], protocol.Reason);
    PipelineWizardBindings.bind(pipeline, unit.Spec, unit.Row.ID, protocol.Row.ID);
    if (await pipeline.Save()) return { Ok: true };
    return PipelineWizardBindings.undo([protocol.Row, unit.Row], `saving the pipeline: ${pipeline.LatestResult?.CompleteMessage || 'save failed'}`);
  }

  /** Points the pipeline at both versions, with the target columns the server derives from the unit. */
  private static bind(pipeline: MJMLTrainingPipelineEntity, unit: PredictionUnitSpec, unitId: string, protocolId: string): void {
    pipeline.PredictionUnitID = unitId;
    pipeline.EvaluationProtocolID = protocolId;
    pipeline.TargetVariable = PredictionUnit.DescribeLabelRule(unit);
    pipeline.ProblemType = TaskTypeRules.LegacyProblemTypeForTask(unit.label.outcome);
  }

  private static async saveUnit(
    draft: UnitDraft, author: Actor, provider: IMetadataProvider, user: UserInfo | undefined,
  ): Promise<{ readonly Ok: true; readonly Row: MJPredictionUnitEntity; readonly Spec: PredictionUnitSpec } | { readonly Ok: false; readonly Reason: string }> {
    const row = await provider.GetEntityObject<MJPredictionUnitEntity>('MJ: Prediction Units', user);
    row.NewRecord();
    const id = ProtocolRows.NewVersionRowID();
    ProtocolRows.ApplyPredictionUnitDraftToRow(row, draft, { ID: id, LineageRootID: id, Version: 1, LabelVersion: 1, AuthoredBy: author });
    if (!(await row.Save())) return { Ok: false, Reason: `saving the Prediction Unit: ${row.LatestResult?.CompleteMessage || 'save failed'}` };
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (parsed.Ok === false) return PipelineWizardBindings.undo([row], `the saved Prediction Unit does not parse: ${parsed.Errors.join('; ')}`);
    return { Ok: true, Row: row, Spec: parsed.Value };
  }

  private static async saveProtocol(
    unit: PredictionUnitSpec, inputs: WizardBindingPlan['Protocol'], name: string, author: Actor, provider: IMetadataProvider, user: UserInfo | undefined,
  ): Promise<{ readonly Ok: true; readonly Row: MJEvaluationProtocolEntity } | { readonly Ok: false; readonly Reason: string }> {
    const row = await provider.GetEntityObject<MJEvaluationProtocolEntity>('MJ: Evaluation Protocols', user);
    row.NewRecord();
    const id = ProtocolRows.NewVersionRowID();
    ProtocolRows.ApplyProtocolDraftToRow(row, LegacyPipelines.LegacyProtocolDraft(unit, inputs, name), { ID: id, LineageRootID: id, Version: 1, AuthoredBy: author, Description: null });
    if (await row.Save()) return { Ok: true, Row: row };
    return { Ok: false, Reason: `saving the Evaluation Protocol: ${row.LatestResult?.CompleteMessage || 'save failed'}` };
  }

  /** Deletes rows this call created (newest first) and returns the reason, naming any row that could not be deleted. */
  private static async undo(rows: readonly BaseEntity[], reason: string): Promise<{ readonly Ok: false; readonly Reason: string }> {
    const left: string[] = [];
    for (const row of rows) {
      if (!(await row.Delete())) left.push(`${row.EntityInfo?.Name || 'row'} ${row.PrimaryKey.ToString()}: ${row.LatestResult?.CompleteMessage || 'delete failed'}`);
    }
    return { Ok: false, Reason: left.length === 0 ? reason : `${reason}; could not delete ${left.join(', ')}` };
  }
}
