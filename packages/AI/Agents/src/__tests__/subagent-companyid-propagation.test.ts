/**
 * Unit test for sub-agent companyId propagation (spec §4.2 / issue #4396).
 *
 * Verifies that when BaseAgent.ExecuteSubAgent runs a sub-agent via AgentRunner.RunAgent,
 * the companyId on ExecuteAgentParams is propagated to the sub-agent RunAgent parameters
 * alongside the primary scope pair.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseAgent } from "../base-agent";
import type { ExecuteAgentParams, AgentSubAgentRequest, ExecuteAgentResult } from "@memberjunction/ai-core-plus";
import type { MJAIAgentEntityExtended, MJAIAgentRunStepEntityExtended } from "@memberjunction/core-entities";

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

vi.mock("@memberjunction/aiengine", () => ({
    AIEngine: {
        get Instance() {
            return {
                Agents: [],
                AgentRelationships: [],
                AgentActions: [],
                GetSubAgents: () => [],
            };
        },
    },
}));

const mockRunAgent = vi.fn();

vi.mock("../AgentRunner", () => ({
    AgentRunner: class {
        RunAgent = mockRunAgent;
    },
}));

class TestableSubAgentCaller extends BaseAgent {
    public async invokeExecuteSubAgent(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended
    ): Promise<ExecuteAgentResult> {
        return this.ExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);
    }
}

describe("BaseAgent.ExecuteSubAgent - companyId propagation (§4.2)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRunAgent.mockResolvedValue({
            success: true,
            agentRun: { ID: "child-run-id" },
            payload: {},
        });
    });

    it("propagates companyId to the sub-agent RunAgent parameters when provided", async () => {
        const caller = new TestableSubAgentCaller();
        const params: ExecuteAgentParams = {
            agent: { ID: "parent-agent-id", Name: "ParentAgent" } as unknown as MJAIAgentEntityExtended,
            conversationMessages: [],
            companyId: "company-uuid-test-42",
            PrimaryScopeEntityName: "TestEntity",
            PrimaryScopeRecordID: "record-uuid-1",
        };
        const subAgentRequest: AgentSubAgentRequest = {
            name: "ChildAgent",
            message: "Execute specialized child task",
        };
        const subAgent = {
            ID: "child-agent-id",
            Name: "ChildAgent",
            Status: "Active",
        } as unknown as MJAIAgentEntityExtended;
        const stepEntity = {
            ID: "step-uuid-1",
            TargetLogID: null,
        } as unknown as MJAIAgentRunStepEntityExtended;

        await caller.invokeExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);

        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        const passedParams = mockRunAgent.mock.calls[0][0];
        expect(passedParams.companyId).toBe("company-uuid-test-42");
        expect(passedParams.PrimaryScopeRecordID).toBe("record-uuid-1");
    });

    it("a sub-agent of a RuntimeOnly parent runs RuntimeOnly, on the parent's keys and configuration", async () => {
        const caller = new TestableSubAgentCaller();
        const keys = [{ driverClass: "GeminiLLM", apiKey: "sk-gemini" }];
        const params: ExecuteAgentParams = {
            agent: { ID: "parent-agent-id", Name: "ParentAgent" } as unknown as MJAIAgentEntityExtended,
            conversationMessages: [],
            apiKeys: keys,
            configurationId: "config-uuid-1",
            CredentialScope: "RuntimeOnly",
        };
        const subAgent = { ID: "child-agent-id", Name: "ChildAgent", Status: "Active" } as unknown as MJAIAgentEntityExtended;
        const stepEntity = { ID: "step-uuid-3", TargetLogID: null } as unknown as MJAIAgentRunStepEntityExtended;

        await caller.invokeExecuteSubAgent(params, { name: "ChildAgent", message: "Do it", terminateAfter: false }, subAgent, stepEntity);

        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
        expect(passedParams.CredentialScope).toBe("RuntimeOnly");
        expect(passedParams.apiKeys).toBe(keys);
        expect(passedParams.configurationId).toBe("config-uuid-1");
    });

    it("a sub-agent inherits the run's audience, as given, so it re-hydrates the same readers", async () => {
        const caller = new TestableSubAgentCaller();
        const audience = { Mode: "Intersection" as const, UserIDs: ["aaaaaaaa-0000-4000-8000-0000000000b3"] };
        const params: ExecuteAgentParams = {
            agent: { ID: "parent-agent-id", Name: "ParentAgent" } as unknown as MJAIAgentEntityExtended,
            conversationMessages: [],
            Audience: audience,
        };
        const subAgent = { ID: "child-agent-id", Name: "ChildAgent", Status: "Active" } as unknown as MJAIAgentEntityExtended;
        const stepEntity = { ID: "step-uuid-4", TargetLogID: null } as unknown as MJAIAgentRunStepEntityExtended;

        await caller.invokeExecuteSubAgent(params, { name: "ChildAgent", message: "Do it", terminateAfter: false }, subAgent, stepEntity);

        const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
        expect(passedParams.Audience).toBe(audience);
    });

    it("the realtime delegation target inherits the run's audience", async () => {
        const caller = new TestableSubAgentCaller();
        const audience = { Mode: "Intersection" as const, UserIDs: ["aaaaaaaa-0000-4000-8000-0000000000b4"] };
        const target = { ID: "target-agent-id", Name: "Target" } as unknown as MJAIAgentEntityExtended;
        const internals = caller as unknown as {
            resolveRealtimeTargetAgent: (params: ExecuteAgentParams) => MJAIAgentEntityExtended | null;
            delegateRealtimeToTarget: (
                params: ExecuteAgentParams,
                config: undefined,
                request: { CallID: string; Arguments: string; AbortSignal: AbortSignal }
            ) => Promise<{ Success: boolean }>;
        };
        vi.spyOn(internals, "resolveRealtimeTargetAgent").mockReturnValue(target);
        const params: ExecuteAgentParams = {
            agent: { ID: "coagent-id", Name: "CoAgent" } as unknown as MJAIAgentEntityExtended,
            conversationMessages: [],
            Audience: audience,
        };

        const request = { CallID: "call-1", Arguments: JSON.stringify({ request: "do it" }), AbortSignal: new AbortController().signal };
        await internals.delegateRealtimeToTarget(params, undefined, request);

        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        expect((mockRunAgent.mock.calls[0][0] as ExecuteAgentParams).Audience).toBe(audience);
    });

    it("passes undefined companyId when parent params do not specify one", async () => {
        const caller = new TestableSubAgentCaller();
        const params: ExecuteAgentParams = {
            agent: { ID: "parent-agent-id", Name: "ParentAgent" } as unknown as MJAIAgentEntityExtended,
            conversationMessages: [],
            companyId: undefined,
            PrimaryScopeEntityName: "TestEntity",
            PrimaryScopeRecordID: "record-uuid-2",
        };
        const subAgentRequest: AgentSubAgentRequest = {
            name: "ChildAgent",
            message: "Execute task without company",
        };
        const subAgent = {
            ID: "child-agent-id",
            Name: "ChildAgent",
            Status: "Active",
        } as unknown as MJAIAgentEntityExtended;
        const stepEntity = {
            ID: "step-uuid-2",
            TargetLogID: null,
        } as unknown as MJAIAgentRunStepEntityExtended;

        await caller.invokeExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);

        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        const passedParams = mockRunAgent.mock.calls[0][0];
        expect(passedParams.companyId).toBeUndefined();
    });
});
