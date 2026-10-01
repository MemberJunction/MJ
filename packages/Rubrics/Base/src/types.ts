/** How a not-applicable answer changes the node's weight. Criterion policy wins over the version policy. */
export type NotApplicablePolicy = 'ExcludeAndRedistribute' | 'CountAsZero' | 'FailEvaluation' | 'NotAllowed';

/** How a group combines its included, non-advisory children. Null on a group means WeightedMean. */
export type RollupMethod = 'WeightedMean' | 'Minimum' | 'Maximum';

export type RubricNodeType = 'Group' | 'Criterion';

export type RubricScaleType = 'Levels' | 'Numeric';

/** First match wins. See RubricScoring.compute. */
export type RubricOutcome =
    | 'Incomplete'
    | 'NotApplicableFailure'
    | 'GateFailed'
    | 'BelowThreshold'
    | 'Passed'
    | 'Scored';

/** How much a draft differs from the version it was cloned from. Initial is the first publish. */
export type VersionBump = 'Major' | 'Minor' | 'Patch' | 'Initial';

export interface RubricScaleLevelSnapshot {
    id: string;
    label: string;
    value: number;
    /** Explicit 0..1 position. A levels answer scores this, not a linear map of value. */
    normalizedValue: number;
    description?: string | null;
    sequence: number;
}

export interface RubricScaleSnapshot {
    id: string;
    scaleType: RubricScaleType;
    minValue?: number | null;
    maxValue?: number | null;
    step?: number | null;
    higherIsBetter: boolean;
    levels: RubricScaleLevelSnapshot[];
}

export interface RubricLevelAnchorSnapshot {
    scaleLevelId?: string | null;
    anchorValue?: number | null;
    descriptor: string;
}

export interface RubricNodeSnapshot {
    id: string;
    /** Stable identity across versions. Diff and hashes match nodes by this, not by id. */
    key: string;
    parentId?: string | null;
    name: string;
    description?: string | null;
    guidance?: string | null;
    nodeType: RubricNodeType;
    scaleId?: string | null;
    weight: number;
    isAdvisory: boolean;
    isGate: boolean;
    gateMinimumScore?: number | null;
    notApplicablePolicy?: NotApplicablePolicy | null;
    rollupMethod?: RollupMethod | null;
    evidenceRequired: boolean;
    rationaleRequired: boolean;
    sequence: number;
    evaluatorConfig?: unknown;
    anchors?: RubricLevelAnchorSnapshot[];
}

export interface RubricBandSnapshot {
    id: string;
    label: string;
    description?: string | null;
    minScore: number;
    maxScore: number;
    displayTone: string;
    sequence: number;
}

/** One published or draft version, already loaded. Ids are local to this snapshot. */
export interface RubricVersionSnapshot {
    id: string;
    rubricId: string;
    majorVersion?: number | null;
    minorVersion?: number | null;
    patchVersion?: number | null;
    instructions?: string | null;
    passThreshold?: number | null;
    minimumCompleteness?: number | null;
    notApplicablePolicy: NotApplicablePolicy;
    scoreDisplayMin: number;
    scoreDisplayMax: number;
    nodes: RubricNodeSnapshot[];
    scales: RubricScaleSnapshot[];
    bands: RubricBandSnapshot[];
}

/** One leaf answer. Groups are not answered; the scorer writes their rows. */
export interface RubricAnswer {
    criterionId: string;
    scaleLevelId?: string | null;
    rawValue?: number | null;
    isNotApplicable?: boolean;
    /** 0..1 when the evaluator reported one. Omitted values are left out of the confidence mean. */
    confidence?: number | null;
}

export interface RubricScoreInput {
    version: RubricVersionSnapshot;
    answers: RubricAnswer[];
    /** Consumer override. Stored as PassThresholdApplied. Null means the version threshold. */
    passThresholdOverride?: number | null;
}

export interface ScoredNode {
    id: string;
    key: string;
    /** 0..1, or null when the node is excluded or unanswered. Rounded to 6 places. */
    normalizedScore: number | null;
    /** This node's share of its included siblings. Null when the node is not in the rollup. */
    effectiveWeight: number | null;
    /**
     * normalizedScore times the product of effective weights from this node to the root.
     * Null when any ancestor rolls up by Minimum or Maximum.
     */
    overallContribution: number | null;
    gateFailed: boolean;
    isNotApplicable: boolean;
    isAdvisory: boolean;
}

export interface RubricScoreResult {
    /** 0..1 WeightedMean of the included top-level nodes, or null when nothing was included. */
    normalizedScore: number | null;
    /**
     * Scored applicable non-advisory leaves divided by applicable non-advisory leaves.
     * 1 when nothing is applicable.
     */
    completeness: number | null;
    outcome: RubricOutcome;
    /** True only for Passed. Null for Scored, and for Incomplete when there is no threshold and no gate. */
    passed: boolean | null;
    gateFailed: boolean;
    passThresholdApplied: number | null;
    bandId: string | null;
    /** OverallContribution-weighted mean of leaf confidences that were reported. */
    confidence: number | null;
    nodes: ScoredNode[];
    scoringEngineVersion: '1.0';
}

export interface VersionChange {
    bump: 'Major' | 'Minor' | 'Patch';
    /** Node key, band id, scale id, or "version". */
    subject: string;
    property: string;
}

export interface VersionDiffResult {
    changes: VersionChange[];
    /** Null when the draft is identical to its base and cannot be published. */
    computedBump: 'Major' | 'Minor' | 'Patch' | null;
    /** max(computed, requested). An author may go higher, never lower. Initial on the first publish. */
    appliedBump: VersionBump | null;
    nextVersion: { major: number; minor: number; patch: number } | null;
}
