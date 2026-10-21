/**
 * Unit tests for sub-agent conversationDetailId propagation (Fix #2)
 * and sub-agent durable workflow Paused state propagation to parent agent (Fix #3).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseAgent } from "../base-agent";
import type {
    ExecuteAgentParams,
    AgentSubAgentRequest,
    ExecuteAgentResult,
    BaseAgentNextStep,
} from "@memberjunction/ai-core-plus";
import type {
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIAgentRelationshipEntity,
} from "@memberjunction/core-entities";

vi.mock("@memberjunction/core", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

const mockAgentsList: Array<{ ID: string; Name: string; Status: string }> = [];
const mockRunnableDirectory: Array<{ ID: string; Name: string; Description: string }> = [];
const mockHasPermission = vi.fn().mockResolvedValue(true);

vi.mock("@memberjunction/aiengine", () => ({
    AIEngine: {
        get Instance() {
            return {
                Agents: mockAgentsList,
                AgentRelationships: [],
                AgentActions: [],
                GetSubAgents: () => [],
                GetUserRunnableAgentDirectory: () => mockRunnableDirectory,
            };
        },
    },
}));

vi.mock("@memberjunction/ai-engine-base", () => ({
    AIAgentPermissionHelper: {
        HasPermission: (...args: unknown[]) => mockHasPermission(...args),
    },
}));

const mockRunAgent = vi.fn();

vi.mock("../AgentRunner", () => ({
    AgentRunner: class {
        RunAgent = mockRunAgent;
    },
}));

interface TestSubAgentInternals {
    _agentRun: MJAIAgentRunEntityExtended | undefined;
    _awaitingWorkflowTaskID: string | null;
    createStepEntity: (opts: Record<string, unknown>) => Promise<MJAIAgentRunStepEntityExtended>;
    finalizeStepEntity: (
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: Record<string, unknown>
    ) => Promise<void>;
    executeChildSubAgentStep: (
        params: ExecuteAgentParams<Record<string, unknown>>,
        previousDecision: BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>>,
        parentStepId?: string,
        subAgentPayloadOverride?: Record<string, unknown>,
        stepCount?: number,
        resolvedSubAgentEntity?: MJAIAgentEntityExtended
    ) => Promise<BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>>>;
    executeRelatedSubAgentStep: (
        params: ExecuteAgentParams<Record<string, unknown>>,
        previousDecision: BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>>,
        subAgentEntity: MJAIAgentEntityExtended,
        relationship: MJAIAgentRelationshipEntity,
        parentStepId?: string,
        subAgentPayloadOverride?: Record<string, unknown>,
        stepCount?: number
    ) => Promise<BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>>>;
    selfCheckSuccess: (
        params: ExecuteAgentParams<Record<string, unknown>>,
        stepResult: BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>>,
        stepCount: number
    ) => Promise<BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>>>;
}

class TestableSubAgentOrchestrator extends BaseAgent {
    public async invokeExecuteSubAgent(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended
    ): Promise<ExecuteAgentResult> {
        return this.ExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);
    }

    public invokeExtractSubAgentWorkflowTaskID(subAgentRun: MJAIAgentRunEntityExtended | undefined): string {
        return this.extractSubAgentWorkflowTaskID(subAgentRun);
    }
}

describe("BaseAgent sub-agent conversationDetailId and durable workflow Paused propagation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRunAgent.mockResolvedValue({
            success: true,
            agentRun: { ID: "child-run-id", Status: "Completed" },
            payload: {},
        });
    });

    describe("Fix #2: conversationDetailId propagation in ExecuteSubAgent", () => {
        it("propagates conversationDetailId from parent ExecuteAgentParams to sub-agent RunAgent params", async () => {
            const orchestrator = new TestableSubAgentOrchestrator();
            const params: ExecuteAgentParams = {
                agent: { ID: "sage-agent-id", Name: "Sage" } as unknown as MJAIAgentEntityExtended,
                conversationMessages: [],
                conversationDetailId: "conv-detail-uuid-999",
            };
            const subAgentRequest: AgentSubAgentRequest = {
                name: "Workflow Planner",
                message: "Plan and launch the multi-step workflow",
                terminateAfter: false,
            };
            const subAgent = {
                ID: "workflow-planner-id",
                Name: "Workflow Planner",
                Status: "Active",
            } as unknown as MJAIAgentEntityExtended;
            const stepEntity = {
                ID: "step-uuid-10",
                TargetLogID: null,
            } as unknown as MJAIAgentRunStepEntityExtended;

            await orchestrator.invokeExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);

            expect(mockRunAgent).toHaveBeenCalledTimes(1);
            const passedParams = mockRunAgent.mock.calls[0][0] as ExecuteAgentParams;
            expect(passedParams.conversationDetailId).toBe("conv-detail-uuid-999");
        });

        it("passes undefined conversationDetailId when parent ExecuteAgentParams does not specify one", async () => {
            const orchestrator = new TestableSubAgentOrchestrator();
            const params: ExecuteAgentParams = {
                agent: { ID: "sage-agent-id", Name: "Sage" } as unknown as MJAIAgentEntityExtended,
                conversationMessages: [],
            };
            const subAgentRequest: AgentSubAgentRequest = {
                name: "Workflow Planner",
                message: "Plan workflow",
            };
            const subAgent = {
                ID: "workflow-planner-id",
                Name: "Workflow Planner",
                Status: "Active",
            } as unknown as MJAIAgentEntityExtended;
            const stepEntity = {
                ID: "step-uuid-11",
                TargetLogID: null,
            } as unknown as MJAIAgentRunStepEntityExtended;

            await orchestrator.invokeExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);

            expect(mockRunAgent).toHaveBeenCalledTimes(1);
            const passedParams = mockRunAgent.mock.calls[0][0] as ExecuteAgentParams;
            expect(passedParams.conversationDetailId).toBeUndefined();
        });
    });

    describe("Fix #3: durable workflow Paused state propagation from sub-agent to parent", () => {
        it("extracts parentTaskId from sub-agent Paused step OutputData when available", () => {
            const orchestrator = new TestableSubAgentOrchestrator();
            const pausedSubAgentRun = {
                ID: "subagent-run-42",
                Status: "Paused",
                Steps: [
                    {
                        ID: "step-1",
                        OutputData: JSON.stringify({ parentTaskId: "workflow-parent-task-uuid-123" }),
                    },
                ],
            } as unknown as MJAIAgentRunEntityExtended;

            expect(orchestrator.invokeExtractSubAgentWorkflowTaskID(pausedSubAgentRun)).toBe(
                "workflow-parent-task-uuid-123"
            );
        });

        it("falls back to sub-agent run ID when step OutputData does not contain parentTaskId", () => {
            const orchestrator = new TestableSubAgentOrchestrator();
            const pausedSubAgentRun = {
                ID: "subagent-run-fallback-id",
                Status: "Paused",
                Steps: [],
            } as unknown as MJAIAgentRunEntityExtended;

            expect(orchestrator.invokeExtractSubAgentWorkflowTaskID(pausedSubAgentRun)).toBe(
                "subagent-run-fallback-id"
            );
        });

        it("parks parent and terminates immediately when a child sub-agent returns Status === 'Paused'", async () => {
            const orchestrator = new TestableSubAgentOrchestrator();
            const internals = orchestrator as unknown as TestSubAgentInternals;

            const fakeStepEntity = {
                ID: "child-step-id",
                TargetLogID: null,
                PayloadAtEnd: null,
            } as unknown as MJAIAgentRunStepEntityExtended;
            vi.spyOn(internals, "createStepEntity").mockResolvedValue(fakeStepEntity);
            const finalizeSpy = vi.spyOn(internals, "finalizeStepEntity").mockResolvedValue();

            internals._agentRun = {
                ID: "parent-run-id",
                Status: "Running",
                Steps: [],
            } as unknown as MJAIAgentRunEntityExtended;

            mockRunAgent.mockResolvedValue({
                success: true,
                payload: { workflowLaunched: true },
                agentRun: {
                    ID: "wp-run-id",
                    Status: "Paused",
                    FinalStep: "Success",
                    Message: "Starting the 3-step market analysis workflow now.",
                    Steps: [
                        {
                            ID: "wp-step-1",
                            OutputData: JSON.stringify({ parentTaskId: "durable-task-graph-uuid-777" }),
                        },
                    ],
                },
            });

            const params: ExecuteAgentParams<Record<string, unknown>> = {
                agent: { ID: "sage-id", Name: "Sage" } as unknown as MJAIAgentEntityExtended,
                conversationMessages: [],
                conversationDetailId: "conv-detail-123",
            };
            const previousDecision: BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>> = {
                step: "Sub-Agent",
                terminate: false,
                previousPayload: {},
                newPayload: {},
                subAgent: {
                    name: "Workflow Planner",
                    message: "User approved the plan. Launch the workflow.",
                    terminateAfter: false,
                },
            };
            const subAgentEntity = {
                ID: "wp-agent-id",
                Name: "Workflow Planner",
                Status: "Active",
                ParentID: "sage-id",
            } as unknown as MJAIAgentEntityExtended;

            const nextStep = await internals.executeChildSubAgentStep(
                params,
                previousDecision,
                undefined,
                undefined,
                1,
                subAgentEntity
            );

            expect(nextStep.terminate).toBe(true);
            expect(nextStep.step).toBe("Success");
            expect(nextStep.message).toBe("Starting the 3-step market analysis workflow now.");
            expect(internals._awaitingWorkflowTaskID).toBe("durable-task-graph-uuid-777");
            expect(finalizeSpy).toHaveBeenCalledTimes(1);
            const recordedOutput = finalizeSpy.mock.calls[0][3] as { shouldTerminate: boolean; nextStep: string };
            expect(recordedOutput.shouldTerminate).toBe(true);
            expect(recordedOutput.nextStep).toBe("success");
        });

        it("parks parent and terminates immediately when a related sub-agent returns Status === 'Paused'", async () => {
            const orchestrator = new TestableSubAgentOrchestrator();
            const internals = orchestrator as unknown as TestSubAgentInternals;

            const fakeStepEntity = {
                ID: "related-step-id",
                TargetLogID: null,
                PayloadAtEnd: null,
            } as unknown as MJAIAgentRunStepEntityExtended;
            vi.spyOn(internals, "createStepEntity").mockResolvedValue(fakeStepEntity);
            const finalizeSpy = vi.spyOn(internals, "finalizeStepEntity").mockResolvedValue();

            internals._agentRun = {
                ID: "parent-run-id",
                Status: "Running",
                Steps: [],
            } as unknown as MJAIAgentRunEntityExtended;

            mockRunAgent.mockResolvedValue({
                success: true,
                payload: { status: "dispatched" },
                agentRun: {
                    ID: "related-wp-run-id",
                    Status: "Paused",
                    FinalStep: "Success",
                    Message: "Workflow dispatched and running in background.",
                    Steps: [
                        {
                            ID: "rel-step-1",
                            OutputData: JSON.stringify({ parentTaskId: "related-workflow-task-888" }),
                        },
                    ],
                },
            });

            const params: ExecuteAgentParams<Record<string, unknown>> = {
                agent: { ID: "sage-id", Name: "Sage" } as unknown as MJAIAgentEntityExtended,
                conversationMessages: [],
                conversationDetailId: "conv-detail-456",
            };
            const previousDecision: BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>> = {
                step: "Sub-Agent",
                terminate: false,
                previousPayload: {},
                newPayload: {},
                subAgent: {
                    name: "Workflow Planner",
                    message: "Execute approved multi-agent plan",
                    terminateAfter: false,
                },
            };
            const subAgentEntity = {
                ID: "wp-agent-id",
                Name: "Workflow Planner",
                Status: "Active",
            } as unknown as MJAIAgentEntityExtended;
            const relationship = {
                ID: "rel-id",
                AgentID: "sage-id",
                SubAgentID: "wp-agent-id",
                Status: "Active",
                SubAgentOutputMapping: null,
                SubAgentInputMapping: null,
                SubAgentContextPaths: null,
            } as unknown as MJAIAgentRelationshipEntity;

            const nextStep = await internals.executeRelatedSubAgentStep(
                params,
                previousDecision,
                subAgentEntity,
                relationship,
                undefined,
                undefined,
                1
            );

            expect(nextStep.terminate).toBe(true);
            expect(nextStep.step).toBe("Success");
            expect(nextStep.message).toBe("Workflow dispatched and running in background.");
            expect(internals._awaitingWorkflowTaskID).toBe("related-workflow-task-888");
            expect(finalizeSpy).toHaveBeenCalledTimes(1);
            const recordedOutput = finalizeSpy.mock.calls[0][3] as { shouldTerminate: boolean; nextStep: string };
            expect(recordedOutput.shouldTerminate).toBe(true);
            expect(recordedOutput.nextStep).toBe("success");
        });

        it("skips selfCheckSuccess rubric re-evaluation when _awaitingWorkflowTaskID is set", async () => {
            const orchestrator = new TestableSubAgentOrchestrator();
            const internals = orchestrator as unknown as TestSubAgentInternals;
            internals._awaitingWorkflowTaskID = "durable-task-graph-uuid-777";

            const params: ExecuteAgentParams<Record<string, unknown>> = {
                agent: {
                    ID: "sage-id",
                    Name: "Sage",
                    FinalPayloadValidation: "Check rubric strictly",
                    FinalPayloadValidationMode: "Retry",
                } as unknown as MJAIAgentEntityExtended,
                conversationMessages: [],
            };
            const stepResult: BaseAgentNextStep<Record<string, unknown>, Record<string, unknown>> = {
                step: "Success",
                terminate: true,
                message: "Starting workflow now.",
                previousPayload: {},
                newPayload: {},
            };

            const checked = await internals.selfCheckSuccess(params, stepResult, 1);
            expect(checked).toBe(stepResult);
            expect(checked.terminate).toBe(true);
            expect(checked.step).toBe("Success");
        });
    });

    describe("Fix #1: Pre-flight validation for Tasks steps and folded sub-agent permissions", () => {
        beforeEach(() => {
            mockAgentsList.length = 0;
            mockRunnableDirectory.length = 0;
            mockHasPermission.mockResolvedValue(true);
        });

        it("converts a Tasks step referencing an unknown agent into a Retry step with available runnable agents hint", async () => {
            mockAgentsList.push(
                { ID: "qb-id", Name: "Query Builder", Status: "Active" },
                { ID: "rrw-id", Name: "Research Report Writer", Status: "Active" }
            );
            mockRunnableDirectory.push(
                { ID: "qb-id", Name: "Query Builder", Description: "SQL query specialist" },
                { ID: "rrw-id", Name: "Research Report Writer", Description: "Report writer" }
            );

            const orchestrator = new TestableSubAgentOrchestrator();
            const validator = orchestrator as unknown as {
                validateNextStep: (
                    p: ExecuteAgentParams,
                    ns: BaseAgentNextStep,
                    payload: Record<string, unknown>,
                    run: MJAIAgentRunEntityExtended,
                    step: MJAIAgentRunStepEntityExtended
                ) => Promise<BaseAgentNextStep>;
            };

            const params: ExecuteAgentParams = {
                agent: { ID: "sage-id", Name: "Sage" } as unknown as MJAIAgentEntityExtended,
                conversationMessages: [],
                contextUser: { ID: "user-1" } as never,
            };
            const tasksStep = {
                step: "Tasks",
                terminate: false,
                taskGraph: {
                    folded: false,
                    spec: {
                        workflowName: "Orders Analysis",
                        reasoning: "Multi-step analysis",
                        tasks: [
                            {
                                tempId: "t1",
                                name: "Run Query",
                                description: "Query orders",
                                kind: "Agent",
                                configuration: { agentName: "Query Builder" },
                                dependsOn: [],
                            },
                            {
                                tempId: "t2",
                                name: "Analyze Data",
                                description: "Analyze results",
                                kind: "Agent",
                                configuration: { agentName: "Data Analysis Agent" },
                                dependsOn: ["t1"],
                            },
                        ],
                    },
                },
            } as unknown as BaseAgentNextStep;

            const validated = await validator.validateNextStep(
                params,
                tasksStep,
                {},
                { ID: "run-1" } as unknown as MJAIAgentRunEntityExtended,
                { ID: "step-1" } as unknown as MJAIAgentRunStepEntityExtended
            );

            expect(validated.step).toBe("Retry");
            expect(validated.terminate).toBe(false);
            expect(validated.errorMessage).toContain("Data Analysis Agent");
            expect(validated.errorMessage).toContain("Available runnable agents: Query Builder, Research Report Writer");
        });

        it("converts a Tasks step referencing a permission-denied agent into a Retry step without leaking existence", async () => {
            mockAgentsList.push(
                { ID: "qb-id", Name: "Query Builder", Status: "Active" },
                { ID: "secret-id", Name: "Restricted Executive Agent", Status: "Active" }
            );
            mockRunnableDirectory.push({ ID: "qb-id", Name: "Query Builder", Description: "SQL query specialist" });
            mockHasPermission.mockImplementation(async (agentId: string) => agentId === "qb-id");

            const orchestrator = new TestableSubAgentOrchestrator();
            const validator = orchestrator as unknown as {
                validateNextStep: (
                    p: ExecuteAgentParams,
                    ns: BaseAgentNextStep,
                    payload: Record<string, unknown>,
                    run: MJAIAgentRunEntityExtended,
                    step: MJAIAgentRunStepEntityExtended
                ) => Promise<BaseAgentNextStep>;
            };

            const params: ExecuteAgentParams = {
                agent: { ID: "sage-id", Name: "Sage" } as unknown as MJAIAgentEntityExtended,
                conversationMessages: [],
                contextUser: { ID: "user-1" } as never,
            };
            const tasksStep = {
                step: "Tasks",
                terminate: false,
                taskGraph: {
                    folded: false,
                    spec: {
                        workflowName: "Restricted Workflow",
                        reasoning: "Try restricted agent",
                        tasks: [
                            {
                                tempId: "t1",
                                name: "Step 1",
                                description: "Run restricted",
                                kind: "Agent",
                                configuration: { agentName: "Restricted Executive Agent" },
                                dependsOn: [],
                            },
                        ],
                    },
                },
            } as unknown as BaseAgentNextStep;

            const validated = await validator.validateNextStep(
                params,
                tasksStep,
                {},
                { ID: "run-1" } as unknown as MJAIAgentRunEntityExtended,
                { ID: "step-1" } as unknown as MJAIAgentRunStepEntityExtended
            );

            expect(validated.step).toBe("Retry");
            expect(validated.errorMessage).toContain("unknown or inaccessible agent(s): Restricted Executive Agent");
            expect(validated.errorMessage).toContain("Available runnable agents: Query Builder");
        });

        it("rejects a folded 1-node task-graph Sub-Agent step when the user lacks run permission", async () => {
            mockAgentsList.push({ ID: "restricted-id", Name: "Restricted Agent", Status: "Active" });
            mockRunnableDirectory.push({ ID: "qb-id", Name: "Query Builder", Description: "SQL query specialist" });
            mockHasPermission.mockResolvedValue(false);

            const orchestrator = new TestableSubAgentOrchestrator();
            const validator = orchestrator as unknown as {
                validateSubAgentNextStep: (
                    p: ExecuteAgentParams,
                    ns: BaseAgentNextStep,
                    payload: Record<string, unknown>,
                    run: MJAIAgentRunEntityExtended,
                    step: MJAIAgentRunStepEntityExtended
                ) => Promise<BaseAgentNextStep>;
            };

            const params: ExecuteAgentParams = {
                agent: { ID: "sage-id", Name: "Sage" } as unknown as MJAIAgentEntityExtended,
                conversationMessages: [],
                contextUser: { ID: "user-1" } as never,
            };
            const foldedStep: BaseAgentNextStep = {
                step: "Sub-Agent",
                terminate: false,
                subAgent: { name: "Restricted Agent", message: "Do restricted work", terminateAfter: false },
                taskGraph: {
                    folded: true,
                    foldReason: "Single-node agent graph folded to in-run sub-agent call",
                    spec: {
                        workflowName: "Folded Restricted",
                        reasoning: "Folded",
                        tasks: [],
                    },
                },
            };

            const validated = await validator.validateSubAgentNextStep(
                params,
                foldedStep,
                {},
                { ID: "run-1" } as unknown as MJAIAgentRunEntityExtended,
                { ID: "step-1" } as unknown as MJAIAgentRunStepEntityExtended
            );

            expect(validated.step).toBe("Retry");
            expect(validated.errorMessage).toContain("Sub-agent 'Restricted Agent' not found or not active");
            expect(validated.errorMessage).toContain("Available runnable agents: Query Builder");
        });
    });

    describe("Fix #4: formatSubAgentResultAsMarkdown includes sub-agent Message", () => {
        it("renders **Message:** alongside **Payload:** when sub-agent run includes a Message", () => {
            const orchestrator = new TestableSubAgentOrchestrator();
            const formatter = orchestrator as unknown as {
                formatSubAgentResultAsMarkdown: (name: string, res: ExecuteAgentResult) => string;
            };

            const md = formatter.formatSubAgentResultAsMarkdown("Workflow Planner", {
                success: true,
                payload: {},
                agentRun: {
                    ID: "wp-run-1",
                    Status: "Completed",
                    Message: "### Proposed 2-Step Plan\n1. Query Builder\n2. Research Report Writer",
                } as unknown as MJAIAgentRunEntityExtended,
            });

            expect(md).toContain("## Sub-agent: Workflow Planner ✓");
            expect(md).toContain("**Message:**\n### Proposed 2-Step Plan\n1. Query Builder\n2. Research Report Writer");
            expect(md).toContain("**Payload:**\n{}");
        });
    });
});

