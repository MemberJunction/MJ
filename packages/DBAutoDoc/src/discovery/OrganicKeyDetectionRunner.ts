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
import { ValueOverlapSampler } from './ValueOverlapSampler.js';
import { MinHashSignature } from './MinHashSketch.js';

export interface RunnerOptions {
    /** Optional progress callback for long-running operations. */
    onProgress?: (message: string) => void;
}

export class OrganicKeyDetectionRunner {
    constructor(
        private readonly config: OrganicKeyDetectionConfig,
        private readonly aiConfig?: AIConfig,
        private readonly driver?: BaseAutoDocDriver,
    ) {}

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

        if (embeddingActive) {
            progress(`Organic keys — computing embeddings for ${columns.length} columns`);
            await this.attachEmbeddings(columns);
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
        const candidates = detector.detect(columns);

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

        // ─── Step 6: Estimate cost ──────────────────────────────────────────
        const estimatedCost = this.estimateCost(inputTokens, outputTokens);

        // ─── Step 7: Persist results ────────────────────────────────────────
        state.organicKeyClusters = confirmed;
        this.writePhase(state, {
            triggered: true,
            triggerReason: this.config.enabled ? 'config.organicKeyDetection.enabled' : undefined,
            startedAt,
            completedAt: new Date().toISOString(),
            status: 'completed',
            candidateClusterCount: candidates.length,
            confirmedClusterCount: confirmed.length,
            rejectedClusterCount: rejected,
            splitClusterCount: split,
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

        for (const schema of state.schemas) {
            for (const table of schema.tables) {
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
     * Uses the configured AI provider's embedding endpoint (Gemini / OpenAI). On failure,
     * embeddings are simply not attached and the runner falls back to name + value signals.
     */
    private async attachEmbeddings(columns: DetectorInputColumn[]): Promise<void> {
        if (!this.aiConfig || !this.config.embedding?.enabled) return;
        try {
            const provider = createEmbeddingProvider({
                provider: this.aiConfig.provider,
                apiKey: this.aiConfig.apiKey,
                model: this.config.embedding.model ?? 'gemini-embedding-001',
                dimensions: this.config.embedding.dimensions,
                batchSize: this.config.embedding.batchSize,
            });
            const texts = columns.map(
                (c) =>
                    `Column ${c.schema}.${c.table}.${c.column}. ${c.description ?? ''}`.trim(),
            );
            const vectors = await provider.embed(texts);
            for (let i = 0; i < columns.length; i++) {
                columns[i].embedding = vectors[i];
            }
        } catch (err) {
            // Embedding failure is non-fatal — log via no-op (runner-level progress already announced this step)
            // and continue with whichever signals remain.
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
