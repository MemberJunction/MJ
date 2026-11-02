/**
 * @fileoverview Deterministic Concept Seed Clustering over `MJ: Content Item Chunks`,
 * `MJ: Content Item Tags`, section heading breadcrumbs (`Decorator`), existing `MJ: Graph Concepts`,
 * and live MemberJunction schema metadata (`MJ: Entities`, `MJ: Queries`).
 *
 * Why this exists: Running an LLM chunk-by-chunk over a 400- to 4,000-page manual invents
 * thousands of fragmented duplicate concepts. This deterministic pre-clustering stage groups
 * chunks across one or more `Content Source`s by their governed `TagStage` tags, normalized
 * heading hierarchy, and synonym/token overlap with existing `GraphConcept`s and `Entities`
 * BEFORE calling the `BaseConceptSynthesizer` once per concept cluster.
 *
 * @module @memberjunction/content-pipeline-base
 */

import {
    GetAuthorityTierRank,
    GetConceptTypeRank,
    type ConceptTaxonomyMode,
    type GraphAuthorityTier,
    type GraphConceptType,
    type GraphConceptTypeDescriptor,
} from './GraphOverlay.types.js';

/** Input representation of a segmented `MJ: Content Item Chunk` with its parent item's tags and source metadata. */
export interface ContentChunkSeedInput {
    readonly ChunkID: string;
    readonly ContentItemID: string;
    readonly ContentSourceID: string;
    readonly ContentItemTitle: string | null;
    readonly Text: string;
    /** Structural section/heading breadcrumb written by `SegmentStage` (e.g., `"Bylaws > Article IV > §4.2 Grace Period"`). */
    readonly HeadingPath?: string | null;
    readonly Sequence?: number;
    /** Governed tag names attached to the parent `Content Item` by `TagStage`. */
    readonly Tags?: readonly string[];
    /** Authority tier configured on the originating `Content Source`. */
    readonly AuthorityTier?: GraphAuthorityTier;
    /** Optional document effective date for chronological supersession. */
    readonly EffectiveDate?: Date | null;
}

/** Existing `MJ: Graph Concepts` row in the target `GraphID`. */
export interface ExistingGraphConceptSeed {
    readonly ConceptID: string;
    readonly Name: string;
    readonly ConceptType: GraphConceptType;
    /** Optional foreign key to `MJ: Graph Concept Types` (`__mj.GraphConceptType.ID`). */
    readonly ConceptTypeID?: string | null;
    readonly Synonyms?: readonly string[];
    readonly Description?: string | null;
    readonly Specification?: string | null;
    readonly AuthorityTier?: GraphAuthorityTier;
}

/** Lightweight MJ schema/query descriptor used when `GroundingMode !== 'none'`. */
export interface SchemaGroundingTarget {
    readonly EntityName: 'MJ: Entities' | 'MJ: Queries' | 'MJ: Entity Alternate Base Views' | 'MJ: AI Skills' | 'MJ: Actions';
    readonly RecordID: string;
    readonly Name: string;
    readonly Description?: string | null;
    readonly SynonymsOrKeywords?: readonly string[];
}

/** Potential contradiction detected deterministically across chunks in the same concept seed cluster. */
export interface SeedClusterConflictCandidate {
    readonly HigherAuthorityChunkID: string;
    readonly LowerAuthorityChunkID: string;
    readonly HigherAuthorityTier: GraphAuthorityTier;
    readonly LowerAuthorityTier: GraphAuthorityTier;
    readonly Reason: string;
}

/** One grouped concept cluster ready for `BaseConceptSynthesizer`. */
export interface ConceptSeedCluster {
    /** Deterministic key (`existing:<ConceptID>` or `candidate:<normalizedTopic>`). */
    readonly ClusterKey: string;
    /** Display name proposed or matched for the concept. */
    readonly ConceptName: string;
    /** Inferred concept classification based on heading/text signals or existing concept. */
    readonly InferredConceptType: GraphConceptType;
    /** Resolved `MJ: Graph Concept Types` ID when `conceptTypes` descriptors are provided or matched from an existing concept. */
    readonly InferredConceptTypeID?: string | null;
    /** Rank order of `InferredConceptType` (lower = higher priority, e.g., Policy = 10, Term = 60). */
    readonly ConceptTypeRank: number;
    /** Populated when this cluster matched an existing `GraphConcept` in the target graph. */
    readonly MatchedExistingConcept?: ExistingGraphConceptSeed;
    /** Match score in [0, 1] against `MatchedExistingConcept` (or 0 when net-new). */
    readonly ExistingConceptMatchScore: number;
    /** Chunks routed to this concept, sorted highest `AuthorityTier` first, then newest `EffectiveDate`. */
    readonly Chunks: readonly ContentChunkSeedInput[];
    /**Highest authority tier among all contributing chunks. */
    readonly HighestAuthorityTier: GraphAuthorityTier;
    /** Union of governed tag names across the cluster's chunks. */
    readonly AssociatedTags: readonly string[];
    /** Live MJ Entities, Queries, Alternate Base Views, Skills, or Actions matching this concept. */
    readonly GroundingMatches: readonly {
        readonly Target: SchemaGroundingTarget;
        readonly MatchScore: number;
        readonly SuggestedEdgeType: 'Describes' | 'Defines' | 'Measures' | 'Implements';
    }[];
    /** Numeric/modal discrepancy flags detected across multiple chunks/sources in this cluster. */
    readonly PotentialConflicts: readonly SeedClusterConflictCandidate[];
}

/** Options controlling deterministic concept seed clustering. */
export interface ConceptClusteringOptions {
    readonly taxonomyMode?: ConceptTaxonomyMode;
    readonly conceptMatchThreshold?: number;
    readonly maxNewConcepts?: number | null;
    readonly groundingTargets?: readonly SchemaGroundingTarget[];
    /** Optional active `MJ: Graph Concept Types` rows for rank ordering and `ConceptTypeID` resolution. */
    readonly conceptTypes?: readonly GraphConceptTypeDescriptor[];
}

/** Output of `ClusterContentIntoConceptSeeds`. */
export interface ConceptClusteringResult {
    readonly Clusters: readonly ConceptSeedCluster[];
    readonly MatchedExistingCount: number;
    readonly ProposedNewCount: number;
    /** Chunks that could not be matched to an existing concept when `taxonomyMode === 'constrained'`. */
    readonly UnmatchedChunkIDs: readonly string[];
}

const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'general', 'how',
    'in', 'into', 'is', 'it', 'its', 'manual', 'notes', 'of', 'on', 'or', 'overview',
    'page', 'part', 'policy', 'procedure', 'procedures', 'rule', 'rules', 'section',
    'sop', 'standard', 'summary', 'table', 'that', 'the', 'their', 'this', 'to', 'with',
]);

/**
 * Normalizes a section heading breadcrumb or tag into a clean canonical topic title,
 * stripping leading numbering (e.g. `"Article IV - Section 4.2.1: Renewal Grace Period"` -> `"Renewal Grace Period"`).
 */
export function ExtractLeafTopicFromHeading(headingPath: string | null | undefined): string | null {
    if (!headingPath || headingPath.trim().length === 0) return null;

    // Split breadcrumb path (`A > B > C` or `A / B / C`) and walk from deepest leaf upward
    const segments = headingPath
        .split(/\s*(?:>|\/|\||»|→)\s*/)
        .map((s) => cleanHeadingSegment(s))
        .filter((s) => s.length >= 3 && !isGenericBoilerplateHeading(s));

    if (segments.length === 0) return null;
    return segments[segments.length - 1];
}

function cleanHeadingSegment(raw: string): string {
    return raw
        .trim()
        // Strip leading "Article IV:", "Chapter 12 -", "Section 4.2.1.", "§3.1", "(a)", etc.
        .replace(
            /^(?:(?:article|chapter|section|part|appendix|exhibit|schedule|rule|item)\s+[ivxlcdm0-9]+(?:\.[0-9a-z]+)*[\s:.\-–—]*|(?:§+\s*)?[0-9]+(?:\.[0-9a-z]+)*[\s:.\-–—)]+|\([a-z0-9]+\)\s*)/i,
            '',
        )
        .replace(/\s+/g, ' ')
        .trim();
}

function isGenericBoilerplateHeading(cleaned: string): boolean {
    const lower = cleaned.toLowerCase();
    return (
        lower === 'introduction' ||
        lower === 'overview' ||
        lower === 'purpose' ||
        lower === 'scope' ||
        lower === 'background' ||
        lower === 'definitions' ||
        lower === 'general' ||
        lower === 'appendix' ||
        lower === 'table of contents' ||
        lower === 'references' ||
        lower === 'summary'
    );
}

/** Tokenizes a concept name, tag, or heading into normalized content stems for Jaccard/overlap scoring. */
export function TokenizeConceptPhrase(phrase: string): string[] {
    return phrase
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(stemToken)
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function stemToken(token: string): string {
    if (token.length > 5 && token.endsWith('ies')) {
        return `${token.slice(0, -3)}y`;
    }
    if (token.length > 5 && token.endsWith('ing')) {
        return token.slice(0, -3);
    }
    if (token.length > 4 && token.endsWith('es') && !token.endsWith('ses')) {
        return token.slice(0, -2);
    }
    if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
        return token.slice(0, -1);
    }
    return token;
}

/**
 * Computes lexical/synonym similarity in [0, 1] between a candidate topic string (and optional tags)
 * and an existing `GraphConcept` (checking its `Name` and `Synonyms`).
 */
export function ScoreConceptNameSimilarity(
    candidatePhrase: string,
    existingName: string,
    existingSynonyms: readonly string[] = [],
): number {
    const candNorm = normalizeExactKey(candidatePhrase);
    if (!candNorm) return 0;

    const allTargets = [existingName, ...existingSynonyms];
    let bestScore = 0;

    const candTokens = new Set(TokenizeConceptPhrase(candidatePhrase));

    for (const target of allTargets) {
        const targetNorm = normalizeExactKey(target);
        if (!targetNorm) continue;

        if (candNorm === targetNorm) {
            return 1.0;
        }

        const targetTokens = new Set(TokenizeConceptPhrase(target));
        if (candTokens.size === 0 || targetTokens.size === 0) continue;

        let intersection = 0;
        for (const t of candTokens) {
            if (targetTokens.has(t)) intersection++;
        }
        if (intersection === 0) continue;

        const union = candTokens.size + targetTokens.size - intersection;
        const jaccard = intersection / union;
        const containment = intersection / Math.min(candTokens.size, targetTokens.size);
        const combined = 0.60 * jaccard + 0.40 * containment;

        if (combined > bestScore) {
            bestScore = combined;
        }
    }

    return Math.round(bestScore * 10000) / 10000;
}

/**
 * Infers the `GraphConceptType` (`'Policy' | 'Metric' | 'Process' | 'Role' | 'Domain' | 'Term'`)
 * from a topic label and its associated chunk text.
 */
export function InferConceptTypeFromSignals(
    topicName: string,
    sampleTexts: readonly string[],
): GraphConceptType {
    const combinedHeader = topicName.toLowerCase();
    const combinedText = sampleTexts.slice(0, 3).join(' ').toLowerCase();

    if (
        /\b(rate|ratio|metric|kpi|score|percentage|count|revenue|arr|open ar|retention|churn)\b/.test(
            combinedHeader,
        )
    ) {
        return 'Metric';
    }
    if (
        /\b(workflow|process|procedure|steps|onboarding|reinstatement|approval flow|how to|checklist)\b/.test(
            combinedHeader,
        ) ||
        /(?:\bstep\s+1\b|\b1\.\s+[a-z]+\b.*\b2\.\s+[a-z]+\b)/i.test(combinedText)
    ) {
        return 'Process';
    }
    if (
        /\b(policy|eligibility|requirement|rule|threshold|limit|compliance|grace period|refund|governance|bylaw)\b/.test(
            combinedHeader,
        ) ||
        /\b(must|shall|required to|prohibited|eligible|approval required)\b/.test(combinedText)
    ) {
        return 'Policy';
    }
    if (
        /\b(role|chair|officer|director|steward|treasurer|secretary|owner|fiduciary|counsel)\b/.test(
            combinedHeader,
        )
    ) {
        return 'Role';
    }
    if (/\b(department|division|program|committee|finance|membership|operations|accounting)\b/.test(combinedHeader)) {
        return 'Domain';
    }
    return 'Term';
}

/**
 * Deterministically groups `ContentChunkSeedInput` records into `ConceptSeedCluster`s,
 * matching against existing `GraphConcept`s, aligning with MJ `Entities` / `Queries`,
 * and flagging cross-chunk numeric/modal discrepancies.
 */
export function ClusterContentIntoConceptSeeds(
    chunks: readonly ContentChunkSeedInput[],
    existingConcepts: readonly ExistingGraphConceptSeed[] = [],
    options: ConceptClusteringOptions = {},
): ConceptClusteringResult {
    const taxonomyMode = options.taxonomyMode ?? 'propose-only';
    const matchThreshold = options.conceptMatchThreshold ?? 0.82;
    const maxNew = options.maxNewConcepts ?? null;
    const groundingTargets = options.groundingTargets ?? [];
    const configuredConceptTypes = options.conceptTypes ?? [];

    interface MutableBucket {
        key: string;
        displayName: string;
        matchedConcept?: ExistingGraphConceptSeed;
        matchScore: number;
        chunks: ContentChunkSeedInput[];
        tags: Set<string>;
    }

    const buckets = new Map<string, MutableBucket>();
    const unmatchedChunkIDs: string[] = [];

    for (const chunk of chunks) {
        const candidateTopics = extractCandidateTopicsForChunk(chunk);
        if (candidateTopics.length === 0) {
            unmatchedChunkIDs.push(chunk.ChunkID);
            continue;
        }

        // 1. Check if any candidate topic matches an existing GraphConcept above threshold
        let bestExisting: { concept: ExistingGraphConceptSeed; score: number } | null = null;
        for (const topic of candidateTopics) {
            for (const existing of existingConcepts) {
                const score = ScoreConceptNameSimilarity(topic, existing.Name, existing.Synonyms ?? []);
                if (score >= matchThreshold && (!bestExisting || score > bestExisting.score)) {
                    bestExisting = { concept: existing, score };
                }
            }
        }

        if (bestExisting) {
            const bucketKey = `existing:${bestExisting.concept.ConceptID}`;
            let bucket = buckets.get(bucketKey);
            if (!bucket) {
                bucket = {
                    key: bucketKey,
                    displayName: bestExisting.concept.Name,
                    matchedConcept: bestExisting.concept,
                    matchScore: bestExisting.score,
                    chunks: [],
                    tags: new Set<string>(),
                };
                buckets.set(bucketKey, bucket);
            } else if (bestExisting.score > bucket.matchScore) {
                bucket.matchScore = bestExisting.score;
            }
            bucket.chunks.push(chunk);
            for (const t of chunk.Tags ?? []) bucket.tags.add(t);
            continue;
        }

        // 2. No existing concept matched; if 'constrained', do not create new concept buckets
        if (taxonomyMode === 'constrained') {
            unmatchedChunkIDs.push(chunk.ChunkID);
            continue;
        }

        // 3. Merge into an existing candidate bucket if stems overlap strongly (>= matchThreshold), else open a new candidate bucket
        const primaryTopic = candidateTopics[0];
        let matchedCandidateKey: string | null = null;
        let bestCandScore = 0;

        for (const [bKey, bucket] of buckets) {
            if (bucket.matchedConcept) continue;
            const sim = ScoreConceptNameSimilarity(primaryTopic, bucket.displayName, Array.from(bucket.tags));
            if (sim >= matchThreshold && sim > bestCandScore) {
                bestCandScore = sim;
                matchedCandidateKey = bKey;
            }
        }

        const bucketKey = matchedCandidateKey ?? `candidate:${normalizeExactKey(primaryTopic)}`;
        let bucket = buckets.get(bucketKey);
        if (!bucket) {
            bucket = {
                key: bucketKey,
                displayName: primaryTopic,
                matchScore: 0,
                chunks: [],
                tags: new Set<string>(),
            };
            buckets.set(bucketKey, bucket);
        }
        bucket.chunks.push(chunk);
        for (const t of chunk.Tags ?? []) bucket.tags.add(t);
    }

    // Build final sorted clusters, applying maxNewConcepts cap on net-new clusters if configured
    const existingClusters: ConceptSeedCluster[] = [];
    const candidateClusters: ConceptSeedCluster[] = [];

    for (const bucket of buckets.values()) {
        // Deduplicate chunks by ChunkID and sort by AuthorityTier rank desc, then EffectiveDate desc
        const uniqueChunksMap = new Map<string, ContentChunkSeedInput>();
        for (const c of bucket.chunks) {
            uniqueChunksMap.set(c.ChunkID, c);
        }
        const sortedChunks = Array.from(uniqueChunksMap.values()).sort((a, b) => {
            const rankDiff = GetAuthorityTierRank(b.AuthorityTier) - GetAuthorityTierRank(a.AuthorityTier);
            if (rankDiff !== 0) return rankDiff;
            const timeA = a.EffectiveDate?.getTime() ?? 0;
            const timeB = b.EffectiveDate?.getTime() ?? 0;
            return timeB - timeA;
        });

        const highestTier = sortedChunks[0]?.AuthorityTier ?? 'Reference';
        const inferredType =
            bucket.matchedConcept?.ConceptType ??
            InferConceptTypeFromSignals(
                bucket.displayName,
                sortedChunks.map((c) => c.Text),
            );
        const resolvedConceptTypeID =
            bucket.matchedConcept?.ConceptTypeID ??
            configuredConceptTypes.find(
                (t) => t.Name.trim().toLowerCase() === inferredType.trim().toLowerCase(),
            )?.ID ??
            null;
        const conceptTypeRank = GetConceptTypeRank(inferredType, configuredConceptTypes);

        const groundingMatches = matchGroundingTargets(
            bucket.displayName,
            Array.from(bucket.tags),
            groundingTargets,
        );
        const conflicts = detectPotentialChunkConflicts(sortedChunks);

        const cluster: ConceptSeedCluster = {
            ClusterKey: bucket.key,
            ConceptName: bucket.displayName,
            InferredConceptType: inferredType,
            ...(resolvedConceptTypeID ? { InferredConceptTypeID: resolvedConceptTypeID } : {}),
            ConceptTypeRank: conceptTypeRank,
            ...(bucket.matchedConcept ? { MatchedExistingConcept: bucket.matchedConcept } : {}),
            ExistingConceptMatchScore: bucket.matchScore,
            Chunks: sortedChunks,
            HighestAuthorityTier: highestTier,
            AssociatedTags: Array.from(bucket.tags).sort(),
            GroundingMatches: groundingMatches,
            PotentialConflicts: conflicts,
        };

        if (bucket.matchedConcept) {
            existingClusters.push(cluster);
        } else {
            candidateClusters.push(cluster);
        }
    }

    // Prioritize candidate clusters with more chunks, higher authority tiers, and higher-priority concept type rank (lower number = higher priority)
    candidateClusters.sort(
        (a, b) =>
            b.Chunks.length - a.Chunks.length ||
            GetAuthorityTierRank(b.HighestAuthorityTier) - GetAuthorityTierRank(a.HighestAuthorityTier) ||
            a.ConceptTypeRank - b.ConceptTypeRank ||
            a.ConceptName.localeCompare(b.ConceptName),
    );

    const allowedCandidates =
        maxNew !== null && maxNew >= 0 ? candidateClusters.slice(0, maxNew) : candidateClusters;

    const allClusters = [...existingClusters, ...allowedCandidates];

    return {
        Clusters: allClusters,
        MatchedExistingCount: existingClusters.length,
        ProposedNewCount: allowedCandidates.length,
        UnmatchedChunkIDs: unmatchedChunkIDs,
    };
}

function extractCandidateTopicsForChunk(chunk: ContentChunkSeedInput): string[] {
    const topics: string[] = [];
    const fromHeading = ExtractLeafTopicFromHeading(chunk.HeadingPath);
    if (fromHeading) {
        topics.push(fromHeading);
    }
    for (const tag of chunk.Tags ?? []) {
        const cleaned = tag.trim();
        if (cleaned.length >= 2 && !topics.includes(cleaned)) {
            topics.push(cleaned);
        }
    }
    if (topics.length === 0 && chunk.ContentItemTitle) {
        const fromTitle = cleanHeadingSegment(chunk.ContentItemTitle);
        if (fromTitle.length >= 3) {
            topics.push(fromTitle);
        }
    }
    return topics;
}

function matchGroundingTargets(
    conceptName: string,
    tags: readonly string[],
    targets: readonly SchemaGroundingTarget[],
): ConceptSeedCluster['GroundingMatches'] {
    const matches: Array<{
        readonly Target: SchemaGroundingTarget;
        readonly MatchScore: number;
        readonly SuggestedEdgeType: 'Describes' | 'Defines' | 'Measures' | 'Implements';
    }> = [];

    for (const target of targets) {
        const nameScore = ScoreConceptNameSimilarity(
            conceptName,
            target.Name,
            target.SynonymsOrKeywords ?? [],
        );
        let bestTagScore = 0;
        for (const tag of tags) {
            const ts = ScoreConceptNameSimilarity(tag, target.Name, target.SynonymsOrKeywords ?? []);
            if (ts > bestTagScore) bestTagScore = ts;
        }
        const score = Math.max(nameScore, bestTagScore * 0.9);
        if (score >= 0.55) {
            matches.push({
                Target: target,
                MatchScore: Math.round(score * 10000) / 10000,
                SuggestedEdgeType: edgeTypeForTargetEntity(target.EntityName),
            });
        }
    }

    matches.sort((a, b) => b.MatchScore - a.MatchScore);
    return matches;
}

function edgeTypeForTargetEntity(
    entityName: SchemaGroundingTarget['EntityName'],
): 'Describes' | 'Defines' | 'Measures' | 'Implements' {
    switch (entityName) {
        case 'MJ: Entities':
            return 'Describes';
        case 'MJ: Entity Alternate Base Views':
            return 'Defines';
        case 'MJ: Queries':
            return 'Measures';
        case 'MJ: AI Skills':
        case 'MJ: Actions':
            return 'Implements';
    }
}

/**
 * Scans chunks mapped to the same concept for conflicting numeric durations/currency thresholds
 * (e.g. `"60 days"` vs `"90 days"`, or `"$500"` vs `"$1,000"`).
 */
function detectPotentialChunkConflicts(
    chunks: readonly ContentChunkSeedInput[],
): SeedClusterConflictCandidate[] {
    if (chunks.length < 2) return [];
    const conflicts: SeedClusterConflictCandidate[] = [];

    for (let i = 0; i < chunks.length; i++) {
        for (let j = i + 1; j < chunks.length; j++) {
            const a = chunks[i];
            const b = chunks[j];
            if (a.ContentItemID === b.ContentItemID && a.HeadingPath === b.HeadingPath) continue;

            const daysA = extractNumericUnitValues(a.Text, /\b(\d+)\s*(?:-|\s)?\s*days?\b/gi);
            const daysB = extractNumericUnitValues(b.Text, /\b(\d+)\s*(?:-|\s)?\s*days?\b/gi);
            if (hasDisjointNumbers(daysA, daysB)) {
                conflicts.push({
                    HigherAuthorityChunkID: a.ChunkID,
                    LowerAuthorityChunkID: b.ChunkID,
                    HigherAuthorityTier: a.AuthorityTier ?? 'Reference',
                    LowerAuthorityTier: b.AuthorityTier ?? 'Reference',
                    Reason: `Conflicting day thresholds (${Array.from(daysA).join('/')} days vs. ${Array.from(daysB).join('/')} days)`,
                });
                continue;
            }

            const usdA = extractNumericUnitValues(a.Text, /\$\s*([0-9,]+(?:\.[0-9]{2})?)\b/g);
            const usdB = extractNumericUnitValues(b.Text, /\$\s*([0-9,]+(?:\.[0-9]{2})?)\b/g);
            if (hasDisjointNumbers(usdA, usdB)) {
                conflicts.push({
                    HigherAuthorityChunkID: a.ChunkID,
                    LowerAuthorityChunkID: b.ChunkID,
                    HigherAuthorityTier: a.AuthorityTier ?? 'Reference',
                    LowerAuthorityTier: b.AuthorityTier ?? 'Reference',
                    Reason: `Conflicting currency thresholds ($${Array.from(usdA).join('/$')} vs. $${Array.from(usdB).join('/$')})`,
                });
            }
        }
    }

    return conflicts;
}

function extractNumericUnitValues(text: string, pattern: RegExp): Set<string> {
    const result = new Set<string>();
    for (const match of text.matchAll(pattern)) {
        const normalized = match[1].replace(/,/g, '');
        if (normalized) result.add(normalized);
    }
    return result;
}

function hasDisjointNumbers(setA: ReadonlySet<string>, setB: ReadonlySet<string>): boolean {
    if (setA.size === 0 || setB.size === 0) return false;
    for (const val of setA) {
        if (setB.has(val)) return false;
    }
    return true;
}

function normalizeExactKey(raw: string): string {
    return TokenizeConceptPhrase(raw).sort().join('_');
}
