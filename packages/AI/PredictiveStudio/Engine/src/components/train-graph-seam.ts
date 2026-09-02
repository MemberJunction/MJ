/**
 * @module components/train-graph-seam
 *
 * The production {@link ITrainComponentGraphResolver} — what turns a pipeline's stored
 * `ComponentGraph` into something the sidecar can actually train.
 *
 * Two jobs, both of which need live metadata and so belong here rather than in the pure translator:
 *
 * 1. **Vocabulary.** Component-type names → driver keys, via {@link MLComponentEngine}'s cached tree.
 * 2. **Reuse.** A node that reuses an already-trained `MJ: ML Components` instance needs that
 *    instance's fitted artifact to travel with the request, because the sidecar has no database.
 *
 * Every failure here throws. That is the deliberate difference from the materialization seam: a
 * materialization that fails costs provenance, while a graph that silently fails to resolve would
 * cost correctness — the run would train the root estimator alone and report it as the composed
 * model, and no metric, leaderboard entry or model row would look any different.
 */

import { RunView, LogStatus } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ComponentGraphNode } from '@memberjunction/predictive-studio-core';

import type { IArtifactLoader } from '../scoring/types';
import type { ITrainComponentGraphResolver, ResolvedTrainGraph } from '../training/types';
import { MLComponentEngine } from './ml-component-engine';
import { toTrainComponentGraph, type TrainGraphType } from './graph-to-train';

/** The `MJ: ML Components` columns a reused instance is read through. */
interface ReusableComponentRow {
  ID: string;
  Name: string | null;
  IsTrained: boolean | null;
  ArtifactFileID: string | null;
  PromotionState: string | null;
}

/**
 * Metadata-backed composition resolver: resolves type names against the live component tree and
 * loads each reused component's artifact through the same {@link IArtifactLoader} scoring uses.
 */
export class MetadataTrainComponentGraphResolver implements ITrainComponentGraphResolver {
  /**
   * @param artifactLoader read-side artifact seam — the same one scoring uses, so a reused
   *   component is loaded from exactly the bytes that were stored for it
   * @param engine optional component engine override (tests inject a pre-loaded one)
   */
  constructor(
    private readonly artifactLoader: IArtifactLoader,
    private readonly engine: MLComponentEngine = MLComponentEngine.Instance,
  ) {}

  /** @inheritdoc */
  public async resolve(
    graph: ComponentGraphNode,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<ResolvedTrainGraph> {
    await this.engine.Config(false, contextUser, provider);

    const translation = toTrainComponentGraph(graph, (name): TrainGraphType | undefined => {
      const type = this.engine.FindTypeByName(name);
      return type
        ? { Name: type.Name, IsAbstract: type.IsAbstract, DriverClass: type.DriverClass, Status: type.Status }
        : undefined;
    });

    const artifacts = await this.loadReusedArtifacts(translation.ReuseInstanceIDs, contextUser, provider);

    return {
      node: translation.Node,
      rootDriver: translation.RootDriver,
      artifacts,
      warnings: translation.Warnings,
    };
  }

  /**
   * Load the fitted artifact of every reused component, base64-keyed by component id.
   *
   * Refuses a component that is not trained, has no artifact, or whose bytes cannot be read —
   * each of those would otherwise reach the sidecar as a missing key and, worse, could look like
   * a fresh fit if the sidecar were ever made lenient.
   */
  private async loadReusedArtifacts(
    componentIDs: string[],
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<Record<string, string>> {
    const unique = [...new Set(componentIDs)];
    if (unique.length === 0) {
      return {};
    }

    const rowsByID = await this.loadComponentRows(unique, contextUser, provider);
    const artifacts: Record<string, string> = {};

    for (const id of unique) {
      const row = rowsByID.get(id);
      if (!row) {
        throw new Error(`Component graph reuses '${id}', but there is no such ML Component.`);
      }
      const label = row.Name ? `'${row.Name}' (${id})` : `'${id}'`;
      if (!row.IsTrained) {
        throw new Error(`Component graph reuses ${label}, which has never been trained — there is no fitted state to reuse.`);
      }
      if (!row.ArtifactFileID) {
        throw new Error(`Component graph reuses ${label}, which is marked trained but has no stored artifact.`);
      }
      const bytes = await this.artifactLoader.load(row.ArtifactFileID, contextUser);
      if (!bytes) {
        throw new Error(`Component graph reuses ${label}, but its artifact '${row.ArtifactFileID}' could not be read.`);
      }
      if (row.PromotionState === 'Deprecated') {
        LogStatus(`MetadataTrainComponentGraphResolver: reusing deprecated component ${label}.`);
      }
      artifacts[id] = Buffer.from(bytes).toString('base64');
    }
    return artifacts;
  }

  /** Read the reused `MJ: ML Components` rows in one pass. */
  private async loadComponentRows(
    componentIDs: string[],
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<Map<string, ReusableComponentRow>> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const idList = componentIDs.map((id) => `'${id}'`).join(',');
    const result = await rv.RunView<ReusableComponentRow>(
      {
        EntityName: 'MJ: ML Components',
        ExtraFilter: `ID IN (${idList})`,
        Fields: ['ID', 'Name', 'IsTrained', 'ArtifactFileID', 'PromotionState'],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      throw new Error(`Component graph could not read the components it reuses: ${result.ErrorMessage}`);
    }
    return new Map(result.Results.map((r) => [r.ID, r]));
  }
}
