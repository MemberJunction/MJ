/**
 * @module scoring/shadow-scoring
 *
 * Online Shadow Scoring (`WS-4.4`) for `MJ: Record Processes` (`'ML Model'` and `'Infer'` work types).
 *
 * Guarantees:
 * 1. **Champion Isolation**: Champion executes synchronously/normally and writes authoritative target
 *    entity fields + champion audit rows (`Role: 'Champion'`). For `'ML Model'` Record Processes,
 *    the records sampled by {@link ShadowScoringCoordinator} form the drift-evaluation population:
 *    each sampled record's champion prediction is persisted to `MJ: Feature Values` with
 *    `Role = 'Champion'` and a computed `ValueKeyHash` via
 *    {@link FeatureValueCacheService.RecordFeatureValues} before the challenger runs. Challenger
 *    errors or timeouts (`MaxLatencyMs`) NEVER fail or delay the champion execution.
 * 2. **Zero Business-Entity Mutation**: Challenger runs against the exact same frozen feature snapshot
 *    and writes only to the feature/prediction audit log with `Role: 'Challenger'`, never mutating
 *    target business entity records.
 * 3. **Non-Blocking Dispatch**: Sampled invocations (`SampleRate` in `[0, 1]`) are dispatched
 *    asynchronously on a deferred event-loop tick with an in-flight concurrency cap and
 *    `MaxLatencyMs` timeout + `AbortSignal` enforcement.
 */

import { LogError, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
  MJFeatureValueEntity,
  MJMLModelEntity,
  MJRecordProcessEntity_IRecordProcessChallengerConfig,
} from '@memberjunction/core-entities';
import { FeatureValueCacheService } from '@memberjunction/feature-pipelines';
import type {
  FeatureSchemaEntry,
  FittedPreprocessing,
  PredictRequest,
  ProblemType,
} from '@memberjunction/predictive-studio-core';
import {
  ModelArtifactMissingMessage,
  ModelHasTrainedArtifact,
  ModelNeedsTrainingError,
  ModelNeedsTrainingMessage,
  ModelNotScorableError,
} from './model-readiness';
import type { MLInferenceDeps } from './types';

/**
 * Declarative shadow challenger configuration stored on `MJ: Record Processes.ChallengerConfiguration`
 * (generated as `MJRecordProcessEntity_IRecordProcessChallengerConfig` and accessed via
 * `MJRecordProcessEntity.ChallengerConfigurationObject`).
 */
export type IRecordProcessChallengerConfig = MJRecordProcessEntity_IRecordProcessChallengerConfig;

/**
 * Frozen snapshot dispatched to the shadow challenger queue/worker.
 */
export interface ShadowScoreEnvelope {
  readonly RecordProcessID?: string;
  readonly ProcessRunID?: string | null;
  readonly EntityID?: string;
  readonly EntityName?: string;
  readonly RecordID: string;
  readonly FeatureName?: string;
  readonly ChampionModelID?: string;
  readonly ChallengerConfig: IRecordProcessChallengerConfig;
  /** Exact frozen feature vector / row snapshot assembled for the champion. */
  readonly FrozenFeatures: Readonly<Record<string, unknown>>;
  readonly ChampionScore?: number;
  readonly ChampionLabel?: string;
  readonly ChampionConfidence?: number;
  readonly ChampionLatencyMs?: number;
  readonly DispatchedAt: string;
}

/**
 * Output returned by a challenger model/prompt evaluator.
 */
export interface ChallengerScoreOutput {
  readonly Score?: number;
  readonly Label?: string;
  readonly Confidence?: number;
  readonly Reasoning?: string;
}

/**
 * Audit row persisted for champion and challenger predictions (`MJ: Feature Values` / prediction audit).
 */
export interface ShadowFeatureValueAuditRecord {
  readonly RecordID: string;
  readonly EntityID?: string;
  readonly EntityName?: string;
  readonly RecordProcessID?: string;
  readonly ProcessRunID?: string | null;
  readonly FeatureName?: string;
  readonly Role: 'Champion' | 'Challenger';
  readonly ModelID?: string;
  readonly PromptID?: string;
  readonly NumericValue?: number | null;
  readonly TextValue?: string | null;
  readonly Confidence?: number | null;
  readonly Reasoning?: string | null;
  readonly LatencyMs?: number;
  readonly TimedOut?: boolean;
  readonly ErrorMessage?: string;
  readonly FrozenFeatures: Readonly<Record<string, unknown>>;
  readonly RecordedAt: string;
}

/**
 * Seam for publishing shadow scoring envelopes onto `WorkQueue` (`WorkQueueEngine.Instance.Publish(...)`).
 *
 * ponytail: `WorkQueueEngine.Instance.Publish(topic, requests)` requires a provisioned `MJ: Work Queue Topics`
 * row, transport binding, and a dedicated background worker subscription that consumes the topic and calls
 * `ShadowScoringCoordinator.ExecuteChallengerEnvelope`. Because core metadata does not seed a shadow-scoring
 * queue topic or worker daemon, `ShadowScoringCoordinator` defaults to deferred in-process execution on a
 * background tick (`ExecuteInProcessWhenPublished` defaults to `true` when no `WorkQueuePublisher` is supplied,
 * and `false` when one is supplied). Deployments with a dedicated queue consumer can inject an
 * `IShadowWorkQueuePublisher` implementation here without changing processor code.
 */
export interface IShadowWorkQueuePublisher {
  PublishShadowItem(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void>;
}

/**
 * Seam for executing the challenger model/prompt against a frozen feature snapshot.
 */
export interface IChallengerScoreRunner {
  RunChallenger(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    signal?: AbortSignal,
  ): Promise<ChallengerScoreOutput>;
}

/**
 * Seam for recording `Role: 'Champion' | 'Challenger'` rows in `MJ: Feature Values` / prediction logs
 * without ever mutating the target business entity.
 */
export interface IShadowScoreAuditSink {
  RecordShadowAudit(
    record: ShadowFeatureValueAuditRecord,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void>;
}

/**
 * Options for {@link ShadowScoringCoordinator}.
 */
export interface ShadowScoringCoordinatorOptions {
  readonly WorkQueuePublisher?: IShadowWorkQueuePublisher;
  readonly ChallengerRunner?: IChallengerScoreRunner;
  readonly AuditSink?: IShadowScoreAuditSink;
  /**
   * Whether to also run `ExecuteChallengerEnvelope` in-process after publishing to `WorkQueuePublisher`.
   * Defaults to `false` when `WorkQueuePublisher` is supplied (so the external worker is the sole consumer
   * and the challenger is never double-run), and `true` when `WorkQueuePublisher` is omitted.
   */
  readonly ExecuteInProcessWhenPublished?: boolean;
  /** Injectable RNG returning `[0, 1)` for deterministic sampling in tests. */
  readonly Rng?: () => number;
  /**
   * Maximum number of concurrent in-flight shadow tasks allowed at once. Additional sampled envelopes
   * arriving while at capacity are dropped (and counted in {@link ShadowScoringCoordinator.DroppedCount})
   * so a slow challenger can never cause unbounded memory growth. Defaults to `64`.
   */
  readonly MaxInFlight?: number;
}

/**
 * Optional per-dispatch flags for {@link ShadowScoringCoordinator.DispatchShadowScore}.
 */
export interface DispatchShadowScoreOptions {
  /**
   * Set to `true` when the caller has already verified {@link ShadowScoringCoordinator.ShouldSample}
   * before constructing the envelope, avoiding a second RNG draw.
   */
  readonly AlreadySampled?: boolean;
}

const DEFAULT_MAX_IN_FLIGHT = 64;
const DEFAULT_MAX_LATENCY_MS = 5000;

/**
 * Coordinates sampling, non-blocking `WorkQueue` publication, bounded-timeout challenger execution,
 * and `Role: 'Challenger'` audit persistence.
 */
export class ShadowScoringCoordinator {
  private readonly workQueuePublisher?: IShadowWorkQueuePublisher;
  private readonly challengerRunner?: IChallengerScoreRunner;
  private readonly auditSink?: IShadowScoreAuditSink;
  private readonly executeInProcessWhenPublished: boolean;
  private readonly rng: () => number;
  private readonly maxInFlight: number;
  private readonly inFlightTasks = new Set<Promise<void>>();
  private droppedCount = 0;

  constructor(options: ShadowScoringCoordinatorOptions = {}) {
    this.workQueuePublisher = options.WorkQueuePublisher;
    this.challengerRunner = options.ChallengerRunner;
    this.auditSink = options.AuditSink;
    this.executeInProcessWhenPublished =
      options.ExecuteInProcessWhenPublished ?? (options.WorkQueuePublisher === undefined);
    this.rng = options.Rng ?? (() => Math.random());
    this.maxInFlight =
      typeof options.MaxInFlight === 'number' && Number.isFinite(options.MaxInFlight) && options.MaxInFlight >= 1
        ? Math.floor(options.MaxInFlight)
        : DEFAULT_MAX_IN_FLIGHT;
  }

  /** Number of currently active background shadow tasks. */
  public get InFlightCount(): number {
    return this.inFlightTasks.size;
  }

  /** Number of sampled shadow envelopes dropped because `InFlightCount >= MaxInFlight`. */
  public get DroppedCount(): number {
    return this.droppedCount;
  }

  /**
   * Determine whether a live champion invocation should be mirrored to the challenger.
   * Rejects non-number `SampleRate` values (e.g. uncoerced strings) and configurations lacking
   * both `ChallengerModelID` and `ChallengerPromptID`.
   */
  public ShouldSample(config: IRecordProcessChallengerConfig | undefined | null): boolean {
    if (!config || config.Enabled !== true) {
      return false;
    }
    if (typeof config.SampleRate !== 'number' || !Number.isFinite(config.SampleRate) || config.SampleRate <= 0) {
      return false;
    }
    const hasModelTarget =
      typeof config.ChallengerModelID === 'string' && config.ChallengerModelID.trim().length > 0;
    const hasPromptTarget =
      typeof config.ChallengerPromptID === 'string' && config.ChallengerPromptID.trim().length > 0;
    if (!hasModelTarget && !hasPromptTarget) {
      return false;
    }
    if (config.SampleRate >= 1) {
      return true;
    }
    return this.rng() < config.SampleRate;
  }

  /**
   * Fire-and-forget shadow dispatch. Defers all publisher and challenger execution to a future tick
   * so synchronous work inside a runner never blocks the champion write path, and caps concurrent
   * in-flight tasks at `MaxInFlight`.
   */
  public DispatchShadowScore(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    options?: DispatchShadowScoreOptions,
  ): void {
    if (!options?.AlreadySampled && !this.ShouldSample(envelope.ChallengerConfig)) {
      return;
    }
    if (this.inFlightTasks.size >= this.maxInFlight) {
      this.droppedCount++;
      return;
    }

    const task: Promise<void> = new Promise<void>((resolve) => {
      setImmediate(resolve);
    })
      .then(() => this.executeShadowPipeline(envelope, contextUser, provider))
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        LogError(`ShadowScoringCoordinator: unhandled shadow error for record '${envelope.RecordID}': ${msg}`);
      })
      .finally(() => {
        this.inFlightTasks.delete(task);
      });

    this.inFlightTasks.add(task);
  }

  /**
   * Wait for all currently in-flight background shadow tasks to settle (used by tests and graceful shutdown).
   */
  public async FlushInFlight(): Promise<void> {
    while (this.inFlightTasks.size > 0) {
      await Promise.allSettled(Array.from(this.inFlightTasks));
    }
  }

  /**
   * Execute a single shadow envelope (called either by the WorkQueue consumer or background runner),
   * starting the `MaxLatencyMs` timer and `AbortController` BEFORE invoking the challenger runner,
   * and persisting the `Role: 'Challenger'` audit record.
   */
  public async ExecuteChallengerEnvelope(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<ShadowFeatureValueAuditRecord> {
    const startedAt = Date.now();
    const maxLatencyMs =
      typeof envelope.ChallengerConfig.MaxLatencyMs === 'number' &&
      Number.isFinite(envelope.ChallengerConfig.MaxLatencyMs) &&
      envelope.ChallengerConfig.MaxLatencyMs > 0
        ? envelope.ChallengerConfig.MaxLatencyMs
        : DEFAULT_MAX_LATENCY_MS;

    let output: ChallengerScoreOutput | undefined;
    let timedOut = false;
    let errorMessage: string | undefined;

    if (this.challengerRunner) {
      try {
        output = await this.runWithTimeout(
          (signal) =>
            this.challengerRunner!.RunChallenger(
              {
                ...envelope,
                FrozenFeatures: Object.freeze({ ...envelope.FrozenFeatures }),
              },
              contextUser,
              provider,
              signal,
            ),
          maxLatencyMs,
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.startsWith('SHADOW_TIMEOUT:')) {
          timedOut = true;
          errorMessage = msg;
        } else {
          errorMessage = msg;
        }
        LogError(
          `ShadowScoringCoordinator: challenger failed for record '${envelope.RecordID}' ` +
            `(model='${envelope.ChallengerConfig.ChallengerModelID ?? envelope.ChallengerConfig.ChallengerPromptID ?? 'unknown'}'): ${msg}`,
        );
      }
    }

    const latencyMs = Date.now() - startedAt;
    const auditRecord: ShadowFeatureValueAuditRecord = {
      RecordID: envelope.RecordID,
      EntityID: envelope.EntityID,
      EntityName: envelope.EntityName,
      RecordProcessID: envelope.RecordProcessID,
      ProcessRunID: envelope.ProcessRunID,
      FeatureName: envelope.FeatureName,
      Role: 'Challenger',
      ModelID: envelope.ChallengerConfig.ChallengerModelID,
      PromptID: envelope.ChallengerConfig.ChallengerPromptID,
      NumericValue: output?.Score ?? null,
      TextValue: output?.Label ?? null,
      Confidence: output?.Confidence ?? null,
      Reasoning: output?.Reasoning ?? null,
      LatencyMs: latencyMs,
      TimedOut: timedOut,
      ErrorMessage: errorMessage,
      FrozenFeatures: { ...envelope.FrozenFeatures },
      RecordedAt: new Date().toISOString(),
    };

    if (this.auditSink) {
      try {
        await this.auditSink.RecordShadowAudit(auditRecord, contextUser, provider);
      } catch (sinkErr: unknown) {
        const msg = sinkErr instanceof Error ? sinkErr.message : String(sinkErr);
        LogError(`ShadowScoringCoordinator: failed to persist Challenger audit row for '${envelope.RecordID}': ${msg}`);
      }
    }

    return auditRecord;
  }

  private async executeShadowPipeline(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void> {
    await this.recordChampionFeatureValue(envelope, contextUser, provider);

    if (this.workQueuePublisher) {
      try {
        await this.workQueuePublisher.PublishShadowItem(envelope, contextUser, provider);
      } catch (pubErr: unknown) {
        const msg = pubErr instanceof Error ? pubErr.message : String(pubErr);
        LogError(`ShadowScoringCoordinator: WorkQueue publish failed for '${envelope.RecordID}': ${msg}`);
      }
      if (!this.executeInProcessWhenPublished) {
        return;
      }
    }

    if (this.challengerRunner || this.auditSink) {
      await this.ExecuteChallengerEnvelope(envelope, contextUser, provider);
    }
  }

  private async recordChampionFeatureValue(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void> {
    if (
      !envelope.RecordProcessID ||
      !envelope.RecordID ||
      !contextUser ||
      (envelope.ChampionScore === undefined && envelope.ChampionLabel === undefined)
    ) {
      return;
    }
    try {
      const activeProvider = provider ?? Metadata.Provider; // global-provider-ok: fallback when caller does not supply a per-request provider
      const resolvedEntityId =
        envelope.EntityID ??
        (envelope.EntityName ? activeProvider.EntityByName?.(envelope.EntityName)?.ID : undefined);
      if (!resolvedEntityId) {
        return;
      }
      const championValue =
        envelope.ChampionScore !== undefined ? envelope.ChampionScore : (envelope.ChampionLabel ?? null);
      await FeatureValueCacheService.Instance.RecordFeatureValues({
        recordProcessID: envelope.RecordProcessID,
        entityID: resolvedEntityId,
        recordID: envelope.RecordID,
        outputs: [
          {
            featureName: envelope.FeatureName || 'Prediction',
            value: championValue,
            confidence: envelope.ChampionConfidence ?? null,
          },
        ],
        promptID: null,
        promptVersionHash: null,
        constraintHash: null,
        processRunID: envelope.ProcessRunID ?? null,
        pipelineVersion: null,
        aiModelID: envelope.ChampionModelID ?? null,
        parametersHash: null,
        inputHash: null,
        source: 'Pipeline',
        contextUser,
        provider: activeProvider,
      });
    } catch (champErr: unknown) {
      const msg = champErr instanceof Error ? champErr.message : String(champErr);
      LogError(
        `ShadowScoringCoordinator: failed to persist Champion Feature Value row for '${envelope.RecordID}': ${msg}`,
      );
    }
  }

  /**
   * Starts the timeout timer and creates the `AbortController` BEFORE invoking `fn(signal)`
   * so synchronous work or slow async work inside `fn` is bounded and receives an abort signal.
   */
  private async runWithTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
    const abortController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const timeoutErr = new Error(`SHADOW_TIMEOUT: Challenger exceeded MaxLatencyMs (${timeoutMs}ms)`);
        abortController.abort(timeoutErr);
        reject(timeoutErr);
      }, timeoutMs);
    });
    try {
      const workPromise = Promise.resolve().then(() => fn(abortController.signal));
      return await Promise.race([workPromise, timeoutPromise]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

interface LoadedChallengerModel {
  modelId: string;
  artifactB64: string;
  fittedPreprocessing: FittedPreprocessing;
  featureSchema: FeatureSchemaEntry[];
  problemType: ProblemType;
  targetVariable: string;
}

/**
 * Production {@link IChallengerScoreRunner} for `WorkType = 'ML Model'`.
 *
 * Scores the frozen feature row captured from the champion run against `ChallengerModelID`
 * through the same `MLInferenceDeps` (modelLoader, artifactLoader, sidecar `/predict`) used by
 * `MLModelInferenceProcessor`, without touching the target business entity.
 */
export class MLModelChallengerScoreRunner implements IChallengerScoreRunner {
  private readonly artifactCache = new Map<string, { artifactFileId: string; artifactB64Promise: Promise<string> }>();

  constructor(private readonly deps: MLInferenceDeps) {}

  /** @inheritdoc */
  public async RunChallenger(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    signal?: AbortSignal,
  ): Promise<ChallengerScoreOutput> {
    this.throwIfAborted(signal);
    const challengerModelId = envelope.ChallengerConfig.ChallengerModelID?.trim();
    if (!challengerModelId) {
      throw new Error('MLModelChallengerScoreRunner: ChallengerModelID is required for ML Model shadow scoring');
    }

    const activeProvider = provider ?? Metadata.Provider; // global-provider-ok: fallback when caller does not supply a per-request provider
    const loaded = await this.loadChallengerModel(challengerModelId, contextUser, activeProvider);
    this.throwIfAborted(signal);

    const featureRow = this.projectFrozenRow(envelope.FrozenFeatures, loaded.featureSchema);
    const req: PredictRequest = {
      artifact_b64: loaded.artifactB64,
      fitted_preprocessing: loaded.fittedPreprocessing,
      feature_schema: loaded.featureSchema,
      rows: [featureRow],
    };

    const response = await this.deps.sidecar.predict(req);
    this.throwIfAborted(signal);

    const prediction = response.predictions[0];
    if (!prediction) {
      throw new Error(`MLModelChallengerScoreRunner: sidecar returned no prediction for challenger model '${challengerModelId}'`);
    }

    const label = prediction.class != null ? String(prediction.class) : undefined;
    const confidence =
      loaded.problemType === 'classification' && Number.isFinite(prediction.score)
        ? Math.max(prediction.score, 1 - prediction.score)
        : undefined;

    return {
      Score: prediction.score,
      Label: label,
      Confidence: confidence,
    };
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const reason = signal.reason;
      throw reason instanceof Error
        ? reason
        : new Error(`SHADOW_TIMEOUT: Challenger aborted (${String(reason ?? 'aborted')})`);
    }
  }

  private async loadChallengerModel(
    modelId: string,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider,
  ): Promise<LoadedChallengerModel> {
    const model = await this.deps.modelLoader.loadModel(modelId, contextUser, provider);
    if (!model) {
      throw new ModelNeedsTrainingError(`MLModelChallengerScoreRunner: ML Model '${modelId}' not found`);
    }
    this.assertStatusCanScore(modelId, model);
    const artifactB64 = await this.ensureArtifactB64(modelId, model.ArtifactFileID, contextUser);
    return {
      modelId: model.ID,
      artifactB64,
      fittedPreprocessing: parseJsonOrDefault<FittedPreprocessing>(model.FittedPreprocessing, {}),
      featureSchema: parseJsonOrDefault<FeatureSchemaEntry[]>(model.FeatureSchema, []),
      problemType: (model.ProblemType as ProblemType) ?? 'classification',
      targetVariable: model.TargetVariable,
    };
  }

  private ensureArtifactB64(
    modelId: string,
    artifactFileId: string,
    contextUser: UserInfo | undefined,
  ): Promise<string> {
    const cached = this.artifactCache.get(modelId);
    if (cached && cached.artifactFileId === artifactFileId) {
      return cached.artifactB64Promise;
    }
    const artifactB64Promise = (async () => {
      const bytes = await this.deps.artifactLoader.load(artifactFileId, contextUser);
      if (!bytes) {
        throw new ModelNeedsTrainingError(
          `MLModelChallengerScoreRunner: ${ModelArtifactMissingMessage(modelId, artifactFileId)}`,
        );
      }
      return Buffer.from(bytes).toString('base64');
    })().catch((err: unknown) => {
      const current = this.artifactCache.get(modelId);
      if (current && current.artifactFileId === artifactFileId) {
        this.artifactCache.delete(modelId);
      }
      throw err;
    });
    this.artifactCache.set(modelId, { artifactFileId, artifactB64Promise });
    return artifactB64Promise;
  }

  private assertStatusCanScore(modelId: string, model: MJMLModelEntity): void {
    const status: MJMLModelEntity['Status'] = model.Status;
    switch (status) {
      case 'Draft':
        if (!ModelHasTrainedArtifact(model) || !model.ArtifactFileID) {
          throw new ModelNeedsTrainingError(`MLModelChallengerScoreRunner: ${ModelNeedsTrainingMessage(modelId)}`);
        }
        throw new ModelNotScorableError(modelId, status);
      case 'Validated':
      case 'Published':
        if (!ModelHasTrainedArtifact(model) || !model.ArtifactFileID) {
          throw new ModelNeedsTrainingError(`MLModelChallengerScoreRunner: ${ModelNeedsTrainingMessage(modelId)}`);
        }
        return;
      default:
        throw new ModelNotScorableError(modelId, status);
    }
  }

  private projectFrozenRow(
    frozenFeatures: Readonly<Record<string, unknown>>,
    featureSchema: FeatureSchemaEntry[],
  ): Record<string, string | number | boolean | null> {
    const row: Record<string, string | number | boolean | null> = {};
    if (featureSchema.length > 0) {
      for (const entry of featureSchema) {
        row[entry.Name] = coerceFeaturePrimitive(frozenFeatures[entry.Name]);
      }
      return row;
    }
    for (const [key, val] of Object.entries(frozenFeatures)) {
      row[key] = coerceFeaturePrimitive(val);
    }
    return row;
  }
}

/**
 * Production {@link IShadowScoreAuditSink} that writes `MJ: Feature Values` rows with
 * `Role = 'Challenger'`.
 *
 * ## Why `ValueKeyHash` is `null` on Challenger rows
 * `__mj.FeatureValue` has a filtered unique index `UQ_FeatureValue_ValueKey` on
 * `(RecordProcessID, ValueKeyHash) WHERE ValueKeyHash IS NOT NULL` that deduplicates
 * production champion values by `(EntityID, RecordID, FeatureName, Value*)`. If a challenger
 * computed the same prediction value as the champion and wrote a non-null `ValueKeyHash`,
 * saving the challenger row would collide with `UQ_FeatureValue_ValueKey`. Leaving
 * `ValueKeyHash = null` on `Role = 'Challenger'` rows guarantees challenger audit records
 * can never collide with or replace a champion row while keeping full lineage (`RecordProcessID`,
 * `EntityID`, `RecordID`, `FeatureName`, `ProcessRunID`, `AIModelID`, `PromptID`).
 */
export class FeatureValueShadowAuditSink implements IShadowScoreAuditSink {
  /** @inheritdoc */
  public async RecordShadowAudit(
    record: ShadowFeatureValueAuditRecord,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void> {
    const activeProvider = provider ?? Metadata.Provider; // global-provider-ok: fallback when caller does not supply a per-request provider
    const resolvedEntityId =
      record.EntityID ??
      (record.EntityName ? activeProvider.EntityByName(record.EntityName)?.ID : undefined);
    if (!resolvedEntityId) {
      LogError(
        `FeatureValueShadowAuditSink: cannot persist Challenger row for record '${record.RecordID}' without EntityID or resolvable EntityName`,
      );
      return;
    }

    const fv = await activeProvider.GetEntityObject<MJFeatureValueEntity>('MJ: Feature Values', contextUser);
    fv.NewRecord();
    fv.EntityID = resolvedEntityId;
    fv.RecordID = record.RecordID;
    fv.FeatureName = record.FeatureName && record.FeatureName.trim().length > 0 ? record.FeatureName : 'Prediction';
    fv.Role = 'Challenger';
    fv.Source = 'Pipeline';
    fv.ValueKeyHash = null;
    fv.RecordProcessID = record.RecordProcessID ?? null;
    fv.ProcessRunID = record.ProcessRunID ?? null;
    fv.AIModelID = record.ModelID ?? null;
    fv.PromptID = record.PromptID ?? null;
    fv.ValueNumeric = record.NumericValue ?? null;
    fv.ValueText = record.TextValue ?? null;
    fv.Confidence = record.Confidence ?? null;
    fv.Reasoning = record.ErrorMessage
      ? record.TimedOut
        ? `SHADOW_TIMEOUT: ${record.ErrorMessage}`
        : `SHADOW_ERROR: ${record.ErrorMessage}`
      : (record.Reasoning ?? null);
    fv.ComputedAt = record.RecordedAt ? new Date(record.RecordedAt) : new Date();

    const saved = await fv.Save();
    if (!saved) {
      LogError(
        `FeatureValueShadowAuditSink: failed to save Challenger FeatureValue row for record '${record.RecordID}': ${fv.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
    }
  }
}

function parseJsonOrDefault<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function coerceFeaturePrimitive(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}
