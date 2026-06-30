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
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import { MLSidecar } from '@memberjunction/predictive-studio-sidecar';

import type { IMLModelLoader, ISidecarPredictor } from './types';

/**
 * `RunView`-backed {@link IMLModelLoader}. Loads the model as a full
 * `entity_object` (it is read for its frozen contract, not mutated) and returns
 * `null` when not found.
 */
export class RunViewMLModelLoader implements IMLModelLoader {
  /** @inheritdoc */
  public async loadModel(
    modelId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLModelEntity | null> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
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
 * {@link ISidecarPredictor} backed by the self-managing {@link MLSidecar} client.
 * Lazily starts the sidecar on first use (managed or remote mode is decided by
 * `MLSidecar` from options/env), then warm-caches the connection for the run.
 */
export class MJSidecarPredictor implements ISidecarPredictor {
  private started = false;

  /**
   * @param sidecar an `MLSidecar` instance (managed or remote)
   */
  constructor(private readonly sidecar: MLSidecar = new MLSidecar()) {}

  /** @inheritdoc */
  public async predict(req: PredictRequest): Promise<PredictResponse> {
    if (!this.started) {
      await this.sidecar.start();
      this.started = true;
    }
    return this.sidecar.predict(req);
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
