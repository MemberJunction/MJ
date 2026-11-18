/**
 * @module scoring/scoring-seams
 *
 * The collaborators {@link ScoringService} composes, as narrow interfaces with their production implementations: the
 * sidecar `/predict`, the artifact loader, the model runtime (the frozen inference contract of a verified model and its
 * feature assembly), the Feature Value store, where a binding's live challenger comes from, the batch size and the
 * clock. A {@link ScoringContext} may replace any of them ({@link ScoringContext.Seams}); {@link ScoringSeamDefaults}
 * fills in the rest.
 */
import type { MJMLModelEntity, MJMLModelScoringBindingEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import type { RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { EscapeSQLString } from '@memberjunction/global';
import { FeatureValueCacheService } from '@memberjunction/feature-pipelines';
import {
  LABEL_COLUMN,
  type AssemblyRefusal,
  type FeatureSchemaEntry,
  type MatrixData,
  type SnapshotFeatureColumn,
} from '@memberjunction/predictive-studio-core';

import type { SourceRow } from '../feature-assembly/data-access';
import { AsOfFeatureAssembler } from '../feature-assembly/as-of/as-of-assembler';
import { ReadCapExceededError } from '../feature-assembly/read-cap-error';
import { TrainingRefusedError } from '../training/training-refusal';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';
import { MLModelInferenceProcessor } from './ml-model-inference-processor';
import { MJSidecarPredictor, RunViewMLModelLoader } from './seams';
import { StorageProviderArtifactLoader } from './storage-provider-artifact-loader';
import type { ScoringContext } from './scoring-context';
import type { IArtifactLoader, ISidecarPredictor, LoadedModel, MLInferenceDeps } from './types';

/** A scope's rows assembled into the model's feature matrix, aligned with the rows' order. */
export interface ScoringAssembled {
  readonly Status: 'assembled';
  readonly Matrix: MatrixData;
  /** The assembled columns' names and kinds, in matrix order. */
  readonly Columns: readonly FeatureSchemaEntry[];
  /** The encoded columns a Prediction Unit assembly hashes (`SnapshotFiles.ComputeFeatureSchemaHash`); null for a model without a unit. */
  readonly HashColumns: readonly SnapshotFeatureColumn[] | null;
  /** The record of each matrix row, in matrix order. */
  readonly RowIDs: readonly string[];
}

/** The outcome of one assembly: the matrix, or why assembly stopped. */
export type ScoringAssembly = ScoringAssembled | { readonly Status: 'refused'; readonly Refusal: AssemblyRefusal };

/** A verified model ready to score: its frozen inference contract and its feature assembly. */
export interface IScoringPreparedModel {
  /** The frozen inference contract (schema, preprocessing, artifact, unit, training rows). */
  readonly Loaded: LoadedModel;
  /**
   * Assembles the records `recordIds` (values of the scope entity's primary key `keyField`) as of `asOf`:
   * `'unit-rule'` dates each row by its Prediction Unit's rule, a date reads every row as of that day; a model without a
   * unit ignores `asOf` (the caller admits only the run date for it).
   */
  Assemble(recordIds: readonly string[], keyField: string, asOf: 'unit-rule' | Date): Promise<ScoringAssembly>;
}

/** Turns a checked model row and its verified artifact bytes into an {@link IScoringPreparedModel}. */
export interface IScoringModelRuntime {
  /** Builds the frozen contract of `model` from the row and `bytes`; reads the model's unit and training rows. */
  Prepare(model: MJMLModelEntity, bytes: Uint8Array, ctx: ScoringContext): Promise<IScoringPreparedModel>;
}

/** The Feature Value writes scoring makes: the model-row writer and the binding's Human rows (PR 1's service). */
export type ScoringValueStore = Pick<FeatureValueCacheService, 'RecordModelValues' | 'RecordHumanValue' | 'RetireHumanValue'>;

/** Where a binding's live challenger comes from (§5.8.3 step 5). */
export interface IChallengerSource {
  /** The challenger model the binding's champion is mirrored to, or null when none is named. */
  ChallengerModelID(binding: MJMLModelScoringBindingEntity, ctx: RegistryContext): Promise<string | null>;
}

/** The clock the run date is read from. */
export interface ScoringClock {
  /** The current instant. */
  Now(): Date;
}

/** Every collaborator of the scoring service. */
export interface ScoringServiceSeams {
  readonly ArtifactLoader: IArtifactLoader;
  readonly Sidecar: ISidecarPredictor;
  readonly Runtime: IScoringModelRuntime;
  readonly Values: ScoringValueStore;
  readonly Challengers: IChallengerSource;
  /** Records per batch: one sidecar round trip and one transaction each. */
  readonly BatchSize: number;
  readonly Clock: ScoringClock;
}

/** Records per batch when none is given: Record Set Processing's default batch size. */
export const SCORING_BATCH_SIZE_DEFAULT = 100;

/**
 * The production model runtime: {@link MLModelInferenceProcessor}, primed with the verified model so it reads neither
 * the row nor the artifact again. A Prediction Unit model assembles through `AssembleForScoring` (PR 3's as-of
 * assembly); a model without a unit through the transform-only `'on-demand'` assembly.
 */
export class InferenceScoringRuntime implements IScoringModelRuntime {
  /** @param deps the inference seams (the sidecar and artifact loader are not called: the model arrives verified) */
  constructor(private readonly deps: MLInferenceDeps) {}

  /** @inheritdoc */
  public async Prepare(model: MJMLModelEntity, bytes: Uint8Array, ctx: ScoringContext): Promise<IScoringPreparedModel> {
    const processor = new MLModelInferenceProcessor({ modelId: model.ID, deps: this.deps });
    const context: RecordProcessorContext = { ContextUser: ctx.ContextUser, Provider: ctx.Provider, ProcessRunID: ctx.ProcessRunID || undefined };
    const loaded = await processor.PrimeVerifiedModel(model, bytes, context);
    return {
      Loaded: loaded,
      Assemble: (recordIds, keyField, asOf) => InferenceScoringRuntime.Assemble(processor, loaded, recordIds, keyField, asOf, context),
    };
  }

  /** One assembly; a typed assembly refusal or a capped read becomes the refused outcome, anything else throws. */
  public static async Assemble(
    processor: MLModelInferenceProcessor, loaded: LoadedModel, recordIds: readonly string[], keyField: string, asOf: 'unit-rule' | Date, context: RecordProcessorContext,
  ): Promise<ScoringAssembly> {
    const rows: SourceRow[] = recordIds.map((id) => ({ [keyField]: id }));
    try {
      return loaded.unit === null ? await InferenceScoringRuntime.transformOnly(processor, rows, recordIds, context) : await InferenceScoringRuntime.asOf(processor, rows, asOf, context);
    } catch (e) {
      if (e instanceof TrainingRefusedError && e.Refusal.stage === 'assembly') return { Status: 'refused', Refusal: e.Refusal.reason };
      if (e instanceof ReadCapExceededError) return { Status: 'refused', Refusal: { kind: 'truncated-read', entity: e.EntityName, rowsExpected: e.RowsMatched, rowsRead: e.RowsRead } };
      throw e;
    }
  }

  /** A unit model's rows, read as of `asOf`; a row the history cannot cover refuses, as training's `refuse` policy does. */
  private static async asOf(processor: MLModelInferenceProcessor, rows: SourceRow[], asOf: 'unit-rule' | Date, context: RecordProcessorContext): Promise<ScoringAssembly> {
    const assembled = await processor.AssembleForScoring(rows, context, asOf);
    if (assembled.Status === 'refused') return assembled;
    const first = assembled.UncoveredRowsExcluded[0];
    if (first) {
      const coverage = assembled.Coverage.find((c) => c.entity === first.entity && c.field === first.field);
      return { Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: first.entity, field: first.field, historyStart: coverage?.historyStart || null, rowsAffected: first.rows } };
    }
    const result = AsOfFeatureAssembler.ToFeatureAssemblyResult(assembled, null, LABEL_COLUMN);
    return {
      Status: 'assembled',
      Matrix: result.matrix,
      Columns: result.featureSchema,
      HashColumns: assembled.Columns.map((c) => ({ name: c.Name, encoding: c.Encoding, sourceColumn: c.SourceColumn })),
      RowIDs: assembled.Rows.map((r) => r.RowID),
    };
  }

  /** A model without a unit: the transform-only assembly, rows in input order. */
  private static async transformOnly(processor: MLModelInferenceProcessor, rows: SourceRow[], recordIds: readonly string[], context: RecordProcessorContext): Promise<ScoringAssembly> {
    const result = await processor.AssembleTransformOnly(rows, context);
    return { Status: 'assembled', Matrix: result.matrix, Columns: result.featureSchema, HashColumns: null, RowIDs: [...recordIds] };
  }
}

/**
 * The production challenger source: the binding's Record Process `ChallengerConfiguration`, when it is enabled and of
 * work type `'ML Model'` with a `ChallengerModelID` (#6180's configuration). The monitoring job spec names no challenger
 * model, so it is not read here.
 */
export class RecordProcessChallengerSource implements IChallengerSource {
  /** @inheritdoc */
  public async ChallengerModelID(binding: MJMLModelScoringBindingEntity, ctx: RegistryContext): Promise<string | null> {
    if (!binding.RecordProcessID) return null;
    const read = await StoredRowReads.Run<MJRecordProcessEntity>({
      EntityName: 'MJ: Record Processes', ExtraFilter: `ID='${EscapeSQLString(binding.RecordProcessID)}'`, ResultType: 'entity_object', MaxRows: 1, // pk-filter-ok: MJ: Record Processes is an MJ core entity keyed by ID
    }, ctx);
    if (!read.Success) throw new Error(`Scoring: reading Record Process '${binding.RecordProcessID}' of binding '${binding.ID}' failed: ${read.ErrorMessage}`);
    const config = read.Results[0]?.ChallengerConfigurationObject || null;
    if (!config || !config.Enabled || config.WorkType !== 'ML Model' || !config.ChallengerModelID) return null;
    return config.ChallengerModelID;
  }
}

/** Resolves a context's seams over the production defaults. */
export class ScoringSeamDefaults {
  /** `partial` with every collaborator it leaves out set to its production implementation. */
  public static Resolve(partial: Partial<ScoringServiceSeams> | undefined): ScoringServiceSeams {
    const artifactLoader = partial?.ArtifactLoader || new StorageProviderArtifactLoader();
    const sidecar = partial?.Sidecar || new MJSidecarPredictor();
    return {
      ArtifactLoader: artifactLoader,
      Sidecar: sidecar,
      Runtime: partial?.Runtime || new InferenceScoringRuntime({ modelLoader: new RunViewMLModelLoader(), artifactLoader, sidecar }),
      Values: partial?.Values || FeatureValueCacheService.Instance,
      Challengers: partial?.Challengers || new RecordProcessChallengerSource(),
      BatchSize: partial?.BatchSize && partial.BatchSize > 0 ? partial.BatchSize : SCORING_BATCH_SIZE_DEFAULT,
      Clock: partial?.Clock || { Now: () => new Date() },
    };
  }
}
