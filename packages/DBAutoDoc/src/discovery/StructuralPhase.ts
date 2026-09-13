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
    summary: {
        transitiveBridgesFound: number;
        /** False when the phase declined to walk at all, with `skipReason` saying why. */
        walked: boolean;
        /** Set when `walked` is false. */
        skipReason?: 'disabled' | 'no-clusters' | 'no-edges';
        /** Set when a walk bound stopped the search before it was exhausted. */
        truncationReasons?: string[];
    };
}

export interface StructuralPhaseOptions {
    /**
     * Skip the phase outright. The organic keys themselves come from the SEMANTIC phase;
     * this phase only adds transitive bridge spokes, so a run can decline it and still
     * produce keys. That is the difference between a large schema emitting a reduced result
     * and a large schema emitting nothing.
     */
    skip?: boolean;
    /** Bounds handed to the graph walk. Omitted entries take the walker's own ceilings. */
    maxFrontier?: number;
    maxPathsPerPair?: number;
    maxTotalPaths?: number;
}

const EMPTY = (skipReason: 'disabled' | 'no-clusters' | 'no-edges'): StructuralPhaseResult => ({
    bridges: [],
    summary: { transitiveBridgesFound: 0, walked: false, skipReason },
});

export function runStructuralPhase(
    state: DatabaseDocumentation,
    clusters: OrganicKeyCluster[],
    opts: StructuralPhaseOptions = {},
): StructuralPhaseResult {
    if (opts.skip) {
        return EMPTY('disabled');
    }
    if (clusters.length === 0) {
        return EMPTY('no-clusters');
    }

    // GATE ON THE EDGE SET, NOT ON DECLARED FOREIGN KEYS. A state with no declared FKs can
    // still build a dense graph, because `collectFKEdgesFromState` also pulls the SOFT FKs
    // that the key-detection phase inferred — which on an imported schema is most of them.
    // So "does this database declare foreign keys?" is the wrong question; "does this state
    // yield any join edge at all?" is the one that decides whether there is a walk to do.
    const edges = collectFKEdgesFromState(state);
    if (edges.length === 0) {
        return EMPTY('no-edges');
    }

    // Only pass bounds the caller actually set: a spread of `{maxFrontier: undefined}` would
    // overwrite the walker's ceiling with undefined and un-bound the walk.
    const walkBounds: { maxFrontier?: number; maxPathsPerPair?: number; maxTotalPaths?: number } = {};
    if (opts.maxFrontier !== undefined) walkBounds.maxFrontier = opts.maxFrontier;
    if (opts.maxPathsPerPair !== undefined) walkBounds.maxPathsPerPair = opts.maxPathsPerPair;
    if (opts.maxTotalPaths !== undefined) walkBounds.maxTotalPaths = opts.maxTotalPaths;

    let truncationReasons: string[] | undefined;
    const bridges = detectTransitiveBridges(clusters, edges, state, {
        walkBounds,
        onTruncated: (reasons) => { truncationReasons = reasons; },
    });
    return {
        bridges,
        summary: {
            transitiveBridgesFound: bridges.length,
            walked: true,
            ...(truncationReasons ? { truncationReasons } : {}),
        },
    };
}
