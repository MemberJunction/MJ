import { describe, it, expect } from 'vitest';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskNode, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import {
    BuildTaskGraphDiagnostic,
    ComputeBlastRadiusTaskIDs,
    ExtractGraphTelemetry,
} from '../lib/task-graph-diagnostics';
import { ComputePayloadDiff } from '../lib/task-graph-variables.component';
import { TASK_GRAPH_RENDER_TYPES } from '../lib/task-graph-canvas-adapter';

function fakeTask(overrides: Partial<MJTaskEntity>): MJTaskEntity {
    return {
        ID: 'task-1',
        Name: 'Step 1',
        Status: 'Pending',
        ErrorMessage: null,
        InputPayload: null,
        OutputPayload: null,
        Configuration: null,
        StepType: null,
        ...overrides,
    } as unknown as MJTaskEntity;
}

describe('TaskGraphDiagnostics — Co-Pilot, Telemetry & Blast Radius', () => {
    it('translates a held GateDecision frame into an actionable plain-English notice', () => {
        const notice = BuildTaskGraphDiagnostic({
            LatestFrame: {
                kind: 'GateDecision',
                verdict: 'held',
                taskId: 't-approve',
                taskName: 'Manager Gate',
                edgeId: 'edge-42',
                reason: 'ambiguous tier',
            },
        });
        expect(notice?.Kind).toBe('held');
        expect(notice?.EdgeID).toBe('edge-42');
        expect(notice?.Message).toContain('Manager Gate');
        expect(notice?.Message).toContain('ambiguous tier');
    });

    it('detects TAINTED_EGRESS_BLOCKED failures as a safety gate notice', () => {
        const notice = BuildTaskGraphDiagnostic({
            Tasks: [
                fakeTask({
                    ID: 't-email',
                    Name: 'Send Customer Email',
                    Status: 'Failed',
                    ErrorMessage: 'TAINTED_EGRESS_BLOCKED: unverified external payload',
                }),
            ],
        });
        expect(notice?.Kind).toBe('taint');
        expect(notice?.TaskID).toBe('t-email');
        expect(notice?.Title).toContain('Safety Gate');
    });

    it('extracts X-Ray items, Decision confidence, Person Verified, Taint, and Saga labels', () => {
        const tasks = [
            fakeTask({
                ID: 't-ext',
                Name: 'Fetch Webhook',
                Status: 'Complete',
                OutputPayload: JSON.stringify({ IsOutputTainted: true, ticketCount: 14 }),
            }),
            fakeTask({
                ID: 't-decide',
                Name: 'Classify Tier',
                Status: 'Complete',
                Configuration: JSON.stringify({ minConfidence: 0.85 }),
                OutputPayload: JSON.stringify({ confidence: 0.92, tier: 'Enterprise' }),
            }),
            fakeTask({
                ID: 't-human',
                Name: 'Ops Approval',
                StepType: 'Human',
                Status: 'Complete',
            }),
            fakeTask({
                ID: 't-saga',
                Name: 'Refund Charge',
                Status: 'Pending',
                Configuration: JSON.stringify({ CompensatesTaskID: 't-ext' }),
            }),
        ];

        const telemetry = ExtractGraphTelemetry(tasks);
        expect(telemetry.TaintedTaskIDs).toEqual(['t-ext']);
        expect(telemetry.VerifiedTaskIDs).toEqual(['t-human']);
        expect(telemetry.DecisionConfidence['t-decide']?.Score).toBe(92);
        expect(telemetry.DecisionConfidence['t-decide']?.Threshold).toBe(85);
        expect(telemetry.SagaCompensationLabels['t-saga']).toContain('Fetch Webhook');
        expect(telemetry.XRayItems['t-decide']?.length).toBeGreaterThan(0);
    });

    it('computes downstream What-If failure blast radius using ComputeTasksToBlock', () => {
        const spec: TaskGraphSpec = {
            workflowName: 'BlastTest',
            reasoning: '',
            tasks: [
                TaskNode.Action({ tempId: 'a', name: 'A', description: '', dependsOn: [] }, { actionName: 'A' }),
                TaskNode.Action({ tempId: 'b', name: 'B', description: '', dependsOn: ['a'] }, { actionName: 'B' }),
                TaskNode.Action({ tempId: 'c', name: 'C', description: '', dependsOn: ['b'] }, { actionName: 'C' }),
                TaskNode.Action({ tempId: 'independent', name: 'Ind', description: '', dependsOn: [] }, { actionName: 'I' }),
            ],
        };
        expect(ComputeBlastRadiusTaskIDs(spec, 'a').sort()).toEqual(['b', 'c']);
        expect(ComputeBlastRadiusTaskIDs(spec, 'independent')).toEqual([]);
    });

    it('computes Before/After payload diffs cleanly', () => {
        const diff = ComputePayloadDiff(
            { status: 'Draft', count: 3, tempFlag: true },
            { status: 'Approved', count: 3, approvedBy: 'Alice' },
        );
        expect(diff.find((d) => d.Key === 'status')?.Kind).toBe('changed');
        expect(diff.find((d) => d.Key === 'approvedBy')?.Kind).toBe('added');
        expect(diff.find((d) => d.Key === 'tempFlag')?.Kind).toBe('removed');
        expect(diff.find((d) => d.Key === 'count')?.Kind).toBe('unchanged');
    });

    it('marks non-authorable render types as Draggable: false so palette stays scoped to 3 kinds', () => {
        const draggableKinds = TASK_GRAPH_RENDER_TYPES.filter((t) => t.Draggable !== false).map((t) => t.Type);
        expect(draggableKinds).toEqual(['AgentTask', 'ActionTask', 'HumanTask']);
        expect(TASK_GRAPH_RENDER_TYPES.length).toBe(8);
    });
});
