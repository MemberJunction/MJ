/**
 * @module scoring/scoring-seams
 *
 * The collaborators {@link ScoringService} composes, as narrow interfaces with their production implementations: the
 * sidecar `/predict`, the artifact loader, the model runtime (the frozen inference contract of a verified model and its
 * feature assembly), the Feature Value store, where a binding's live challenger comes from, the batch size and the
 * clock. A {@link ScoringContext} may replace any of them ({@link ScoringContext.Seams}); {@link ScoringSeamDefaults}
 * fills in the rest.
 */
import type { MJMLModelEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import type { RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { RunView } from '@memberjunction/core';
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
import { MissingFeatureColumnsError } from '../feature-assembly/feature-assembly-executor';
import { TrainingRefusedError } from '../training/training-refusal';
import type { RegistryContext } from '../registry/registry-context';
import { MLModelInferenceProcessor } from './ml-model-inference-processor';
import { ShadowScoringCoordinator } from './shadow-scoring';
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

/**
 * The outcome of one assembly: the matrix; why assembly stopped; or the feature columns the scope's rows do not carry
 * (a model without a unit reads its features off the scope entity's rows, never off the training entity).
 */
export type ScoringAssembly =
  | ScoringAssembled
  | { readonly Status: 'refused'; readonly Refusal: AssemblyRefusal }
  | { readonly Status: 'missing-columns'; readonly Columns: readonly string[] };

/** A verified model ready to score: its frozen inference contract and its feature assembly. */
export interface IScoringPreparedModel {
  /** The frozen inference contract (schema, preprocessing, artifact, unit, training rows). */
  readonly Loaded: LoadedModel;
  /**
   * Assembles the records `recordIds` (values of the scope entity `entityName`'s primary key `keyField`) as of `asOf`:
   * `'unit-rule'` dates each row by its Prediction Unit's rule, a date reads every row as of that day; a model without a
   * unit ignores `asOf` (the caller admits only the run date for it) and reads the records' rows from `entityName`.
   * Every read goes through `ctx` (the calling batch's user and provider), never the context the model was prepared
   * with: a prepared model is shared read-only by the batches of a run.
   */
  Assemble(recordIds: readonly string[], keyField: string, asOf: 'unit-rule' | Date, entityName: string, ctx: ScoringContext): Promise<ScoringAssembly>;
}

/** Turns a checked model row and its verified artifact bytes into an {@link IScoringPreparedModel}. */
export interface IScoringModelRuntime {
  /** Builds the frozen contract of `model` from the row and `bytes`; reads the model's unit and training rows. */
  Prepare(model: MJMLModelEntity, bytes: Uint8Array, ctx: ScoringContext): Promise<IScoringPreparedModel>;
}

/** The Feature Value writes scoring makes: the model-row writer and the binding's Human rows (PR 1's service). */
export type ScoringValueStore = Pick<FeatureValueCacheService, 'RecordModelValues' | 'RecordHumanValue' | 'RetireHumanValue'>;

/** The challenger a binding run is mirrored to, and which of the run's records it scores (§5.8.3 step 5). */
export interface ChallengerSelection {
  /** The challenger model. */
  readonly ModelID: string;
  /** Whether the record is in the challenger's sample: a pure function of the record, so batches scored at once agree. */
  Sampled(recordId: string): boolean;
}

/** Where a binding's live challenger comes from (§5.8.3 step 5). */
export interface IChallengerSource {
  /** The challenger the binding's run as of `asOf` is mirrored to, with its sample, or null when none is named. */
  Challenger(binding: MJMLModelScoringBindingEntity, asOf: Date, ctx: RegistryContext): Promise<ChallengerSelection | null>;
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

/** The records an assembly reads: their keys, the key field and their entity. */
export interface ScopedRecords {
  readonly RecordIDs: readonly string[];
  readonly KeyField: string;
  readonly EntityName: string;
}

/** Keys per read of a scope's rows. */
const SCOPE_ROW_CHUNK = 100;

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
    const loaded = await processor.PrimeVerifiedModel(model, bytes, InferenceScoringRuntime.processorContext(ctx));
    return {
      Loaded: loaded,
      Assemble: (recordIds, keyField, asOf, entityName, call) => InferenceScoringRuntime.Assemble(processor, loaded, { RecordIDs: recordIds, KeyField: keyField, EntityName: entityName }, asOf, InferenceScoringRuntime.processorContext(call)),
    };
  }

  /** The processor context of a scoring call: its user, provider and Process Run. Pure. */
  private static processorContext(ctx: ScoringContext): RecordProcessorContext {
    return { ContextUser: ctx.ContextUser, Provider: ctx.Provider, ProcessRunID: ctx.ProcessRunID || undefined };
  }

  /**
   * One assembly; a typed assembly refusal or a capped read becomes the refused outcome, a feature column the scope's
   * rows lack becomes the missing-columns outcome, anything else throws.
   */
  public static async Assemble(
    processor: MLModelInferenceProcessor, loaded: LoadedModel, scope: ScopedRecords, asOf: 'unit-rule' | Date, context: RecordProcessorContext,
  ): Promise<ScoringAssembly> {
    try {
      if (loaded.unit !== null) return await InferenceScoringRuntime.asOf(processor, scope.RecordIDs.map((id) => ({ [scope.KeyField]: id })), asOf, context);
      return await InferenceScoringRuntime.transformOnly(processor, scope, context);
    } catch (e) {
      if (e instanceof TrainingRefusedError && e.Refusal.stage === 'assembly') return { Status: 'refused', Refusal: e.Refusal.reason };
      if (e instanceof ReadCapExceededError) return { Status: 'refused', Refusal: { kind: 'truncated-read', entity: e.EntityName, rowsExpected: e.RowsMatched, rowsRead: e.RowsRead } };
      if (e instanceof MissingFeatureColumnsError) return { Status: 'missing-columns', Columns: e.Columns };
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

  /** A model without a unit: the scope's rows read from its own entity, then the transform-only assembly, in input order. */
  private static async transformOnly(processor: MLModelInferenceProcessor, scope: ScopedRecords, context: RecordProcessorContext): Promise<ScoringAssembly> {
    const rows = await InferenceScoringRuntime.readScopeRows(scope, context);
    const result = await processor.AssembleTransformOnly(rows, context);
    return { Status: 'assembled', Matrix: result.matrix, Columns: result.featureSchema, HashColumns: null, RowIDs: [...scope.RecordIDs] };
  }

  /**
   * The scope's records as rows of its own entity, in `RecordIDs` order, one read per {@link SCOPE_ROW_CHUNK} keys.
   *
   * @throws when a read fails or a record is not found
   */
  private static async readScopeRows(scope: ScopedRecords, context: RecordProcessorContext): Promise<SourceRow[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < scope.RecordIDs.length; i += SCOPE_ROW_CHUNK) chunks.push(scope.RecordIDs.slice(i, i + SCOPE_ROW_CHUNK));
    const reads = await RunView.FromMetadataProvider(context.Provider).RunViews<SourceRow>(chunks.map((ids) => ({
      EntityName: scope.EntityName, ExtraFilter: `${scope.KeyField} IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
      ResultType: 'simple' as const, IgnoreMaxRows: true, BypassCache: true,
    })), context.ContextUser);
    const byKey = new Map<string, SourceRow>();
    for (const read of reads) {
      if (!read.Success) throw new Error(`Scoring: reading ${scope.EntityName} records failed: ${read.ErrorMessage}`);
      for (const row of read.Results) byKey.set(String(row[scope.KeyField]).toLowerCase(), row);
    }
    const rows: SourceRow[] = [];
    const missing: string[] = [];
    for (const id of scope.RecordIDs) {
      const row = byKey.get(id.toLowerCase());
      if (row) rows.push(row);
      else missing.push(id);
    }
    if (missing.length > 0) throw new Error(`Scoring: ${missing.length} record(s) of ${scope.EntityName} were not found (first: ${missing.slice(0, 5).join(', ')})`);
    return rows;
  }
}

/**
 * A model runtime that prepares each verified model once and hands back the same prepared model for later calls: the
 * runtime of one bound Record Process run, which calls the scoring service once per batch, so its model's frozen
 * contract, training rows and series history are read once per run, not once per batch. Keyed by the model and its
 * registered artifact hash (the bytes the service verified against it). Construct one per run.
 */
export class MemoizedScoringRuntime implements IScoringModelRuntime {
  private readonly prepared = new Map<string, Promise<IScoringPreparedModel>>();

  /** @param inner the runtime that prepares a model the first time */
  constructor(private readonly inner: IScoringModelRuntime) {}

  /** @inheritdoc; a failed preparation is dropped, so a later call prepares again */
  public Prepare(model: MJMLModelEntity, bytes: Uint8Array, ctx: ScoringContext): Promise<IScoringPreparedModel> {
    const key = `${model.ID.toLowerCase()}|${(model.ArtifactSha256 || '').toLowerCase()}`;
    const known = this.prepared.get(key);
    if (known) return known;
    const fresh = this.inner.Prepare(model, bytes, ctx);
    this.prepared.set(key, fresh);
    fresh.catch(() => this.prepared.delete(key));
    return fresh;
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
      Challengers: partial?.Challengers || new ShadowScoringCoordinator(),
      BatchSize: partial?.BatchSize && partial.BatchSize > 0 ? partial.BatchSize : SCORING_BATCH_SIZE_DEFAULT,
      Clock: partial?.Clock || { Now: () => new Date() },
    };
  }
}
