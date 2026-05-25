import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { BaseAgentNextStep, ExecuteAgentParams, AgentSubAgentRequest, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

const mockAgentsList: any[] = [
    { ID: 'child-1-id', ParentID: 'parent-agent-id', Name: 'ChildAgent1', Status: 'Active', PayloadDownstreamPaths: null, PayloadUpstreamPaths: null, PayloadScope: null },
    { ID: 'child-2-id', ParentID: 'parent-agent-id', Name: 'ChildAgent2', Status: 'Active', PayloadDownstreamPaths: null, PayloadUpstreamPaths: null, PayloadScope: null },
    { ID: 'child-scoped-id', ParentID: 'parent-agent-id', Name: 'ChildScopedAgent', Status: 'Active', PayloadDownstreamPaths: '["scopedData"]', PayloadUpstreamPaths: '["scopedData.*"]', PayloadScope: 'scopedData' }
];

const mockRelationshipsList: any[] = [
    {
        ID: 'rel-1-id',
        AgentID: 'parent-agent-id',
        SubAgentID: 'related-1-id',
        Status: 'Active',
        SubAgentInputMapping: '{"inputData": "mappedInput"}',
        SubAgentOutputMapping: '{"resultData": "mappedOutput"}',
        SubAgentContextPaths: '["contextData"]'
    }
];

const mockRelatedAgentsList: any[] = [
    { ID: 'related-1-id', Name: 'RelatedAgent1', Status: 'Active' }
];

vi.mock('@memberjunction/aiengine', () => {
    return {
        AIEngine: {
            get Instance() {
                return {
                    Agents: [...mockAgentsList, ...mockRelatedAgentsList],
                    AgentRelationships: mockRelationshipsList,
                };
            }
        }
    };
});

// Mock step entity
class MockStepEntity {
    public ID: string;
    public AgentRunID?: string;
    public StepNumber?: number;
    public StepType?: string;
    public StepName?: string;
    public TargetID?: string;
    public TargetLogID?: string;
    public ParentID?: string;
    public Status?: string;
    public StartedAt?: Date;
    public PayloadAtStart?: string;
    public PayloadAtEnd?: string;
    public InputData?: string;

    private _saveCallback: () => Promise<boolean>;

    constructor(id: string, saveCallback?: () => Promise<boolean>) {
        this.ID = id;
        this._saveCallback = saveCallback || (() => Promise.resolve(true));
    }

    public async Save(): Promise<boolean> {
        return await this._saveCallback();
    }
}

// Subclass BaseAgent to mock the ExecuteSubAgent call and other DB-touching routines
class TestParallelAgent extends BaseAgent {
    public mockExecuteSubAgentResult: (reqName: string, initialPayload?: any) => ExecuteAgentResult<any> = () => ({
        success: true,
        payload: {}
    });

    public executeSubAgentCallOrder: string[] = [];

    // Expose processSubAgentStep for testing
    public async testProcessSubAgentStep(
        params: ExecuteAgentParams<any>,
        previousDecision: BaseAgentNextStep<any, any>,
        parentStepId?: string
    ) {
        return await (this as any).processSubAgentStep(params, previousDecision, parentStepId);
    }

    // Expose queueStepSave for testing
    public testQueueStepSave(stepEntity: any) {
        (this as any).queueStepSave(stepEntity);
    }

    // Expose internal pendingSaves for assertion
    public getPendingSaves() {
        return (this as any)._pendingSaves;
    }

    // Expose internal stepSavePromises for assertion
    public getStepSavePromises() {
        return (this as any)._stepSavePromises;
    }

    protected override async ExecuteSubAgent<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgent: any,
        stepEntity: any,
        payload?: SR,
        contextMessage?: any,
        stepCount: number = 0
    ): Promise<ExecuteAgentResult<SR>> {
        this.executeSubAgentCallOrder.push(subAgentRequest.name);
        return this.mockExecuteSubAgentResult(subAgentRequest.name, payload);
    }
}

// ============================================================================
// Tests
// ============================================================================

describe('Parallel Sub-Agents and Save Queuing', () => {
    let agent: TestParallelAgent;
    let mockStepEntitiesCreated: MockStepEntity[];
    let nextStepId: number;

    beforeEach(() => {
        agent = new TestParallelAgent();
        mockStepEntitiesCreated = [];
        nextStepId = 1;

        const mockProvider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                const id = `mock-step-id-${nextStepId++}`;
                const mockEntity = new MockStepEntity(id);
                mockStepEntitiesCreated.push(mockEntity);
                return mockEntity;
            })
        };

        (agent as any)._activeProvider = mockProvider;
        (agent as any)._agentRun = {
            ID: 'mock-run-id',
            Steps: [],
            Save: vi.fn().mockResolvedValue(true)
        };
    });

    describe('queueStepSave Sequencer', () => {
        it('should execute saves on different step IDs independently', async () => {
            let callOrder: string[] = [];
            const step1 = new MockStepEntity('step-1', async () => {
                callOrder.push('step-1-saved');
                return true;
            });
            const step2 = new MockStepEntity('step-2', async () => {
                callOrder.push('step-2-saved');
                return true;
            });

            agent.testQueueStepSave(step1);
            agent.testQueueStepSave(step2);

            await Promise.all(agent.getPendingSaves());

            expect(callOrder).toContain('step-1-saved');
            expect(callOrder).toContain('step-2-saved');
            expect(callOrder.length).toBe(2);
        });

        it('should execute saves on the same step ID sequentially to avoid race conditions', async () => {
            let resolveFirstSave: any;
            const firstSavePromise = new Promise<boolean>((resolve) => {
                resolveFirstSave = resolve;
            });

            let callOrder: string[] = [];
            
            const stepEntity = new MockStepEntity('step-shared');
            
            // First save mock
            const save1 = vi.fn().mockImplementation(async () => {
                callOrder.push('save-1-started');
                await firstSavePromise;
                callOrder.push('save-1-ended');
                return true;
            });

            // Second save mock
            const save2 = vi.fn().mockImplementation(async () => {
                callOrder.push('save-2-started');
                return true;
            });

            // Redefine Save for the test
            let callCount = 0;
            stepEntity.Save = async () => {
                callCount++;
                if (callCount === 1) {
                    return await save1();
                } else {
                    return await save2();
                }
            };

            // Queue both saves
            agent.testQueueStepSave(stepEntity);
            agent.testQueueStepSave(stepEntity);

            // Give a microtask tick for execution to start
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(callOrder).toEqual(['save-1-started']); // Save 2 should not have started yet

            // Resolve the first save
            resolveFirstSave(true);

            // Wait for all pending saves to complete
            await Promise.all(agent.getPendingSaves());

            expect(callOrder).toEqual([
                'save-1-started',
                'save-1-ended',
                'save-2-started'
            ]);
        });
    });

    describe('Parallel Sub-Agent Execution Loop', () => {
        it('should execute multiple sub-agents concurrently', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: {
                    ID: 'parent-agent-id',
                    Name: 'ParentAgent',
                } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };

            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: { val: 10 },
                subAgents: [
                    { name: 'ChildAgent1', message: 'Do job 1', terminateAfter: false },
                    { name: 'ChildAgent2', message: 'Do job 2', terminateAfter: false }
                ]
            };

            // Implement mock ExecuteSubAgent results
            agent.mockExecuteSubAgentResult = (name: string) => {
                if (name === 'ChildAgent1') {
                    return {
                        success: true,
                        payload: { child1Result: 'data1' },
                        agentRun: { FinalStep: 'Success', Steps: [{ ID: 's1' }] } as any
                    };
                } else {
                    return {
                        success: true,
                        payload: { child2Result: 'data2' },
                        agentRun: { FinalStep: 'Success', Steps: [{ ID: 's2' }] } as any
                    };
                }
            };

            const result = await agent.testProcessSubAgentStep(params, previousDecision);

            // Verify both sub-agents were executed
            expect(agent.executeSubAgentCallOrder).toContain('ChildAgent1');
            expect(agent.executeSubAgentCallOrder).toContain('ChildAgent2');
            expect(agent.executeSubAgentCallOrder.length).toBe(2);

            // Verify payloads were merged sequentially
            // Since ChildAgent1 and ChildAgent2 run, they both merge back into the main payload.
            // PayloadManager.mergeUpstreamPayload merges keys into parent payload.
            expect(result.newPayload).toEqual({
                val: 10,
                child1Result: 'data1',
                child2Result: 'data2'
            });

            // Verify progress callbacks and conversation updates
            expect(params.onProgress).toHaveBeenCalledTimes(2);
            expect(params.conversationMessages.length).toBe(3); // 2 assistant delegation msgs + 1 user completion msg
            expect(params.conversationMessages[2].content).toContain('Parallel Sub-Agents Completed:');
            expect(params.conversationMessages[2].content).toContain('ChildAgent1');
            expect(params.conversationMessages[2].content).toContain('ChildAgent2');
        });

        it('should correctly scope child payload inputs and merge scoped outputs', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: {
                    ID: 'parent-agent-id',
                    Name: 'ParentAgent',
                } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };

            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {
                    someMainData: 'main',
                    scopedData: {
                        inputVal: 42
                    }
                },
                subAgents: [
                    { name: 'ChildScopedAgent', message: 'Do scoped job', terminateAfter: false }
                ]
            };

            let capturedPayload: any;
            agent.mockExecuteSubAgentResult = (name: string, initialPayload: any) => {
                // ExecuteSubAgent will be called with the scoped child payload
                // Let's capture the payload from the call to mockExecuteSubAgentResult, but wait!
                // ExecuteSubAgent receives the payload as an argument, let's spy on that using a mock handler.
                return {
                    success: true,
                    payload: { ...initialPayload, outputVal: 99 }, // This will be reverse-scoped and merged
                    agentRun: { FinalStep: 'Success', Steps: [{ ID: 's1' }] } as any
                };
            };

            const executeSpy = vi.spyOn(agent as any, 'ExecuteSubAgent');

            const result = await agent.testProcessSubAgentStep(params, previousDecision);

            // Verify ExecuteSubAgent was called with scoped input payload { inputVal: 42 }
            expect(executeSpy).toHaveBeenCalledTimes(1);
            const callArgs = executeSpy.mock.calls[0];
            const passedPayload = callArgs[4];
            expect(passedPayload).toEqual({ inputVal: 42 });

            // Verify merged payload has outputVal merged back inside scopedData
            expect(result.newPayload).toEqual({
                someMainData: 'main',
                scopedData: {
                    inputVal: 42,
                    outputVal: 99
                }
            });
        });

        it('should correctly map inputs and outputs for related sub-agents', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: {
                    ID: 'parent-agent-id',
                    Name: 'ParentAgent',
                } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };

            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {
                    inputData: 'inputValue'
                },
                subAgents: [
                    { name: 'RelatedAgent1', message: 'Do related job', terminateAfter: false }
                ]
            };

            const executeSpy = vi.spyOn(agent as any, 'ExecuteSubAgent');

            agent.mockExecuteSubAgentResult = () => ({
                success: true,
                payload: { resultData: 'outputValue' },
                agentRun: { FinalStep: 'Success', Steps: [{ ID: 's1' }] } as any
            });

            const result = await agent.testProcessSubAgentStep(params, previousDecision);

            expect(executeSpy).toHaveBeenCalledTimes(1);
            const callArgs = executeSpy.mock.calls[0];
            
            // Verifying downstream mapping: mappedInput = inputData ('inputValue')
            const passedPayload = callArgs[4];
            expect(passedPayload).toEqual({ mappedInput: 'inputValue' });

            // Verifying upstream mapping: mappedOutput = resultData ('outputValue')
            expect(result.newPayload).toEqual({
                inputData: 'inputValue',
                mappedOutput: 'outputValue'
            });
        });

        it('should aggregate media and file outputs from concurrent sub-agents', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: {
                    ID: 'parent-agent-id',
                    Name: 'ParentAgent',
                } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };

            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgents: [
                    { name: 'ChildAgent1', message: 'Job 1', terminateAfter: false },
                    { name: 'ChildAgent2', message: 'Job 2', terminateAfter: false }
                ]
            };

            agent.mockExecuteSubAgentResult = (name: string) => {
                if (name === 'ChildAgent1') {
                    return {
                        success: true,
                        payload: {},
                        mediaOutputs: [{ ID: 'm1', FileName: 'img1.png' } as any],
                        fileOutputs: [{ ID: 'f1', FileName: 'doc1.pdf' } as any],
                        agentRun: { FinalStep: 'Success' } as any
                    };
                } else {
                    return {
                        success: true,
                        payload: {},
                        mediaOutputs: [{ ID: 'm2', FileName: 'img2.png' } as any],
                        fileOutputs: [{ ID: 'f2', FileName: 'doc2.pdf' } as any],
                        agentRun: { FinalStep: 'Success' } as any
                    };
                }
            };

            await agent.testProcessSubAgentStep(params, previousDecision);

            // Verify aggregated media and files are collected on the parent agent instance
            const parentMedia = (agent as any)._mediaOutputs;
            const parentFiles = (agent as any)._fileOutputs;

            expect(parentMedia).toHaveLength(2);
            expect(parentMedia[0].FileName).toBe('img1.png');
            expect(parentMedia[1].FileName).toBe('img2.png');

            expect(parentFiles).toHaveLength(2);
            expect(parentFiles[0].FileName).toBe('doc1.pdf');
            expect(parentFiles[1].FileName).toBe('doc2.pdf');
        });
    });
});
