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
import { compose } from './Composer.js';
import { DetectedOrganicKeysOutput } from './OrganicKeyTranslator.js';

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
    };
}

export interface DetectorRunOptions {
    onProgress?: ProgressCallback;
}

export class OrganicKeyDetector {
    constructor(
        private readonly config: OrganicKeyDetectionConfig,
        private readonly aiConfig: AIConfig,
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
        const c = compose(a.clusters, b.bridges);
        progress(`compose: emitted ${c.emitted}/${a.clusters.length} clusters (${c.summary.outputKeys} keys, ${c.summary.outputSpokes} spokes)`);

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
            },
        };
    }

    private estimateCost(inputTokens: number, outputTokens: number): number {
        const pricing = this.aiConfig.pricing;
        if (!pricing) return 0;
        return (inputTokens / 1_000_000) * (pricing.inputCostPer1MTokens ?? 0)
             + (outputTokens / 1_000_000) * (pricing.outputCostPer1MTokens ?? 0);
    }
}
