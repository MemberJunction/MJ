/**
 * @module training/trainer-incumbent
 *
 * The incumbent a training run is compared with (D4-93). The trainer request's `incumbent` slot (`TrainerRequest`,
 * `Core/src/trainer-contract.ts:72`) carries the pipeline's Published model and a download of its stored artifact, and
 * the sidecar stores the paired comparison as the run's `incumbentDiff`, which `PublishRules.ReverifyPublish` needs to
 * publish a pipeline's second model. The incumbent is resolved with the reads the lifecycle gate uses: the pipeline's
 * Published model row, its registered delivery checked against `RegistrySchemas`, and its artifact loaded and verified
 * through `ArtifactRegistry`; a status read alone never makes a model the incumbent.
 */
import { LogError, RunView } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { JsonParse, RegistrySchemas, type ArtifactLoad, type EvaluationProtocolSpec } from '@memberjunction/predictive-studio-core';

import { ArtifactRegistry } from '../registry/artifact-registry';
import type { RegistryContext } from '../registry/registry-context';
import type { IArtifactLoader } from '../scoring/types';

/** A verified incumbent: the model and the stored artifact file the trainer request downloads. */
export interface TrainerIncumbent {
  readonly ModelID: string;
  /** The `MJ: Files` row of the stored artifact (the request's download is issued for it). */
  readonly FileID: string;
  /** The verified SHA-256 of the stored bytes (the sidecar checks the download against it). */
  readonly Sha256: string;
}

/** What the protocol's incumbent rule resolved to. */
export type IncumbentResolution =
  /** The protocol's `promotion.incumbent` is `none`: the run is not compared with a published model. */
  | { readonly Kind: 'not-compared' }
  /** `current-published`, and the pipeline has no Published model (its first model). */
  | { readonly Kind: 'no-published-model' }
  /** `current-published`, but the Published model cannot be the incumbent; `Reason` says why. */
  | { readonly Kind: 'not-verifiable'; readonly ModelID: string | null; readonly Reason: string }
  | { readonly Kind: 'resolved'; readonly Incumbent: TrainerIncumbent };

/** The published-model columns the resolution reads. */
type IncumbentColumns = Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256' | 'Delivery'>;

/** Resolving a training run's incumbent. */
export class TrainerIncumbents {
  /**
   * The incumbent `protocol`'s rule names for `pipelineId`. Each rule the protocol can declare is handled:
   * `none` → `not-compared`; `current-published` → the pipeline's one Published model when it has a registered
   * delivery and its artifact verifies now, else `no-published-model` or `not-verifiable` with the reason.
   *
   * @throws Error when a read fails
   */
  public static async Resolve(pipelineId: string, protocol: Pick<EvaluationProtocolSpec, 'promotion'>, ctx: RegistryContext, loader: IArtifactLoader): Promise<IncumbentResolution> {
    const rule = protocol.promotion.incumbent;
    switch (rule) {
      case 'none':
        return { Kind: 'not-compared' };
      case 'current-published':
        return TrainerIncumbents.resolvePublished(pipelineId, ctx, loader);
      default: {
        const unknown: never = rule;
        throw new Error(`Predictive Studio training: the protocol's incumbent rule '${String(unknown)}' is not one the trainer can resolve`);
      }
    }
  }

  /**
   * The incumbent the request sends: the resolved one, else null. A Published model that cannot be the incumbent is
   * logged with its reason and the request sends null rather than refusing the training: a pipeline whose published
   * artifact is broken is exactly one that needs a new model (§5.7 R7 (c)), and its publish is then refused
   * `incumbent-diff-missing` by the gate, which records why.
   */
  public static IncumbentOf(resolution: IncumbentResolution, trainingRunId: string): TrainerIncumbent | null {
    if (resolution.Kind === 'resolved') return resolution.Incumbent;
    if (resolution.Kind === 'not-verifiable') {
      LogError(`Predictive Studio training: run ${trainingRunId} is trained without an incumbent: Published ML Model ${resolution.ModelID || '(unknown)'} cannot be one: ${resolution.Reason}`);
    }
    return null;
  }

  /** The pipeline's one Published model, verified as the gate verifies it. */
  private static async resolvePublished(pipelineId: string, ctx: RegistryContext, loader: IArtifactLoader): Promise<IncumbentResolution> {
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<IncumbentColumns>(
      {
        EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID='${EscapeSQLString(pipelineId)}' AND Status='Published'`,
        Fields: ['ID', 'ArtifactFileID', 'ArtifactSha256', 'Delivery'], ResultType: 'simple',
      },
      ctx.ContextUser,
    );
    if (!r.Success) throw new Error(`Reading the Published model of pipeline ${pipelineId} failed: ${r.ErrorMessage || 'unknown error'}`);
    if (r.Results.length === 0) return { Kind: 'no-published-model' };
    if (r.Results.length > 1) return { Kind: 'not-verifiable', ModelID: null, Reason: `the pipeline has ${r.Results.length} Published models (the registry job remediates this)` };
    return TrainerIncumbents.verified(r.Results[0], ctx, loader);
  }

  /** The model as an incumbent when its delivery is registered and its artifact verifies now. */
  private static async verified(model: IncumbentColumns, ctx: RegistryContext, loader: IArtifactLoader): Promise<IncumbentResolution> {
    if (!TrainerIncumbents.hasRegisteredDelivery(model.Delivery)) {
      return { Kind: 'not-verifiable', ModelID: model.ID, Reason: 'it has no registered delivery (a pre-change model)' };
    }
    if (!model.ArtifactFileID) return { Kind: 'not-verifiable', ModelID: model.ID, Reason: 'it has no artifact file' };
    let load: ArtifactLoad;
    try {
      load = await ArtifactRegistry.ForContext(ctx, loader).Load(model, ctx);
    } catch (error) {
      return { Kind: 'not-verifiable', ModelID: model.ID, Reason: `its artifact could not be read: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (load.Status !== 'verified') return { Kind: 'not-verifiable', ModelID: model.ID, Reason: `its artifact is ${load.Status}` };
    return { Kind: 'resolved', Incumbent: { ModelID: model.ID, FileID: model.ArtifactFileID, Sha256: load.Sha256 } };
  }

  /** True when the stored `Delivery` is a registered delivery that ships an artifact (checked against `RegistrySchemas`). */
  private static hasRegisteredDelivery(text: string | null): boolean {
    const json = JsonParse.ParseJsonText(text, 'Delivery');
    if (json.Ok === false) return false;
    const parsed = RegistrySchemas.RegisteredDeliveryView.safeParse(json.Value);
    return parsed.success === true && parsed.data.kind === 'delivered';
  }
}
