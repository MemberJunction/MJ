/**
 * @module training/seams
 *
 * Production implementations of the {@link TrainingDeps} seams — thin adapters
 * over `Metadata.GetEntityObject`, `RunView`, and the Python sidecar
 * ({@link MLSidecar} from `@memberjunction/predictive-studio-sidecar`). These are
 * the only place the engine touches MJ's live data/inference plumbing; the
 * orchestrator itself depends solely on the narrow interfaces, so unit tests
 * substitute in-memory fakes and never need a DB or sidecar.
 */

import {
  RunView,
  type BaseEntity,
  type UserInfo,
  type IMetadataProvider,
} from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type {
  TrainRequest,
  TrainResponse,
  MatrixData,
  TrainerRequest,
  TrainerResult,
} from '@memberjunction/predictive-studio-core';
import { MLSidecar, SidecarError } from '@memberjunction/predictive-studio-sidecar';
import { MLSidecarProvider } from '../sidecar-provider';
import type { IEntityFactory, IRecordLoader, ISidecarTrainer, ITrainerEvaluator } from './types';

/**
 * Provider-bound {@link IEntityFactory}: every entity is created through the
 * caller's provider, never the global `Metadata` default.
 */
export class MetadataEntityFactory implements IEntityFactory {
  /**
   * @param provider the provider entities are created on (it and its `CurrentUser`
   *   are honored so multi-provider callers create entities on the RIGHT server)
   */
  constructor(private readonly provider: IMetadataProvider) {}

  /** @inheritdoc */
  public async getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
    return this.provider.GetEntityObject<T>(entityName, contextUser || this.provider.CurrentUser);
  }
}

/**
 * `RunView`-backed {@link IRecordLoader}; every read runs on the caller's provider. Loads the pipeline as a full
 * `entity_object` (it is read, not mutated) and computes the next version from a
 * narrow `simple` projection over `MJ: ML Models`.
 */
export class RunViewRecordLoader implements IRecordLoader {
  /** @inheritdoc */
  public async loadPipeline(
    pipelineId: string,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<MJMLTrainingPipelineEntity | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJMLTrainingPipelineEntity>(
      {
        EntityName: 'MJ: ML Training Pipelines',
        ExtraFilter: `ID='${pipelineId}'`,
        ResultType: 'entity_object',
        MaxRows: 1,
      },
      contextUser,
    );
    if (!result.Success || result.Results.length === 0) {
      return null;
    }
    return result.Results[0];
  }

  /** @inheritdoc */
  public async nextModelVersion(
    pipelineId: string,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<number> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<{ Version: number }>(
      {
        EntityName: 'MJ: ML Models',
        ExtraFilter: `PipelineID='${pipelineId}'`,
        Fields: ['Version'],
        OrderBy: 'Version DESC',
        MaxRows: 1,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success || result.Results.length === 0) {
      return 1;
    }
    return (result.Results[0].Version ?? 0) + 1;
  }

  /** @inheritdoc */
  public async resolveAlgorithmDriverKey(
    algorithmId: string,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<string | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<{ DriverClass: string }>(
      {
        EntityName: 'MJ: ML Algorithms',
        ExtraFilter: `ID='${algorithmId}'`,
        Fields: ['DriverClass'],
        MaxRows: 1,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success || result.Results.length === 0) {
      return null;
    }
    return result.Results[0].DriverClass ?? null;
  }
}

/**
 * {@link ISidecarTrainer} and {@link ITrainerEvaluator} backed by the self-managing {@link MLSidecar} client.
 * Lazily starts the sidecar on first use (managed or remote mode is decided by
 * `MLSidecar` from options/env). Defaults to the process-shared
 * {@link MLSidecarProvider} instance rather than constructing a private `MLSidecar`
 * — see that class's doc comment for why a per-instance sidecar leaked a Python
 * child process per action run. Tests (and callers that genuinely need an isolated
 * sidecar) can still inject their own via the constructor parameter.
 */
export class MJSidecarTrainer implements ISidecarTrainer, ITrainerEvaluator {
  private started = false;

  /**
   * @param sidecar an `MLSidecar` instance (managed or remote); defaults to the
   *   shared, process-lifetime instance from {@link MLSidecarProvider}
   */
  constructor(private readonly sidecar: MLSidecar = MLSidecarProvider.Instance.GetSidecar()) {}

  /** @inheritdoc */
  public async train(req: TrainRequest, lockedHoldout?: MatrixData): Promise<TrainResponse> {
    await this.ensureStarted();
    // Forward the orchestrator-carved **locked holdout** (plan §8.2) on the shared
    // `TrainRequest.holdout` channel. The sidecar fits preprocessing on the
    // training `data` only, then APPLIES that frozen fitted transform to these
    // holdout rows and scores them exactly once → `holdout_metrics` (the anti-skew
    // guarantee, plan §6.2 — holdout preprocessing is never re-fit). `req.data`
    // already excludes the holdout, so the carve stays deterministic + auditable
    // on the TypeScript side. When no holdout was carved (e.g. tiny datasets) we
    // simply omit it and the sidecar returns no `holdout_metrics`.
    const withHoldout: TrainRequest =
      lockedHoldout && lockedHoldout.rows.length > 0 ? { ...req, holdout: lockedHoldout } : req;
    return this.sidecar.Train(withHoldout);
  }

  /**
   * Run one protocol-driven training with bounded retries: a transport failure or a 5xx answer is retried up to
   * `req.maxRetries` times; a 4xx refusal is not retried (the request itself is wrong) and is rethrown. When every
   * attempt fails the result is `failed` at stage `timeout` naming the last error, never partial metrics.
   */
  public async RunTrainer(req: TrainerRequest): Promise<TrainerResult> {
    await this.ensureStarted();
    let lastError = '';
    for (let attempt = 0; attempt <= req.maxRetries; attempt++) {
      try {
        return await this.sidecar.RunTrainer(req);
      } catch (err) {
        if (err instanceof SidecarError && err.Status >= 400 && err.Status < 500) throw err;
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    return {
      status: 'failed',
      trainingRunId: req.trainingRunId,
      stage: 'timeout',
      message: `sidecar gave no result after ${req.maxRetries + 1} attempt(s): ${lastError}`,
      computeSeconds: 0,
    };
  }

  /** Start the sidecar once per trainer; later calls reuse the connection. */
  private async ensureStarted(): Promise<void> {
    if (!this.started) {
      await this.sidecar.Start();
      this.started = true;
    }
  }
}
