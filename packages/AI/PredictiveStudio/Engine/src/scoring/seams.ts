/**
 * @module scoring/seams
 *
 * Production implementations of the {@link MLInferenceDeps} seams — thin adapters
 * over `RunView`, `MJ: Files`, and the Python sidecar ({@link MLSidecar} from
 * `@memberjunction/predictive-studio-sidecar`). These are the only place the
 * scorer touches MJ's live data/inference plumbing; the processor itself depends
 * solely on the narrow interfaces, so unit tests substitute in-memory fakes and
 * never need a DB or sidecar.
 */

import { RunView, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJMLModelEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';
import { MLSidecarProvider } from '../sidecar-provider';

import type { IMLModelLoader, IPipelineUnitLookup, ISidecarPredictor, ITrainingRowsLookup } from './types';
import { TrainingKeys } from './training-keys';

/**
 * `RunView`-backed {@link IMLModelLoader}. Loads the model as a full
 * `entity_object` (it is read for its frozen contract, not mutated) and returns
 * `null` when not found.
 */
export class RunViewMLModelLoader implements IMLModelLoader {
  /** @inheritdoc */
  public async loadModel(
    modelId: string,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider,
  ): Promise<MJMLModelEntity | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJMLModelEntity>(
      {
        EntityName: 'MJ: ML Models',
        ExtraFilter: `ID='${modelId}'`,
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
}

/**
 * `RunView`-backed {@link IPipelineUnitLookup}: one narrow read of the pipeline's `PredictionUnitID`. A failed read and
 * a read that finds no row both throw: a pipeline that cannot be read is not a pipeline without a unit.
 */
export class RunViewPipelineUnitLookup implements IPipelineUnitLookup {
  /** @inheritdoc */
  public async PredictionUnitIDOf(pipelineId: string, contextUser: UserInfo | undefined, provider: IMetadataProvider): Promise<string | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<Pick<MJMLTrainingPipelineEntity, 'ID' | 'PredictionUnitID'>>(
      { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(pipelineId)}'`, Fields: ['ID', 'PredictionUnitID'], MaxRows: 1 },
      contextUser,
    );
    if (!result.Success) throw new Error(`Reading ML Training Pipeline ${pipelineId} failed: ${result.ErrorMessage || 'unknown error'}`);
    const row = result.Results[0];
    if (!row) throw new Error(`ML Training Pipeline ${pipelineId} was not found or not readable, so whether its models belong to a Prediction Unit is unknown`);
    return row.PredictionUnitID || null;
  }
}

/**
 * {@link ITrainingRowsLookup} over the model's Training Snapshot: the development row ids of its verified row manifest
 * ({@link TrainingKeys.LoadTrainingRowIds}). A failed read throws naming the model.
 */
export class RunViewTrainingRowsLookup implements ITrainingRowsLookup {
  /** @inheritdoc */
  public async TrainingRowIdsOf(modelId: string, contextUser: UserInfo | undefined, provider: IMetadataProvider): Promise<ReadonlySet<string>> {
    return TrainingKeys.LoadTrainingRowIds(modelId, provider, contextUser);
  }
}

/**
 * {@link ISidecarPredictor} backed by the self-managing {@link MLSidecar} client.
 * Lazily starts the sidecar on first use (managed or remote mode is decided by
 * `MLSidecar` from options/env), then warm-caches the connection for the run.
 * Defaults to the process-shared {@link MLSidecarProvider} instance rather than
 * constructing a private `MLSidecar` — see that class's doc comment for why a
 * per-instance sidecar leaked a Python child process per action run. Tests (and
 * callers that genuinely need an isolated sidecar) can still inject their own via
 * the constructor parameter.
 */
export class MJSidecarPredictor implements ISidecarPredictor {
  private started = false;

  /**
   * @param sidecar an `MLSidecar` instance (managed or remote); defaults to the
   *   shared, process-lifetime instance from {@link MLSidecarProvider}
   */
  constructor(private readonly sidecar: MLSidecar = MLSidecarProvider.Instance.GetSidecar()) {}

  /** @inheritdoc */
  public async predict(req: PredictRequest): Promise<PredictResponse> {
    if (!this.started) {
      await this.sidecar.Start();
      this.started = true;
    }
    return this.sidecar.Predict(req);
  }
}

// NOTE on `IArtifactLoader`:
//
// The read-side artifact loader is the counterpart to the training
// `MJFilesArtifactStore.save`. Like the training store, the byte transfer to
// MJStorage is wired by the layer that owns the storage binding (provider id +
// MJStorage driver). The Engine package deliberately does NOT import MJStorage
// drivers (keeping it slim + trivially mockable), so the production
// `IArtifactLoader` is supplied by that higher layer (or by the sidecar's own
// warm artifact cache keyed by model id). Tests inject an in-memory loader; see
// `./artifact-loader` for the in-memory implementation.
