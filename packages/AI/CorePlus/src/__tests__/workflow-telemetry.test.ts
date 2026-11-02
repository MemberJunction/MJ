import { describe, expect, it } from 'vitest';
import { DiscoverWorkflowPromotionCandidates, type ExecutedTaskGraphRecord } from '../task-graph/dag-similarity';
import { TaskNode, type TaskGraphSpec } from '../task-graph/task-graph-spec';
import {
    EvaluateWorkflowCanonHealth,
    type WorkflowRunTelemetryRecord,
    type WorkflowTelemetryInput,
} from '../task-graph/workflow-telemetry';

const EVAL_TIME = new Date('2026-11-02T12:00:00Z');
const DAY_MS = 86_400_000;

function daysAgo(days: number): Date {
    return new Date(EVAL_TIME.getTime() - days * DAY_MS);
}

function buildRenewalSpec(includeExtraStep = false): TaskGraphSpec {
    const tasks = [
        TaskNode.Action(
            { tempId: 's1', name: 'Load Membership', description: '', dependsOn: [] },
            { actionName: 'Get Membership Record' },
        ),
        TaskNode.Action(
            { tempId: 's2', name: 'Calculate Dues', description: '', dependsOn: ['s1'] },
            { actionName: 'Calculate Renewal Dues' },
        ),
        TaskNode.Action(
            { tempId: 's3', name: 'Generate Invoice', description: '', dependsOn: ['s2'] },
            { actionName: 'Create Renewal Invoice' },
        ),
    ];

    if (includeExtraStep) {
        tasks.push(
            TaskNode.Action(
                { tempId: 's4', name: 'Apply Chapter Split', description: '', dependsOn: ['s3'] },
                { actionName: 'Allocate Chapter Dues Split' },
            ),
            TaskNode.Action(
                { tempId: 's5', name: 'Notify Chapter Treasurer', description: '', dependsOn: ['s4'] },
                { actionName: 'Send Chapter Split Notification' },
            ),
        );
    }

    return {
        workflowName: includeExtraStep ? 'AdHoc Renewal With Chapter Split' : 'Standard Member Renewal',
        tasks,
    };
}

describe('workflow-telemetry', () => {
    it('flags Dormant workflows with PruneOrDeprecate when uncalled for >= 60 days', () => {
        const input: WorkflowTelemetryInput = {
            WorkflowAgentID: 'wf-dormant',
            WorkflowName: 'Legacy Paper Directory Export',
            Spec: buildRenewalSpec(false),
            CreatedAt: daysAgo(180),
            Runs: [
                { RunID: 'r1', StartedAt: daysAgo(75), Status: 'Completed' },
                { RunID: 'r2', StartedAt: daysAgo(82), Status: 'Completed' },
            ],
        };

        const [report] = EvaluateWorkflowCanonHealth([input], [], { evaluationTime: EVAL_TIME });
        expect(report.Signals).toContain('Dormant');
        expect(report.RecommendedAction).toBe('PruneOrDeprecate');
        expect(report.RiskLevel).toBe('Low');
        expect(report.Metrics.DaysSinceLastRun).toBe(75);
    });

    it('distinguishes true UsageDecay from a general seasonal domain slowdown', () => {
        // Baseline window (30..90 days ago = 60 days): 12 runs (0.20 runs/day)
        // Recent window (0..30 days ago = 30 days): 1 run (0.0333 runs/day) -> raw VelocityRatio ~ 0.1667
        const baselineRuns: WorkflowRunTelemetryRecord[] = Array.from({ length: 12 }, (_, i) => ({
            RunID: `base-${i}`,
            StartedAt: daysAgo(35 + i * 4),
            Status: 'Completed',
        }));
        const recentRuns: WorkflowRunTelemetryRecord[] = [
            { RunID: 'rec-1', StartedAt: daysAgo(5), Status: 'Completed' },
        ];

        // Case A: Domain activity stayed steady (30 recent domain runs vs 60 baseline domain runs -> 1.0/day both windows)
        const decayingInput: WorkflowTelemetryInput = {
            WorkflowAgentID: 'wf-decay',
            WorkflowName: 'Abandoned Renewal Flow',
            Spec: buildRenewalSpec(false),
            Runs: [...baselineRuns, ...recentRuns],
            RecentDomainActivityCount: 30,
            BaselineDomainActivityCount: 60,
        };

        // Case B: Entire domain went quiet for the season (1 recent domain run vs 12 baseline domain runs)
        const seasonalInput: WorkflowTelemetryInput = {
            WorkflowAgentID: 'wf-seasonal',
            WorkflowName: 'Annual Gala Registration Flow',
            Spec: buildRenewalSpec(false),
            Runs: [...baselineRuns, ...recentRuns],
            RecentDomainActivityCount: 1,
            BaselineDomainActivityCount: 24,
        };

        const reports = EvaluateWorkflowCanonHealth(
            [decayingInput, seasonalInput],
            [],
            { evaluationTime: EVAL_TIME },
        );

        const decayReport = reports.find((r) => r.WorkflowAgentID === 'wf-decay')!;
        const seasonalReport = reports.find((r) => r.WorkflowAgentID === 'wf-seasonal')!;

        expect(decayReport.Signals).toContain('UsageDecay');
        expect(decayReport.Metrics.UsageVelocityRatio).toBeLessThan(0.20);
        expect(decayReport.Metrics.DomainAdjustedVelocityRatio).toBeLessThan(0.20);

        // Seasonal workflow had low raw velocity, but domain-adjusted ratio is ~2.0 (it kept its share of the quiet domain)
        expect(seasonalReport.Signals).not.toContain('UsageDecay');
        expect(seasonalReport.Signals).toEqual(['Healthy']);
    });

    it('detects ExceptionSpike and pinpoints HotspotNodes when a DAG starts escalating to Loop fallback', () => {
        const baselineRuns: WorkflowRunTelemetryRecord[] = Array.from({ length: 6 }, (_, i) => ({
            RunID: `b-${i}`,
            StartedAt: daysAgo(40 + i * 3),
            Status: 'Completed',
            EscalatedToLoopOrRecovery: false,
        }));

        const recentRuns: WorkflowRunTelemetryRecord[] = [
            {
                RunID: 'r-1',
                StartedAt: daysAgo(2),
                Status: 'Completed',
                EscalatedToLoopOrRecovery: true,
                FailedOrEscalatedNodeSignatures: ['Action:calculate_renewal_dues'],
            },
            {
                RunID: 'r-2',
                StartedAt: daysAgo(4),
                Status: 'Failed',
                EscalatedToLoopOrRecovery: true,
                FailedOrEscalatedNodeSignatures: ['Action:calculate_renewal_dues'],
            },
            {
                RunID: 'r-3',
                StartedAt: daysAgo(6),
                Status: 'Completed',
                EscalatedToLoopOrRecovery: false,
            },
        ];

        const [report] = EvaluateWorkflowCanonHealth(
            [
                {
                    WorkflowAgentID: 'wf-exc',
                    WorkflowName: 'Member Renewal',
                    Spec: buildRenewalSpec(false),
                    Runs: [...baselineRuns, ...recentRuns],
                },
            ],
            [],
            { evaluationTime: EVAL_TIME },
        );

        expect(report.Signals).toContain('ExceptionSpike');
        expect(report.RecommendedAction).toBe('AdjustOrReExtract');
        expect(report.RiskLevel).toBe('High');
        expect(report.HotspotNodes[0]).toEqual({
            NodeSignature: 'Action:calculate_renewal_dues',
            IncidentCount: 2,
            IncidentRate: 0.6667,
        });
    });

    it('correlates a decaying saved Workflow with an evolved ad-hoc DAG cluster as ShadowBypassed', () => {
        // Saved workflow (3 steps) dropped from 10 baseline runs to 1 recent run
        const baselineRuns: WorkflowRunTelemetryRecord[] = Array.from({ length: 10 }, (_, i) => ({
            RunID: `b-${i}`,
            StartedAt: daysAgo(35 + i * 4),
            Status: 'Completed',
        }));
        const recentRuns: WorkflowRunTelemetryRecord[] = [
            { RunID: 'r-1', StartedAt: daysAgo(15), Status: 'Completed' },
        ];

        // Meanwhile, Loop agents ran a 5-step evolved version (adding chapter split + notification) 4 times in the last 10 days!
        const adHocRuns: ExecutedTaskGraphRecord[] = Array.from({ length: 4 }, (_, i) => ({
            RunID: `adhoc-${i}`,
            Spec: buildRenewalSpec(true),
            Succeeded: true,
            ExecutedAt: daysAgo(2 + i * 2),
        }));

        const discovery = DiscoverWorkflowPromotionCandidates(adHocRuns, []);
        const clusters = discovery.Findings.map((f) => f.Cluster);

        const [report] = EvaluateWorkflowCanonHealth(
            [
                {
                    WorkflowAgentID: 'wf-renewal-v1',
                    WorkflowName: 'Standard Member Renewal',
                    Spec: buildRenewalSpec(false),
                    Runs: [...baselineRuns, ...recentRuns],
                },
            ],
            clusters,
            { evaluationTime: EVAL_TIME },
        );

        expect(report.Signals).toContain('UsageDecay');
        expect(report.Signals).toContain('ShadowBypassed');
        expect(report.RecommendedAction).toBe('SupersedeWithShadowCluster');
        expect(report.ShadowBypass).toBeDefined();
        expect(report.ShadowBypass?.RecentClusterRunsCount).toBe(4);
        expect(report.ShadowBypass?.Diff.AddedOperators).toEqual([
            'Action:allocate_chapter_dues_split',
            'Action:send_chapter_split_notification',
        ]);
    });

    it('detects OutcomeDrift when downstream human approval rate drops and respects grace period for brand-new workflows', () => {
        // Workflow A: Completed runs in both windows, but recent runs have OutcomeApproved = false
        const baselineApproved: WorkflowRunTelemetryRecord[] = Array.from({ length: 5 }, (_, i) => ({
            RunID: `base-ok-${i}`,
            StartedAt: daysAgo(40 + i * 3),
            Status: 'Completed',
            OutcomeApproved: true,
        }));
        const recentRejected: WorkflowRunTelemetryRecord[] = [
            { RunID: 'rec-rej-1', StartedAt: daysAgo(3), Status: 'Completed', OutcomeApproved: false },
            { RunID: 'rec-rej-2', StartedAt: daysAgo(6), Status: 'Completed', OutcomeApproved: false },
            { RunID: 'rec-ok-3', StartedAt: daysAgo(9), Status: 'Completed', OutcomeApproved: true },
        ];

        // Workflow B: Brand-new workflow created 5 days ago with 0 runs -> should NOT be flagged Dormant
        const brandNewInput: WorkflowTelemetryInput = {
            WorkflowAgentID: 'wf-new',
            WorkflowName: 'Newly Promoted Onboarding Flow',
            Spec: buildRenewalSpec(false),
            CreatedAt: daysAgo(5),
            Runs: [],
        };

        // Workflow C: Dormant workflow that still has an active schedule -> Medium risk level
        const scheduledDormantInput: WorkflowTelemetryInput = {
            WorkflowAgentID: 'wf-sched-dormant',
            WorkflowName: 'Scheduled Monthly Sync',
            Spec: buildRenewalSpec(false),
            CreatedAt: daysAgo(120),
            HasActiveSchedule: true,
            Runs: [{ RunID: 'old-1', StartedAt: daysAgo(90), Status: 'Completed' }],
        };

        const reports = EvaluateWorkflowCanonHealth(
            [
                {
                    WorkflowAgentID: 'wf-drift',
                    WorkflowName: 'Dues Adjustment Approval',
                    Spec: buildRenewalSpec(false),
                    Runs: [...baselineApproved, ...recentRejected],
                },
                brandNewInput,
                scheduledDormantInput,
            ],
            [],
            { evaluationTime: EVAL_TIME },
        );

        const driftReport = reports.find((r) => r.WorkflowAgentID === 'wf-drift')!;
        expect(driftReport.Signals).toContain('OutcomeDrift');
        expect(driftReport.RecommendedAction).toBe('HumanReview');
        expect(driftReport.RiskLevel).toBe('High');
        expect(driftReport.Metrics.BaselineSuccessRate).toBe(1);
        expect(driftReport.Metrics.RecentSuccessRate).toBeCloseTo(0.3333, 3);

        const newReport = reports.find((r) => r.WorkflowAgentID === 'wf-new')!;
        expect(newReport.Signals).toEqual(['Healthy']);
        expect(newReport.HealthScore).toBe(1);

        const schedDormantReport = reports.find((r) => r.WorkflowAgentID === 'wf-sched-dormant')!;
        expect(schedDormantReport.Signals).toContain('Dormant');
        expect(schedDormantReport.RiskLevel).toBe('Medium');

        // Reports are sorted worst HealthScore first
        expect(reports[0].HealthScore).toBeLessThanOrEqual(reports[1].HealthScore);
        expect(reports[1].HealthScore).toBeLessThanOrEqual(reports[2].HealthScore);
    });
});
