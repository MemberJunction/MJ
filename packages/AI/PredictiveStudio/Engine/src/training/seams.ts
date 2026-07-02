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
  Metadata,
  RunView,
  type BaseEntity,
  type UserInfo,
  type IMetadataProvider,
} from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { TrainRequest, TrainResponse, MatrixData } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import type { IEntityFactory, IRecordLoader, ISidecarTrainer } from './types';

/**
 * `Metadata.GetEntityObject`-backed {@link IEntityFactory}. Optionally bound to a
 * specific provider for multi-provider correctness.
 */
export class MetadataEntityFactory implements IEntityFactory {
  /**
   * @param provider optional provider; when supplied it (and its `CurrentUser`)
   *   is honored so multi-provider callers create entities on the RIGHT server.
   *   When omitted the global default `Metadata` provider is used.
   */
  constructor(private readonly provider?: IMetadataProvider) {}

  /** @inheritdoc */
  public async getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
    if (this.provider) {
      return this.provider.GetEntityObject<T>(entityName, contextUser ?? this.provider.CurrentUser);
    }
    const md = this.provider ?? new Metadata();
    return md.GetEntityObject<T>(entityName, contextUser);
  }
}

/**
 * `RunView`-backed {@link IRecordLoader}. Loads the pipeline as a full
 * `entity_object` (it is read, not mutated) and computes the next version from a
 * narrow `simple` projection over `MJ: ML Models`.
 */
export class RunViewRecordLoader implements IRecordLoader {
  /** @inheritdoc */
  public async loadPipeline(
    pipelineId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLTrainingPipelineEntity | null> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
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
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<number> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
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
}

/**
 * {@link ISidecarTrainer} backed by the self-managing {@link MLSidecar} client.
 * Lazily starts the sidecar on first use (managed or remote mode is decided by
 * `MLSidecar` from options/env).
 */
export class MJSidecarTrainer implements ISidecarTrainer {
  private started = false;

  /**
   * @param sidecar an `MLSidecar` instance (managed or remote)
   */
  constructor(private readonly sidecar: MLSidecar = new MLSidecar()) {}

  /** @inheritdoc */
  public async train(req: TrainRequest, lockedHoldout?: MatrixData): Promise<TrainResponse> {
    if (!this.started) {
      await this.sidecar.start();
      this.started = true;
    }
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
    return this.sidecar.train(withHoldout);
  }
}
