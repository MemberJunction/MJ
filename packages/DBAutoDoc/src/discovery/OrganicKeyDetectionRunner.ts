/**
 * Organic Key Detection Runner
 *
 * Orchestration helper that wires the {@link OrganicKeyClusterDetector} and
 * {@link OrganicKeyClusterRefiner} into DBAutoDoc's analysis pipeline. Reads
 * column metadata from the populated state, runs detection, optionally invokes
 * LLM refinement, and writes results back into:
 *   - `state.organicKeyClusters` (deliverable)
 *   - `state.phases.organicKeyDetection` (phase tracking)
 */

import { AIConfig, OrganicKeyDetectionConfig } from '../types/config.js';
import { DatabaseDocumentation } from '../types/state.js';
import {
    DEFAULT_HYBRID_WEIGHTS,
    DEFAULT_THRESHOLDS,
    OrganicKeyCluster,
    OrganicKeyDetectionPhase,
    HybridDistanceWeights,
    ClusteringThresholds,
} from '../types/organic-keys.js';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { DetectorInputColumn, OrganicKeyClusterDetector } from './OrganicKeyClusterDetector.js';
import { OrganicKeyClusterRefiner } from './OrganicKeyClusterRefiner.js';
import { createEmbeddingProvider } from './EmbeddingProvider.js';
import { EmbeddingCache } from './EmbeddingCache.js';
import { ConceptMergePass } from './ConceptMergePass.js';
import { SemanticClusterExpander } from './SemanticClusterExpander.js';
import { MissingConceptsDetector } from './MissingConceptsDetector.js';
import { BusinessConceptProjector } from './BusinessConceptProjector.js';
import { ValueOverlapSampler } from './ValueOverlapSampler.js';
import { MinHashSignature } from './MinHashSketch.js';

export interface RunnerOptions {
    /** Optional progress callback for long-running operations. */
    onProgress?: (message: string) => void;
    /**
     * Path to the embedding cache file. When provided, embeddings are persisted
     * across runs and only newly-encountered descriptors get fetched from the
     * provider. Typically passed as `<outputDir>/embedding-cache.json` so it
     * sits alongside state.json.
     */
    embeddingCachePath?: string;
}

export class OrganicKeyDetectionRunner {
    constructor(
        private readonly config: OrganicKeyDetectionConfig,
        private readonly aiConfig?: AIConfig,
        private readonly driver?: BaseAutoDocDriver,
    ) {}

    /** Embedding cache instance, lazily created when embeddingCachePath is set. */
    private embeddingCache: EmbeddingCache | null = null;

    /**
     * Run organic key detection against the populated state.
     * On success, writes `state.organicKeyClusters` and `state.phases.organicKeyDetection`.
     */
    public async run(state: DatabaseDocumentation, opts: RunnerOptions = {}): Promise<void> {
        const startedAt = new Date().toISOString();
        const progress = opts.onProgress ?? (() => {});

        if (!this.config.enabled) {
            this.writePhase(state, {
                triggered: false,
                startedAt,
                completedAt: new Date().toISOString(),
                status: 'skipped',
                candidateClusterCount: 0,
                confirmedClusterCount: 0,
                rejectedClusterCount: 0,
                splitClusterCount: 0,
                tokensUsed: 0,
                inputTokens: 0,
                outputTokens: 0,
                estimatedCost: 0,
                weights: { ...DEFAULT_HYBRID_WEIGHTS },
                thresholds: { ...DEFAULT_THRESHOLDS },
                skipReason: 'organicKeyDetection.enabled = false',
            });
            return;
        }

        // ─── Step 1: Build input column set ─────────────────────────────────
        progress('Organic keys — gathering columns');
        const columns = this.buildInputColumns(state);

        if (columns.length === 0) {
            this.writePhase(state, {
                triggered: true,
                startedAt,
                completedAt: new Date().toISOString(),
                status: 'skipped',
                candidateClusterCount: 0,
                confirmedClusterCount: 0,
                rejectedClusterCount: 0,
                splitClusterCount: 0,
                tokensUsed: 0,
                inputTokens: 0,
                outputTokens: 0,
                estimatedCost: 0,
                weights: { ...DEFAULT_HYBRID_WEIGHTS },
                thresholds: { ...DEFAULT_THRESHOLDS },
                skipReason: 'No columns available for clustering',
            });
            state.organicKeyClusters = [];
            return;
        }

        // ─── Step 2: Compute optional signals (embeddings + MinHash) ────────
        const embeddingActive =
            !!this.config.embedding?.enabled && !!this.aiConfig?.apiKey;
        const minHashActive = !!this.config.minHash?.enabled && !!this.driver;

        // Lazily instantiate the embedding cache if a path was provided.
        if (embeddingActive && opts.embeddingCachePath) {
            this.embeddingCache = new EmbeddingCache(opts.embeddingCachePath);
            await this.embeddingCache.load();
        }

        if (embeddingActive) {
            progress(`Organic keys — computing embeddings for ${columns.length} columns`);
            await this.attachEmbeddings(columns, progress);
        }
        if (minHashActive) {
            progress(`Organic keys — sampling values for MinHash signatures`);
            await this.attachValueSignatures(columns, progress);
        }

        // ─── Step 3: Determine active distance weights based on config + signal availability ───
        const weights = this.resolveWeights(embeddingActive, minHashActive);
        const thresholds = this.resolveThresholds();

        // ─── Step 4: Run clustering ─────────────────────────────────────────
        progress(`Organic keys — clustering ${columns.length} columns`);
        const detector = new OrganicKeyClusterDetector({ weights, thresholds });
        let candidates = detector.detect(columns);

        // ─── Step 4b: Business-concept gate (drop audit/system clusters pre-refinement) ───
        let gatedAway = 0;
        if (
            this.config.businessGate?.enabled &&
            embeddingActive &&
            this.aiConfig &&
            candidates.length > 0
        ) {
            try {
                const gateThreshold = this.config.businessGate.threshold ?? 0.05;
                const provider = createEmbeddingProvider({
                    provider: this.aiConfig.provider,
                    apiKey: this.aiConfig.apiKey,
                    model: this.config.embedding?.model ?? 'gemini-embedding-001',
                    dimensions: this.config.embedding?.dimensions,
                    batchSize: this.config.embedding?.batchSize,
                });
                const projector = await BusinessConceptProjector.build(provider, {
                    anchors: this.config.embedding?.customBusinessAnchors,
                    additionalAnchors: this.config.embedding?.additionalBusinessAnchors,
                });
                const indexByKey = new Map(
                    columns.map((c, i) => [`${c.schema}.${c.table}.${c.column}`, i]),
                );
                const before = candidates.length;
                candidates = candidates.filter((cluster) => {
                    const memberEmbeddings: Float32Array[] = [];
                    for (const m of cluster.members) {
                        const idx = indexByKey.get(`${m.schema}.${m.table}.${m.column}`);
                        if (idx === undefined) continue;
                        const emb = columns[idx].embedding;
                        if (emb) memberEmbeddings.push(emb instanceof Float32Array ? emb : Float32Array.from(emb));
                    }
                    if (memberEmbeddings.length === 0) return true; // keep — can't score
                    const score = projector.scoreCluster(memberEmbeddings);
                    return score.antiScore - score.businessScore <= gateThreshold;
                });
                gatedAway = before - candidates.length;
                if (gatedAway > 0) {
                    progress(
                        `Organic keys — business gate dropped ${gatedAway} clusters (threshold ${gateThreshold})`,
                    );
                }
            } catch (err) {
                progress(
                    `Organic keys — business gate skipped due to error: ${(err as Error).message}`,
                );
            }
        }

        let refinementEnabled =
            (this.config.refinement?.enabled ?? !!this.aiConfig) && !!this.aiConfig;

        // ─── Step 5: Optional LLM refinement ────────────────────────────────
        let confirmed: OrganicKeyCluster[] = candidates;
        let rejected = 0;
        let split = 0;
        let errors = 0;
        let tokensUsed = 0;
        let inputTokens = 0;
        let outputTokens = 0;

        if (refinementEnabled && this.aiConfig && candidates.length > 0) {
            progress(`Organic keys — refining ${candidates.length} candidate clusters via LLM`);
            try {
                const refiner = new OrganicKeyClusterRefiner(this.aiConfig);
                const descriptions = this.buildDescriptionsMap(state);
                const result = await refiner.refineAll(candidates, descriptions, {
                    concurrency: this.config.refinement?.concurrency ?? 4,
                });
                confirmed = result.confirmed;
                rejected = result.rejected;
                split = result.split;
                errors = result.errors;
                tokensUsed = result.tokens.total;
                inputTokens = result.tokens.input;
                outputTokens = result.tokens.output;
            } catch (err) {
                progress(`Organic keys — refinement failed: ${(err as Error).message}. Keeping unrefined candidates.`);
                refinementEnabled = false;
                errors = 1;
            }
        }

        // ─── Step 5a: Convergence loop — expansion + missing-concepts ───────
        // Iterate expansion (grow existing clusters by K-NN+LLM) and
        // missing-concepts (LLM discovers concepts the refiner rejected) until
        // the KEEP set stabilizes. Mirrors DBAutoDoc's convergence detection.
        const expansionEnabled =
            this.config.semanticExpansion?.enabled !== false &&
            refinementEnabled &&
            this.aiConfig &&
            embeddingActive &&
            confirmed.length > 0;
        const missingEnabled =
            this.config.missingConcepts?.enabled !== false &&
            refinementEnabled &&
            this.aiConfig &&
            embeddingActive;
        const convergenceEnabled = this.config.convergence?.enabled !== false;
        const maxIter = convergenceEnabled
            ? this.config.convergence?.maxIterations ?? 3
            : 1;

        let totalExpandedColumns = 0;
        let totalDiscoveredConcepts = 0;
        let convergedAtIteration: number | null = null;

        if ((expansionEnabled || missingEnabled) && confirmed.length > 0) {
            const descriptions = this.buildDescriptionsMap(state);
            const expander = expansionEnabled ? new SemanticClusterExpander(this.aiConfig!) : null;
            const provider = (expansionEnabled || missingEnabled)
                ? createEmbeddingProvider({
                      provider: this.aiConfig!.provider,
                      apiKey: this.aiConfig!.apiKey,
                      model: this.config.embedding?.model ?? 'gemini-embedding-001',
                      dimensions: this.config.embedding?.dimensions,
                      batchSize: this.config.embedding?.batchSize,
                  })
                : null;
            const missingDetector = missingEnabled && provider
                ? new MissingConceptsDetector(this.aiConfig!, provider)
                : null;

            for (let iter = 0; iter < maxIter; iter++) {
                const beforeKeepCount = confirmed.length;
                const beforeMemberCount = totalMemberCount(confirmed);

                // Expansion
                if (expander) {
                    progress(
                        `Organic keys — iteration ${iter + 1}/${maxIter}: expansion over ${confirmed.length} clusters`,
                    );
                    try {
                        const result = await expander.expandAll(confirmed, columns, descriptions, {
                            topK: this.config.semanticExpansion?.topK,
                            similarityFloor: this.config.semanticExpansion?.similarityFloor,
                            concurrency: this.config.semanticExpansion?.concurrency,
                        });
                        totalExpandedColumns += result.addedMemberCount;
                        tokensUsed += result.tokensUsed;
                        inputTokens += result.inputTokens;
                        outputTokens += result.outputTokens;
                        if (result.addedMemberCount > 0) {
                            progress(
                                `Organic keys — iter ${iter + 1} expansion: +${result.addedMemberCount} cols across ${result.perCluster.filter((c) => c.outcome === 'expanded').length} clusters`,
                            );
                        }
                    } catch (err) {
                        progress(`Organic keys — iter ${iter + 1} expansion skipped: ${(err as Error).message}`);
                    }
                }

                // Missing-concepts discovery
                if (missingDetector) {
                    progress(`Organic keys — iter ${iter + 1}: missing-concepts discovery`);
                    try {
                        const result = await missingDetector.findAndExpand(
                            confirmed,
                            columns,
                            descriptions,
                            {
                                maxConcepts: this.config.missingConcepts?.maxConcepts,
                                topK: this.config.missingConcepts?.topK,
                                similarityFloor: this.config.missingConcepts?.similarityFloor,
                                residualSampleSize: this.config.missingConcepts?.residualSampleSize,
                            },
                        );
                        for (const c of result.newClusters) confirmed.push(c);
                        totalDiscoveredConcepts += result.newClusters.length;
                        tokensUsed += result.tokensUsed;
                        inputTokens += result.inputTokens;
                        outputTokens += result.outputTokens;
                        if (result.newClusters.length > 0) {
                            const conceptNames = result.newClusters.map((c) => c.concept).join(', ');
                            progress(
                                `Organic keys — iter ${iter + 1} discovery: +${result.newClusters.length} new clusters [${conceptNames}]`,
                            );
                        }
                    } catch (err) {
                        progress(`Organic keys — iter ${iter + 1} discovery skipped: ${(err as Error).message}`);
                    }
                }

                const afterKeepCount = confirmed.length;
                const afterMemberCount = totalMemberCount(confirmed);
                if (
                    convergenceEnabled &&
                    afterKeepCount === beforeKeepCount &&
                    afterMemberCount === beforeMemberCount
                ) {
                    convergedAtIteration = iter + 1;
                    progress(`Organic keys — converged after iteration ${iter + 1} (no changes)`);
                    break;
                }
            }
        }
        // Telemetry (not currently surfaced into the phase; suppresses unused warning).
        void totalExpandedColumns;
        void totalDiscoveredConcepts;
        void convergedAtIteration;

        // ─── Step 5b: Concept-merge pass (consolidate same-concept KEEPs) ───
        let mergedAway = 0;
        if (
            this.config.conceptMerge?.enabled !== false &&
            refinementEnabled &&
            this.aiConfig &&
            confirmed.length > 1
        ) {
            progress(`Organic keys — concept-merge pass over ${confirmed.length} KEEPs`);
            try {
                const mergePass = new ConceptMergePass(this.aiConfig);
                const mergeResult = await mergePass.mergeAll(confirmed);
                if (mergeResult.mergedAwayCount > 0) {
                    progress(
                        `Organic keys — concept-merge: ${confirmed.length} → ${mergeResult.clusters.length} (${mergeResult.mergedAwayCount} merged away)`,
                    );
                }
                confirmed = mergeResult.clusters;
                mergedAway = mergeResult.mergedAwayCount;
                tokensUsed += mergeResult.tokensUsed;
                inputTokens += mergeResult.inputTokens;
                outputTokens += mergeResult.outputTokens;
            } catch (err) {
                progress(`Organic keys — concept-merge skipped due to error: ${(err as Error).message}`);
            }
        }

        // ─── Step 6: Estimate cost ──────────────────────────────────────────
        const estimatedCost = this.estimateCost(inputTokens, outputTokens);

        // ─── Step 7: Persist results ────────────────────────────────────────
        state.organicKeyClusters = confirmed;
        const cacheStats = this.embeddingCache?.stats();
        this.writePhase(state, {
            triggered: true,
            triggerReason: this.config.enabled ? 'config.organicKeyDetection.enabled' : undefined,
            startedAt,
            completedAt: new Date().toISOString(),
            status: 'completed',
            candidateClusterCount: candidates.length + gatedAway,
            confirmedClusterCount: confirmed.length,
            rejectedClusterCount: rejected,
            splitClusterCount: split,
            gatedClusterCount: gatedAway,
            mergedClusterCount: mergedAway,
            embeddingCache: cacheStats
                ? {
                      hits: cacheStats.hits,
                      misses: cacheStats.misses,
                      entries: cacheStats.entries,
                      cachePath: cacheStats.cachePath,
                  }
                : undefined,
            tokensUsed,
            inputTokens,
            outputTokens,
            estimatedCost,
            weights,
            thresholds,
            embeddingModelUsed: this.config.embedding?.enabled ? this.config.embedding.model : undefined,
            refinementModelUsed: refinementEnabled
                ? this.config.refinement?.model ?? this.aiConfig?.model
                : undefined,
            errorMessage: errors > 0 ? `${errors} cluster refinement errors` : undefined,
        });
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    private buildInputColumns(state: DatabaseDocumentation): DetectorInputColumn[] {
        const fkColumns = this.buildFKLookup(state);
        const out: DetectorInputColumn[] = [];
        const excludeMatchers = compileTableExcludePatterns(this.config.excludeTablePatterns);

        for (const schema of state.schemas) {
            for (const table of schema.tables) {
                if (tableMatchesAnyPattern(table.name, excludeMatchers)) continue;
                for (const col of table.columns) {
                    const key = `${schema.name}.${table.name}.${col.name}`;
                    const fk = fkColumns.get(key);
                    out.push({
                        schema: schema.name,
                        table: table.name,
                        column: col.name,
                        dataType: col.dataType,
                        description: col.description ?? col.userDescription ?? '',
                        isPrimaryKey: !!col.isPrimaryKey,
                        participatesInFK: !!col.isForeignKey || !!fk,
                        fkTarget: fk
                            ? { schema: fk.targetSchema, table: fk.targetTable, column: fk.targetColumn }
                            : col.foreignKeyReferences
                              ? {
                                    schema: col.foreignKeyReferences.schema,
                                    table: col.foreignKeyReferences.table,
                                    column: col.foreignKeyReferences.referencedColumn,
                                }
                              : null,
                    });
                }
            }
        }
        return out;
    }

    private buildFKLookup(state: DatabaseDocumentation): Map<
        string,
        { targetSchema: string; targetTable: string; targetColumn: string }
    > {
        const map = new Map<
            string,
            { targetSchema: string; targetTable: string; targetColumn: string }
        >();
        const fks = state.phases?.keyDetection?.discovered?.foreignKeys ?? [];
        for (const fk of fks) {
            const key = `${fk.schemaName}.${fk.sourceTable}.${fk.sourceColumn}`;
            map.set(key, {
                targetSchema: fk.targetSchema,
                targetTable: fk.targetTable,
                targetColumn: fk.targetColumn,
            });
        }
        return map;
    }

    private buildDescriptionsMap(state: DatabaseDocumentation): Map<string, string> {
        const map = new Map<string, string>();
        for (const schema of state.schemas) {
            for (const table of schema.tables) {
                for (const col of table.columns) {
                    const key = `${schema.name}.${table.name}.${col.name}`;
                    const desc = col.description ?? col.userDescription ?? '';
                    if (desc) map.set(key, desc);
                }
            }
        }
        return map;
    }

    private resolveWeights(
        embeddingActive: boolean,
        minHashActive: boolean,
    ): HybridDistanceWeights {
        const cfg = this.config.weights ?? {};
        return {
            nameSimilarity: cfg.nameSimilarity ?? DEFAULT_HYBRID_WEIGHTS.nameSimilarity,
            embeddingDistance: embeddingActive
                ? cfg.embeddingDistance ?? DEFAULT_HYBRID_WEIGHTS.embeddingDistance
                : 0,
            valueOverlap: minHashActive
                ? cfg.valueOverlap ?? DEFAULT_HYBRID_WEIGHTS.valueOverlap
                : 0,
        };
    }

    /**
     * Generate embeddings for each column's descriptor and attach to the column record.
     *
     * By default, embeddings are projected through business-concept anchors (per PR #2193
     * organic key definition) before being attached to the column. This makes business-
     * meaningful concepts dominate the clustering space and pushes non-business clusters
     * (audit timestamps, replication GUIDs) into a region of the space where they don't
     * resemble organic key candidates.
     *
     * Raw embeddings can be requested via `embedding.useBusinessProjection: false` for
     * debugging or comparison runs.
     */
    private async attachEmbeddings(
        columns: DetectorInputColumn[],
        progress: (msg: string) => void,
    ): Promise<void> {
        if (!this.aiConfig || !this.config.embedding?.enabled) return;
        try {
            const model = this.config.embedding.model ?? 'gemini-embedding-001';
            const dimensions = this.config.embedding.dimensions ?? 1536;
            const provider = createEmbeddingProvider({
                provider: this.aiConfig.provider,
                apiKey: this.aiConfig.apiKey,
                model,
                dimensions,
                batchSize: this.config.embedding.batchSize,
            });
            const texts = columns.map(
                (c) =>
                    `Column ${c.schema}.${c.table}.${c.column}. ${c.description ?? ''}`.trim(),
            );

            // Use the embedding cache when available — only missing descriptors hit the provider.
            let rawVectors: Float32Array[];
            if (this.embeddingCache) {
                const keys = texts.map((text) => ({ model, dimensions, text }));
                rawVectors = await this.embeddingCache.getOrFill(keys, (missing) =>
                    provider.embed(missing.map((k) => k.text)),
                );
                const stats = this.embeddingCache.stats();
                progress(
                    `Organic keys — embedding cache: ${stats.hits} hits, ${stats.misses} misses (${stats.entries} entries)`,
                );
            } else {
                rawVectors = await provider.embed(texts);
            }

            // Empirically, projection into a small business-concept space over-merges
            // distinct business concepts (e.g. BusinessEntityID and ProductID both project
            // similarly onto "business identifier" axis and collapse into one mega-cluster).
            // Raw embeddings preserve cross-concept discrimination. Projection is kept as an
            // opt-in (e.g. as a future post-filter / gate) but defaults to off.
            // See validation results in tools/organic-key-cluster-poc/compare-projection-modes.mjs.
            const useProjection = this.config.embedding.useBusinessProjection === true;
            if (useProjection) {
                const projector = await BusinessConceptProjector.build(provider, {
                    anchors: this.config.embedding.customBusinessAnchors,
                    additionalAnchors: this.config.embedding.additionalBusinessAnchors,
                });
                const projected = projector.projectAll(rawVectors);
                for (let i = 0; i < columns.length; i++) {
                    columns[i].embedding = projected[i];
                }
            } else {
                for (let i = 0; i < columns.length; i++) {
                    columns[i].embedding = rawVectors[i];
                }
            }
        } catch (err) {
            throw new Error(`Embedding generation failed: ${(err as Error).message}`);
        }
    }

    /**
     * Sample values per column via the DB driver and attach MinHash signatures.
     */
    private async attachValueSignatures(
        columns: DetectorInputColumn[],
        progress: (msg: string) => void,
    ): Promise<void> {
        if (!this.driver || !this.config.minHash?.enabled) return;
        const sampler = new ValueOverlapSampler(this.driver);
        const sampleSize = this.config.minHash.sampleSize ?? 500;
        const numHashes = this.config.minHash.numHashes ?? 128;
        const signatures = await sampler.sampleAll(
            columns.map((c) => ({
                schema: c.schema,
                table: c.table,
                column: c.column,
                dataType: c.dataType,
            })),
            {
                sampleSize,
                numHashes,
                onProgress: (sampled, total, current) => {
                    if (sampled % 50 === 0) progress(`Organic keys — sampled ${sampled}/${total} (${current})`);
                },
            },
        );
        for (const col of columns) {
            const key = `${col.schema}.${col.table}.${col.column}`;
            const sig = signatures.get(key);
            if (sig) col.valueSignature = sig;
        }
    }

    private resolveThresholds(): ClusteringThresholds {
        const t = this.config.thresholds ?? {};
        return {
            candidateEdgeMax: t.candidateEdgeMax ?? DEFAULT_THRESHOLDS.candidateEdgeMax,
            mergeMax: t.mergeMax ?? DEFAULT_THRESHOLDS.mergeMax,
            topKNeighbors: t.topKNeighbors ?? DEFAULT_THRESHOLDS.topKNeighbors,
            minClusterSize: t.minClusterSize ?? DEFAULT_THRESHOLDS.minClusterSize,
            minDistinctTables: t.minDistinctTables ?? DEFAULT_THRESHOLDS.minDistinctTables,
        };
    }

    private estimateCost(inputTokens: number, outputTokens: number): number {
        const p = this.aiConfig?.pricing;
        if (!p) return 0;
        const inCost = (inputTokens / 1_000_000) * (p.inputCostPer1MTokens ?? 0);
        const outCost = (outputTokens / 1_000_000) * (p.outputCostPer1MTokens ?? 0);
        return inCost + outCost;
    }

    private writePhase(state: DatabaseDocumentation, phase: OrganicKeyDetectionPhase): void {
        state.phases.organicKeyDetection = phase;
    }
}

// ─── Table-exclude pattern helpers ───────────────────────────────────────────

/**
 * Compile a list of glob-like patterns into RegExp matchers. Supports `*` and `%`
 * as wildcards. Matching is case-insensitive. Patterns without wildcards match
 * the full table name. Patterns with wildcards become anchored regex patterns.
 */
export function compileTableExcludePatterns(patterns: readonly string[] | undefined): RegExp[] {
    if (!patterns || patterns.length === 0) return [];
    return patterns.map((raw) => {
        const pattern = String(raw).trim();
        if (!pattern) return /(?!)/; // Never-matching pattern for empty entries
        // Escape regex special chars EXCEPT our wildcards, then translate wildcards to .*
        const escaped = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/[*%]/g, '.*');
        return new RegExp(`^${escaped}$`, 'i');
    });
}

/** Test whether a table name matches any of the compiled exclude patterns. */
export function tableMatchesAnyPattern(tableName: string, matchers: RegExp[]): boolean {
    if (matchers.length === 0) return false;
    for (const m of matchers) {
        if (m.test(tableName)) return true;
    }
    return false;
}

/** Sum of member counts across a cluster set — used by the convergence loop to detect fixed-point. */
function totalMemberCount(clusters: OrganicKeyCluster[]): number {
    let n = 0;
    for (const c of clusters) n += c.members.length;
    return n;
}
