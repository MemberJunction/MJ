/**
 * @module scoring/shadow-scoring
 *
 * Online Shadow Scoring (`WS-4.4`) for `MJ: Record Processes` (`'ML Model'` and `'Infer'` work types).
 *
 * Guarantees:
 * 1. **Champion Isolation**: Champion executes synchronously/normally and writes authoritative target
 *    entity fields + champion audit rows (`Role: 'Champion'`). Challenger errors or timeouts
 *    (`MaxLatencyMs`) NEVER fail or delay the champion execution.
 * 2. **Zero Business-Entity Mutation**: Challenger runs against the exact same frozen feature snapshot
 *    and writes only to the feature/prediction audit log with `Role: 'Challenger'`, never mutating
 *    target business entity records.
 * 3. **Non-Blocking Dispatch**: Sampled invocations (`SampleRate` in `[0, 1]`) are dispatched
 *    asynchronously via `IShadowWorkQueuePublisher` (or executed in a bounded background task with
 *    `MaxLatencyMs` timeout enforcement).
 */

import { LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';

/**
 * Declarative shadow challenger configuration stored on `MJ: Record Processes`
 * (`ChallengerConfiguration` / `Configuration.challengerConfiguration`).
 */
export interface IRecordProcessChallengerConfig {
  readonly Enabled: boolean;
  /** Fraction of live invocations (0.0 to 1.0) mirrored to the challenger. */
  readonly SampleRate: number;
  readonly WorkType: MJRecordProcessEntity['WorkType'];
  readonly ChallengerModelID?: string;
  readonly ChallengerPromptID?: string;
  readonly ChallengerEndpointConfig?: Readonly<Record<string, string | number | boolean>>;
  /** Timeout budget in ms; never blocks champion write path. */
  readonly MaxLatencyMs: number;
}

/**
 * Frozen snapshot dispatched to the shadow challenger queue/worker.
 */
export interface ShadowScoreEnvelope {
  readonly RecordProcessID?: string;
  readonly EntityID?: string;
  readonly EntityName?: string;
  readonly RecordID: string;
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
  readonly Role: 'Champion' | 'Challenger';
  readonly ModelID?: string;
  readonly PromptID?: string;
  readonly NumericValue?: number | null;
  readonly TextValue?: string | null;
  readonly Confidence?: number | null;
  readonly LatencyMs?: number;
  readonly TimedOut?: boolean;
  readonly ErrorMessage?: string;
  readonly FrozenFeatures: Readonly<Record<string, unknown>>;
  readonly RecordedAt: string;
}

/**
 * Seam for publishing shadow scoring envelopes onto `WorkQueue` (`WorkQueueEngine.Instance.Publish(...)`).
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
  readonly workQueuePublisher?: IShadowWorkQueuePublisher;
  readonly challengerRunner?: IChallengerScoreRunner;
  readonly auditSink?: IShadowScoreAuditSink;
  /**
   * Whether to also run `ExecuteChallengerEnvelope` in-process after publishing to `workQueuePublisher`.
   * Defaults to `true` when `challengerRunner` or `auditSink` is supplied without an external consumer;
   * set to `false` when a dedicated `WorkQueue` worker calls `ExecuteChallengerEnvelope`.
   */
  readonly executeInProcessWhenPublished?: boolean;
  /** Injectable RNG returning `[0, 1)` for deterministic sampling in tests. */
  readonly rng?: () => number;
}

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
  private readonly inFlightTasks = new Set<Promise<void>>();

  constructor(options: ShadowScoringCoordinatorOptions = {}) {
    this.workQueuePublisher = options.workQueuePublisher;
    this.challengerRunner = options.challengerRunner;
    this.auditSink = options.auditSink;
    this.executeInProcessWhenPublished = options.executeInProcessWhenPublished ?? true;
    this.rng = options.rng ?? (() => Math.random());
  }

  /**
   * Determine whether a live champion invocation should be mirrored to the challenger.
   */
  public ShouldSample(config: IRecordProcessChallengerConfig | undefined): boolean {
    if (!config || !config.Enabled) {
      return false;
    }
    if (!Number.isFinite(config.SampleRate) || config.SampleRate <= 0) {
      return false;
    }
    if (config.SampleRate >= 1) {
      return true;
    }
    return this.rng() < config.SampleRate;
  }

  /**
   * Fire-and-forget shadow dispatch. Never throws and never blocks the champion write path.
   */
  public DispatchShadowScore(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): void {
    if (!this.ShouldSample(envelope.ChallengerConfig)) {
      return;
    }
    const task = this.executeShadowPipeline(envelope, contextUser, provider)
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
    await Promise.allSettled(Array.from(this.inFlightTasks));
  }

  /**
   * Execute a single shadow envelope (called either by the WorkQueue consumer or background runner),
   * enforcing `MaxLatencyMs` and persisting the `Role: 'Challenger'` audit record.
   */
  public async ExecuteChallengerEnvelope(
    envelope: ShadowScoreEnvelope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<ShadowFeatureValueAuditRecord> {
    const startedAt = Date.now();
    const maxLatencyMs =
      Number.isFinite(envelope.ChallengerConfig.MaxLatencyMs) && envelope.ChallengerConfig.MaxLatencyMs > 0
        ? envelope.ChallengerConfig.MaxLatencyMs
        : 5000;

    let output: ChallengerScoreOutput | undefined;
    let timedOut = false;
    let errorMessage: string | undefined;

    if (this.challengerRunner) {
      try {
        output = await this.runWithTimeout(
          this.challengerRunner.RunChallenger(
            {
              ...envelope,
              FrozenFeatures: Object.freeze({ ...envelope.FrozenFeatures }),
            },
            contextUser,
            provider,
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
      Role: 'Challenger',
      ModelID: envelope.ChallengerConfig.ChallengerModelID,
      PromptID: envelope.ChallengerConfig.ChallengerPromptID,
      NumericValue: output?.Score ?? null,
      TextValue: output?.Label ?? null,
      Confidence: output?.Confidence ?? null,
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

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`SHADOW_TIMEOUT: Challenger exceeded MaxLatencyMs (${timeoutMs}ms)`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
