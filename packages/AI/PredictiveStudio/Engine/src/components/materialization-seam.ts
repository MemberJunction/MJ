/**
 * @module components/materialization-seam
 *
 * The production {@link IModelComponentMaterializer} — the adapter that turns live MJ
 * metadata (entities, fields, the algorithm→component-type bridge) into the plain
 * {@link MaterializationInput} the pure planner consumes, then persists the result.
 *
 * Keeping the metadata reads here (rather than in {@link ComponentMaterializer}) is what
 * lets the planner stay pure and the training engine stay ignorant of both.
 */

import { RunView, Metadata, LogStatus, LogError } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo, EntityInfo } from '@memberjunction/core';

import {
  ComponentMaterializer,
  readTargetEntityMetadata,
  type CompositionMaterializationInput,
  type IModelComponentMaterializer,
  type MaterializationDeps,
  type MaterializationResult,
  type TrainedModelContext,
} from './component-materializer';
import type { FkGraphEntity } from './join-path';
import { MLComponentEngine } from './ml-component-engine';

/**
 * Metadata-backed model materializer. Resolves the algorithm's leaf component type from
 * `MJ: ML Algorithms.ComponentTypeID`, projects the target entity's fields, hands the FK
 * graph to the join-path resolver, and delegates persistence to {@link ComponentMaterializer}.
 *
 * **Never throws** — every failure path returns a {@link MaterializationResult} carrying a
 * warning, so a training run is never lost to a provenance problem.
 */
export class MetadataComponentMaterializer implements IModelComponentMaterializer {
  /**
   * @param materializer the pure planner + writer this seam delegates to
   * @param engine component-type tree, consulted only when the model was composed
   */
  constructor(
    private readonly materializer: ComponentMaterializer = new ComponentMaterializer(),
    private readonly engine: MLComponentEngine = MLComponentEngine.Instance,
  ) {}

  /** @inheritdoc */
  public async materializeTrainedModel(
    ctx: TrainedModelContext,
    deps: MaterializationDeps,
    provider?: IMetadataProvider,
  ): Promise<MaterializationResult> {
    try {
      const md = provider ?? Metadata.Provider;
      if (!md) {
        return skipped('no metadata provider is available to resolve entity fields');
      }
      const componentTypeID = await this.resolveComponentTypeID(ctx.algorithmID, deps.contextUser, provider);
      if (!componentTypeID) {
        // Expected for an algorithm not yet bridged to the component tree — say so plainly
        // rather than inventing a type, and leave the model unprojected.
        return skipped(
          `algorithm '${ctx.algorithmID}' has no ComponentTypeID — bridge it to a leaf in the ML Component Type tree to enable materialization`,
        );
      }
      const targetEntity = readTargetEntityMetadata(md, ctx.targetEntityName);
      if (!targetEntity) {
        return skipped(`target entity '${ctx.targetEntityName}' was not found in metadata`);
      }

      return await this.materializer.materialize(
        ctx.model,
        {
          composition: await this.resolveComposition(ctx, deps.contextUser, provider),
          componentName: ctx.componentName,
          componentTypeID,
          mlModelID: ctx.model.ID,
          targetEntity,
          targetVariable: ctx.targetVariable,
          problemType: ctx.problemType,
          featureSchema: ctx.featureSchema,
          datedSources: ctx.datedSources,
          hyperparameters: ctx.hyperparameters,
          fkGraph: toFkGraph(md.Entities),
          entityIdsByName: entityIdsByName(md.Entities),
        },
        deps,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`MetadataComponentMaterializer: ${message}`);
      return { ComponentID: null, BindingCount: 0, ComposedComponentCount: 0, Warnings: [`Materialization failed: ${message}`] };
    }
  }

  /**
   * Build the composition input for a composed model: the graph, the sidecar's per-node states,
   * and the type-name lookups needed to turn names into rows.
   *
   * Returns `undefined` for a plain model, and also when the sidecar reported no per-node states
   * — a graph with nothing to pair against cannot be materialized honestly.
   */
  private async resolveComposition(
    ctx: TrainedModelContext,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<CompositionMaterializationInput | undefined> {
    if (!ctx.componentGraph || !ctx.componentStates || ctx.componentStates.length === 0) {
      return undefined;
    }
    await this.engine.Config(false, contextUser, provider);
    const typeIdsByName = new Map<string, string>();
    const driverByTypeName = new Map<string, string>();
    for (const type of this.engine.ComponentTypes) {
      const key = type.Name.trim().toLowerCase();
      typeIdsByName.set(key, type.ID);
      if (type.DriverClass) {
        driverByTypeName.set(key, type.DriverClass);
      }
    }
    return { graph: ctx.componentGraph, states: ctx.componentStates, typeIdsByName, driverByTypeName };
  }

  /** Read the leaf `MJ: ML Component Types` id bridged onto the algorithm row. */
  private async resolveComponentTypeID(
    algorithmID: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<string | null> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<{ ComponentTypeID: string | null }>(
      {
        EntityName: 'MJ: ML Algorithms',
        ExtraFilter: `ID='${algorithmID}'`,
        Fields: ['ComponentTypeID'],
        MaxRows: 1,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      LogError(`MetadataComponentMaterializer: failed to read ML Algorithm '${algorithmID}': ${result.ErrorMessage}`);
      return null;
    }
    return result.Results[0]?.ComponentTypeID ?? null;
  }
}

/** Project MJ entities into the structural shape the FK-path resolver walks. */
function toFkGraph(entities: EntityInfo[]): FkGraphEntity[] {
  return entities.map((e) => ({
    ID: e.ID,
    Name: e.Name,
    Fields: e.Fields.map((f) => ({ Name: f.Name, RelatedEntityID: f.RelatedEntityID })),
  }));
}

/** Entity ids keyed by lowercased name, for resolving a dated source's entity. */
function entityIdsByName(entities: EntityInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entities) {
    map.set(e.Name.toLowerCase(), e.ID);
  }
  return map;
}

/** A skipped materialization: no rows written, one plain-language reason. */
function skipped(reason: string): MaterializationResult {
  LogStatus(`MetadataComponentMaterializer: skipping materialization — ${reason}.`);
  return { ComponentID: null, BindingCount: 0, ComposedComponentCount: 0, Warnings: [`Materialization skipped: ${reason}.`] };
}
