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
import { LogError, Metadata } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import type { ComponentGraphNode } from '@memberjunction/predictive-studio-core';
import { validateArchitectureSpec } from '@memberjunction/predictive-studio-core';

import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import { MLComponentEngine } from '../components/ml-component-engine';
import { validateGraphAgainstTree } from '../components/graph-resolver';
import { ReuseFinder } from '../stories/reuse-finder';
import { SignalComputer } from '../components/signal-compute';
import { SignalCatalog } from '../components/signal-catalog';
import { EVIDENCE_STRENGTH, FindingFinder } from '../stories/finding-finder';
import type { SignalBindingOverride } from '../components/signal-binding';

/** DriverClass keys, matching the seeded `MJ: Actions` rows. */
export const BROWSE_COMPONENT_TREE_DRIVER_CLASS = 'PredictiveStudioBrowseComponentTreeAction';
export const FIND_REUSABLE_COMPONENTS_DRIVER_CLASS = 'PredictiveStudioFindReusableComponentsAction';
export const VALIDATE_COMPONENT_GRAPH_DRIVER_CLASS = 'PredictiveStudioValidateComponentGraphAction';
export const COMPUTE_SIGNAL_DRIVER_CLASS = 'PredictiveStudioComputeSignalAction';
export const LIST_SIGNALS_DRIVER_CLASS = 'PredictiveStudioListSignalsAction';
export const FIND_FINDINGS_DRIVER_CLASS = 'PredictiveStudioFindFindingsAction';


/**
 * Shared plumbing for the component-tree actions: the loaded tree, and the one embedding call every
 * meaning-search must go through.
 *
 * `loadEngine` is a seam rather than a direct `MLComponentEngine.Instance` read so tests can hand in
 * a fixed tree; `embedQuery` is here rather than per-action because the model it picks has to match
 * the one that wrote every `StoryVector`, and a second copy is a second chance to pick differently.
 */
export abstract class BaseComponentTreeAction extends BasePredictiveStudioAction {
  /** Engine seam — overridden in tests. */
  protected async loadEngine(params: RunActionParams): Promise<MLComponentEngine> {
    const engine = MLComponentEngine.Instance;
    await engine.Config(false, params.ContextUser, this.providerFor(params));
    return engine;
  }

  /**
   * The provider to read metadata through.
   *
   * `RunActionParams.Provider` is optional and is NOT set on the ordinary action-engine path — only
   * a caller doing its own multi-provider routing supplies one. Passing it straight through means
   * anything that requires a provider fails for every normal invocation while working perfectly in
   * a test that hands one in, so the documented fallback is applied here, once, rather than being
   * each action's to remember.
   */
  protected providerFor(params: RunActionParams): IMetadataProvider {
    return params.Provider ?? Metadata.Provider;
  }

  /**
   * Embed a plain-English query with the SAME model that embedded the component stories.
   *
   * `AIEngine.EmbedTextLocal` picks the highest-power LOCAL embedding model, which is exactly what
   * `BaseEntity.GenerateEmbedding` calls when it writes `StoryVector` on save. Routing both through
   * one call is what makes the cosine distances meaningful; there is deliberately no way for a
   * caller to choose a different model here.
   */
  protected async embedQuery(text: string): Promise<number[] | null> {
    try {
      const embedded = await AIEngine.Instance.EmbedTextLocal(text);
      return embedded?.result?.vector ?? null;
    } catch (e) {
      LogError(e);
      return null;
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

}

/**
 * `Browse ML Component Tree` — what kinds of parts exist, and what a given one inherits.
 *
 * Reading the tree is not the same as reading a list of algorithms: a leaf's real capabilities are
 * the ones it INHERITS (its preprocessing bank, its hyperparameter bank, its statistical gates), so
 * the resolved profile is what the action returns — with provenance, so an agent can say *where* a
 * constraint came from rather than just that it exists.
 */
@RegisterClass(BaseAction, BROWSE_COMPONENT_TREE_DRIVER_CLASS)
export class PredictiveStudioBrowseComponentTreeAction extends BaseComponentTreeAction {
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
export class PredictiveStudioFindReusableComponentsAction extends BaseComponentTreeAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      // `QueryText` is the form a UI can actually use: a browser cannot embed, and a caller who
      // hand-picks an embedding model will eventually pick a different one from the stories' and
      // get distances that mean nothing. Embedding here removes that choice — this is the same
      // call (`AIEngine.EmbedTextLocal`) that `BaseEntity` used to write every StoryVector, so the
      // query and the corpus land in one vector space by construction rather than by discipline.
      const queryText = this.getStringParam(params, 'QueryText');
      const queryVector = this.parseQueryVector(params) ?? (queryText ? await this.embedQuery(queryText) : null);
      if (!queryVector) {
        return this.fail(
          'VALIDATION_ERROR',
          queryText
            ? 'QueryText could not be embedded — no local embedding model is available, so meaning-search cannot run.'
            : 'Supply QueryText (plain English, embedded server-side) or QueryVector (a numeric array embedded with the SAME model the component stories were embedded with).',
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
        this.providerFor(params),
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


  /** Finder seam — overridden in tests. */
  protected createFinder(): ReuseFinder {
    return new ReuseFinder();
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
export class PredictiveStudioValidateComponentGraphAction extends BaseComponentTreeAction {
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

}

/** Parse a JSON string, returning `null` rather than throwing. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}


/**
 * `Compute Signal` — run ONE proven measure over a population, with no model involved.
 *
 * This is what makes the catalogue callable rather than browsable. Most questions a business asks
 * are measurements, not predictions — *"who has gone quiet since the conference?"* is an activity
 * recency signal over a population, and running a whole renewal model to answer it is the wrong
 * tool returning the wrong shape (a probability, when the asker wanted a number of days).
 *
 * The optional binding parameters are what let a measure proven on members be pointed at donors or
 * registrants: the signal's stored binding is a DEFAULT, and anything supplied here replaces it
 * while the meaning — the aggregate and its window — stays fixed.
 */
@RegisterClass(BaseAction, COMPUTE_SIGNAL_DRIVER_CLASS)
export class PredictiveStudioComputeSignalAction extends BaseComponentTreeAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const signalId = this.getStringParam(params, 'SignalID');
      const targetEntity = this.getStringParam(params, 'TargetEntity');
      if (!signalId || !targetEntity) {
        return this.fail('VALIDATION_ERROR', 'SignalID and TargetEntity are both required.');
      }

      const result = await this.createComputer().compute(
        {
          SignalID: signalId,
          TargetEntity: targetEntity,
          Filter: this.getStringParam(params, 'Filter'),
          MaxRows: this.getNumericParam(params, 'MaxRows'),
          AsOfColumn: this.getStringParam(params, 'AsOfColumn'),
          Binding: this.readBinding(params),
        },
        params.ContextUser,
        this.providerFor(params),
        await this.loadEngine(params),
      );

      if (!result.Success) {
        // A refused binding is a validation problem the caller can fix, not an internal failure —
        // the message names the field that does not exist.
        return this.fail('COMPUTE_FAILED', result.ErrorMessage ?? 'The signal could not be computed.');
      }

      this.addOutputParam(params, 'Values', result.Values);
      this.addOutputParam(params, 'OutputColumn', result.OutputColumn);
      // What it ACTUALLY measured after the override, so a caller can record provenance rather
      // than assume the default binding was used.
      this.addOutputParam(params, 'ResolvedAs', result.ResolvedAs);
      return this.ok(params, `Computed '${result.OutputColumn}' for ${result.Values.length} record(s).`);
    } catch (e) {
      LogError(e);
      return this.fail('COMPUTE_FAILED', `Signal computation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Read the optional binding substitutions. All absent ⇒ the signal's stored binding is used. */
  protected readBinding(params: RunActionParams): SignalBindingOverride | undefined {
    const binding: SignalBindingOverride = {
      SourceEntity: this.getStringParam(params, 'SourceEntity'),
      ForeignKeyField: this.getStringParam(params, 'ForeignKeyField'),
      DateField: this.getStringParam(params, 'DateField'),
      ValueField: this.getStringParam(params, 'ValueField'),
      Column: this.getStringParam(params, 'Column'),
    };
    // Send undefined rather than an object of undefineds, so the resolver's "keep the default"
    // path is taken cleanly.
    return Object.values(binding).some((v) => v !== undefined) ? binding : undefined;
  }

  /** Seam — overridden in tests. */
  protected createComputer(): SignalComputer {
    return new SignalComputer();
  }

}


/**
 * `List Signals` — what can this organisation measure?
 *
 * The companion to `Compute Signal`: a caller cannot compute a measure it has no id for, and it
 * cannot guess one. Supplying `QueryText` ranks the catalogue by meaning — *"how recently someone
 * engaged"* returns the recency measure without anyone knowing a table or column name — and
 * omitting it returns the catalogue in name order.
 *
 * `Rebindable` is the field that matters to a caller building a UI or an agent planning a step: a
 * measure that cannot be pointed at another population must not be offered with a population picker
 * beside it. It is resolved here from the component type's driver, because the type tree is not
 * visible to a browser and an inferred answer would be wrong in exactly the cases that matter.
 */
@RegisterClass(BaseAction, LIST_SIGNALS_DRIVER_CLASS)
export class PredictiveStudioListSignalsAction extends BaseComponentTreeAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      // Same embedding rule as the reuse search: the vector must come from the model that wrote the
      // stories, so a caller supplies text and we embed, or supplies a vector it embedded itself.
      const queryText = this.getStringParam(params, 'QueryText');
      const searchVector = this.parseQueryVector(params) ?? (queryText ? await this.embedQuery(queryText) : null);
      if (queryText && !searchVector) {
        return this.fail(
          'VALIDATION_ERROR',
          'QueryText could not be embedded — no local embedding model is available, so the catalogue cannot be ranked by meaning. Omit QueryText to list it unranked.',
        );
      }

      const result = await this.createCatalog().list(
        {
          SearchVector: searchVector ?? undefined,
          RebindableOnly: this.getBooleanParam(params, 'RebindableOnly', false),
          MaxRows: this.getNumericParam(params, 'MaxRows'),
          MinSimilarity: this.getNumericParam(params, 'MinSimilarity'),
          PromotionStates: this.parseStringArray(params, 'PromotionStates'),
        },
        params.ContextUser,
        this.providerFor(params),
        await this.loadEngine(params),
      );

      this.addOutputParam(params, 'Signals', result.Signals);
      if (result.Warnings.length > 0) {
        this.addOutputParam(params, 'Warnings', result.Warnings);
      }
      return this.ok(
        params,
        result.Signals.length > 0
          ? `Found ${result.Signals.length} signal(s), ${result.Signals.filter((s) => s.Rebindable).length} of which can be pointed at another population.`
          : `No signal matched${result.Warnings.length > 0 ? ` (${result.Warnings.join(' ')})` : '.'}`,
      );
    } catch (e) {
      LogError(e);
      return this.fail('LIST_FAILED', `The signal catalogue could not be listed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Seam — overridden in tests. */
  protected createCatalog(): SignalCatalog {
    return new SignalCatalog();
  }

}


/**
 * `Find Relevant Findings` — what has this organization actually learned about something?
 *
 * The counterpart to `Find Reusable Components`: that one returns a measure you can RUN, this one
 * returns a fact you can CITE. Both are meaning searches over stored story vectors, so a question
 * asked in plain English — *"why do members lapse?"* — reaches the record without anyone naming a
 * table.
 *
 * `MinEvidence` is the parameter that matters for an agent. An observed association and a tested
 * intervention answer different questions, and an agent recommending an ACTION should demand the
 * latter and return nothing rather than dress up the former as advice. Every match carries its own
 * evidence type, date, population and out-of-sample metric, so a citation can be checked instead of
 * taken on trust.
 */
@RegisterClass(BaseAction, FIND_FINDINGS_DRIVER_CLASS)
export class PredictiveStudioFindFindingsAction extends BaseComponentTreeAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const queryText = this.getStringParam(params, 'QueryText');
      const queryVector = this.parseQueryVector(params) ?? (queryText ? await this.embedQuery(queryText) : null);
      if (!queryVector) {
        return this.fail(
          'VALIDATION_ERROR',
          queryText
            ? 'QueryText could not be embedded — no local embedding model is available, so findings cannot be searched by meaning.'
            : 'Supply QueryText (plain English, embedded server-side) or QueryVector (embedded with the SAME model the finding stories were embedded with).',
        );
      }

      const minEvidence = this.getStringParam(params, 'MinEvidence');
      if (minEvidence && !EVIDENCE_STRENGTH.includes(minEvidence)) {
        // Refused rather than ignored: silently dropping an evidence floor would return
        // associations to a caller that explicitly asked for tested interventions.
        return this.fail(
          'VALIDATION_ERROR',
          `'${minEvidence}' is not an evidence type. Valid, weakest first: ${EVIDENCE_STRENGTH.join(', ')}.`,
        );
      }

      const result = await this.createFindingFinder().find(
        {
          QueryVector: queryVector,
          TopK: this.getNumericParam(params, 'TopK'),
          MinSimilarity: this.getNumericParam(params, 'MinSimilarity'),
          MinEvidence: minEvidence,
          TargetVariable: this.getStringParam(params, 'TargetVariable'),
          IncludeSuperseded: this.getBooleanParam(params, 'IncludeSuperseded', false),
        },
        params.ContextUser,
        this.providerFor(params),
      );

      this.addOutputParam(params, 'Findings', result.Matches);
      this.addOutputParam(params, 'CandidatesConsidered', result.CandidatesConsidered);
      if (result.Warnings.length > 0) {
        this.addOutputParam(params, 'Warnings', result.Warnings);
      }
      return this.ok(
        params,
        result.Matches.length > 0
          ? `Found ${result.Matches.length} finding(s) out of ${result.CandidatesConsidered} considered.`
          : `Nothing on record matches that${result.Warnings.length > 0 ? ` (${result.Warnings.join(' ')})` : '.'} An empty answer means nothing has been MEASURED about it — not that it is untrue.`,
      );
    } catch (e) {
      LogError(e);
      return this.fail('SEARCH_FAILED', `Finding search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Seam — overridden in tests. */
  protected createFindingFinder(): FindingFinder {
    return new FindingFinder();
  }
}

/** Tree-shaking anchor — call from a manifest/loader so the @RegisterClass side effects survive. */
export function LoadPredictiveStudioComponentTreeActions(): void {
  /* no-op */
}
