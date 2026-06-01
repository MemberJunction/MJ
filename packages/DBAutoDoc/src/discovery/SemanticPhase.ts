/**
 * Phase A — SEMANTIC.
 *
 * The defensible PR #2193 pipeline:
 *
 *   1. PREFILTER (deterministic)
 *        Drop columns that cannot be organic keys regardless of semantics:
 *        binary/blob types, audit-named columns, ultra-low-cardinality.
 *
 *   2. NORMALIZE TO BUSINESS SPACE (LLM, one call per table)
 *        For each surviving column, produce a structured business-focused
 *        description that encodes PR #2193's "if two rows share this value,
 *        do they refer to the same real-world entity?" test, plus a canonical
 *        snake_case conceptName, normalization strategy, and isOrganicKey gate.
 *        Columns the normalizer rejects (audit, categorical, surrogate, free-
 *        text, etc.) are dropped here.
 *
 *   3. EMBED the normalized descriptions
 *        Same-concept descriptions geometrically converge regardless of
 *        source-system, table, or column-name conventions. Sample values are
 *        appended to distinguish e.g. emails from phones even when both
 *        describe "identifying a person".
 *
 *   4. CLUSTER (agglomerative average-linkage, gap-detected threshold)
 *        Each cluster is a candidate organic-key concept. The threshold is
 *        auto-calibrated by finding the largest gap in the bottom of the
 *        pairwise-distance distribution — robust across schemas/providers.
 *
 *   5. SPLIT-BY-CONCEPT
 *        When the LLM has already assigned DIFFERENT conceptNames to columns
 *        the embeddings put in the same cluster (e.g. product_id /
 *        product_model_id / product_category_id all describe "an identifier
 *        for a product-related entity" and embed close together), honor the
 *        LLM's distinction by splitting the cluster along conceptName.
 *        Catches Gemini's tight description-space compression without losing
 *        cross-table merging when the LLM does converge on one name.
 *
 *   6. LABEL each cluster from its members' conceptName votes.
 *
 * No vocabulary discovery, no LLM cluster judge, no per-cluster refinement —
 * the normalize step IS the PR #2193 judgment, the cluster + split steps ARE
 * the cross-table identity proof.
 */

import { AIConfig, OrganicKeyDetectionConfig } from '../types/config.js';
import { DatabaseDocumentation } from '../types/state.js';
import {
    DEFAULT_DETECTOR_CONFIG,
    OrganicKeyCluster,
    OrganicKeyClusterMember,
    OrganicKeyNormalizationStrategy,
} from '../types/organic-keys.js';
import {
    TableNormalizer,
    NormalizedColumn,
    NormalizerInputColumn,
    TableNormalizationInput,
} from './ColumnNormalizer.js';
import { ColumnClusterer, ClustererInputColumn } from './ColumnClusterer.js';
import { createEmbeddingProvider, EmbeddingProviderName } from './EmbeddingProvider.js';

const AUDIT_COLUMN_PATTERN = /^(modified|created|updated|inserted|changed)(date|at|time|by|on)?$|^rowguid$|^timestamp$|^row_?version$|^__mj_.*$/i;
const NON_VALUEMATCHABLE_TYPES = /(binary|blob|image|varbinary|xml|geography|geometry|hierarchyid|sql_variant)/i;

// ─── Prefilter cardinality cutoffs ───────────────────────────────────────────
/**
 * A column with fewer than this many distinct values AND a uniqueness ratio below
 * {@link MIN_UNIQUENESS_RATIO} is treated as a low-cardinality categorical (boolean/enum),
 * not an identity-bearing column, and is dropped before clustering.
 */
const MIN_DISTINCT_FOR_KEY = 10;
const MIN_UNIQUENESS_RATIO = 0.001;

// ─── Embedding-input sample caps ─────────────────────────────────────────────
/** At most this many sample values are appended to a column's embedding text. */
const EMBED_SAMPLE_COUNT = 4;
/** Each appended sample value is truncated to this many characters. */
const EMBED_SAMPLE_MAX_CHARS = 60;

// ─── Cluster-confidence tightness penalty ────────────────────────────────────
/**
 * Cluster confidence = mean member confidence − (maxIntraDistance × {@link TIGHTNESS_PENALTY_SLOPE}),
 * with the penalty capped at {@link TIGHTNESS_PENALTY_MAX} so a loose-but-real cluster isn't
 * over-penalized into irrelevance.
 */
const TIGHTNESS_PENALTY_SLOPE = 0.5;
const TIGHTNESS_PENALTY_MAX = 0.2;

/**
 * Clustering sensitivity → percentile of the pairwise cosine-distance distribution used as the
 * auto-calibrated merge threshold. A lower percentile yields tighter (stricter) clusters.
 */
const SENSITIVITY_PERCENTILE: Record<'strict' | 'balanced' | 'permissive', number> = {
    strict: 1,
    balanced: 5,
    permissive: 15,
};

/** A cluster as produced by the clusterer / concept-split step: member indexes into the
 *  normalized-column array, the emitted member descriptors, and the cluster's intra-distance. */
type RawCluster = { memberIndexes: number[]; members: OrganicKeyClusterMember[]; maxIntraDistance: number };

/** Result of the semantic (organic-key clustering) phase. */
export interface SemanticPhaseResult {
    clusters: OrganicKeyCluster[];
    tokens: { input: number; output: number; total: number };
    summary: {
        columnsInScope: number;
        columnsNormalized: number;
        columnsRejectedByNormalizer: number;
        /** Clusters formed by the embedding clusterer, before the concept-name split. */
        clustersBeforeSplit: number;
        /** Final clusters after splitting by concept name and dropping sub-threshold sub-clusters. */
        clustersFound: number;
        /** Sub-clusters discarded during the split for falling below minClusterSize / minDistinctTables. */
        clustersDropped: number;
    };
}

/** Receives human-readable progress messages as the semantic phase advances. */
export type ProgressCallback = (message: string) => void;

export async function runSemanticPhase(
    state: DatabaseDocumentation,
    config: OrganicKeyDetectionConfig,
    aiConfig: AIConfig,
    progress: ProgressCallback = () => {},
): Promise<SemanticPhaseResult> {
    // ─── 1. Prefilter ────────────────────────────────────────────────────────
    const candidates = prefilter(state, config);
    progress(`semantic: ${candidates.length} columns in scope`);
    if (candidates.length < (config.minClusterSize ?? DEFAULT_DETECTOR_CONFIG.minClusterSize)) {
        return emptyResult(candidates.length);
    }

    // ─── 2. Normalize to business space (LLM per-table) ──────────────────────
    progress('semantic: normalizing column descriptions to business space');
    const tableInputs = groupColumnsByTable(state, candidates);
    const normResult = await new TableNormalizer(aiConfig).normalizeAll(tableInputs, {
        concurrency: config.refinementConcurrency ?? DEFAULT_DETECTOR_CONFIG.refinementConcurrency,
        maxRetries: config.maxRefinementRetries ?? 2,
        onProgress: () => {},
    });
    progress(`semantic: ${normResult.normalized.length} columns kept (${normResult.rejected} rejected by PR-#2193 axes)`);

    if (normResult.normalized.length < (config.minClusterSize ?? DEFAULT_DETECTOR_CONFIG.minClusterSize)) {
        return {
            clusters: [],
            tokens: normResult.tokens,
            summary: {
                columnsInScope: candidates.length,
                columnsNormalized: normResult.normalized.length,
                columnsRejectedByNormalizer: normResult.rejected,
                clustersBeforeSplit: 0,
                clustersFound: 0,
                clustersDropped: 0,
            },
        };
    }

    // ─── 3. Embed the normalized descriptions ────────────────────────────────
    const embedProvider = resolveEmbeddingProvider(config, aiConfig);
    progress(`semantic: embedding ${normResult.normalized.length} descriptions via ${embedProvider.name}`);
    const texts = normResult.normalized.map((n) => buildEmbeddingText(n));
    const embeddings = await embedProvider.embed(texts);

    // ─── 4. Cluster columns by embedding distance ────────────────────────────
    const sensitivity = config.clusteringSensitivity ?? 'balanced';
    const percentile = sensitivityToPercentile(sensitivity);
    const clusterer = new ColumnClusterer({
        mergeThreshold: config.mergeThreshold,
        mergeThresholdPercentile: percentile,
        minClusterSize: config.minClusterSize ?? DEFAULT_DETECTOR_CONFIG.minClusterSize,
        minDistinctTables: config.minDistinctTables ?? DEFAULT_DETECTOR_CONFIG.minDistinctTables,
    });
    const clustererInputs: ClustererInputColumn[] = normResult.normalized.map((n, i) => ({
        schema: n.schema,
        table: n.table,
        column: n.column,
        embedding: embeddings[i],
        participatesInFK: n.participatesInFK,
        fkTarget: n.fkTarget,
        isPrimaryKey: n.isPrimaryKey,
    }));
    const rawClusters = clusterer.cluster(clustererInputs);
    progress(`semantic: ${rawClusters.length} clusters formed (threshold=${clusterer.lastResolvedThreshold.toFixed(3)})`);

    // ─── 5. Split clusters that contain multiple distinct conceptNames ──────
    const minClusterSize = config.minClusterSize ?? DEFAULT_DETECTOR_CONFIG.minClusterSize;
    const minDistinctTables = config.minDistinctTables ?? DEFAULT_DETECTOR_CONFIG.minDistinctTables;
    const { clusters: split, dropped } = splitClustersByConceptName(
        rawClusters,
        normResult.normalized,
        minClusterSize,
        minDistinctTables,
    );
    if (split.length !== rawClusters.length) {
        progress(`semantic: ${split.length} clusters after concept-name split`);
    }

    // ─── 6. Label clusters from member votes ─────────────────────────────────
    const clusters: OrganicKeyCluster[] = split.map((rc, idx) => {
        const memberNormalized = rc.memberIndexes.map((i) => normResult.normalized[i]);
        return labelCluster(memberNormalized, rc.members, rc.maxIntraDistance, idx);
    });

    return {
        clusters,
        tokens: normResult.tokens,
        summary: {
            columnsInScope: candidates.length,
            columnsNormalized: normResult.normalized.length,
            columnsRejectedByNormalizer: normResult.rejected,
            clustersBeforeSplit: rawClusters.length,
            clustersFound: clusters.length,
            clustersDropped: dropped,
        },
    };
}

/**
 * Split each raw embedding cluster into sub-clusters by distinct conceptName.
 *
 * Embedding clustering over-merges when distinct concepts produce similar descriptions
 * (e.g. product_id vs product_model_id vs product_category_id all describe "identifier
 * for a product-related entity"). The LLM normalize step already distinguished them by
 * assigning different concept names — we honor that here by splitting any cluster whose
 * members carry multiple distinct conceptName values.
 *
 * Sub-clusters that fall below `minClusterSize` / `minDistinctTables` are dropped (a concept
 * with one column in one table isn't a cross-table organic key). Returns the surviving
 * sub-clusters (sorted largest-first) and the count of dropped sub-clusters.
 */
function splitClustersByConceptName(
    rawClusters: RawCluster[],
    normalized: NormalizedColumn[],
    minClusterSize: number,
    minDistinctTables: number,
): { clusters: RawCluster[]; dropped: number } {
    const split: RawCluster[] = [];
    let dropped = 0;
    for (const rc of rawClusters) {
        const byConcept = groupMemberIndexesByConcept(rc.memberIndexes, normalized);
        if (byConcept.size === 1) {
            split.push(rc);
            continue;
        }
        for (const [, idxs] of byConcept) {
            const members = idxs.map((i) => toClusterMember(normalized[i]));
            const tableSet = new Set(members.map((m) => `${m.schema}.${m.table}`));
            if (members.length < minClusterSize || tableSet.size < minDistinctTables) {
                dropped++;
                continue;
            }
            split.push({ memberIndexes: idxs, members, maxIntraDistance: rc.maxIntraDistance });
        }
    }
    split.sort((a, b) => b.members.length - a.members.length);
    return { clusters: split, dropped };
}

/**
 * Bucket member indexes by normalized conceptName. The grouping key is lowercased with all
 * non-alphanumeric chars stripped, collapsing LLM stochastic variants (`sales_person_id` vs
 * `salesPersonId`) into one bucket — they're the same identifier written differently.
 */
function groupMemberIndexesByConcept(memberIndexes: number[], normalized: NormalizedColumn[]): Map<string, number[]> {
    const byConcept = new Map<string, number[]>();
    for (const ci of memberIndexes) {
        const cn = (normalized[ci].conceptName || '__unnamed__').toLowerCase().replace(/[^a-z0-9]/g, '');
        const bucket = byConcept.get(cn);
        if (bucket) bucket.push(ci);
        else byConcept.set(cn, [ci]);
    }
    return byConcept;
}

/** Project a normalized column into the cluster-member descriptor (sans per-column normalization). */
function toClusterMember(n: NormalizedColumn): OrganicKeyClusterMember {
    return {
        schema: n.schema,
        table: n.table,
        column: n.column,
        participatesInFK: n.participatesInFK,
        fkTarget: n.fkTarget,
        isPrimaryKey: n.isPrimaryKey,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function prefilter(state: DatabaseDocumentation, config: OrganicKeyDetectionConfig): NormalizerInputColumn[] {
    const sampleValueCount = config.sampleValueCount ?? DEFAULT_DETECTOR_CONFIG.sampleValueCount;
    const out: NormalizerInputColumn[] = [];
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            for (const col of table.columns) {
                if (NON_VALUEMATCHABLE_TYPES.test(col.dataType)) continue;
                if (AUDIT_COLUMN_PATTERN.test(col.name)) continue;
                if (col.statistics) {
                    const distinct = col.statistics.distinctCount ?? 0;
                    const ratio = col.statistics.uniquenessRatio ?? 0;
                    // Drop ultra-low-cardinality / near-boolean columns.
                    if (distinct < MIN_DISTINCT_FOR_KEY && ratio < MIN_UNIQUENESS_RATIO) continue;
                }
                out.push({
                    schema: schema.name,
                    table: table.name,
                    column: col.name,
                    dataType: col.dataType,
                    originalDescription: col.userDescription ?? col.description ?? '',
                    sampleValues: extractSampleValues(col, sampleValueCount),
                    participatesInFK: !!col.isForeignKey,
                    fkTarget: col.foreignKeyReferences
                        ? {
                              schema: col.foreignKeyReferences.schema,
                              table: col.foreignKeyReferences.table,
                              column: col.foreignKeyReferences.referencedColumn,
                          }
                        : null,
                    isPrimaryKey: !!col.isPrimaryKey,
                });
            }
        }
    }
    return out;
}

function groupColumnsByTable(state: DatabaseDocumentation, columns: NormalizerInputColumn[]): TableNormalizationInput[] {
    const schemaDesc = new Map<string, string | undefined>();
    const tableDesc = new Map<string, string | undefined>();
    for (const s of state.schemas) {
        schemaDesc.set(s.name, s.description);
        for (const t of s.tables) tableDesc.set(`${s.name}.${t.name}`, t.description);
    }
    const buckets = new Map<string, NormalizerInputColumn[]>();
    for (const c of columns) {
        const k = `${c.schema}.${c.table}`;
        const b = buckets.get(k);
        if (b) b.push(c);
        else buckets.set(k, [c]);
    }
    return Array.from(buckets.entries()).map(([k, cols]) => {
        const [schema, table] = k.split('.');
        return {
            schema,
            table,
            schemaDescription: schemaDesc.get(schema),
            tableDescription: tableDesc.get(k),
            columns: cols,
        };
    });
}

/**
 * Build the embedding input text from a normalized column.
 *
 * Gemini clustering embeddings compress "database column description" text into
 * a tight neighborhood ([0, 0.15] cosine distance). To pull distinct concepts
 * apart in that compressed geometry, we lead with the concept name repeated
 * three times — embedding models give more weight to repeated tokens, so a
 * column labeled "product_category_id" lands distinguishably away from one
 * labeled "product_id" even though their template descriptions look similar.
 *
 * Sample values are appended last (when present) to add concrete value-format
 * signal that distinguishes e.g. an email from a phone even when both describe
 * "identifying a person".
 */
function buildEmbeddingText(n: NormalizedColumn): string {
    const concept = (n.conceptName || 'unknown').replace(/_/g, ' ');
    const parts: string[] = [];
    parts.push(`${concept}. ${concept}. ${concept}.`);
    parts.push(n.normalizedDescription);
    if (n.sampleValues && n.sampleValues.length > 0) {
        const samples = n.sampleValues.slice(0, EMBED_SAMPLE_COUNT).map((v) => String(v).slice(0, EMBED_SAMPLE_MAX_CHARS));
        parts.push(`Sample values: ${samples.join(' | ')}.`);
    }
    return parts.join(' ');
}

function labelCluster(
    members: NormalizedColumn[],
    outMembers: OrganicKeyClusterMember[],
    maxIntraDistance: number,
    index: number,
): OrganicKeyCluster {
    // Cluster concept = majority concept name (ties → highest confidence).
    const conceptVotes = new Map<string, { count: number; sumConf: number }>();
    for (const m of members) {
        const key = m.conceptName || 'unknown';
        const cur = conceptVotes.get(key) ?? { count: 0, sumConf: 0 };
        cur.count += 1;
        cur.sumConf += m.confidence;
        conceptVotes.set(key, cur);
    }
    const concept = Array.from(conceptVotes.entries())
        .sort((a, b) => b[1].count - a[1].count || b[1].sumConf - a[1].sumConf || a[0].localeCompare(b[0]))[0][0];

    // Per-column normalization — each member keeps its own strategy + expression so
    // the emitted EntityOrganicKey hub row for THAT column carries the right transformation.
    // The runtime applies each side's own expression at match time (see
    // BuildOrganicKeyViewParams in MJCore). The cluster-level `normalization` field is
    // computed by majority vote as a summary / fallback for legacy consumers.
    const stratCounts = new Map<OrganicKeyNormalizationStrategy, number>();
    for (const m of members) {
        stratCounts.set(m.normalizationStrategy, (stratCounts.get(m.normalizationStrategy) ?? 0) + 1);
    }
    const normalization = Array.from(stratCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

    // Highest-confidence member's customNormalizationExpression becomes the cluster-level
    // fallback (only used if a member doesn't carry its own — shouldn't normally happen).
    const customFallback = members
        .slice()
        .sort((a, b) => b.confidence - a.confidence)
        .find((m) => m.customNormalizationExpression)?.customNormalizationExpression;

    // Decorate outMembers with per-column normalization. Members are aligned by index
    // with `members` (the NormalizedColumn array) via the caller's memberIndexes mapping.
    const decoratedMembers: OrganicKeyClusterMember[] = outMembers.map((om, i) => {
        const nm = members[i];
        return {
            ...om,
            normalizationStrategy: nm?.normalizationStrategy,
            customNormalizationExpression: nm?.customNormalizationExpression,
        };
    });

    // Cluster confidence = mean of member confidences, lightly penalized by tightness.
    const meanConf = members.reduce((s, n) => s + n.confidence, 0) / members.length;
    const tightnessPenalty = Math.min(TIGHTNESS_PENALTY_MAX, maxIntraDistance * TIGHTNESS_PENALTY_SLOPE);
    const confidence = Math.max(0, Math.min(1, meanConf - tightnessPenalty));

    // Reasoning from the highest-confidence member.
    const repr = members.slice().sort((a, b) => b.confidence - a.confidence)[0];

    return {
        id: `cluster_${index}`,
        concept,
        normalization,
        customNormalizationExpression: customFallback,
        members: decoratedMembers,
        confidence,
        reasoning: repr.reasoning,
        maxIntraDistance,
    };
}

function extractSampleValues(
    col: { statistics?: { sampleValues?: unknown[] }; possibleValues?: unknown[] },
    max: number,
): string[] {
    const raw = col.statistics?.sampleValues ?? col.possibleValues ?? [];
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const v of raw) {
        if (v == null) continue;
        const s = String(v).trim();
        if (s.length === 0) continue;
        out.push(s);
        if (out.length >= max) break;
    }
    return out;
}

function sensitivityToPercentile(s: 'strict' | 'balanced' | 'permissive'): number {
    return SENSITIVITY_PERCENTILE[s] ?? SENSITIVITY_PERCENTILE.balanced;
}

interface EmbeddingProviderHandle {
    name: string;
    embed: (texts: string[]) => Promise<Float32Array[]>;
}

function resolveEmbeddingProvider(
    config: OrganicKeyDetectionConfig,
    aiConfig: AIConfig,
): EmbeddingProviderHandle {
    const cfg = config.embedding ?? {};
    const provider = (cfg.provider ?? 'openai') as EmbeddingProviderName;
    const apiKey = aiConfig.apiKey;
    const impl = createEmbeddingProvider({
        provider,
        apiKey,
        model: cfg.model,
        dimensions: cfg.dimensions,
        batchSize: cfg.batchSize,
        endpoint: cfg.endpoint,
    });
    return {
        name: `${provider}:${cfg.model ?? 'default'}`,
        embed: (texts: string[]) => impl.embed(texts),
    };
}

function emptyResult(columnsInScope: number): SemanticPhaseResult {
    return {
        clusters: [],
        tokens: { input: 0, output: 0, total: 0 },
        summary: {
            columnsInScope,
            columnsNormalized: 0,
            columnsRejectedByNormalizer: 0,
            clustersBeforeSplit: 0,
            clustersFound: 0,
            clustersDropped: 0,
        },
    };
}
