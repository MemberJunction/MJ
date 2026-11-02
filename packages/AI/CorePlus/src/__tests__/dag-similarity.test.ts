import { describe, expect, it } from 'vitest';
import {
    CanonicalizeNodeSignature,
    CompareDAGFingerprints,
    ComputeDAGFingerprint,
    ComputeDAGSimilarity,
    DiffDAGFingerprints,
    DiscoverWorkflowPromotionCandidates,
    NormalizeEdgeConditionShape,
    type ExecutedTaskGraphRecord,
    type SavedWorkflowRecord,
} from '../task-graph/dag-similarity';
import { TaskNode, type TaskGraphSpec } from '../task-graph/task-graph-spec';

function buildCreditIncreaseDAG(options: {
    prefix?: string;
    reverseArrayOrder?: boolean;
    includeAuditStep?: boolean;
    workflowName?: string;
} = {}): TaskGraphSpec {
    const p = options.prefix ?? 'n';
    const lookupNode = TaskNode.Action(
        {
            tempId: `${p}_lookup`,
            name: 'Lookup Member Account',
            description: 'Fetch member credit history',
            dependsOn: [],
            layout: { x: 100, y: 200 },
            inputPayload: { MemberID: '12345', RequestAmount: 7500 },
        },
        { actionName: 'Get Member Credit Profile' },
    );

    const decisionNode = TaskNode.Decision(
        {
            tempId: `${p}_decide`,
            name: 'Evaluate Credit Risk',
            description: 'Check whether CFO approval is required',
            dependsOn: [`${p}_lookup`],
        },
        {
            promptName: 'Credit Risk Evaluator',
            questions: {
                requiresApproval: {
                    kind: 'Likelihood',
                    instructions: 'Does this request require CFO approval?',
                },
            },
        },
    );

    const humanNode = TaskNode.Human(
        {
            tempId: `${p}_human`,
            name: 'CFO Approval',
            description: 'Wait for CFO sign-off',
            dependsOn: [
                {
                    tempId: `${p}_decide`,
                    condition: `decisions.${p}_decide.requiresApproval.probability >= 0.5`,
                    exclusiveGroup: 'route',
                    priority: 10,
                },
            ],
        },
        { assignToUserID: 'user-random-uuid-999', instructions: 'Approve credit increase' },
    );

    const applyNode = TaskNode.Action(
        {
            tempId: `${p}_apply`,
            name: 'Apply Credit Limit',
            description: 'Update credit limit in ERP',
            dependsOn: [`${p}_human`],
        },
        { actionName: 'Update Member Credit Limit' },
    );

    const tasks = [lookupNode, decisionNode, humanNode, applyNode];

    if (options.includeAuditStep) {
        const auditNode = TaskNode.Action(
            {
                tempId: `${p}_audit`,
                name: 'Write Audit Entry',
                description: 'Record credit limit change in audit log',
                dependsOn: [`${p}_apply`],
            },
            { actionName: 'Create Credit Audit Log' },
        );
        tasks.push(auditNode);
    }

    if (options.reverseArrayOrder) {
        tasks.reverse();
    }

    return {
        workflowName: options.workflowName ?? 'Credit Increase Approval',
        reasoning: 'Standard credit workflow',
        tasks,
    };
}

describe('dag-similarity', () => {
    it('canonicalizes node signatures across all TaskGraphNodeKind variants and strips run-specific IDs', () => {
        const actionA = TaskNode.Action(
            {
                tempId: 'step_1',
                name: 'Run A',
                description: 'd1',
                dependsOn: [],
                inputPayload: { InvoiceID: 'abc', Amount: 50 },
            },
            { actionName: '  Send Invoice Reminder  ' },
        );
        const actionB = TaskNode.Action(
            {
                tempId: 'completely_different_id',
                name: 'Different Name',
                description: 'd2',
                dependsOn: [],
                inputPayload: { Amount: 999, InvoiceID: 'xyz' },
            },
            { actionName: 'send invoice reminder' },
        );

        expect(CanonicalizeNodeSignature(actionA)).toBe('Action:send_invoice_reminder');
        expect(CanonicalizeNodeSignature(actionA)).toBe(CanonicalizeNodeSignature(actionB));
        expect(CanonicalizeNodeSignature(actionA, { includeInputPayloadKeys: true })).toBe(
            'Action:send_invoice_reminder[in:amount,invoiceid]',
        );
        expect(CanonicalizeNodeSignature(actionB, { includeInputPayloadKeys: true })).toBe(
            'Action:send_invoice_reminder[in:amount,invoiceid]',
        );
    });

    it('produces identical ExactStructureHash and 1.0 similarity for isomorphic DAGs with different tempIds and node order', () => {
        const graphA = buildCreditIncreaseDAG({ prefix: 'run1', reverseArrayOrder: false });
        const graphB = buildCreditIncreaseDAG({ prefix: 'run2_iso', reverseArrayOrder: true });

        const fpA = ComputeDAGFingerprint(graphA);
        const fpB = ComputeDAGFingerprint(graphB);

        expect(fpA.ExactStructureHash).toBe(fpB.ExactStructureHash);

        const sim = CompareDAGFingerprints(fpA, fpB);
        expect(sim.IsExactStructuralMatch).toBe(true);
        expect(sim.Overall).toBe(1);
        expect(sim.OperatorJaccard).toBe(1);
        expect(sim.EdgeBigramJaccard).toBe(1);
        expect(sim.WLSubtreeCosine).toBe(1);
    });

    it('computes high partial similarity and accurate diffs when a DAG adds an extra step', () => {
        const baseGraph = buildCreditIncreaseDAG({ includeAuditStep: false });
        const extendedGraph = buildCreditIncreaseDAG({ includeAuditStep: true });

        const fpBase = ComputeDAGFingerprint(baseGraph);
        const fpExt = ComputeDAGFingerprint(extendedGraph);

        const sim = CompareDAGFingerprints(fpBase, fpExt);
        expect(sim.IsExactStructuralMatch).toBe(false);
        expect(sim.Overall).toBeGreaterThan(0.70);
        expect(sim.Overall).toBeLessThan(1.0);

        const diff = DiffDAGFingerprints(fpBase, fpExt);
        expect(diff.AddedOperators).toEqual(['Action:create_credit_audit_log']);
        expect(diff.RemovedOperators).toEqual([]);
        expect(diff.SharedOperators.length).toBe(4);
    });

    it('preserves 2-hop transitive reachability similarity when an intermediate step is inserted between two nodes', () => {
        const directGraph: TaskGraphSpec = {
            workflowName: 'Direct',
            tasks: [
                TaskNode.Action(
                    { tempId: 'a', name: 'Fetch', description: '', dependsOn: [] },
                    { actionName: 'Fetch Member' },
                ),
                TaskNode.Action(
                    { tempId: 'b', name: 'Notify', description: '', dependsOn: ['a'] },
                    { actionName: 'Send Renewal Email' },
                ),
            ],
        };

        const withMiddleStepGraph: TaskGraphSpec = {
            workflowName: 'With Format Step',
            tasks: [
                TaskNode.Action(
                    { tempId: 'a', name: 'Fetch', description: '', dependsOn: [] },
                    { actionName: 'Fetch Member' },
                ),
                TaskNode.Prompt(
                    { tempId: 'mid', name: 'Draft Copy', description: '', dependsOn: ['a'] },
                    { promptName: 'Draft Renewal Copy' },
                ),
                TaskNode.Action(
                    { tempId: 'b', name: 'Notify', description: '', dependsOn: ['mid'] },
                    { actionName: 'Send Renewal Email' },
                ),
            ],
        };

        const sim = ComputeDAGSimilarity(directGraph, withMiddleStepGraph);
        // Direct edge A->B was split into A->Mid->B, so EdgeBigramJaccard is 0,
        // but TransitivePairJaccard still captures A ~> B!
        expect(sim.EdgeBigramJaccard).toBe(0);
        expect(sim.TransitivePairJaccard).toBeGreaterThan(0.30);
        expect(sim.Overall).toBeGreaterThan(0.35);
    });

    it('normalizes edge condition shapes by condition roots', () => {
        expect(NormalizeEdgeConditionShape({ tempId: 'n1' })).toBe('unconditional');
        expect(
            NormalizeEdgeConditionShape({
                tempId: 'n1',
                condition: 'decisions.step1.urgent.probability >= 0.8',
                exclusiveGroup: 'g1',
            }),
        ).toBe('xor:cond(decisions)');
        expect(
            NormalizeEdgeConditionShape({
                tempId: 'n1',
                condition: 'stepResult.step === "Failed" && payload.retryAllowed === true',
            }),
        ).toBe('cond(stepResult+payload)');
    });

    it('discovers net-new PromotionCandidates, EvolutionCandidates, and ExistingWorkflowDiscoveryGaps', () => {
        // 1. Saved workflow: 4-step Credit Increase DAG
        const savedCreditWf: SavedWorkflowRecord = {
            WorkflowAgentID: 'wf-credit-1',
            WorkflowName: 'Canonical Credit Increase',
            Spec: buildCreditIncreaseDAG({ prefix: 'saved', includeAuditStep: false }),
        };

        // 2. Saved workflow: 2-step Invoice Sync
        const invoiceSyncSpec: TaskGraphSpec = {
            workflowName: 'Invoice Sync',
            tasks: [
                TaskNode.Action(
                    { tempId: 's1', name: 'Pull Invoices', description: '', dependsOn: [] },
                    { actionName: 'Pull Stripe Invoices' },
                ),
                TaskNode.Action(
                    { tempId: 's2', name: 'Post GL', description: '', dependsOn: ['s1'] },
                    { actionName: 'Post Invoices To GL' },
                ),
            ],
        };
        const savedInvoiceWf: SavedWorkflowRecord = {
            WorkflowAgentID: 'wf-invoice-1',
            WorkflowName: 'Stripe Invoice GL Sync',
            Spec: invoiceSyncSpec,
        };

        // Executed ad-hoc runs:
        // Group A (3 runs): Novel 3-step Member Onboarding DAG -> should be PromoteToWorkflow
        const buildOnboardingSpec = (idx: number): TaskGraphSpec => ({
            workflowName: `AdHoc Onboarding ${idx}`,
            tasks: [
                TaskNode.Action(
                    { tempId: `ob1_${idx}`, name: 'Verify Dues', description: '', dependsOn: [] },
                    { actionName: 'Verify Membership Payment' },
                ),
                TaskNode.Action(
                    {
                        tempId: `ob2_${idx}`,
                        name: 'Provision Portal',
                        description: '',
                        dependsOn: [`ob1_${idx}`],
                    },
                    { actionName: 'Provision Member Portal Access' },
                ),
                TaskNode.Action(
                    {
                        tempId: `ob3_${idx}`,
                        name: 'Send Welcome Kit',
                        description: '',
                        dependsOn: [`ob2_${idx}`],
                    },
                    { actionName: 'Send Member Welcome Packet' },
                ),
            ],
        });

        // Group B (3 runs): Exact copies of Stripe Invoice GL Sync -> should be ExistingWorkflowDiscoveryGap
        // Group C (3 runs): Modified Credit Increase DAG that adds D&B Bureau check before applying credit limit -> EvolveExistingWorkflow
        const buildEvolvedCreditSpec = (idx: number): TaskGraphSpec => ({
            workflowName: `Evolved Credit ${idx}`,
            tasks: [
                TaskNode.Action(
                    { tempId: `ec1_${idx}`, name: 'Lookup', description: '', dependsOn: [] },
                    { actionName: 'Get Member Credit Profile' },
                ),
                TaskNode.Decision(
                    { tempId: `ec2_${idx}`, name: 'Evaluate', description: '', dependsOn: [`ec1_${idx}`] },
                    {
                        promptName: 'Credit Risk Evaluator',
                        questions: {
                            requiresApproval: { kind: 'Likelihood', instructions: 'Check CFO' },
                        },
                    },
                ),
                TaskNode.Human(
                    {
                        tempId: `ec3_${idx}`,
                        name: 'CFO Approval',
                        description: '',
                        dependsOn: [
                            {
                                tempId: `ec2_${idx}`,
                                condition: `decisions.ec2_${idx}.requiresApproval.probability >= 0.5`,
                                exclusiveGroup: 'route',
                                priority: 10,
                            },
                        ],
                    },
                    { instructions: 'Approve credit increase' },
                ),
                TaskNode.Action(
                    { tempId: `ec4_${idx}`, name: 'Check Bureau', description: '', dependsOn: [`ec3_${idx}`] },
                    { actionName: 'Fetch D&B Credit Score' },
                ),
                TaskNode.Action(
                    { tempId: `ec5_${idx}`, name: 'Apply Credit Limit', description: '', dependsOn: [`ec4_${idx}`] },
                    { actionName: 'Update Member Credit Limit' },
                ),
            ],
        });

        const executedRuns: ExecutedTaskGraphRecord[] = [
            { RunID: 'r-ob-1', Spec: buildOnboardingSpec(1), Succeeded: true },
            { RunID: 'r-ob-2', Spec: buildOnboardingSpec(2), Succeeded: true },
            { RunID: 'r-ob-3', Spec: buildOnboardingSpec(3), Succeeded: true },

            { RunID: 'r-inv-1', Spec: invoiceSyncSpec, Succeeded: true },
            { RunID: 'r-inv-2', Spec: invoiceSyncSpec, Succeeded: true },
            { RunID: 'r-inv-3', Spec: invoiceSyncSpec, Succeeded: true },

            { RunID: 'r-ec-1', Spec: buildEvolvedCreditSpec(1), Succeeded: true },
            { RunID: 'r-ec-2', Spec: buildEvolvedCreditSpec(2), Succeeded: true },
            { RunID: 'r-ec-3', Spec: buildEvolvedCreditSpec(3), Succeeded: true },
        ];

        const analysis = DiscoverWorkflowPromotionCandidates(
            executedRuns,
            [savedCreditWf, savedInvoiceWf],
            { minClusterSize: 3 },
        );

        expect(analysis.PromotionCandidates.length).toBe(1);
        expect(analysis.PromotionCandidates[0].Cluster.Members.length).toBe(3);
        expect(analysis.PromotionCandidates[0].Disposition).toBe('PromoteToWorkflow');

        expect(analysis.DiscoveryGaps.length).toBe(1);
        expect(analysis.DiscoveryGaps[0].ClosestSavedWorkflow?.WorkflowAgentID).toBe('wf-invoice-1');

        expect(analysis.EvolutionCandidates.length).toBe(1);
        expect(analysis.EvolutionCandidates[0].ClosestSavedWorkflow?.WorkflowAgentID).toBe('wf-credit-1');
        expect(analysis.EvolutionCandidates[0].ClosestSavedWorkflow?.Diff.AddedOperators).toContain(
            'Action:fetch_d&b_credit_score',
        );
    });
});
