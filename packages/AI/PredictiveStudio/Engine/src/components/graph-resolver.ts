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
