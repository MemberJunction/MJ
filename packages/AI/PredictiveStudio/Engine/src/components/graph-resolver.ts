/**
 * @module components/graph-resolver
 *
 * Bridges the live component tree ({@link MLComponentEngine}) to the PURE graph validator in Core.
 *
 * The validator is deliberately provider-free — it takes three lookups as callbacks — so the exact
 * same rules run in the Studio UI against the browser's cached tree and on the server against the
 * engine's. This module is that adapter, and nothing more: no rules live here.
 */

import type { GraphComponentType, GraphResolver, GraphSlot, ComponentGraphNode, GraphValidationResult } from '@memberjunction/predictive-studio-core';
import { validateComponentGraph } from '@memberjunction/predictive-studio-core';

import { MLComponentEngine } from './ml-component-engine';
import type {
  ComponentSearchProfile,
  HyperparameterKnob,
  IComponentProfileSource,
} from '../experiment/component-combination-wave-strategist';

/**
 * Build a {@link GraphResolver} over a loaded {@link MLComponentEngine}.
 *
 * Slots come from `ResolveProfile`, not from the raw slot rows — a slot declared on `Structure` and
 * narrowed on `Stacking Wrapper` must reach the validator in its INHERITED, narrowed form, which is
 * exactly what the profile resolver produces.
 *
 * @param engine a `Config`-ed component engine (the caller awaits `Config` first)
 */
export function buildGraphResolver(engine: MLComponentEngine = MLComponentEngine.Instance): GraphResolver {
  return {
    FindTypeByName: (name: string): GraphComponentType | undefined => {
      const type = engine.FindTypeByName(name);
      return type ? { ID: type.ID, Name: type.Name, Kind: type.Kind, IsAbstract: type.IsAbstract } : undefined;
    },
    SlotsFor: (componentTypeID: string): GraphSlot[] =>
      engine.ResolveProfile(componentTypeID).Slots.map((s) => ({
        Name: s.Name,
        AcceptsComponentTypeID: s.AcceptsComponentTypeID,
        MinCount: s.MinCount,
        MaxCount: s.MaxCount,
      })),
    IsDescendantOf: (typeID: string, ancestorID: string): boolean => engine.IsDescendantOf(typeID, ancestorID),
  };
}

/**
 * Validate a proposed composition against the LIVE component tree.
 *
 * @param graph the proposed tree
 * @param engine a `Config`-ed component engine
 */
export function validateGraphAgainstTree(
  graph: ComponentGraphNode,
  engine: MLComponentEngine = MLComponentEngine.Instance,
): GraphValidationResult {
  return validateComponentGraph(graph, buildGraphResolver(engine));
}

/**
 * Adapt {@link MLComponentEngine} to the combination search's profile lookup: given an algorithm
 * NAME as a proposed experiment carries it, return the knobs its component type declares —
 * INHERITED, so XGBoost gets the boosting knobs from Boosting and the ensemble knobs from Tree
 * Ensemble without anyone restating them on the leaf.
 *
 * Returns `null` for an algorithm with no component type or no hyperparameter bank, which the
 * strategist reads as "nothing declared to search over" and leaves alone.
 */
export class ComponentEngineProfileSource implements IComponentProfileSource {
  /** @param engine a `Config`-ed component engine */
  constructor(private readonly engine: MLComponentEngine = MLComponentEngine.Instance) {}

  /** @inheritdoc */
  public profileFor(algorithmName: string): ComponentSearchProfile | null {
    const type = this.engine.FindTypeByName(algorithmName);
    if (!type) {
      return null;
    }
    let items: ReturnType<MLComponentEngine['ResolveProfile']>['Properties']['HyperparameterBank'];
    try {
      items = this.engine.ResolveProfile(type.ID).Properties.HyperparameterBank;
    } catch {
      // An unresolvable profile is a TREE problem the linter reports; the search simply has nothing
      // to vary rather than failing the session.
      return null;
    }
    if (!items || items.length === 0) {
      return null;
    }

    const knobs: HyperparameterKnob[] = [];
    for (const item of items) {
      const knob = toKnob(item.ItemKey, item.Value);
      if (knob) {
        knobs.push(knob);
      }
    }
    return knobs.length > 0 ? { Hyperparameters: knobs } : null;
  }
}

/**
 * Narrow one `HyperparameterBank` row's parsed value into a searchable knob. A row that declares no
 * range and no options is skipped: it documents that the knob EXISTS without saying what values are
 * reasonable, and inventing a range would be the search making up the family's own guidance.
 */
function toKnob(itemKey: string | null, value: unknown): HyperparameterKnob | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const v = value as { name?: unknown; range?: unknown; options?: unknown };
  const name = typeof v.name === 'string' && v.name.trim().length > 0 ? v.name.trim() : itemKey;
  if (!name) {
    return null;
  }
  const range =
    Array.isArray(v.range) && v.range.length === 2 && v.range.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? ([v.range[0], v.range[1]] as [number, number])
      : undefined;
  const options = Array.isArray(v.options) && v.options.length > 0 ? (v.options as Array<string | number | boolean>) : undefined;
  if (!range && !options) {
    return null;
  }
  return { Name: name, Range: range, Options: options };
}

