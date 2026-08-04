/**
 * @module maintenance/seams
 *
 * Production implementations of the {@link MaintenanceDeps} seams — thin adapters
 * over `RunView` (binding/model loads + row counts) and the scoring action's
 * {@link ProductionScoreRecordSetRunner} (re-scoring), plus the DEFAULT honest
 * drift detector. These are the only place the MaintenanceEngine touches MJ's live
 * data/inference plumbing; the engine itself depends solely on the narrow
 * interfaces, so unit tests substitute in-memory fakes and never need a DB or
 * sidecar.
 */

import { RunView, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import type {
  MJMLModelEntity,
  MJMLModelScoringBindingEntity,
} from '@memberjunction/core-entities';

import { ProductionScoreRecordSetRunner } from '../actions/score-record-set.runner';
import type { MLInferenceDeps } from '../scoring/types';
import type {
  IMaintenanceLoader,
  IRowCounter,
  IRescoreRunner,
  IDriftDetector,
  RescoreRequest,
  RescoreResult,
  DriftContext,
  DriftResult,
  MaintenanceBindingMode,
} from './types';

/**
 * `RunView`-backed {@link IMaintenanceLoader}. Loads bindings + models as full
 * `entity_object`s — the binding IS mutated (its monitoring fields are stamped
 * after a re-score), so it must be a real entity object.
 */
export class RunViewMaintenanceLoader implements IMaintenanceLoader {
  /** @inheritdoc */
  public async loadBinding(
    bindingId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLModelScoringBindingEntity | null> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<MJMLModelScoringBindingEntity>(
      {
        EntityName: 'MJ: ML Model Scoring Bindings',
        ExtraFilter: `ID='${bindingId}'`,
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
  public async loadBindings(
    mode?: MaintenanceBindingMode,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLModelScoringBindingEntity[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<MJMLModelScoringBindingEntity>(
      {
        EntityName: 'MJ: ML Model Scoring Bindings',
        ExtraFilter: mode ? `Mode='${mode}'` : undefined,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!result.Success) {
      return [];
    }
    return result.Results;
  }

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
 * `RunView`-backed {@link IRowCounter}. Uses the `count_only` result type so the
 * full population size lands in `TotalRowCount` WITHOUT materializing any rows —
 * the efficient way to get a current count for the data-volume / drift triggers.
 */
export class RunViewRowCounter implements IRowCounter {
  /** @inheritdoc */
  public async countRows(
    entityName: string,
    extraFilter?: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<number> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView(
      {
        EntityName: entityName,
        ExtraFilter: extraFilter,
        // count_only returns no rows but populates TotalRowCount (runView.ts).
        ResultType: 'count_only',
      },
      contextUser,
    );
    if (!result.Success) {
      throw new Error(`RunViewRowCounter: failed to count '${entityName}': ${result.ErrorMessage}`);
    }
    return result.TotalRowCount ?? result.Results.length;
  }
}

/**
 * {@link IRescoreRunner} backed by the scoring action's
 * {@link ProductionScoreRecordSetRunner}. Re-scores a binding's full population via
 * a `filter` scope over the target entity, reusing the SAME inference path
 * (transform-only assembly → sidecar `/predict`) as on-demand scoring.
 *
 * The artifact-loader half of `MLInferenceDeps` must be supplied by the higher
 * layer that owns the MJStorage binding (the Engine package does not import
 * MJStorage drivers — see `scoring/seams.ts`). Pass `deps` when constructing.
 */
export class ProductionRescoreRunner implements IRescoreRunner {
  private readonly runner: ProductionScoreRecordSetRunner;

  /**
   * @param deps optional scoring deps bundle (model loader / artifact loader /
   *   sidecar). When omitted the underlying runner builds production model-loader +
   *   sidecar, but a real artifact loader must be wired in for production scoring.
   * @param primaryKeyField primary-key field on scored entities (defaults to `ID`)
   */
  constructor(deps?: MLInferenceDeps, primaryKeyField?: string) {
    this.runner = new ProductionScoreRecordSetRunner({ deps, primaryKeyField });
  }

  /** @inheritdoc */
  public async rescore(request: RescoreRequest): Promise<RescoreResult> {
    const result = await this.runner.run({
      modelId: request.modelId,
      scope: {
        filter: {
          entityName: request.targetEntityName,
          extraFilter: request.extraFilter,
          maxRows: request.maxRows,
        },
      },
      contextUser: request.contextUser,
      provider: request.provider,
    });
    return { scoredCount: result.scoredCount, failedCount: result.failedCount };
  }
}

/**
 * The DEFAULT, intentionally-simple-and-honest {@link IDriftDetector} (plan §12 /
 * §16 [O]). It does NOT pretend to run a real distributional test. Instead it uses
 * an observable proxy: how much the population the model is being scored against
 * has grown relative to the training population. When the scored/trained row-count
 * ratio exceeds a configurable threshold, it reports "drift" — a transparent stand
 * -in that flags "the world the model sees has materially changed in size".
 *
 * A genuine statistical method (population-stability index / KS over the score
 * distribution) is a flagged follow-up — inject a real detector implementing the
 * same {@link IDriftDetector} contract when it lands.
 */
export class RowCountProxyDriftDetector implements IDriftDetector {
  /**
   * @param growthRatioThreshold the scored-vs-trained row-count growth ratio above
   *   which drift is reported (default `0.5` = "population is ≥50% bigger than the
   *   model was trained on"). This deliberately mirrors — but is independent of —
   *   the data-volume staleness trigger, so a deployment can run drift OR data
   *   -volume (or both) at different thresholds.
   */
  constructor(private readonly growthRatioThreshold = 0.5) {}

  /** @inheritdoc */
  public detectDrift(context: DriftContext): DriftResult {
    const trained = context.trainedRowCount;
    const observed = context.currentRowCount ?? context.lastScoredRowCount;
    if (trained == null || trained <= 0 || observed == null) {
      return {
        drifted: false,
        detail: 'Not enough row-count history to assess drift; treating as no drift (default proxy detector).',
      };
    }
    const growth = (observed - trained) / trained;
    const drifted = growth > this.growthRatioThreshold;
    return {
      drifted,
      score: growth,
      detail: drifted
        ? `The scored population is ${(growth * 100).toFixed(0)}% larger than the training population ` +
          `(${trained} → ${observed} rows), past the ${(this.growthRatioThreshold * 100).toFixed(0)}% drift proxy threshold. ` +
          `This is a coarse size-based proxy, not a true distribution test — a human should confirm.`
        : `The scored population (${observed} rows) is within the drift proxy threshold of the training population (${trained} rows).`,
    };
  }
}
