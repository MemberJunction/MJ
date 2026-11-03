/**
 * @fileoverview Deterministic DAG canonicalization, Weisfeiler-Lehman topological hashing,
 * structural similarity, clustering, and workflow promotion discovery.
 *
 * Pure and dependency-free (browser and server safe) so both the ambient Canon Health engine
 * and Explorer visualization/analytics surfaces can compare runtime TaskGraphs against
 * saved canonized Flow workflows without database or Node-only dependencies.
 *
 * @module @memberjunction/ai-core-plus
 */

import {
    NormalizeDependency,
    type TaskGraphDependency,
    type TaskGraphNodeConfigMap,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
} from './task-graph-spec';

/** Options controlling how node signatures and topological hashes are computed. */
export interface DAGFingerprintOptions {
    /**
     * Number of Weisfeiler-Lehman (WL) bidirectional message-passing iterations.
     * Default 2 (captures 2-hop ancestor + descendant neighborhood structure).
     */
    readonly wlIterations?: number;
    /**
     * Whether to include normalized top-level `inputPayload` key names in node operator signatures.
     * Default false (keeps operator matching resilient to optional argument variations).
     */
    readonly includeInputPayloadKeys?: boolean;
    /**
     * Whether to include normalized condition shape tokens on dependency edges.
     * Default true (distinguishes unconditional edges from conditional branching edges).
     */
    readonly includeConditionShape?: boolean;
}

/** Deterministic structural fingerprint of a `TaskGraphSpec`. */
export interface DAGFingerprint {
    readonly WorkflowName: string;
    readonly NodeCount: number;
    readonly EdgeCount: number;
    /**
     * Isomorphism-invariant 64-bit hex hash (16 hex chars) of the graph's WL node hashes,
     * operator multiset, and edge bigrams. Two graphs with the same operator topology
     * produce the exact same hash regardless of `tempId` naming or array ordering.
     */
    readonly ExactStructureHash: string;
    /** Map from canonical operator signature (`Kind:Target...`) to occurrence count. */
    readonly OperatorMultiset: ReadonlyMap<string, number>;
    /** Map from directed edge bigram (`opA ->[condShape] opB`) to occurrence count. */
    readonly DirectEdgeBigrams: ReadonlyMap<string, number>;
    /**
     * Set of 2-hop transitive reachability pairs (`opA ~> opB`).
     * Preserves structural alignment when one graph inserts an intermediate logging or validation step.
     */
    readonly TransitiveReachabilityPairs: ReadonlySet<string>;
    /** Map from Weisfeiler-Lehman subtree feature token (`d0:...`, `d1:...`, `d2:...`) to count. */
    readonly WLSubtreeFeatures: ReadonlyMap<string, number>;
    /** Per-node canonical operator signature, keyed by the node's `tempId`. */
    readonly NodeSignaturesByTempId: ReadonlyMap<string, string>;
}

/** Weights for combining component similarity metrics into an overall score in [0, 1]. */
export interface DAGSimilarityWeights {
    readonly operatorWeight?: number;
    readonly directEdgeWeight?: number;
    readonly transitiveEdgeWeight?: number;
    readonly wlSubtreeWeight?: number;
}

/** Detailed breakdown of structural similarity between two DAGs. */
export interface DAGSimilarityScore {
    /** Weighted overall similarity in [0, 1]. */
    readonly Overall: number;
    /** Multiset Jaccard similarity over canonical node operator signatures in [0, 1]. */
    readonly OperatorJaccard: number;
    /** Multiset Jaccard similarity over directed edge bigrams in [0, 1]. */
    readonly EdgeBigramJaccard: number;
    /** Set Jaccard similarity over 1-hop and 2-hop reachability pairs in [0, 1]. */
    readonly TransitivePairJaccard: number;
    /** Cosine similarity over Weisfeiler-Lehman subtree feature vectors in [0, 1]. */
    readonly WLSubtreeCosine: number;
    /** True when both graphs have the exact same `ExactStructureHash`, node count, and edge count. */
    readonly IsExactStructuralMatch: boolean;
}

/** Structural difference between a baseline graph (e.g. a saved Workflow) and a candidate graph. */
export interface DAGStructuralDiff {
    readonly SharedOperators: readonly string[];
    readonly AddedOperators: readonly string[];
    readonly RemovedOperators: readonly string[];
    readonly AddedEdges: readonly string[];
    readonly RemovedEdges: readonly string[];
}

/** Metadata about one executed runtime `TaskGraph` used for clustering and promotion discovery. */
export interface ExecutedTaskGraphRecord {
    /** Unique ID of the root task or agent run that produced this graph. */
    readonly RunID: string;
    /** The projected or submitted `TaskGraphSpec`. */
    readonly Spec: TaskGraphSpec;
    /** Whether the graph settled `Complete` without unhandled node failures. */
    readonly Succeeded: boolean;
    /** Total node retries or recovery edges triggered during execution. Default 0. */
    readonly RetryOrRecoveryCount?: number;
    /** Optional user rating (e.g. 1..5 or thumbs-up/down mapped to numeric) if available. */
    readonly UserRating?: number | null;
    /** When the execution completed. */
    readonly ExecutedAt?: Date;
    /** Optional originating Loop Agent ID or Name. */
    readonly OriginatingAgentName?: string | null;
}

/** Metadata about an existing saved Flow workflow (`MJ: AI Agents` where Type = 'Flow'). */
export interface SavedWorkflowRecord {
    readonly WorkflowAgentID: string;
    readonly WorkflowName: string;
    /** The workflow's compiled `TaskGraphSpec` (from `FlowGraphCompiler`). */
    readonly Spec: TaskGraphSpec;
}

/** A cluster of structurally similar ad-hoc runtime task graphs. */
export interface DiscoveredDAGCluster {
    readonly ClusterID: string;
    /** Representative graph (`ExecutedTaskGraphRecord`) with highest central similarity and cleanliness. */
    readonly Medoid: ExecutedTaskGraphRecord;
    readonly MedoidFingerprint: DAGFingerprint;
    /** All executed graphs belonging to this cluster. */
    readonly Members: readonly ExecutedTaskGraphRecord[];
    /** Fraction of members in the cluster where `Succeeded === true`. */
    readonly SuccessRate: number;
    /** Mean pairwise structural similarity across cluster members. */
    readonly MeanIntraClusterSimilarity: number;
    /** Fraction of members sharing the exact same `ExactStructureHash` as the medoid. */
    readonly ExactTopologyRatio: number;
}

/** Classification of a discovered cluster relative to existing canonized Workflows. */
export type WorkflowClusterDisposition =
    | 'PromoteToWorkflow'
    | 'EvolveExistingWorkflow'
    | 'ExistingWorkflowDiscoveryGap'
    | 'BelowPromotionThreshold';

/** Actionable finding produced for a discovered cluster of executed task graphs. */
export interface WorkflowClusterFinding {
    readonly Cluster: DiscoveredDAGCluster;
    readonly Disposition: WorkflowClusterDisposition;
    /** Best-matching existing saved Workflow, if any crossed the minimum overlap floor. */
    readonly ClosestSavedWorkflow?: {
        readonly WorkflowAgentID: string;
        readonly WorkflowName: string;
        readonly Similarity: DAGSimilarityScore;
        readonly Diff: DAGStructuralDiff;
    };
    /** Confidence score in [0, 1] combining cluster size, intra-cluster similarity, and success rate. */
    readonly Confidence: number;
    /** Human-readable explanation of why this cluster was surfaced. */
    readonly Summary: string;
}

/** Thresholds for clustering ad-hoc task graphs and identifying promotion candidates. */
export interface PromotionDiscoveryOptions {
    /** Minimum pairwise similarity to group two executed graphs into the same cluster. Default 0.75. */
    readonly clusterSimilarityThreshold?: number;
    /** Minimum number of executions in a cluster to qualify for promotion. Default 3. */
    readonly minClusterSize?: number;
    /** Minimum success rate across cluster members to qualify for promotion. Default 0.80. */
    readonly minSuccessRate?: number;
    /**
     * Similarity threshold above which a cluster is considered a duplicate of an already-saved Workflow
     * (indicating a routing/discovery gap rather than a net-new workflow). Default 0.85.
     */
    readonly existingWorkflowMatchThreshold?: number;
    /**
     * Lower similarity bound `[evolutionMinSimilarity, existingWorkflowMatchThreshold)` where a cluster
     * is flagged as a candidate evolution/v2 of an existing saved Workflow. Default 0.40.
     */
    readonly evolutionMinSimilarity?: number;
    /** Ignore trivial 1-node graphs when looking for multi-step workflow promotions. Default 2. */
    readonly minNodesPerGraph?: number;
    /**
     * Maximum number of executed task graphs to cluster in a single invocation (most recent runs
     * are prioritized when the input exceeds this cap). Default `MAX_CLUSTERING_GRAPHS` (500).
     */
    readonly maxGraphsToCluster?: number;
    readonly fingerprintOptions?: DAGFingerprintOptions;
    readonly similarityWeights?: DAGSimilarityWeights;
}

/** Default upper bound on executed task graphs clustered per call to bound pairwise matrix memory/CPU. */
export const MAX_CLUSTERING_GRAPHS = 500;

/** Complete output of `DiscoverWorkflowPromotionCandidates`. */
export interface WorkflowPromotionAnalysis {
    readonly Findings: readonly WorkflowClusterFinding[];
    readonly PromotionCandidates: readonly WorkflowClusterFinding[];
    readonly EvolutionCandidates: readonly WorkflowClusterFinding[];
    readonly DiscoveryGaps: readonly WorkflowClusterFinding[];
}

/**
 * Computes the canonical operator signature for a single `TaskGraphSpecNode`.
 *
 * Strips run-specific IDs (`tempId`, `assignToUserID`, layout coordinates, literal values)
 * while preserving the node's `kind` and the normalized name of its target Agent, Action,
 * Prompt, Decision schema, or Loop body operator.
 */
export function CanonicalizeNodeSignature(
    node: TaskGraphSpecNode,
    options: Pick<DAGFingerprintOptions, 'includeInputPayloadKeys'> = {},
): string {
    const baseOp = extractCoreOperatorToken(node);
    if (!options.includeInputPayloadKeys || !node.inputPayload) {
        return baseOp;
    }
    const keys = Object.keys(node.inputPayload)
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length > 0)
        .sort();
    return keys.length > 0 ? `${baseOp}[in:${keys.join(',')}]` : baseOp;
}

function extractCoreOperatorToken(node: TaskGraphSpecNode): string {
    switch (node.kind) {
        case 'Agent': {
            const cfg = node.configuration as TaskGraphNodeConfigMap['Agent'];
            const preset = cfg.presetName?.trim() ? `:${normalizeIdentifier(cfg.presetName)}` : '';
            return `Agent:${normalizeIdentifier(cfg.agentName)}${preset}`;
        }
        case 'Action': {
            const cfg = node.configuration as TaskGraphNodeConfigMap['Action'];
            return `Action:${normalizeIdentifier(cfg.actionName)}`;
        }
        case 'Prompt': {
            const cfg = node.configuration as TaskGraphNodeConfigMap['Prompt'];
            return `Prompt:${normalizeIdentifier(cfg.promptName)}`;
        }
        case 'Decision': {
            const cfg = node.configuration as TaskGraphNodeConfigMap['Decision'];
            const promptToken = cfg.promptName?.trim() ? normalizeIdentifier(cfg.promptName) : 'default_decision';
            const questionKinds = Object.keys(cfg.questions ?? {})
                .sort()
                .map((qKey) => `${normalizeIdentifier(qKey)}:${cfg.questions[qKey]?.kind ?? 'Unknown'}`)
                .join(',');
            return `Decision:${promptToken}[${questionKinds}]`;
        }
        case 'ForEach': {
            const cfg = node.configuration as TaskGraphNodeConfigMap['ForEach'];
            return `ForEach:${extractLoopBodyToken(cfg)}`;
        }
        case 'While': {
            const cfg = node.configuration as TaskGraphNodeConfigMap['While'];
            return `While:${extractLoopBodyToken(cfg)}`;
        }
        case 'External': {
            const cfg = node.configuration as TaskGraphNodeConfigMap['External'];
            return `External:${normalizeIdentifier(cfg.domain)}`;
        }
        case 'Human':
        default:
            return 'Human:approval_or_task';
    }
}

function extractLoopBodyToken(
    loopCfg: TaskGraphNodeConfigMap['ForEach'] | TaskGraphNodeConfigMap['While'],
): string {
    if ('action' in loopCfg && loopCfg.action?.name) {
        return `Action:${normalizeIdentifier(loopCfg.action.name)}`;
    }
    if ('subAgent' in loopCfg && loopCfg.subAgent?.name) {
        return `Agent:${normalizeIdentifier(loopCfg.subAgent.name)}`;
    }
    if ('steps' in loopCfg && Array.isArray(loopCfg.steps) && loopCfg.steps.length > 0) {
        return `Steps:${loopCfg.steps.length}`;
    }
    return 'Body';
}

function normalizeIdentifier(raw: string | undefined | null): string {
    if (!raw) return 'unnamed';
    return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Normalizes an edge condition expression into a structural shape token so two edges
 * testing the same decision root or step outcome match even if whitespace or literal thresholds differ.
 */
export function NormalizeEdgeConditionShape(dep: TaskGraphDependency): string {
    const depType = dep.dependencyType && dep.dependencyType !== 'Prerequisite' ? `${dep.dependencyType}:` : '';
    const xorPrefix = dep.exclusiveGroup ? 'xor:' : '';
    const raw = dep.condition?.trim();
    if (!raw) {
        return `${depType}${xorPrefix}unconditional`;
    }
    const referencesDecision = /\bdecisions\b/.test(raw);
    const referencesStepResult = /\bstepResult\b/.test(raw);
    const referencesPayload = /\bpayload\b/.test(raw);
    const roots: string[] = [];
    if (referencesDecision) roots.push('decisions');
    if (referencesStepResult) roots.push('stepResult');
    if (referencesPayload) roots.push('payload');
    const rootToken = roots.length > 0 ? roots.join('+') : 'expr';
    return `${depType}${xorPrefix}cond(${rootToken})`;
}

/**
 * Computes a deterministic `DAGFingerprint` for a `TaskGraphSpec` using Weisfeiler-Lehman
 * bidirectional neighborhood refinement, directed operator bigrams, and 2-hop reachability.
 */
export function ComputeDAGFingerprint(
    spec: TaskGraphSpec,
    options: DAGFingerprintOptions = {},
): DAGFingerprint {
    const wlIterations = options.wlIterations ?? 2;
    const includeConditionShape = options.includeConditionShape ?? true;

    const nodes = spec.tasks ?? [];
    const nodeSigByTempId = new Map<string, string>();
    const operatorMultiset = new Map<string, number>();

    for (const node of nodes) {
        const sig = CanonicalizeNodeSignature(node, options);
        nodeSigByTempId.set(node.tempId, sig);
        incrementCount(operatorMultiset, sig);
    }

    // Build forward (predecessor -> successor) and reverse (successor -> predecessor) adjacency lists
    const predecessors = new Map<string, Array<{ id: string; edgeToken: string }>>();
    const successors = new Map<string, Array<{ id: string; edgeToken: string }>>();
    for (const node of nodes) {
        predecessors.set(node.tempId, []);
        successors.set(node.tempId, []);
    }

    const directEdgeBigrams = new Map<string, number>();
    let edgeCount = 0;

    for (const node of nodes) {
        const targetSig = nodeSigByTempId.get(node.tempId);
        if (!targetSig) continue;

        for (const rawDep of node.dependsOn ?? []) {
            const dep = NormalizeDependency(rawDep);
            const sourceSig = nodeSigByTempId.get(dep.tempId);
            if (!sourceSig) continue;

            edgeCount++;
            const condShape = includeConditionShape ? NormalizeEdgeConditionShape(dep) : 'edge';
            const bigram = `${sourceSig} -[${condShape}]-> ${targetSig}`;
            incrementCount(directEdgeBigrams, bigram);

            predecessors.get(node.tempId)!.push({ id: dep.tempId, edgeToken: condShape });
            successors.get(dep.tempId)!.push({ id: node.tempId, edgeToken: condShape });
        }
    }

    // Compute 1-hop and 2-hop operator reachability pairs (opA ~> opB)
    const transitivePairs = new Set<string>();
    for (const node of nodes) {
        const uSig = nodeSigByTempId.get(node.tempId)!;
        const hop1Targets = successors.get(node.tempId) ?? [];
        for (const h1 of hop1Targets) {
            const h1Sig = nodeSigByTempId.get(h1.id);
            if (!h1Sig) continue;
            transitivePairs.add(`${uSig} ~> ${h1Sig}`);

            const hop2Targets = successors.get(h1.id) ?? [];
            for (const h2 of hop2Targets) {
                const h2Sig = nodeSigByTempId.get(h2.id);
                if (h2Sig) {
                    transitivePairs.add(`${uSig} ~> ${h2Sig}`);
                }
            }
        }
    }

    // Weisfeiler-Lehman (WL) directional + bidirectional subtree feature extraction
    const wlFeatures = new Map<string, number>();
    let currentInLabels = new Map<string, string>();
    let currentOutLabels = new Map<string, string>();
    let currentBiLabels = new Map<string, string>();

    for (const node of nodes) {
        const d0Hash = fnv1a64Hex(nodeSigByTempId.get(node.tempId)!);
        currentInLabels.set(node.tempId, d0Hash);
        currentOutLabels.set(node.tempId, d0Hash);
        currentBiLabels.set(node.tempId, d0Hash);
        incrementCount(wlFeatures, `d0:${d0Hash}`);
    }

    for (let iter = 1; iter <= wlIterations; iter++) {
        const nextInLabels = new Map<string, string>();
        const nextOutLabels = new Map<string, string>();
        const nextBiLabels = new Map<string, string>();

        for (const node of nodes) {
            const inSelf = currentInLabels.get(node.tempId)!;
            const outSelf = currentOutLabels.get(node.tempId)!;
            const biSelf = currentBiLabels.get(node.tempId)!;

            const predInTokens = (predecessors.get(node.tempId) ?? [])
                .map((p) => `${p.edgeToken}:${currentInLabels.get(p.id) ?? ''}`)
                .sort()
                .join(',');
            const succOutTokens = (successors.get(node.tempId) ?? [])
                .map((s) => `${s.edgeToken}:${currentOutLabels.get(s.id) ?? ''}`)
                .sort()
                .join(',');
            const predBiTokens = (predecessors.get(node.tempId) ?? [])
                .map((p) => `${p.edgeToken}:${currentBiLabels.get(p.id) ?? ''}`)
                .sort()
                .join(',');
            const succBiTokens = (successors.get(node.tempId) ?? [])
                .map((s) => `${s.edgeToken}:${currentBiLabels.get(s.id) ?? ''}`)
                .sort()
                .join(',');

            const inRefined = fnv1a64Hex(`${inSelf}|in(${predInTokens})`);
            const outRefined = fnv1a64Hex(`${outSelf}|out(${succOutTokens})`);
            const biRefined = fnv1a64Hex(`${biSelf}|in(${predBiTokens})|out(${succBiTokens})`);

            nextInLabels.set(node.tempId, inRefined);
            nextOutLabels.set(node.tempId, outRefined);
            nextBiLabels.set(node.tempId, biRefined);

            incrementCount(wlFeatures, `in_d${iter}:${inRefined}`);
            incrementCount(wlFeatures, `out_d${iter}:${outRefined}`);
            incrementCount(wlFeatures, `bi_d${iter}:${biRefined}`);
        }

        currentInLabels = nextInLabels;
        currentOutLabels = nextOutLabels;
        currentBiLabels = nextBiLabels;
    }

    // Canonical isomorphism-invariant hash of the whole DAG
    const sortedFinalNodeHashes = Array.from(currentBiLabels.values()).sort().join('|');
    const sortedBigrams = Array.from(directEdgeBigrams.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, c]) => `${k}#${c}`)
        .join('|');
    const exactStructureHash = fnv1a64Hex(
        `N=${nodes.length};E=${edgeCount};WL=${sortedFinalNodeHashes};BG=${sortedBigrams}`,
    );

    return {
        WorkflowName: spec.workflowName,
        NodeCount: nodes.length,
        EdgeCount: edgeCount,
        ExactStructureHash: exactStructureHash,
        OperatorMultiset: operatorMultiset,
        DirectEdgeBigrams: directEdgeBigrams,
        TransitiveReachabilityPairs: transitivePairs,
        WLSubtreeFeatures: wlFeatures,
        NodeSignaturesByTempId: nodeSigByTempId,
    };
}

/**
 * Compares two `DAGFingerprint`s and returns component and overall similarity scores in [0, 1].
 */
export function CompareDAGFingerprints(
    a: DAGFingerprint,
    b: DAGFingerprint,
    weights: DAGSimilarityWeights = {},
): DAGSimilarityScore {
    if (a.NodeCount === 0 && b.NodeCount === 0) {
        return {
            Overall: 1,
            OperatorJaccard: 1,
            EdgeBigramJaccard: 1,
            TransitivePairJaccard: 1,
            WLSubtreeCosine: 1,
            IsExactStructuralMatch: true,
        };
    }
    if (a.NodeCount === 0 || b.NodeCount === 0) {
        return {
            Overall: 0,
            OperatorJaccard: 0,
            EdgeBigramJaccard: 0,
            TransitivePairJaccard: 0,
            WLSubtreeCosine: 0,
            IsExactStructuralMatch: false,
        };
    }

    const isExact =
        a.NodeCount === b.NodeCount &&
        a.EdgeCount === b.EdgeCount &&
        a.ExactStructureHash === b.ExactStructureHash;

    if (isExact) {
        return {
            Overall: 1,
            OperatorJaccard: 1,
            EdgeBigramJaccard: 1,
            TransitivePairJaccard: 1,
            WLSubtreeCosine: 1,
            IsExactStructuralMatch: true,
        };
    }

    const opJaccard = multisetJaccard(a.OperatorMultiset, b.OperatorMultiset);
    const bothSingleNode = a.EdgeCount === 0 && b.EdgeCount === 0;
    const edgeJaccard = bothSingleNode
        ? opJaccard
        : multisetJaccard(a.DirectEdgeBigrams, b.DirectEdgeBigrams);
    const transitiveJaccard = bothSingleNode
        ? opJaccard
        : setJaccard(a.TransitiveReachabilityPairs, b.TransitiveReachabilityPairs);
    const wlCosine = multisetCosine(a.WLSubtreeFeatures, b.WLSubtreeFeatures);

    const wOp = weights.operatorWeight ?? 0.30;
    const wEdge = weights.directEdgeWeight ?? 0.25;
    const wTrans = weights.transitiveEdgeWeight ?? 0.20;
    const wWl = weights.wlSubtreeWeight ?? 0.25;
    const weightSum = wOp + wEdge + wTrans + wWl;

    const rawOverall =
        weightSum > 0
            ? (wOp * opJaccard + wEdge * edgeJaccard + wTrans * transitiveJaccard + wWl * wlCosine) / weightSum
            : 0;

    return {
        Overall: round4(rawOverall),
        OperatorJaccard: round4(opJaccard),
        EdgeBigramJaccard: round4(edgeJaccard),
        TransitivePairJaccard: round4(transitiveJaccard),
        WLSubtreeCosine: round4(wlCosine),
        IsExactStructuralMatch: false,
    };
}

/** Convenience wrapper comparing two `TaskGraphSpec`s directly. */
export function ComputeDAGSimilarity(
    specA: TaskGraphSpec,
    specB: TaskGraphSpec,
    options?: DAGFingerprintOptions,
    weights?: DAGSimilarityWeights,
): DAGSimilarityScore {
    const fpA = ComputeDAGFingerprint(specA, options);
    const fpB = ComputeDAGFingerprint(specB, options);
    return CompareDAGFingerprints(fpA, fpB, weights);
}

/**
 * Computes the structural difference between a baseline fingerprint (e.g. a saved Workflow)
 * and a candidate fingerprint (e.g. a recurring ad-hoc TaskGraph cluster).
 */
export function DiffDAGFingerprints(
    baseline: DAGFingerprint,
    candidate: DAGFingerprint,
): DAGStructuralDiff {
    const sharedOps: string[] = [];
    const addedOps: string[] = [];
    const removedOps: string[] = [];

    const allOpKeys = new Set<string>([
        ...baseline.OperatorMultiset.keys(),
        ...candidate.OperatorMultiset.keys(),
    ]);

    for (const op of Array.from(allOpKeys).sort()) {
        const baseCount = baseline.OperatorMultiset.get(op) ?? 0;
        const candCount = candidate.OperatorMultiset.get(op) ?? 0;
        const common = Math.min(baseCount, candCount);
        for (let i = 0; i < common; i++) sharedOps.push(op);
        for (let i = 0; i < candCount - baseCount; i++) addedOps.push(op);
        for (let i = 0; i < baseCount - candCount; i++) removedOps.push(op);
    }

    const addedEdges: string[] = [];
    const removedEdges: string[] = [];
    const allEdgeKeys = new Set<string>([
        ...baseline.DirectEdgeBigrams.keys(),
        ...candidate.DirectEdgeBigrams.keys(),
    ]);

    for (const edge of Array.from(allEdgeKeys).sort()) {
        const baseCount = baseline.DirectEdgeBigrams.get(edge) ?? 0;
        const candCount = candidate.DirectEdgeBigrams.get(edge) ?? 0;
        for (let i = 0; i < candCount - baseCount; i++) addedEdges.push(edge);
        for (let i = 0; i < baseCount - candCount; i++) removedEdges.push(edge);
    }

    return {
        SharedOperators: sharedOps,
        AddedOperators: addedOps,
        RemovedOperators: removedOps,
        AddedEdges: addedEdges,
        RemovedEdges: removedEdges,
    };
}

/**
 * Clusters executed ad-hoc runtime task graphs by structural similarity and cross-checks
 * each cluster against existing saved Flow workflows to surface:
 * 1. `PromoteToWorkflow`: Novel recurring successful patterns ready to canonize.
 * 2. `EvolveExistingWorkflow`: Recurring patterns that extend/modify an existing saved workflow.
 * 3. `ExistingWorkflowDiscoveryGap`: Ad-hoc runs that rebuild an already-saved workflow from scratch.
 */
export function DiscoverWorkflowPromotionCandidates(
    executedGraphs: readonly ExecutedTaskGraphRecord[],
    savedWorkflows: readonly SavedWorkflowRecord[] = [],
    options: PromotionDiscoveryOptions = {},
): WorkflowPromotionAnalysis {
    const simThreshold = options.clusterSimilarityThreshold ?? 0.75;
    const minClusterSize = options.minClusterSize ?? 3;
    const minSuccessRate = options.minSuccessRate ?? 0.80;
    const existingMatchThreshold = options.existingWorkflowMatchThreshold ?? 0.85;
    const evolutionMinSim = options.evolutionMinSimilarity ?? 0.40;
    const minNodes = options.minNodesPerGraph ?? 2;
    const maxGraphs = Math.max(1, options.maxGraphsToCluster ?? MAX_CLUSTERING_GRAPHS);

    let eligibleRuns = executedGraphs.filter((r) => (r.Spec.tasks?.length ?? 0) >= minNodes);
    if (eligibleRuns.length === 0) {
        return {
            Findings: [],
            PromotionCandidates: [],
            EvolutionCandidates: [],
            DiscoveryGaps: [],
        };
    }

    if (eligibleRuns.length > maxGraphs) {
        eligibleRuns = [...eligibleRuns]
            .sort((a, b) => {
                const timeA = a.ExecutedAt ? new Date(a.ExecutedAt).getTime() : 0;
                const timeB = b.ExecutedAt ? new Date(b.ExecutedAt).getTime() : 0;
                return timeB - timeA;
            })
            .slice(0, maxGraphs);
    }

    const runFingerprints = eligibleRuns.map((run) => ({
        run,
        fp: ComputeDAGFingerprint(run.Spec, options.fingerprintOptions),
    }));

    const savedFingerprints = savedWorkflows.map((wf) => ({
        workflow: wf,
        fp: ComputeDAGFingerprint(wf.Spec, options.fingerprintOptions),
    }));

    // Pairwise similarity matrix among eligible runs
    const n = runFingerprints.length;
    const simMatrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
        simMatrix[i][i] = 1;
        for (let j = i + 1; j < n; j++) {
            const score = CompareDAGFingerprints(
                runFingerprints[i].fp,
                runFingerprints[j].fp,
                options.similarityWeights,
            );
            simMatrix[i][j] = score.Overall;
            simMatrix[j][i] = score.Overall;
        }
    }

    // Complete-linkage agglomerative clustering (pre-bucketed by ExactStructureHash and updated in O(k) per merge)
    const rawClusters = clusterByCompleteLinkage(
        runFingerprints.map((r) => r.fp),
        simMatrix,
        simThreshold,
    );

    const findings: WorkflowClusterFinding[] = [];

    for (let cIdx = 0; cIdx < rawClusters.length; cIdx++) {
        const indices = rawClusters[cIdx];
        const members = indices.map((idx) => runFingerprints[idx].run);

        // Choose medoid: member maximizing mean similarity to cluster peers, tie-broken by success & zero retries
        let bestMemberLocalIdx = 0;
        let bestMedoidScore = -Infinity;
        for (let a = 0; a < indices.length; a++) {
            const globalA = indices[a];
            let sumSim = 0;
            for (let b = 0; b < indices.length; b++) {
                sumSim += simMatrix[globalA][indices[b]];
            }
            const meanSim = sumSim / indices.length;
            const runA = runFingerprints[globalA].run;
            const cleanlinessBonus =
                (runA.Succeeded ? 0.01 : -0.05) - 0.002 * (runA.RetryOrRecoveryCount ?? 0);
            const candidateScore = meanSim + cleanlinessBonus;
            if (candidateScore > bestMedoidScore) {
                bestMedoidScore = candidateScore;
                bestMemberLocalIdx = a;
            }
        }

        const medoidGlobalIdx = indices[bestMemberLocalIdx];
        const medoid = runFingerprints[medoidGlobalIdx].run;
        const medoidFp = runFingerprints[medoidGlobalIdx].fp;

        // Mean intra-cluster pairwise similarity
        let pairSum = 0;
        let pairCount = 0;
        for (let a = 0; a < indices.length; a++) {
            for (let b = a + 1; b < indices.length; b++) {
                pairSum += simMatrix[indices[a]][indices[b]];
                pairCount++;
            }
        }
        const meanIntraSim = pairCount > 0 ? round4(pairSum / pairCount) : 1;

        const successCount = members.filter((m) => m.Succeeded).length;
        const successRate = round4(successCount / members.length);

        const exactMatches = indices.filter(
            (idx) => runFingerprints[idx].fp.ExactStructureHash === medoidFp.ExactStructureHash,
        ).length;
        const exactTopologyRatio = round4(exactMatches / members.length);

        const cluster: DiscoveredDAGCluster = {
            ClusterID: `cluster-${medoidFp.ExactStructureHash.slice(0, 8)}-${cIdx + 1}`,
            Medoid: medoid,
            MedoidFingerprint: medoidFp,
            Members: members,
            SuccessRate: successRate,
            MeanIntraClusterSimilarity: meanIntraSim,
            ExactTopologyRatio: exactTopologyRatio,
        };

        // Compare medoid against all saved workflows
        let closestSaved: WorkflowClusterFinding['ClosestSavedWorkflow'] | undefined;
        for (const saved of savedFingerprints) {
            const sim = CompareDAGFingerprints(medoidFp, saved.fp, options.similarityWeights);
            if (!closestSaved || sim.Overall > closestSaved.Similarity.Overall) {
                closestSaved = {
                    WorkflowAgentID: saved.workflow.WorkflowAgentID,
                    WorkflowName: saved.workflow.WorkflowName,
                    Similarity: sim,
                    Diff: DiffDAGFingerprints(saved.fp, medoidFp),
                };
            }
        }

        const meetsVolumeAndQuality =
            members.length >= minClusterSize && successRate >= minSuccessRate;
        const confidence = computeClusterConfidence(members.length, minClusterSize, meanIntraSim, successRate);

        let disposition: WorkflowClusterDisposition = 'BelowPromotionThreshold';
        let summary: string;

        if (closestSaved && closestSaved.Similarity.Overall >= existingMatchThreshold) {
            disposition = meetsVolumeAndQuality ? 'ExistingWorkflowDiscoveryGap' : 'BelowPromotionThreshold';
            summary =
                `Cluster of ${members.length} ad-hoc task graph(s) matches existing saved Workflow ` +
                `"${closestSaved.WorkflowName}" (similarity ${(closestSaved.Similarity.Overall * 100).toFixed(1)}%). ` +
                `Agents are reconstructing this workflow dynamically instead of invoking the saved workflow.`;
        } else if (
            closestSaved &&
            closestSaved.Similarity.Overall >= evolutionMinSim &&
            meetsVolumeAndQuality
        ) {
            disposition = 'EvolveExistingWorkflow';
            const addedCount = closestSaved.Diff.AddedOperators.length;
            const removedCount = closestSaved.Diff.RemovedOperators.length;
            summary =
                `Cluster of ${members.length} successful task graph(s) (${(successRate * 100).toFixed(0)}% success) ` +
                `overlaps saved Workflow "${closestSaved.WorkflowName}" ` +
                `(similarity ${(closestSaved.Similarity.Overall * 100).toFixed(1)}%, +${addedCount}/-${removedCount} operator step(s)). ` +
                `Candidate for evolving "${closestSaved.WorkflowName}".`;
        } else if (meetsVolumeAndQuality) {
            disposition = 'PromoteToWorkflow';
            summary =
                `Recurring pattern across ${members.length} task graph executions ` +
                `(${(successRate * 100).toFixed(0)}% success, ${(meanIntraSim * 100).toFixed(1)}% structural consistency, ` +
                `${medoidFp.NodeCount} steps) has no matching saved workflow. Ready for promotion to Canon Workflow.`;
        } else {
            summary =
                `Cluster of ${members.length} execution(s) (${(successRate * 100).toFixed(0)}% success) ` +
                `below promotion threshold (requires >= ${minClusterSize} runs and >= ${(minSuccessRate * 100).toFixed(0)}% success).`;
        }

        findings.push({
            Cluster: cluster,
            Disposition: disposition,
            ...(closestSaved ? { ClosestSavedWorkflow: closestSaved } : {}),
            Confidence: confidence,
            Summary: summary,
        });
    }

    // Sort findings by confidence descending, then cluster size descending
    findings.sort(
        (a, b) => b.Confidence - a.Confidence || b.Cluster.Members.length - a.Cluster.Members.length,
    );

    return {
        Findings: findings,
        PromotionCandidates: findings.filter((f) => f.Disposition === 'PromoteToWorkflow'),
        EvolutionCandidates: findings.filter((f) => f.Disposition === 'EvolveExistingWorkflow'),
        DiscoveryGaps: findings.filter((f) => f.Disposition === 'ExistingWorkflowDiscoveryGap'),
    };
}

/**
 * Complete-linkage agglomerative clustering:
 * 1. Pre-buckets runs with identical `(ExactStructureHash, NodeCount, EdgeCount)` in O(N) because
 *    isomorphic fingerprints have similarity 1.0 with each other and identical similarity to any third DAG.
 * 2. Maintains a cluster-to-cluster complete-linkage similarity matrix and updates only the merged
 *    row/column in O(k) (`Math.min(sim(a, k), sim(b, k))`) at each merge step.
 */
function clusterByCompleteLinkage(
    fingerprints: readonly DAGFingerprint[],
    simMatrix: readonly (readonly number[])[],
    threshold: number,
): number[][] {
    // Step 1: Pre-bucket exact structural matches
    const bucketMap = new Map<string, number[]>();
    for (let i = 0; i < fingerprints.length; i++) {
        const fp = fingerprints[i];
        const key = `${fp.ExactStructureHash}:${fp.NodeCount}:${fp.EdgeCount}`;
        const existing = bucketMap.get(key);
        if (existing) {
            existing.push(i);
        } else {
            bucketMap.set(key, [i]);
        }
    }

    const clusters: number[][] = Array.from(bucketMap.values());
    const kCount = clusters.length;
    if (kCount <= 1) {
        return clusters;
    }

    // Step 2: Initialize cluster-level complete-linkage similarity matrix
    const clusterSim: number[][] = Array.from({ length: kCount }, () => new Array<number>(kCount).fill(1));
    const active: boolean[] = new Array<boolean>(kCount).fill(true);
    for (let i = 0; i < kCount; i++) {
        for (let j = i + 1; j < kCount; j++) {
            const sim = simMatrix[clusters[i][0]][clusters[j][0]];
            clusterSim[i][j] = sim;
            clusterSim[j][i] = sim;
        }
    }

    let activeCount = kCount;
    while (activeCount > 1) {
        let bestI = -1;
        let bestJ = -1;
        let bestMinSim = -1;

        for (let i = 0; i < kCount; i++) {
            if (!active[i]) continue;
            for (let j = i + 1; j < kCount; j++) {
                if (!active[j]) continue;
                const minSim = clusterSim[i][j];
                if (minSim >= threshold && minSim > bestMinSim) {
                    bestMinSim = minSim;
                    bestI = i;
                    bestJ = j;
                }
            }
        }

        if (bestI === -1 || bestJ === -1) {
            break;
        }

        // Merge bestJ into bestI and update complete-linkage similarities in O(k)
        clusters[bestI].push(...clusters[bestJ]);
        active[bestJ] = false;
        activeCount--;

        for (let k = 0; k < kCount; k++) {
            if (!active[k] || k === bestI) continue;
            const mergedSim = Math.min(clusterSim[bestI][k], clusterSim[bestJ][k]);
            clusterSim[bestI][k] = mergedSim;
            clusterSim[k][bestI] = mergedSim;
        }
    }

    const result: number[][] = [];
    for (let i = 0; i < kCount; i++) {
        if (active[i]) {
            result.push(clusters[i]);
        }
    }
    return result;
}

function computeClusterConfidence(
    size: number,
    minSize: number,
    meanIntraSim: number,
    successRate: number,
): number {
    const sizeFactor = Math.min(1, size / Math.max(minSize * 2, 1));
    const raw = 0.35 * sizeFactor + 0.35 * meanIntraSim + 0.30 * successRate;
    return round4(Math.max(0, Math.min(1, raw)));
}

function incrementCount(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function multisetJaccard(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    const keys = new Set<string>([...a.keys(), ...b.keys()]);
    let intersection = 0;
    let union = 0;
    for (const k of keys) {
        const ca = a.get(k) ?? 0;
        const cb = b.get(k) ?? 0;
        intersection += Math.min(ca, cb);
        union += Math.max(ca, cb);
    }
    return union > 0 ? intersection / union : 0;
}

function setJaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;
    for (const item of a) {
        if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
}

function multisetCosine(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const [k, va] of a) {
        normA += va * va;
        const vb = b.get(k);
        if (vb !== undefined) {
            dot += va * vb;
        }
    }
    for (const vb of b.values()) {
        normB += vb * vb;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
}

/**
 * Pure 64-bit FNV-1a hash (implemented as two 32-bit halves with cross-mixing so it runs
 * identically in browsers, React Native, and Node without `node:crypto` or BigInt overhead).
 */
function fnv1a64Hex(input: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        h1 ^= code;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= code ^ (i & 0xff);
        h2 = Math.imul(h2, 0x85ebca6b);
    }
    h1 ^= h2 >>> 13;
    h2 ^= h1 >>> 15;
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `${hex1}${hex2}`;
}

function round4(value: number): number {
    return Math.round(value * 10000) / 10000;
}
