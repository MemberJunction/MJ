/**
 * @fileoverview Deterministic telemetry and Canon Health drift scoring for saved Workflows (Flow DAGs).
 *
 * Evaluates saved canonized workflows against historical execution logs and ad-hoc TaskGraph clusters
 * across the Canon-First health signals:
 * 1. Usage Decay & Dormancy (raw velocity ratio + domain-activity-adjusted abandonment detection)
 * 2. Exception & Loop-Escalation Rate (step failures, recovery branches, Loop/Human bailouts + hotspot steps)
 * 3. Outcome Drift (completion/approval rate shifts relative to baseline)
 * 4. Shadow-Bypass Correlation (matching a decaying/failing saved Workflow to an evolved ad-hoc DAG cluster)
 *
 * Pure and dependency-free so both server-side ambient learning cycles and Explorer dashboards share one model.
 *
 * @module @memberjunction/ai-core-plus
 */

import {
    CompareDAGFingerprints,
    ComputeDAGFingerprint,
    DiffDAGFingerprints,
    type DAGFingerprint,
    type DAGFingerprintOptions,
    type DAGSimilarityScore,
    type DAGStructuralDiff,
    type DiscoveredDAGCluster,
} from './dag-similarity';
import type { TaskGraphSpec } from './task-graph-spec';

/** Telemetry record for one historical execution of a saved Workflow. */
export interface WorkflowRunTelemetryRecord {
    readonly RunID: string;
    readonly StartedAt: Date;
    readonly CompletedAt?: Date | null;
    /** Overall run settlement status. */
    readonly Status: 'Completed' | 'Failed' | 'Cancelled' | 'Blocked' | 'Running';
    /**
     * True when the deterministic DAG had to hand off to an unplanned Loop agent fallback,
     * trigger a failure-recovery edge (`stepResult.Success === false`), or park on a rescue Human task.
     */
    readonly EscalatedToLoopOrRecovery?: boolean;
    /**
     * Canonical operator signatures (`Kind:Target`) or step names of nodes that failed,
     * retried, or triggered an escalation during this run.
     */
    readonly FailedOrEscalatedNodeSignatures?: readonly string[];
    /** Optional downstream human approval or rubric outcome (`true` = approved/passed, `false` = rejected). */
    readonly OutcomeApproved?: boolean | null;
}

/** Input bundle for evaluating one saved canonized Workflow's health. */
export interface WorkflowTelemetryInput {
    readonly WorkflowAgentID: string;
    readonly WorkflowName: string;
    /** Compiled `TaskGraphSpec` of the saved Flow workflow. */
    readonly Spec: TaskGraphSpec;
    /** All historical runs within `(evaluationTime - (recentWindowDays + baselineWindowDays), evaluationTime]`. */
    readonly Runs: readonly WorkflowRunTelemetryRecord[];
    /** When the workflow was created or promoted to Canon (prevents brand-new workflows from false dormancy). */
    readonly CreatedAt?: Date | null;
    /** Whether the workflow has an active Scheduled Job trigger (scheduled workflows expect steady cadence). */
    readonly HasActiveSchedule?: boolean;
    /**
     * Optional external count of domain/entity runs in the recent window (if not derived from `adHocClusters`).
     */
    readonly RecentDomainActivityCount?: number;
    /**
     * Optional external count of domain/entity runs in the baseline window (if not derived from `adHocClusters`).
     */
    readonly BaselineDomainActivityCount?: number;
}

/** Configurable windows and thresholds for Canon Health evaluation. */
export interface WorkflowHealthOptions {
    /** Reference timestamp for window calculations. Defaults to `new Date()`. */
    readonly evaluationTime?: Date;
    /** Length of the recent trailing window in days. Default 30. */
    readonly recentWindowDays?: number;
    /** Length of the prior baseline window in days (immediately preceding the recent window). Default 60. */
    readonly baselineWindowDays?: number;
    /** Days without a single execution before a workflow is flagged `Dormant`. Default 60. */
    readonly dormantDaysThreshold?: number;
    /** Minimum baseline runs required before computing velocity decay ratios. Default 4. */
    readonly minBaselineRunsForDecay?: number;
    /**
     * Velocity ratio (`RecentRunsPerDay / BaselineRunsPerDay`) below which usage decay is flagged.
     * Default 0.35 (a >65% drop in invocation rate).
     */
    readonly usageDecayRatioThreshold?: number;
    /**
     * Recent exception/escalation rate (0..1) or delta above baseline that triggers an exception alert.
     * Default absolute 0.25 or delta +0.15.
     */
    readonly exceptionRateThreshold?: number;
    readonly exceptionRateDeltaThreshold?: number;
    /**
     * Recent outcome approval/success drop vs. baseline that triggers `OutcomeDrift`. Default 0.15 (15% drop).
     */
    readonly outcomeDriftDeltaThreshold?: number;
    /** Similarity band `[min, max)` linking a workflow to an evolved shadow ad-hoc cluster. Default `[0.40, 0.85)`. */
    readonly shadowBypassMinSimilarity?: number;
    readonly shadowBypassMaxSimilarity?: number;
    readonly fingerprintOptions?: DAGFingerprintOptions;
}

/** Canon-First health signals detected on a workflow. */
export type WorkflowHealthSignalKind =
    | 'Healthy'
    | 'Dormant'
    | 'UsageDecay'
    | 'ExceptionSpike'
    | 'OutcomeDrift'
    | 'ShadowBypassed';

/** Recommended triage action aligned with the Canon-First methodology table. */
export type WorkflowTriageAction =
    | 'None'
    | 'PruneOrDeprecate'
    | 'AdjustOrReExtract'
    | 'SupersedeWithShadowCluster'
    | 'HumanReview';

/** Risk level governing whether an agent can auto-stage the cleanup or must route to human review. */
export type CanonTriageRiskLevel = 'Low' | 'Medium' | 'High';

/** Node-level hotspot within a workflow where failures or loop escalations concentrate. */
export interface WorkflowHotspotNode {
    readonly NodeSignature: string;
    readonly IncidentCount: number;
    /** Fraction of recent runs in which this specific node failed or escalated. */
    readonly IncidentRate: number;
}

/** Correlation between a decaying/failing saved Workflow and a recurring ad-hoc TaskGraph cluster. */
export interface ShadowBypassCorrelation {
    readonly Cluster: DiscoveredDAGCluster;
    readonly Similarity: DAGSimilarityScore;
    readonly Diff: DAGStructuralDiff;
    readonly RecentClusterRunsCount: number;
}

/** Comprehensive Canon Health report for a single saved Workflow. */
export interface WorkflowHealthReport {
    readonly WorkflowAgentID: string;
    readonly WorkflowName: string;
    readonly Fingerprint: DAGFingerprint;
    readonly Signals: readonly WorkflowHealthSignalKind[];
    readonly RecommendedAction: WorkflowTriageAction;
    readonly RiskLevel: CanonTriageRiskLevel;
    /** Overall health score in [0, 1] (`1.0` = healthy, `< 0.5` = degraded/drifted). */
    readonly HealthScore: number;
    readonly Metrics: {
        readonly TotalRunsCount: number;
        readonly RecentRunsCount: number;
        readonly BaselineRunsCount: number;
        readonly RecentRunsPerDay: number;
        readonly BaselineRunsPerDay: number;
        /** `RecentRunsPerDay / BaselineRunsPerDay` (or `null` when baseline had insufficient runs). */
        readonly UsageVelocityRatio: number | null;
        /**
         * `UsageVelocityRatio / DomainActivityVelocityRatio` — distinguishes true workflow abandonment
         * (`< 0.40`) from a general seasonal slowdown across the whole domain (`~1.0`).
         */
        readonly DomainAdjustedVelocityRatio: number | null;
        readonly DaysSinceLastRun: number | null;
        readonly RecentExceptionRate: number;
        readonly BaselineExceptionRate: number;
        readonly ExceptionRateDelta: number;
        readonly RecentSuccessRate: number;
        readonly BaselineSuccessRate: number;
        readonly SuccessRateDelta: number;
    };
    readonly HotspotNodes: readonly WorkflowHotspotNode[];
    readonly ShadowBypass?: ShadowBypassCorrelation;
    readonly Summary: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Evaluates Canon Health across a set of saved Workflows, optionally correlating usage decay
 * and exception spikes against discovered ad-hoc `TaskGraph` clusters (`ShadowBypass`).
 */
export function EvaluateWorkflowCanonHealth(
    inputs: readonly WorkflowTelemetryInput[],
    adHocClusters: readonly DiscoveredDAGCluster[] = [],
    options: WorkflowHealthOptions = {},
): WorkflowHealthReport[] {
    const evalTime = options.evaluationTime ?? new Date();
    const recentDays = Math.max(1, options.recentWindowDays ?? 30);
    const baselineDays = Math.max(1, options.baselineWindowDays ?? 60);
    const dormantThreshold = options.dormantDaysThreshold ?? 60;
    const minBaselineRuns = options.minBaselineRunsForDecay ?? 4;
    const decayThreshold = options.usageDecayRatioThreshold ?? 0.35;
    const exceptionThreshold = options.exceptionRateThreshold ?? 0.25;
    const exceptionDeltaThreshold = options.exceptionRateDeltaThreshold ?? 0.15;
    const outcomeDriftThreshold = options.outcomeDriftDeltaThreshold ?? 0.15;
    const shadowMinSim = options.shadowBypassMinSimilarity ?? 0.40;
    const shadowMaxSim = options.shadowBypassMaxSimilarity ?? 0.85;

    const evalMs = evalTime.getTime();
    const recentStartMs = evalMs - recentDays * MS_PER_DAY;
    const baselineStartMs = recentStartMs - baselineDays * MS_PER_DAY;

    const reports: WorkflowHealthReport[] = [];

    for (const input of inputs) {
        const fp = ComputeDAGFingerprint(input.Spec, options.fingerprintOptions);

        const recentRuns: WorkflowRunTelemetryRecord[] = [];
        const baselineRuns: WorkflowRunTelemetryRecord[] = [];
        let lastRunMs: number | null = null;

        for (const run of input.Runs) {
            const startedMs = run.StartedAt.getTime();
            if (startedMs > evalMs) continue;
            if (lastRunMs === null || startedMs > lastRunMs) {
                lastRunMs = startedMs;
            }
            if (startedMs >= recentStartMs) {
                recentRuns.push(run);
            } else if (startedMs >= baselineStartMs) {
                baselineRuns.push(run);
            }
        }

        const recentRunsPerDay = recentRuns.length / recentDays;
        const baselineRunsPerDay = baselineRuns.length / baselineDays;

        const velocityRatio =
            baselineRuns.length >= minBaselineRuns && baselineRunsPerDay > 0
                ? round4(recentRunsPerDay / baselineRunsPerDay)
                : null;

        const daysSinceLastRun =
            lastRunMs !== null
                ? round4((evalMs - lastRunMs) / MS_PER_DAY)
                : input.CreatedAt
                  ? round4(Math.max(0, (evalMs - input.CreatedAt.getTime()) / MS_PER_DAY))
                  : null;

        // Exception & escalation rates
        const recentExceptions = recentRuns.filter(isExceptionOrEscalatedRun).length;
        const baselineExceptions = baselineRuns.filter(isExceptionOrEscalatedRun).length;
        const recentExceptionRate =
            recentRuns.length > 0 ? round4(recentExceptions / recentRuns.length) : 0;
        const baselineExceptionRate =
            baselineRuns.length > 0 ? round4(baselineExceptions / baselineRuns.length) : 0;
        const exceptionRateDelta = round4(recentExceptionRate - baselineExceptionRate);

        // Outcome success/approval rates
        const recentSuccessRate = computeEffectiveSuccessRate(recentRuns);
        const baselineSuccessRate = computeEffectiveSuccessRate(baselineRuns);
        const successRateDelta = round4(recentSuccessRate - baselineSuccessRate);

        // Node-level hotspot extraction across recent runs
        const incidentCounts = new Map<string, number>();
        for (const run of recentRuns) {
            for (const nodeSig of run.FailedOrEscalatedNodeSignatures ?? []) {
                incidentCounts.set(nodeSig, (incidentCounts.get(nodeSig) ?? 0) + 1);
            }
        }
        const hotspotNodes: WorkflowHotspotNode[] = Array.from(incidentCounts.entries())
            .map(([sig, count]) => ({
                NodeSignature: sig,
                IncidentCount: count,
                IncidentRate: recentRuns.length > 0 ? round4(count / recentRuns.length) : 0,
            }))
            .sort((a, b) => b.IncidentCount - a.IncidentCount || a.NodeSignature.localeCompare(b.NodeSignature));

        // Check for overlapping ad-hoc TaskGraph clusters (for both domain activity & shadow-bypass detection)
        let bestShadowMatch: ShadowBypassCorrelation | undefined;
        let adHocRecentCount = 0;
        let adHocBaselineCount = 0;

        for (const cluster of adHocClusters) {
            const sim = CompareDAGFingerprints(fp, cluster.MedoidFingerprint);
            if (sim.OperatorJaccard >= 0.25 || sim.Overall >= shadowMinSim) {
                for (const member of cluster.Members) {
                    const t = member.ExecutedAt?.getTime();
                    if (t !== undefined) {
                        if (t >= recentStartMs && t <= evalMs) adHocRecentCount++;
                        else if (t >= baselineStartMs && t < recentStartMs) adHocBaselineCount++;
                    } else {
                        adHocRecentCount++;
                    }
                }
            }

            if (sim.Overall >= shadowMinSim && sim.Overall < shadowMaxSim) {
                const recentClusterMembers = cluster.Members.filter((m) => {
                    const t = m.ExecutedAt?.getTime();
                    return t === undefined || (t >= recentStartMs && t <= evalMs);
                }).length;

                if (
                    !bestShadowMatch ||
                    sim.Overall > bestShadowMatch.Similarity.Overall ||
                    recentClusterMembers > bestShadowMatch.RecentClusterRunsCount
                ) {
                    bestShadowMatch = {
                        Cluster: cluster,
                        Similarity: sim,
                        Diff: DiffDAGFingerprints(fp, cluster.MedoidFingerprint),
                        RecentClusterRunsCount: recentClusterMembers,
                    };
                }
            }
        }

        // Domain-adjusted velocity ratio: compares workflow velocity to total domain velocity (workflow + overlapping ad-hoc runs)
        const domainRecentTotal =
            input.RecentDomainActivityCount ?? recentRuns.length + adHocRecentCount;
        const domainBaselineTotal =
            input.BaselineDomainActivityCount ?? baselineRuns.length + adHocBaselineCount;
        const domainRecentPerDay = domainRecentTotal / recentDays;
        const domainBaselinePerDay = domainBaselineTotal / baselineDays;
        const domainVelocityRatio =
            domainBaselinePerDay > 0 ? domainRecentPerDay / domainBaselinePerDay : null;

        const domainAdjustedVelocityRatio =
            velocityRatio !== null && domainVelocityRatio !== null && domainVelocityRatio > 0
                ? round4(velocityRatio / domainVelocityRatio)
                : velocityRatio;

        // Classify signals
        const signals: WorkflowHealthSignalKind[] = [];

        const isDormant =
            recentRuns.length === 0 &&
            daysSinceLastRun !== null &&
            daysSinceLastRun >= dormantThreshold;
        if (isDormant) {
            signals.push('Dormant');
        }

        const effectiveDecayRatio = domainAdjustedVelocityRatio ?? velocityRatio;
        const hasUsageDecay =
            !isDormant &&
            velocityRatio !== null &&
            velocityRatio <= decayThreshold &&
            (effectiveDecayRatio === null || effectiveDecayRatio <= decayThreshold + 0.10);
        if (hasUsageDecay) {
            signals.push('UsageDecay');
        }

        const hasExceptionSpike =
            recentRuns.length >= 2 &&
            (recentExceptionRate >= exceptionThreshold ||
                (baselineRuns.length >= 2 && exceptionRateDelta >= exceptionDeltaThreshold));
        if (hasExceptionSpike) {
            signals.push('ExceptionSpike');
        }

        const hasOutcomeDrift =
            recentRuns.length >= 3 &&
            baselineRuns.length >= 3 &&
            baselineSuccessRate - recentSuccessRate >= outcomeDriftThreshold;
        if (hasOutcomeDrift) {
            signals.push('OutcomeDrift');
        }

        const hasShadowBypass =
            bestShadowMatch !== undefined &&
            bestShadowMatch.RecentClusterRunsCount >= 2 &&
            (hasUsageDecay || isDormant || hasExceptionSpike || velocityRatio === null);
        if (hasShadowBypass) {
            signals.push('ShadowBypassed');
        }

        if (signals.length === 0) {
            signals.push('Healthy');
        }

        const { action, riskLevel } = determineTriageActionAndRisk(signals, input.HasActiveSchedule ?? false);
        const healthScore = computeWorkflowHealthScore({
            isDormant,
            hasUsageDecay,
            velocityRatio,
            recentExceptionRate,
            hasExceptionSpike,
            hasOutcomeDrift,
            successRateDelta,
            hasShadowBypass,
        });

        const summary = buildHealthSummary(
            input.WorkflowName,
            signals,
            {
                daysSinceLastRun,
                velocityRatio,
                domainAdjustedVelocityRatio,
                recentExceptionRate,
                baselineExceptionRate,
                recentSuccessRate,
                baselineSuccessRate,
            },
            hotspotNodes,
            bestShadowMatch,
        );

        reports.push({
            WorkflowAgentID: input.WorkflowAgentID,
            WorkflowName: input.WorkflowName,
            Fingerprint: fp,
            Signals: signals,
            RecommendedAction: action,
            RiskLevel: riskLevel,
            HealthScore: healthScore,
            Metrics: {
                TotalRunsCount: input.Runs.length,
                RecentRunsCount: recentRuns.length,
                BaselineRunsCount: baselineRuns.length,
                RecentRunsPerDay: round4(recentRunsPerDay),
                BaselineRunsPerDay: round4(baselineRunsPerDay),
                UsageVelocityRatio: velocityRatio,
                DomainAdjustedVelocityRatio: domainAdjustedVelocityRatio,
                DaysSinceLastRun: daysSinceLastRun,
                RecentExceptionRate: recentExceptionRate,
                BaselineExceptionRate: baselineExceptionRate,
                ExceptionRateDelta: exceptionRateDelta,
                RecentSuccessRate: recentSuccessRate,
                BaselineSuccessRate: baselineSuccessRate,
                SuccessRateDelta: successRateDelta,
            },
            HotspotNodes: hotspotNodes,
            ...(bestShadowMatch ? { ShadowBypass: bestShadowMatch } : {}),
            Summary: summary,
        });
    }

    // Sort worst health score first so the review queue prioritizes degraded canon
    reports.sort((a, b) => a.HealthScore - b.HealthScore || a.WorkflowName.localeCompare(b.WorkflowName));
    return reports;
}

function isExceptionOrEscalatedRun(run: WorkflowRunTelemetryRecord): boolean {
    if (run.EscalatedToLoopOrRecovery) return true;
    if (run.Status === 'Failed' || run.Status === 'Blocked') return true;
    if ((run.FailedOrEscalatedNodeSignatures?.length ?? 0) > 0) return true;
    return false;
}

function computeEffectiveSuccessRate(runs: readonly WorkflowRunTelemetryRecord[]): number {
    if (runs.length === 0) return 1;
    let successes = 0;
    for (const run of runs) {
        const completedCleanly = run.Status === 'Completed' && run.OutcomeApproved !== false;
        if (completedCleanly) successes++;
    }
    return round4(successes / runs.length);
}

function determineTriageActionAndRisk(
    signals: readonly WorkflowHealthSignalKind[],
    hasActiveSchedule: boolean,
): { action: WorkflowTriageAction; riskLevel: CanonTriageRiskLevel } {
    if (signals.includes('ShadowBypassed')) {
        return { action: 'SupersedeWithShadowCluster', riskLevel: 'High' };
    }
    if (signals.includes('ExceptionSpike')) {
        return { action: 'AdjustOrReExtract', riskLevel: 'High' };
    }
    if (signals.includes('OutcomeDrift')) {
        return { action: 'HumanReview', riskLevel: 'High' };
    }
    if (signals.includes('UsageDecay')) {
        return { action: 'HumanReview', riskLevel: 'Medium' };
    }
    if (signals.includes('Dormant')) {
        return {
            action: 'PruneOrDeprecate',
            riskLevel: hasActiveSchedule ? 'Medium' : 'Low',
        };
    }
    return { action: 'None', riskLevel: 'Low' };
}

function computeWorkflowHealthScore(params: {
    isDormant: boolean;
    hasUsageDecay: boolean;
    velocityRatio: number | null;
    recentExceptionRate: number;
    hasExceptionSpike: boolean;
    hasOutcomeDrift: boolean;
    successRateDelta: number;
    hasShadowBypass: boolean;
}): number {
    let score = 1.0;
    if (params.isDormant) {
        score -= 0.55;
    } else if (params.hasUsageDecay && params.velocityRatio !== null) {
        score -= Math.min(0.45, 0.45 * (1 - params.velocityRatio));
    }
    if (params.hasExceptionSpike) {
        score -= Math.min(0.45, 0.20 + 0.50 * params.recentExceptionRate);
    } else if (params.recentExceptionRate > 0) {
        score -= 0.15 * params.recentExceptionRate;
    }
    if (params.hasOutcomeDrift && params.successRateDelta < 0) {
        score -= Math.min(0.35, Math.abs(params.successRateDelta));
    }
    if (params.hasShadowBypass) {
        score -= 0.20;
    }
    return round4(Math.max(0, Math.min(1, score)));
}

function buildHealthSummary(
    workflowName: string,
    signals: readonly WorkflowHealthSignalKind[],
    metrics: {
        daysSinceLastRun: number | null;
        velocityRatio: number | null;
        domainAdjustedVelocityRatio: number | null;
        recentExceptionRate: number;
        baselineExceptionRate: number;
        recentSuccessRate: number;
        baselineSuccessRate: number;
    },
    hotspots: readonly WorkflowHotspotNode[],
    shadow?: ShadowBypassCorrelation,
): string {
    if (signals.length === 1 && signals[0] === 'Healthy') {
        return `Workflow "${workflowName}" is healthy (success rate ${(metrics.recentSuccessRate * 100).toFixed(0)}%, exception rate ${(metrics.recentExceptionRate * 100).toFixed(0)}%).`;
    }

    const parts: string[] = [];
    if (signals.includes('Dormant')) {
        parts.push(
            `dormant for ${metrics.daysSinceLastRun !== null ? Math.round(metrics.daysSinceLastRun) : '60+'} days`,
        );
    }
    if (signals.includes('UsageDecay') && metrics.velocityRatio !== null) {
        const dropPct = Math.round((1 - metrics.velocityRatio) * 100);
        parts.push(`usage dropped ${dropPct}% vs. baseline`);
    }
    if (signals.includes('ExceptionSpike')) {
        const hotspotNote =
            hotspots.length > 0 ? ` (hotspot: ${hotspots[0].NodeSignature})` : '';
        parts.push(
            `exception/escalation rate at ${(metrics.recentExceptionRate * 100).toFixed(0)}% vs. ${(metrics.baselineExceptionRate * 100).toFixed(0)}% baseline${hotspotNote}`,
        );
    }
    if (signals.includes('OutcomeDrift')) {
        parts.push(
            `success rate drifted from ${(metrics.baselineSuccessRate * 100).toFixed(0)}% to ${(metrics.recentSuccessRate * 100).toFixed(0)}%`,
        );
    }
    if (signals.includes('ShadowBypassed') && shadow) {
        const added = shadow.Diff.AddedOperators.length;
        const removed = shadow.Diff.RemovedOperators.length;
        parts.push(
            `shadow-bypassed by a recurring ad-hoc DAG cluster (${shadow.RecentClusterRunsCount} recent runs, ${(shadow.Similarity.Overall * 100).toFixed(0)}% overlap, +${added}/-${removed} steps)`,
        );
    }

    return `Workflow "${workflowName}" flagged for ${signals.join(', ')}: ${parts.join('; ')}.`;
}

function round4(value: number): number {
    return Math.round(value * 10000) / 10000;
}
