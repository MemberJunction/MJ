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
    Summary: {
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
    Skip?: boolean;
    /** Bounds handed to the graph walk. Omitted entries take the walker's own ceilings. */
    MaxFrontier?: number;
    MaxPathsPerPair?: number;
    MaxTotalPaths?: number;
    /**
     * Platform of the analyzed database; the bridge-view SQL this phase emits is written in
     * its dialect. Carried in the options rather than as a third positional parameter so the
     * bounds above and the dialect stay one argument.
     */
    Provider?: BridgeViewProvider;
}

const EMPTY = (skipReason: 'disabled' | 'no-clusters' | 'no-edges'): StructuralPhaseResult => ({
    Bridges: [],
    Summary: { transitiveBridgesFound: 0, walked: false, skipReason },
});

export function RunStructuralPhase(
    state: DatabaseDocumentation,
    clusters: OrganicKeyCluster[],
    opts: StructuralPhaseOptions = {},
): StructuralPhaseResult {
    if (opts.Skip) {
        return EMPTY('disabled');
    }
    if (clusters.length === 0) {
        return EMPTY('no-clusters');
    }

    // GATE ON THE EDGE SET, NOT ON DECLARED FOREIGN KEYS. A state with no declared FKs can
    // still build a dense graph, because `CollectFKEdgesFromState` also pulls the SOFT FKs
    // that the key-detection phase inferred — which on an imported schema is most of them.
    // So "does this database declare foreign keys?" is the wrong question; "does this state
    // yield any join edge at all?" is the one that decides whether there is a walk to do.
    const edges = CollectFKEdgesFromState(state);
    if (edges.length === 0) {
        return EMPTY('no-edges');
    }

    // Only pass bounds the caller actually set: a spread of `{MaxFrontier: undefined}` would
    // overwrite the walker's ceiling with undefined and un-bound the walk.
    const walkBounds: { MaxFrontier?: number; MaxPathsPerPair?: number; MaxTotalPaths?: number } = {};
    if (opts.MaxFrontier !== undefined) walkBounds.MaxFrontier = opts.MaxFrontier;
    if (opts.MaxPathsPerPair !== undefined) walkBounds.MaxPathsPerPair = opts.MaxPathsPerPair;
    if (opts.MaxTotalPaths !== undefined) walkBounds.MaxTotalPaths = opts.MaxTotalPaths;

    let truncationReasons: string[] | undefined;
    const bridges = DetectTransitiveBridges(clusters, edges, state, {
        WalkBounds: walkBounds,
        OnTruncated: (reasons) => { truncationReasons = reasons; },
        ...(opts.Provider ? { provider: opts.Provider } : {}),
    });
    return {
        Bridges: bridges,
        Summary: {
            transitiveBridgesFound: bridges.length,
            walked: true,
            ...(truncationReasons ? { truncationReasons } : {}),
        },
    };
}

/** @deprecated Use {@link RunStructuralPhase}. */
export function runStructuralPhase(
    state: DatabaseDocumentation,
    clusters: OrganicKeyCluster[],
    opts: StructuralPhaseOptions = {},
): StructuralPhaseResult {
    return RunStructuralPhase(state, clusters, opts);
}
