/**
 * @module components/graph-to-train
 *
 * Translates a proposed {@link ComponentGraphNode} tree — written by the Architect in terms of
 * component-type **names** — into the driver-keyed {@link TrainComponentNode} the sidecar executes.
 *
 * This is the last mile of the `compose` decision. Everything upstream of it talks about component
 * types ("Bagging Wrapper over Random Forest"); the sidecar has no database and so talks about
 * drivers (`bagging` over `random_forest`). Two different vocabularies, and this module is the only
 * place they meet.
 *
 * It **refuses** rather than guesses. A name the tree does not know, an abstract type nobody can
 * instantiate, a type with no `DriverClass` to run, a reused instance that also declares children —
 * each of those is an error with a plain-language message, because every one of them would
 * otherwise train *something*, and that something would not be what was described.
 *
 * Pure: the type lookup arrives as a callback, so the translator unit-tests without a provider and
 * runs identically in the browser against `MLComponentEngine`'s cache.
 */

import type { ComponentGraphNode, TrainComponentNode } from '@memberjunction/predictive-studio-core';

/** The facts about a component type this translation needs — a narrowed view of the entity row. */
export interface TrainGraphType {
  /** Type name, echoed into error messages. */
  Name: string;
  /** An abstract type is a place in the tree, not something you can instantiate. */
  IsAbstract: boolean;
  /** The sidecar/runtime key this type executes as. NULL for a type with no runtime. */
  DriverClass: string | null;
  /** Lifecycle status; a `Deprecated` type still translates, but the caller is warned. */
  Status?: string;
}

/** Resolve a component-type name to its facts. Returns `undefined` when the tree has no such type. */
export type TrainGraphTypeLookup = (name: string) => TrainGraphType | undefined;

/** A graph translated into sidecar terms. */
export interface TrainGraphTranslation {
  /**
   * The ROOT node's driver. `TrainRequest.algorithm` keeps naming the root even for a composed
   * model, so every existing read path — metrics, leaderboards, the model row — is unchanged.
   */
  RootDriver: string;
  /** The translated tree. */
  Node: TrainComponentNode;
  /**
   * Every `MJ: ML Components` id the graph reuses, in encounter order. The caller loads each one's
   * artifact into `TrainRequest.component_artifacts`; the sidecar errors on any that is missing.
   */
  ReuseInstanceIDs: string[];
  /** Non-fatal observations (e.g. a deprecated type still in use). */
  Warnings: string[];
}

/** A graph that cannot be translated. The message is written to be shown to a user verbatim. */
export class ComponentGraphTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComponentGraphTranslationError';
  }
}

/**
 * Matches the sidecar's own `composition.MAX_DEPTH`. Kept in lockstep deliberately: refusing here
 * gives a message naming the component types, where the sidecar can only name drivers.
 */
export const MAX_GRAPH_DEPTH = 16;

/**
 * Translate a composition graph into the sidecar's driver-keyed form.
 *
 * Structural legality (slots, arity, what each slot accepts) is NOT re-checked here —
 * `validateComponentGraph` owns that and runs first. This step is purely about vocabulary, plus the
 * refusals that only become visible once you look up the real type.
 *
 * @param graph the root of the proposed composition
 * @param lookup resolves a component-type name against the live tree
 * @throws ComponentGraphTranslationError when the graph names something unrunnable
 */
export function toTrainComponentGraph(graph: ComponentGraphNode, lookup: TrainGraphTypeLookup): TrainGraphTranslation {
  const reuseInstanceIDs: string[] = [];
  const warnings: string[] = [];
  const node = translateNode(graph, lookup, reuseInstanceIDs, warnings, 'root', 0);
  return { RootDriver: node.driver, Node: node, ReuseInstanceIDs: reuseInstanceIDs, Warnings: warnings };
}

/** Translate one node and, recursively, its children. */
function translateNode(
  source: ComponentGraphNode,
  lookup: TrainGraphTypeLookup,
  reuseInstanceIDs: string[],
  warnings: string[],
  path: string,
  depth: number,
): TrainComponentNode {
  if (depth > MAX_GRAPH_DEPTH) {
    throw new ComponentGraphTranslationError(
      `${path}: the composition nests more than ${MAX_GRAPH_DEPTH} levels deep, which almost certainly means it refers to itself.`,
    );
  }

  const type = lookup(source.ComponentTypeRef);
  if (!type) {
    throw new ComponentGraphTranslationError(
      `${path}: there is no component type named '${source.ComponentTypeRef}' in the tree.`,
    );
  }
  if (type.IsAbstract) {
    throw new ComponentGraphTranslationError(
      `${path}: '${type.Name}' is an abstract type — it names a place in the tree, not something that can be trained. Choose one of its concrete descendants.`,
    );
  }
  if (!type.DriverClass) {
    throw new ComponentGraphTranslationError(
      `${path}: '${type.Name}' has no DriverClass, so there is no runtime that can train it.`,
    );
  }
  if (type.Status === 'Deprecated') {
    warnings.push(`${path}: '${type.Name}' is deprecated; it still trains, but prefer its replacement.`);
  }

  const children = source.Children ?? [];

  if (source.ReuseInstanceID) {
    if (children.length > 0) {
      throw new ComponentGraphTranslationError(
        `${path}: '${type.Name}' both reuses an existing component and declares ${children.length} child component(s). A reused component arrives already trained, so its own composition is fixed — drop the children or drop the reuse.`,
      );
    }
    reuseInstanceIDs.push(source.ReuseInstanceID);
    return withSlot({ driver: type.DriverClass, reuse_instance_id: source.ReuseInstanceID }, source.SlotName, depth);
  }

  const node: TrainComponentNode = { driver: type.DriverClass };
  if (source.Params && Object.keys(source.Params).length > 0) {
    node.hyperparameters = source.Params;
  }
  if (children.length > 0) {
    node.children = children.map((child, i) =>
      translateNode(child, lookup, reuseInstanceIDs, warnings, `${path} › ${child.SlotName ?? `child ${i}`}`, depth + 1),
    );
  }
  return withSlot(node, source.SlotName, depth);
}

/**
 * Attach the parent slot a node fills.
 *
 * The root is dropped deliberately: it occupies no slot in anything, so a `SlotName` left on it by
 * a caller who lifted a subtree would otherwise be reported back in `component_states` as though
 * the model filled a position it does not.
 */
function withSlot(node: TrainComponentNode, slotName: string | undefined, depth: number): TrainComponentNode {
  if (slotName && depth > 0) {
    node.slot = slotName;
  }
  return node;
}
