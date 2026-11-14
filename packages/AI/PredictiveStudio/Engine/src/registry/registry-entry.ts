/**
 * @module registry/registry-entry
 *
 * The model registry's read of one `MJ: ML Models` row as a {@link ModelRegistryEntry} (§5.2): the delivery the row
 * stores, its lineage columns, the feature schema hash, the output semantics, and the evaluation and leakage flags of
 * the training run that produced it. The read is honest: it returns `null` only when no row exists, and refuses a row
 * that cannot be a full entry rather than building part of one. A model trained before the registry entry existed
 * (a pre-change model, §5.6) has null entry columns and is refused with {@link RegistryEntryIncompleteError}; how
 * serving treats such a model is the Scoring Service's decision, not this read's.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import {
  GateRules,
  RegistrySchemas,
  TrainingRunResultsParser,
  type CodeVersion,
  type FeatureVersionPin,
  type MetricWithInterval,
  type ModelRegistryEntry,
  type ParseResult,
  type RegisteredDeliveryView,
  type StoredTrainerResult,
} from '@memberjunction/predictive-studio-core';

import { UnitModelLineageParser } from '../training/unit-model-lineage';
import type { RegistryContext } from './registry-context';

/** The run's stored trainer result as the entry names it when it is absent. */
const TRAINER_RESULT_COLUMN = 'MJ: ML Training Runs.ValidationResults.trainer';

/**
 * Thrown when a model row exists but a column its registry entry needs is null: a model trained before the registry
 * entry existed, or a row whose training run stored no trainer result. Names every missing column.
 */
export class RegistryEntryIncompleteError extends Error {
  constructor(public readonly ModelID: string, public readonly MissingColumns: readonly string[]) {
    super(`ML Model '${ModelID}' has no registry entry: ${MissingColumns.join(', ')} ${MissingColumns.length === 1 ? 'is' : 'are'} null`);
    this.name = 'RegistryEntryIncompleteError';
  }
}

/** Thrown when a registry column of a model row holds a value that is not its contract's shape. */
export class RegistryEntryInvalidError extends Error {
  constructor(public readonly ModelID: string, public readonly Column: string, public readonly Errors: readonly string[]) {
    super(`ML Model '${ModelID}': its stored ${Column} is not a valid registry value: ${Errors.join('; ')}`);
    this.name = 'RegistryEntryInvalidError';
  }
}

/** The model columns an entry needs, each named as the error names it. */
type EntryColumn = keyof Pick<
  MJMLModelEntity,
  'TrainingRunID' | 'TrainingSnapshotID' | 'EvaluationProtocolID' | 'PredictionUnitID' | 'SnapshotHash' | 'FeatureSchemaHash' | 'CodeVersion' | 'OutputSemantics' | 'Delivery' | 'Lineage'
>;

/** The entry columns of a model row, each present. */
type EntryColumns = { readonly [K in EntryColumn]: string };

/** The registry's read of model rows. */
export class RegistryEntries {
  /**
   * The registry entry of one model, read through `ctx.Provider` as `ctx.ContextUser`. `Evaluation` and `LeakageFlags`
   * come from the stored trainer result of the run named by `TrainingRunID` (`ValidationResults.trainer`): the holdout
   * primary score of what shipped (the kept member's for keep-simple-baseline) and every baseline. `PinnedFeatureVersions`
   * are the pins of the stored lineage's feature-value columns, `[]` when it has none (PR 5 writes them).
   *
   * @returns the entry, or null only when no model row has this ID
   * @throws RegistryEntryIncompleteError when the row exists but a column the entry needs is null (a pre-change model)
   * @throws RegistryEntryInvalidError when a registry column holds a value that is not its contract's shape
   * @throws Error when a read fails (a failed read is not an absent row)
   */
  public static async Load(modelId: string, ctx: RegistryContext): Promise<ModelRegistryEntry | null> {
    const model = await RegistryEntries.readModel(modelId, ctx);
    if (model === null) return null;
    const c = RegistryEntries.entryColumnsOf(model);
    const trainer = await RegistryEntries.readTrainerResult(model.ID, c.TrainingRunID, ctx);
    const delivery = RegistryEntries.valid(model.ID, 'Delivery', RegistryEntries.deliveryOf(model));
    return {
      ModelID: model.ID,
      PipelineID: model.PipelineID,
      Version: model.Version,
      Status: model.Status,
      Delivery: delivery,
      Lineage: {
        TrainingSnapshotID: c.TrainingSnapshotID,
        SnapshotHash: c.SnapshotHash,
        EvaluationProtocolID: c.EvaluationProtocolID,
        PredictionUnitID: c.PredictionUnitID,
        CodeVersion: RegistryEntries.valid(model.ID, 'CodeVersion', RegistryEntries.codeVersionOf(model)),
        TrainingRunID: c.TrainingRunID,
        PinnedFeatureVersions: RegistryEntries.valid(model.ID, 'Lineage', RegistryEntries.pinsOf(c.Lineage)),
      },
      FeatureSchemaHash: c.FeatureSchemaHash,
      Semantics: RegistryEntries.valid(model.ID, 'OutputSemantics', RegistrySchemas.ParseOutputSemantics(c.OutputSemantics)),
      Evaluation: { Primary: RegistryEntries.valid(model.ID, TRAINER_RESULT_COLUMN, RegistryEntries.primaryOf(delivery, trainer)), Baselines: trainer.baselines },
      LeakageFlags: trainer.leakageFlags,
    };
  }

  /** The model row as an entity object (its JSON columns are read through the generated typed accessors), or null. */
  private static async readModel(modelId: string, ctx: RegistryContext): Promise<MJMLModelEntity | null> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJMLModelEntity>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, ResultType: 'entity_object', MaxRows: 1, SkipTotalRowCount: true },
      ctx.ContextUser,
    );
    if (!result.Success) throw new Error(`Reading ML Model ${modelId} for its registry entry failed: ${result.ErrorMessage || 'unknown error'}`);
    return result.Results[0] || null;
  }

  /** The stored trainer result of the model's training run. */
  private static async readTrainerResult(modelId: string, trainingRunId: string, ctx: RegistryContext): Promise<StoredTrainerResult> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ValidationResults'>>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(trainingRunId)}'`, Fields: ['ID', 'ValidationResults'], ResultType: 'simple', MaxRows: 1 },
      ctx.ContextUser,
    );
    if (!result.Success) throw new Error(`Reading ML Training Run ${trainingRunId} of ML Model ${modelId} failed: ${result.ErrorMessage || 'unknown error'}`);
    const run = result.Results[0];
    if (!run || !run.ValidationResults) throw new RegistryEntryIncompleteError(modelId, [TRAINER_RESULT_COLUMN]);
    const parsed = RegistryEntries.valid(modelId, TRAINER_RESULT_COLUMN, TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults));
    // A refused run stores no trainer result; neither does a completed run without one.
    if (parsed.status !== 'completed' || parsed.trainer === null) throw new RegistryEntryIncompleteError(modelId, [TRAINER_RESULT_COLUMN]);
    return parsed.trainer;
  }

  /** Every entry column of the row; a null (or blank) column is named in the refusal, all of them at once. */
  private static entryColumnsOf(model: MJMLModelEntity): EntryColumns {
    const missing: EntryColumn[] = [];
    const present = (column: EntryColumn): string => {
      const value = model[column];
      if (!value) missing.push(column);
      return value || '';
    };
    const columns: EntryColumns = {
      TrainingRunID: present('TrainingRunID'), TrainingSnapshotID: present('TrainingSnapshotID'), EvaluationProtocolID: present('EvaluationProtocolID'),
      PredictionUnitID: present('PredictionUnitID'), SnapshotHash: present('SnapshotHash'), FeatureSchemaHash: present('FeatureSchemaHash'),
      CodeVersion: present('CodeVersion'), OutputSemantics: present('OutputSemantics'), Delivery: present('Delivery'), Lineage: present('Lineage'),
    };
    if (missing.length > 0) throw new RegistryEntryIncompleteError(model.ID, missing);
    return columns;
  }

  /** The stored delivery view (read through the generated `DeliveryObject` accessor), checked against its contract. */
  private static deliveryOf(model: MJMLModelEntity): ParseResult<RegisteredDeliveryView> {
    const view = model.DeliveryObject;
    return view === null ? { Ok: false, Errors: ['the column does not parse'] } : RegistrySchemas.ValidateDelivery(view);
  }

  /** The stored code version (read through the generated `CodeVersionObject` accessor), checked against its contract. */
  private static codeVersionOf(model: MJMLModelEntity): ParseResult<CodeVersion> {
    const codeVersion = model.CodeVersionObject;
    return codeVersion === null ? { Ok: false, Errors: ['the column does not parse'] } : RegistrySchemas.ValidateCodeVersion(codeVersion);
  }

  /** The pins of the stored unit lineage's feature-value columns. */
  private static pinsOf(lineageText: string): ParseResult<readonly FeatureVersionPin[]> {
    const lineage = UnitModelLineageParser.ParseUnitModelLineage(lineageText);
    if (lineage.Ok === false) return lineage;
    const pins = lineage.Value.featureSpec.flatMap((c) => (c.source.kind === 'feature-value' && c.source.pin !== null ? [c.source.pin] : []));
    return { Ok: true, Value: pins };
  }

  /** The holdout primary score of what the delivery ships: the kept simple member's, else the finalist's. */
  private static primaryOf(delivery: RegisteredDeliveryView, trainer: StoredTrainerResult): ParseResult<MetricWithInterval> {
    if (delivery.kind !== 'delivered' || delivery.shippedRole === 'model') return { Ok: true, Value: trainer.holdout.primary };
    const member = trainer.baselines.find((b) => b.role === 'simple' && GateRules.BaselineMemberName(b.baseline) === delivery.shipped);
    return member === undefined
      ? { Ok: false, Errors: [`no simple baseline named '${delivery.shipped}', the delivered member`] }
      : { Ok: true, Value: member.holdout };
  }

  /** The parsed value, or the refusal naming the column and every problem. */
  private static valid<T>(modelId: string, column: string, parsed: ParseResult<T>): T {
    if (parsed.Ok === false) throw new RegistryEntryInvalidError(modelId, column, parsed.Errors);
    return parsed.Value;
  }
}
