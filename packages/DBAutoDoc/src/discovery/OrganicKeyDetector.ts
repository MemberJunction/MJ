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
import { runSemanticPhase, ProgressCallback } from './SemanticPhase.js';
import { runStructuralPhase } from './StructuralPhase.js';
import { compose, ClusterVerification } from './Composer.js';
import { DetectedOrganicKeysOutput } from './OrganicKeyTranslator.js';
import { KeyVerifier } from './JoinProbe.js';

export interface OrganicKeyDetectionResult {
    clusters: OrganicKeyCluster[];
    output: DetectedOrganicKeysOutput;
    phase: OrganicKeyDetectionPhase;
    summary: {
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
    verification: ClusterVerification[];
}

export interface DetectorRunOptions {
    onProgress?: ProgressCallback;
}

/** Emit-time behaviour for the detector. */
export interface OrganicKeyEmitOptions {
    /**
     * Set `AutoCreateRelatedViewOnForm` on emitted keys. Default false — a
     * machine-proposed key should not silently create a grid per spoke on every form.
     */
    autoCreateRelatedViewOnForm?: boolean;
}

export class OrganicKeyDetector {
    /**
     * @param keyVerifier - Probes each cluster member against the cluster anchor before
     *                      the key is emitted. Pass the SAME instance the analysis engine
     *                      got, so one probe budget covers the whole run. When null, keys
     *                      are emitted unverified — the previous behaviour — and the
     *                      per-cluster record says they were never checked.
     */
    constructor(
        private readonly config: OrganicKeyDetectionConfig,
        private readonly aiConfig: AIConfig,
        private readonly keyVerifier: KeyVerifier | null = null,
        private readonly emitOptions: OrganicKeyEmitOptions = {},
    ) {}

    public async detect(
        state: DatabaseDocumentation,
        opts: DetectorRunOptions = {},
    ): Promise<OrganicKeyDetectionResult> {
        const progress = opts.onProgress ?? (() => {});
        const startedAt = new Date().toISOString();

        const a = await runSemanticPhase(state, this.config, this.aiConfig, progress);
        const b = runStructuralPhase(state, a.clusters);
        progress(`structural: ${b.summary.transitiveBridgesFound} bridges`);
        const c = await compose(a.clusters, b.bridges, this.keyVerifier, {
            autoCreateRelatedViewOnForm: this.emitOptions.autoCreateRelatedViewOnForm,
        });
        // Report what the probe removed, not just what survived: "emitted 5 clusters" and
        // "emitted 5 of 161, 156 refuted" are the same output and completely different
        // facts about the schema.
        const budget = this.keyVerifier ? this.keyVerifier.budget : null;
        progress(
            `compose: emitted ${c.emitted}/${a.clusters.length} clusters (${c.summary.outputKeys} keys, ${c.summary.outputSpokes} spokes)`
            + (budget
                ? `; probe refuted ${c.droppedUnverified} clusters and ${c.droppedMembers} members using ${budget.probesUsed}/${budget.probesAllowed} probes`
                : '; keys NOT verified (no probe configured)')
        );

        // Net additional clusters produced by the concept-name split (sub-clusters created
        // beyond the raw clusterer output, counting both kept and dropped sub-clusters).
        const splitClusterCount = Math.max(
            0,
            a.summary.clustersFound + a.summary.clustersDropped - a.summary.clustersBeforeSplit,
        );

        return {
            clusters: c.annotatedClusters,
            output: c.output,
            phase: {
                triggered: true,
                startedAt,
                completedAt: new Date().toISOString(),
                status: 'completed',
                candidateClusterCount: a.clusters.length,
                confirmedClusterCount: c.emitted,
                rejectedClusterCount: a.summary.columnsRejectedByNormalizer,
                splitClusterCount,
                tokensUsed: a.tokens.total,
                inputTokens: a.tokens.input,
                outputTokens: a.tokens.output,
                estimatedCost: this.estimateCost(a.tokens.input, a.tokens.output),
                refinementModelUsed: this.aiConfig.model,
            },
            summary: {
                columnsInScope: a.summary.columnsInScope,
                columnsNormalized: a.summary.columnsNormalized,
                columnsRejectedByNormalizer: a.summary.columnsRejectedByNormalizer,
                clustersFound: a.clusters.length,
                clustersEmitted: c.emitted,
                clustersDropped: a.summary.clustersDropped,
                outputSchemas: c.summary.outputSchemas,
                outputTables: c.summary.outputTables,
                outputKeys: c.summary.outputKeys,
                outputSpokes: c.summary.outputSpokes,
                transitiveBridges: b.summary.transitiveBridgesFound,
                clustersDroppedUnverified: c.droppedUnverified,
                membersDroppedUnverified: c.droppedMembers,
                probesUsed: budget ? budget.probesUsed : 0,
                probesAllowed: budget ? budget.probesAllowed : 0,
            },
            verification: c.verification,
        };
    }

    private estimateCost(inputTokens: number, outputTokens: number): number {
        const pricing = this.aiConfig.pricing;
        if (!pricing) return 0;
        return (inputTokens / 1_000_000) * (pricing.inputCostPer1MTokens ?? 0)
             + (outputTokens / 1_000_000) * (pricing.outputCostPer1MTokens ?? 0);
    }
}
