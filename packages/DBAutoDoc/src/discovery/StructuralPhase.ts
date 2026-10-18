/**
 * Phase B — STRUCTURAL.
 *
 * Single responsibility: walk the FK graph from each cluster's hubs to find
 * tables reachable via 2-3 FK hops, and emit bridge view SQL for each.
 *
 * PR #2193's transitive-match pattern: when a value-bearing column lives on
 * table H and another table T doesn't carry the value directly but is
 * reachable via FK navigation, a bridge view exposes the value on T's join
 * path so the form can navigate.
 *
 * No scoring, no thresholds — just deterministic graph traversal.
 */

import { DatabaseDocumentation } from '../types/state.js';
import { OrganicKeyCluster } from '../types/organic-keys.js';
import {
    DetectTransitiveBridges,
    CollectFKEdgesFromState,
    TransitiveBridgeFinding,
} from './TransitiveBridgeDetector.js';
import { BridgeViewProvider } from './BridgeViewSQLGenerator.js';

export interface StructuralPhaseResult {
    Bridges: TransitiveBridgeFinding[];
    Summary: { transitiveBridgesFound: number };
}

/**
 * @param provider - Platform of the analyzed database; bridge-view SQL is written in its dialect.
 */
export function RunStructuralPhase(
    state: DatabaseDocumentation,
    clusters: OrganicKeyCluster[],
    provider?: BridgeViewProvider,
): StructuralPhaseResult {
    if (clusters.length === 0) {
        return { Bridges: [], Summary: { transitiveBridgesFound: 0 } };
    }
    const edges = CollectFKEdgesFromState(state);
    const bridges = DetectTransitiveBridges(clusters, edges, state, { provider });
    return { Bridges: bridges, Summary: { transitiveBridgesFound: bridges.length } };
}

/** @deprecated Use {@link RunStructuralPhase}. */
export function runStructuralPhase(
    state: DatabaseDocumentation,
    clusters: OrganicKeyCluster[],
    provider?: BridgeViewProvider,
): StructuralPhaseResult {
    return RunStructuralPhase(state, clusters, provider);
}
