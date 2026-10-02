/**
 * OrganicKeyDetector — the thin orchestrator.
 *
 *   1. SemanticPhase    LLM identifies organic-key concept per column,
 *                       groups columns by canonical concept name into clusters
 *                       spanning ≥2 distinct tables.
 *
 *   2. StructuralPhase  Walks the FK graph from each cluster's hubs to find
 *                       reachable tables 2-3 hops away → bridge view SQL.
 *
 *   3. Composer         Drops fk-redundant clusters (already navigable via
 *                       declared FK per PR #2193), attaches matching bridges,
 *                       emits PR #2193 JSON.
 *
 * No knobs. The LLM is the algorithm; the graph is deterministic; the filter
 * is the one PR #2193 explicitly defines.
 */

import { AIConfig, OrganicKeyDetectionConfig } from '../types/config.js';
import { DatabaseDocumentation } from '../types/state.js';
import { OrganicKeyCluster, OrganicKeyDetectionPhase } from '../types/organic-keys.js';
import { RunSemanticPhase, ProgressCallback } from './SemanticPhase.js';
import { RunStructuralPhase } from './StructuralPhase.js';
import { BridgeViewProvider } from './BridgeViewSQLGenerator.js';
import { Compose, ClusterVerification } from './Composer.js';
import { DetectedOrganicKeysOutput } from './OrganicKeyTranslator.js';
import { KeyVerifier } from './JoinProbe.js';

export interface OrganicKeyDetectionResult {
    clusters: OrganicKeyCluster[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    output: DetectedOrganicKeysOutput;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    Phase: OrganicKeyDetectionPhase;
    Summary: {
        columnsInScope: number;
        columnsNormalized: number;
        columnsRejectedByNormalizer: number;
        clustersFound: number;
        clustersEmitted: number;
        clustersDropped: number;
        outputSchemas: number;
        outputTables: number;
        outputKeys: number;
        outputSpokes: number;
        transitiveBridges: number;
        /** Clusters the value-overlap probe refuted outright. */
        clustersDroppedUnverified: number;
        /** Members dropped for not sharing the anchor's value space. */
        membersDroppedUnverified: number;
        /** Probes spent, and the cap they ran under. */
        probesUsed: number;
        probesAllowed: number;
    };
    /** Per-cluster probe record, so a dropped key can be explained rather than just missing. */
    Verification: ClusterVerification[];
}

export interface DetectorRunOptions {
    OnProgress?: ProgressCallback;
}

/** Emit-time behaviour for the detector. */
export interface OrganicKeyEmitOptions {
    /**
     * Set `AutoCreateRelatedViewOnForm` on emitted keys. Default false — a
     * machine-proposed key should not silently create a grid per spoke on every form.
     */
    AutoCreateRelatedViewOnForm?: boolean;
}

export class OrganicKeyDetector {
    /**
     * @param databaseProvider - Platform of the analyzed database. Bridge-view SQL is emitted in
     *                           its dialect because CodeGen executes it verbatim. Default SQL Server.
     * @param keyVerifier - Probes each cluster member against the cluster anchor before
     *                      the key is emitted. Pass the SAME instance the analysis engine
     *                      got, so one probe budget covers the whole run. When null, keys
     *                      are emitted unverified — the previous behaviour — and the
     *                      per-cluster record says they were never checked.
     */
    constructor(
        private readonly config: OrganicKeyDetectionConfig,
        private readonly aiConfig: AIConfig,
        private readonly databaseProvider?: BridgeViewProvider,
        private readonly keyVerifier: KeyVerifier | null = null,
        private readonly emitOptions: OrganicKeyEmitOptions = {},
    ) {}

    public async Detect(
        state: DatabaseDocumentation,
        opts: DetectorRunOptions = {},
    ): Promise<OrganicKeyDetectionResult> {
        const progress = opts.OnProgress ?? (() => {});
        const startedAt = new Date().toISOString();

        const a = await RunSemanticPhase(state, this.config, this.aiConfig, progress);
        const b = RunStructuralPhase(state, a.clusters, this.databaseProvider);
        progress(`structural: ${b.Summary.transitiveBridgesFound} bridges`);
        const c = await Compose(a.clusters, b.Bridges, this.keyVerifier, {
            AutoCreateRelatedViewOnForm: this.emitOptions.AutoCreateRelatedViewOnForm,
        });
        // Report what the probe removed, not just what survived: "emitted 5 clusters" and
        // "emitted 5 of 161, 156 refuted" are the same output and completely different
        // facts about the schema.
        const budget = this.keyVerifier ? this.keyVerifier.Budget : null;
        progress(
            `compose: emitted ${c.Emitted}/${a.clusters.length} clusters (${c.Summary.outputKeys} keys, ${c.Summary.outputSpokes} spokes)`
            + (budget
                ? `; probe refuted ${c.DroppedUnverified} clusters and ${c.DroppedMembers} members using ${budget.ProbesUsed}/${budget.ProbesAllowed} probes`
                : '; keys NOT verified (no probe configured)')
        );

        // Net additional clusters produced by the concept-name split (sub-clusters created
        // beyond the raw clusterer output, counting both kept and dropped sub-clusters).
        const splitClusterCount = Math.max(
            0,
            a.Summary.clustersFound + a.Summary.clustersDropped - a.Summary.clustersBeforeSplit,
        );

        return {
            clusters: c.AnnotatedClusters,
            output: c.output,
            Phase: {
                triggered: true,
                startedAt,
                completedAt: new Date().toISOString(),
                status: 'completed',
                candidateClusterCount: a.clusters.length,
                confirmedClusterCount: c.Emitted,
                rejectedClusterCount: a.Summary.columnsRejectedByNormalizer,
                splitClusterCount,
                tokensUsed: a.tokens.total,
                inputTokens: a.tokens.input,
                outputTokens: a.tokens.output,
                estimatedCost: this.estimateCost(a.tokens.input, a.tokens.output),
                refinementModelUsed: this.aiConfig.model,
            },
            Summary: {
                columnsInScope: a.Summary.columnsInScope,
                columnsNormalized: a.Summary.columnsNormalized,
                columnsRejectedByNormalizer: a.Summary.columnsRejectedByNormalizer,
                clustersFound: a.clusters.length,
                clustersEmitted: c.Emitted,
                clustersDropped: a.Summary.clustersDropped,
                outputSchemas: c.Summary.outputSchemas,
                outputTables: c.Summary.outputTables,
                outputKeys: c.Summary.outputKeys,
                outputSpokes: c.Summary.outputSpokes,
                transitiveBridges: b.Summary.transitiveBridgesFound,
                clustersDroppedUnverified: c.DroppedUnverified,
                membersDroppedUnverified: c.DroppedMembers,
                probesUsed: budget ? budget.ProbesUsed : 0,
                probesAllowed: budget ? budget.ProbesAllowed : 0,
            },
            Verification: c.Verification,
        };
    }

    /** @deprecated Use {@link Detect}. */
    public async detect(
        state: DatabaseDocumentation,
        opts: DetectorRunOptions = {},
    ): Promise<OrganicKeyDetectionResult> {
        return this.Detect(state, opts);
    }

    private estimateCost(inputTokens: number, outputTokens: number): number {
        const pricing = this.aiConfig.pricing;
        if (!pricing) return 0;
        return (inputTokens / 1_000_000) * (pricing.inputCostPer1MTokens ?? 0)
             + (outputTokens / 1_000_000) * (pricing.outputCostPer1MTokens ?? 0);
    }
}
