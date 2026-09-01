/**
 * @module actions/component-tree.actions
 *
 * The three **component-tree Actions** — the agent-facing surface over the typed component model.
 *
 * Together they close the loop the component model exists for: an agent can *see* what kinds of
 * parts exist and what each one inherits (`Browse ML Component Tree`), *find* an already-trained
 * part worth reusing by what it means (`Find Reusable Components`), and *prove* a proposed
 * composition is legal before anything trains (`Validate Component Graph`).
 *
 * Per `packages/Actions/CLAUDE.md` these stay THIN — they extract and validate params, delegate to
 * the engine services, and map results back. No tree logic lives here.
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type { ComponentGraphNode } from '@memberjunction/predictive-studio-core';
import { validateArchitectureSpec } from '@memberjunction/predictive-studio-core';

import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import { MLComponentEngine } from '../components/ml-component-engine';
import { validateGraphAgainstTree } from '../components/graph-resolver';
import { ReuseFinder } from '../stories/reuse-finder';

/** DriverClass keys, matching the seeded `MJ: Actions` rows. */
export const BROWSE_COMPONENT_TREE_DRIVER_CLASS = 'PredictiveStudioBrowseComponentTreeAction';
export const FIND_REUSABLE_COMPONENTS_DRIVER_CLASS = 'PredictiveStudioFindReusableComponentsAction';
export const VALIDATE_COMPONENT_GRAPH_DRIVER_CLASS = 'PredictiveStudioValidateComponentGraphAction';

/**
 * `Browse ML Component Tree` — what kinds of parts exist, and what a given one inherits.
 *
 * Reading the tree is not the same as reading a list of algorithms: a leaf's real capabilities are
 * the ones it INHERITS (its preprocessing bank, its hyperparameter bank, its statistical gates), so
 * the resolved profile is what the action returns — with provenance, so an agent can say *where* a
 * constraint came from rather than just that it exists.
 */
@RegisterClass(BaseAction, BROWSE_COMPONENT_TREE_DRIVER_CLASS)
export class PredictiveStudioBrowseComponentTreeAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const engine = await this.loadEngine(params);
      const kind = this.getStringParam(params, 'Kind');
      const componentTypeName = this.getStringParam(params, 'ComponentTypeName');

      if (componentTypeName) {
        const type = engine.FindTypeByName(componentTypeName);
        if (!type) {
          return this.fail('NOT_FOUND', `There is no component type called '${componentTypeName}'.`);
        }
        const profile = engine.ResolveProfile(type.ID);
        this.addOutputParam(params, 'Profile', {
          ID: profile.Leaf.ID,
          Name: profile.Leaf.Name,
          Kind: profile.Leaf.Kind,
          IsAbstract: profile.Leaf.IsAbstract,
          // Root first — the chain IS the explanation of where each property came from.
          Chain: profile.Chain.map((c) => c.Name),
          Properties: profile.Properties,
          Provenance: profile.Provenance,
          Slots: profile.Slots,
        });
        return this.ok(params, `Resolved '${type.Name}' through ${profile.Chain.map((c) => c.Name).join(' → ')}.`);
      }

      const types = kind
        ? engine.TypesByKind(kind as Parameters<MLComponentEngine['TypesByKind']>[0], this.getBooleanParam(params, 'ConcreteOnly', false))
        : engine.ComponentTypes;
      this.addOutputParam(
        params,
        'ComponentTypes',
        types.map((t) => ({ ID: t.ID, Name: t.Name, Kind: t.Kind, IsAbstract: t.IsAbstract, ParentID: t.ParentID, Story: t.Story })),
      );
      return this.ok(params, `Found ${types.length} component type(s)${kind ? ` of kind '${kind}'` : ''}.`);
    } catch (e) {
      LogError(e);
      return this.fail('BROWSE_FAILED', `Could not read the component tree: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Engine seam — overridden in tests so no live tree is needed. */
  protected async loadEngine(params: RunActionParams): Promise<MLComponentEngine> {
    const engine = MLComponentEngine.Instance;
    await engine.Config(false, params.ContextUser, params.Provider);
    return engine;
  }
}

/**
 * `Find Reusable Components` — find an already-trained part by what it MEANS.
 *
 * The caller supplies the query embedding, deliberately: the stories were embedded with a specific
 * model, and a vector produced by a different one yields distances that look like numbers and mean
 * nothing. Making that the caller's responsibility keeps the mismatch impossible to introduce here
 * by accident.
 */
@RegisterClass(BaseAction, FIND_REUSABLE_COMPONENTS_DRIVER_CLASS)
export class PredictiveStudioFindReusableComponentsAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const queryVector = this.parseQueryVector(params);
      if (!queryVector) {
        return this.fail(
          'VALIDATION_ERROR',
          'QueryVector parameter is required — a numeric array embedded with the SAME model the component stories were embedded with.',
        );
      }

      const forSlotType = this.getStringParam(params, 'ForComponentTypeID');
      const forSlotName = this.getStringParam(params, 'ForSlotName');
      if (Boolean(forSlotType) !== Boolean(forSlotName)) {
        return this.fail(
          'VALIDATION_ERROR',
          'ForComponentTypeID and ForSlotName must be supplied together — a slot filter needs both the parent type and the slot.',
        );
      }

      const engine = await this.loadEngine(params);
      const result = await this.createFinder().find(
        {
          QueryVector: queryVector,
          TopK: this.getNumericParam(params, 'TopK'),
          MinSimilarity: this.getNumericParam(params, 'MinSimilarity'),
          ForSlot: forSlotType && forSlotName ? { ComponentTypeID: forSlotType, SlotName: forSlotName } : undefined,
          PromotionStates: this.parseStringArray(params, 'PromotionStates'),
          TrainedOnly: this.getBooleanParam(params, 'TrainedOnly', true),
        },
        params.ContextUser,
        params.Provider,
        engine,
      );

      this.addOutputParam(params, 'Matches', result.Matches);
      this.addOutputParam(params, 'CandidatesConsidered', result.CandidatesConsidered);
      if (result.Warnings.length > 0) {
        this.addOutputParam(params, 'Warnings', result.Warnings);
      }
      return this.ok(
        params,
        result.Matches.length > 0
          ? `Found ${result.Matches.length} reusable component(s) out of ${result.CandidatesConsidered} considered.`
          : `No reusable component matched${result.Warnings.length > 0 ? ` (${result.Warnings.join(' ')})` : '.'}`,
      );
    } catch (e) {
      LogError(e);
      return this.fail('SEARCH_FAILED', `Reuse search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Read `QueryVector` as a numeric array, from a native array or a JSON string. */
  protected parseQueryVector(params: RunActionParams): number[] | null {
    const param = this.findParam(params, 'QueryVector');
    if (!param || param.Value == null) {
      return null;
    }
    const raw: unknown = typeof param.Value === 'string' ? safeParse(param.Value) : param.Value;
    if (!Array.isArray(raw) || raw.length === 0) {
      return null;
    }
    const vector: number[] = [];
    for (const v of raw) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return null;
      }
      vector.push(v);
    }
    return vector;
  }

  /** Read an optional string-array param (native array or JSON string). */
  protected parseStringArray(params: RunActionParams, name: string): string[] | undefined {
    const param = this.findParam(params, name);
    if (!param || param.Value == null) {
      return undefined;
    }
    const raw: unknown = typeof param.Value === 'string' ? safeParse(param.Value) : param.Value;
    if (!Array.isArray(raw)) {
      return undefined;
    }
    const out = raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return out.length > 0 ? out : undefined;
  }

  /** Finder seam — overridden in tests. */
  protected createFinder(): ReuseFinder {
    return new ReuseFinder();
  }

  /** Engine seam — overridden in tests. */
  protected async loadEngine(params: RunActionParams): Promise<MLComponentEngine> {
    const engine = MLComponentEngine.Instance;
    await engine.Config(false, params.ContextUser, params.Provider);
    return engine;
  }
}

/**
 * `Validate Component Graph` — prove a proposed composition is buildable, before anything trains.
 *
 * Accepts either a bare graph (`Graph`) or a whole `ArchitectureSpec` (`Architecture`), because the
 * Architect produces the latter and a human composing in the UI produces the former. Findings come
 * back with a path and a message that says what WOULD have been valid, so a caller can fix its own
 * proposal rather than guessing.
 */
@RegisterClass(BaseAction, VALIDATE_COMPONENT_GRAPH_DRIVER_CLASS)
export class PredictiveStudioValidateComponentGraphAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const graph = this.resolveGraph(params);
      if ('error' in graph) {
        return this.fail('VALIDATION_ERROR', graph.error);
      }

      const engine = await this.loadEngine(params);
      const result = validateGraphAgainstTree(graph.node, engine);

      this.addOutputParam(params, 'Valid', result.Valid);
      this.addOutputParam(params, 'Findings', result.Findings);
      return this.ok(
        params,
        result.Valid
          ? 'The composition is buildable — every slot, type and arity checks out.'
          : `The composition is not buildable: ${result.Findings.filter((f) => f.Severity === 'Error').map((f) => `${f.Path}: ${f.Message}`).join(' ')}`,
      );
    } catch (e) {
      LogError(e);
      return this.fail('VALIDATION_FAILED', `Graph validation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Resolve the graph from either param shape, or explain why neither worked. */
  protected resolveGraph(params: RunActionParams): { node: ComponentGraphNode } | { error: string } {
    const architecture = this.getJsonObjectParam(params, 'Architecture');
    if (architecture) {
      const parsed = validateArchitectureSpec(architecture);
      if ('error' in parsed) {
        return { error: `The architecture is malformed: ${parsed.error}` };
      }
      if (!parsed.value.ComposedGraph) {
        return { error: `That architecture is a '${parsed.value.Decision}' decision, which carries no composition to validate.` };
      }
      return { node: parsed.value.ComposedGraph };
    }

    const graph = this.getJsonObjectParam(params, 'Graph');
    if (!graph) {
      return { error: 'Either a Graph or an Architecture parameter is required.' };
    }
    if (typeof (graph as { ComponentTypeRef?: unknown }).ComponentTypeRef !== 'string') {
      return { error: 'Graph must be a composition node with a ComponentTypeRef.' };
    }
    return { node: graph as unknown as ComponentGraphNode };
  }

  /** Engine seam — overridden in tests. */
  protected async loadEngine(params: RunActionParams): Promise<MLComponentEngine> {
    const engine = MLComponentEngine.Instance;
    await engine.Config(false, params.ContextUser, params.Provider);
    return engine;
  }
}

/** Parse a JSON string, returning `null` rather than throwing. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Tree-shaking anchor — call from a manifest/loader so the @RegisterClass side effects survive. */
export function LoadPredictiveStudioComponentTreeActions(): void {
  /* no-op */
}
