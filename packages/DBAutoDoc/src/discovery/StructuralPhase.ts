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
    detectTransitiveBridges,
    collectFKEdgesFromState,
    TransitiveBridgeFinding,
} from './TransitiveBridgeDetector.js';

export interface StructuralPhaseResult {
    bridges: TransitiveBridgeFinding[];
    summary: { transitiveBridgesFound: number };
}

export function runStructuralPhase(
    state: DatabaseDocumentation,
    clusters: OrganicKeyCluster[],
): StructuralPhaseResult {
    if (clusters.length === 0) {
        return { bridges: [], summary: { transitiveBridgesFound: 0 } };
    }
    const edges = collectFKEdgesFromState(state);
    const bridges = detectTransitiveBridges(clusters, edges, state);
    return { bridges, summary: { transitiveBridgesFound: bridges.length } };
}
