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
                    AgentActions: [],
                    GetSubAgents: (agentID: string, status?: string) => {
                        // Mirror the real signature: returns sub-agents (ParentID === agentID)
                        // filtered by Status when provided.
                        return mockAgentsList.filter(a =>
                            a.ParentID === agentID && (!status || a.Status === status)
                        );
                    }
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

    public NewRecord(): void {
        // no-op: the mock already has a client-side ID from the constructor
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

    // Expose validateSubAgentNextStep for testing
    public async testValidateSubAgentNextStep(
        params: ExecuteAgentParams<any>,
        nextStep: BaseAgentNextStep<any, any>
    ) {
        // currentPayload / agentRun / currentStep are not read by the method's
        // resolution logic; pass minimal stubs.
        return await (this as any).validateSubAgentNextStep(
            params,
            nextStep,
            {},
            { ID: 'mock-run-id' },
            { ID: 'mock-step-id' }
        );
    }

    // Expose the protected helper for direct unit testing
    public testGetRequestedSubAgents(nextStep: any) {
        return (this as any).getRequestedSubAgents(nextStep);
    }

    // Expose queueStepSave for testing
    public testQueueStepSave(stepEntity: any) {
        (this as any).queueStepSave(stepEntity);
    }

    // Flush the shared fire-and-forget step-save queue (awaits every queued INSERT/UPDATE save).
    public async testFlushStepSaves() {
        return await (this as any)._stepSaveQueue.Flush();
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

            await agent.testFlushStepSaves();

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

            // Drain the microtask queue without relying on wall-clock timing — we
            // need save-1 to *start* but stay blocked on `firstSavePromise`.
            // Two microtask ticks is enough for the .then() chain to reach the
            // `await firstSavePromise` line.
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(callOrder).toEqual(['save-1-started']); // Save 2 should not have started yet

            // Resolve the first save
            resolveFirstSave(true);

            // Wait for all pending saves to complete
            await agent.testFlushStepSaves();

            expect(callOrder).toEqual([
                'save-1-started',
                'save-1-ended',
                'save-2-started'
            ]);
        });

        it('chains create→finalize on the same instance even when the ID is assigned mid-INSERT (regression: steps stuck at Running)', async () => {
            // Reproduces the real bug: a brand-new step has an EMPTY ID at create; its INSERT Save()
            // assigns the ID (client-side) and then awaits the network. A fast finalize then queues an
            // UPDATE while that INSERT is still in flight. Keyed by ID, create (id='') and finalize
            // (id='assigned') land in different buckets → the chain breaks → the UPDATE races ahead of
            // the INSERT and is lost (row stuck at Running). Keyed by the instance, the chain holds.
            let resolveInsert!: (v: boolean) => void;
            const insertGate = new Promise<boolean>((r) => { resolveInsert = r; });
            const callOrder: string[] = [];

            const stepEntity = new MockStepEntity(''); // empty ID at create time
            let callCount = 0;
            stepEntity.Save = async () => {
                callCount++;
                if (callCount === 1) {
                    stepEntity.ID = 'assigned-uuid'; // INSERT assigns the ID, then blocks (in flight)
                    callOrder.push('insert-started');
                    await insertGate;
                    callOrder.push('insert-ended');
                    return true;
                }
                callOrder.push('update-started');
                return true;
            };

            agent.testQueueStepSave(stepEntity);   // create — ID is ''
            await Promise.resolve();               // let the INSERT Save() start + assign the ID
            agent.testQueueStepSave(stepEntity);   // finalize — ID is now 'assigned-uuid'

            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            // UPDATE must wait for the INSERT to finish, despite the ID having changed between queues.
            expect(callOrder).toEqual(['insert-started']);

            resolveInsert(true);
            await agent.testFlushStepSaves();

            expect(callOrder).toEqual(['insert-started', 'insert-ended', 'update-started']);
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
            expect(params.conversationMessages.length).toBe(3); // 2 user-role delegation annotations + 1 user completion msg
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

        // ── Determinism & safety regressions ──────────────────────────────

        it('should push delegation messages in source order even when one sub-agent finishes first', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: { ID: 'parent-agent-id', Name: 'ParentAgent' } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };
            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgents: [
                    { name: 'ChildAgent1', message: 'Slow job', terminateAfter: false },
                    { name: 'ChildAgent2', message: 'Fast job', terminateAfter: false }
                ]
            };
            // ChildAgent2 will resolve before ChildAgent1; the transcript must still list 1 then 2.
            agent.mockExecuteSubAgentResult = (name: string) => ({
                success: true,
                payload: { [name]: 'ok' },
                agentRun: { FinalStep: 'Success' } as any
            });

            await agent.testProcessSubAgentStep(params, previousDecision);

            // Delegation records are now user-role environment annotations ("[You delegated …]"),
            // not assistant turns — so the model never sees framework prose as an assistant exemplar.
            const delegationContents = params.conversationMessages
                .filter(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('delegated'))
                .map(m => m.content);
            expect(delegationContents).toHaveLength(2);
            expect(delegationContents[0]).toContain('ChildAgent1');
            expect(delegationContents[1]).toContain('ChildAgent2');
        });

        it('should terminate the parent with Failed step when a failing sub-agent requested terminateAfter', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: { ID: 'parent-agent-id', Name: 'ParentAgent' } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };
            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgents: [
                    { name: 'ChildAgent1', message: 'Will fail', terminateAfter: true },
                    { name: 'ChildAgent2', message: 'Will succeed', terminateAfter: false }
                ]
            };
            agent.mockExecuteSubAgentResult = (name: string) => {
                if (name === 'ChildAgent1') {
                    return {
                        success: false,
                        payload: {},
                        agentRun: { FinalStep: 'Failed', ErrorMessage: 'boom' } as any
                    };
                }
                return {
                    success: true,
                    payload: { ok: true },
                    agentRun: { FinalStep: 'Success' } as any
                };
            };

            const result = await agent.testProcessSubAgentStep(params, previousDecision);

            // Matches the single sub-agent path: terminateAfter triggers termination
            // regardless of success. anyFailure → step='Failed'.
            expect(result.terminate).toBe(true);
            expect(result.step).toBe('Failed');
        });

        it('should terminate the parent when a successful sub-agent requested terminateAfter', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: { ID: 'parent-agent-id', Name: 'ParentAgent' } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };
            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgents: [
                    { name: 'ChildAgent1', message: 'Job 1', terminateAfter: true }
                ]
            };
            agent.mockExecuteSubAgentResult = () => ({
                success: true,
                payload: { ok: true },
                agentRun: { FinalStep: 'Success' } as any
            });

            const result = await agent.testProcessSubAgentStep(params, previousDecision);
            expect(result.terminate).toBe(true);
            expect(result.step).toBe('Success');
        });

        it('should deep-clone parent payload per child sub-agent to prevent in-flight mutation races', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: { ID: 'parent-agent-id', Name: 'ParentAgent' } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };

            const parentPayload = { shared: { counter: 0 } };
            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: parentPayload,
                subAgents: [
                    { name: 'ChildAgent1', message: 'Job 1', terminateAfter: false },
                    { name: 'ChildAgent2', message: 'Job 2', terminateAfter: false }
                ]
            };

            const passedPayloads: any[] = [];
            agent.mockExecuteSubAgentResult = (_name: string, initialPayload: any) => {
                passedPayloads.push(initialPayload);
                // Mutate the received payload — siblings must not see this.
                if (initialPayload?.shared) {
                    initialPayload.shared.counter = 999;
                }
                return { success: true, payload: {}, agentRun: { FinalStep: 'Success' } as any };
            };

            await agent.testProcessSubAgentStep(params, previousDecision);

            // Each child got its own clone — sibling mutations are isolated.
            expect(passedPayloads).toHaveLength(2);
            expect(passedPayloads[0]).not.toBe(passedPayloads[1]);
            expect(passedPayloads[0]?.shared).not.toBe(passedPayloads[1]?.shared);
            // Parent's original payload is untouched.
            expect(parentPayload.shared.counter).toBe(0);
        });

        it('should record per-sibling step PayloadAtEnd (the sub-agent contribution, not the cumulative state)', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: { ID: 'parent-agent-id', Name: 'ParentAgent' } as any,
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
            agent.mockExecuteSubAgentResult = (name: string) => ({
                success: true,
                payload: name === 'ChildAgent1' ? { a: 1 } : { b: 2 },
                agentRun: { FinalStep: 'Success' } as any
            });

            await agent.testProcessSubAgentStep(params, previousDecision);

            // mockStepEntitiesCreated holds the step entities the agent created
            // through GetEntityObject in the order they were requested.
            const stepEnds = mockStepEntitiesCreated
                .map(s => s.PayloadAtEnd)
                .filter((v): v is string => typeof v === 'string')
                .map(s => JSON.parse(s));
            expect(stepEnds).toContainEqual({ a: 1 });
            expect(stepEnds).toContainEqual({ b: 2 });
            // No step should record the *combined* {a:1,b:2} — each is its own contribution.
            expect(stepEnds.every(s => Object.keys(s).length === 1)).toBe(true);
        });

        it('should produce a Failed step (without throwing) when one sub-agent name is unresolved', async () => {
            const params: ExecuteAgentParams<any> = {
                agent: { ID: 'parent-agent-id', Name: 'ParentAgent' } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };
            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgents: [
                    { name: 'ChildAgent1', message: 'OK', terminateAfter: false },
                    { name: 'DoesNotExist', message: 'should fail to resolve', terminateAfter: false }
                ]
            };
            agent.mockExecuteSubAgentResult = () => ({
                success: true, payload: {}, agentRun: { FinalStep: 'Success' } as any
            });

            const result = await agent.testProcessSubAgentStep(params, previousDecision);
            // Unresolved name is a synthetic failure; anyFailure → step='Failed'
            // (matches single sub-agent path semantics).
            expect(result.step).toBe('Failed');
            // The aggregated summary should mention the unresolved sibling.
            const summary = params.conversationMessages.find(m =>
                typeof m.content === 'string' && m.content.includes('Parallel Sub-Agents Completed')
            );
            expect(summary?.content).toContain('DoesNotExist');
        });
    });

    describe('getRequestedSubAgents helper', () => {
        it('returns plural subAgents when populated', () => {
            const result = agent.testGetRequestedSubAgents({
                step: 'Sub-Agent',
                subAgents: [
                    { name: 'A', message: 'm1' },
                    { name: 'B', message: 'm2' }
                ]
            });
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('A');
            expect(result[1].name).toBe('B');
        });

        it('falls back to singular subAgent when subAgents is missing', () => {
            const single = { name: 'Solo', message: 'm' };
            const result = agent.testGetRequestedSubAgents({
                step: 'Sub-Agent',
                subAgent: single
            });
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(single);
        });

        it('falls back to singular subAgent when subAgents is empty array', () => {
            const single = { name: 'Solo', message: 'm' };
            const result = agent.testGetRequestedSubAgents({
                step: 'Sub-Agent',
                subAgent: single,
                subAgents: []
            });
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(single);
        });

        it('prefers plural over singular when both are populated', () => {
            const result = agent.testGetRequestedSubAgents({
                step: 'Sub-Agent',
                subAgent: { name: 'ShouldBeIgnored', message: 'x' },
                subAgents: [{ name: 'A', message: 'm1' }]
            });
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('A');
        });

        it('returns empty array when neither is set', () => {
            expect(agent.testGetRequestedSubAgents({ step: 'Sub-Agent' })).toEqual([]);
        });

        it('returns empty array for null / undefined input', () => {
            expect(agent.testGetRequestedSubAgents(undefined)).toEqual([]);
            expect(agent.testGetRequestedSubAgents(null)).toEqual([]);
        });
    });

    describe('validateSubAgentNextStep — singular vs plural request shape', () => {
        const params: ExecuteAgentParams<any> = {
            agent: { ID: 'parent-agent-id', Name: 'ParentAgent' } as any,
            contextUser: { ID: 'user-1' } as any,
            conversationMessages: [],
            onProgress: vi.fn(),
        };

        it('passes when a single singular subAgent resolves to an active child', async () => {
            const nextStep: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgent: { name: 'ChildAgent1', message: 'go', terminateAfter: false }
            };
            const result = await agent.testValidateSubAgentNextStep(params, nextStep);
            // Validation passes through the original nextStep unchanged
            expect(result.step).toBe('Sub-Agent');
            expect(result).toBe(nextStep);
        });

        it('passes when plural subAgents all resolve to active children (regression: parallel fan-out)', async () => {
            const nextStep: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgents: [
                    { name: 'ChildAgent1', message: 'go 1', terminateAfter: false },
                    { name: 'ChildAgent2', message: 'go 2', terminateAfter: false }
                ]
                // Note: no `subAgent` (singular). Before the fix this would have
                // produced a `Retry` with "Sub-agent 'undefined' not found or not active".
            };
            const result = await agent.testValidateSubAgentNextStep(params, nextStep);
            expect(result.step).toBe('Sub-Agent');
            expect(result).toBe(nextStep);
        });

        it('returns Retry when neither subAgent nor subAgents is populated', async () => {
            const nextStep: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {}
                // Intentionally missing both subAgent and subAgents
            };
            const result = await agent.testValidateSubAgentNextStep(params, nextStep);
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain("'undefined'");
            expect(result.errorMessage).toContain('not found or not active');
        });

        it('returns Retry when plural subAgents contains an unresolved name (one bad apple fails the lot)', async () => {
            const nextStep: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgents: [
                    { name: 'ChildAgent1', message: 'ok', terminateAfter: false },
                    { name: 'DoesNotExist', message: 'bad', terminateAfter: false }
                ]
            };
            const result = await agent.testValidateSubAgentNextStep(params, nextStep);
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain('DoesNotExist');
            expect(result.errorMessage).toContain('not found or not active');
        });

        it('returns Retry when singular subAgent name is unknown', async () => {
            const nextStep: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgent: { name: 'NoSuchAgent', message: 'x', terminateAfter: false }
            };
            const result = await agent.testValidateSubAgentNextStep(params, nextStep);
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain('NoSuchAgent');
        });

        it('routes to parallel executor when processSubAgentStep sees subAgents only (no singular)', async () => {
            // End-to-end check that the validate→process pipeline does not
            // get tripped up by the singular-only assumption.
            agent.mockExecuteSubAgentResult = (name: string) => ({
                success: true,
                payload: { [name]: 'ok' },
                agentRun: { FinalStep: 'Success' } as any
            });

            const previousDecision: BaseAgentNextStep<any, any> = {
                step: 'Sub-Agent',
                terminate: false,
                newPayload: {},
                subAgents: [
                    { name: 'ChildAgent1', message: 'a', terminateAfter: false },
                    { name: 'ChildAgent2', message: 'b', terminateAfter: false }
                ]
            };

            const localParams: ExecuteAgentParams<any> = {
                agent: { ID: 'parent-agent-id', Name: 'ParentAgent' } as any,
                contextUser: { ID: 'user-1' } as any,
                conversationMessages: [],
                onProgress: vi.fn(),
            };
            await agent.testProcessSubAgentStep(localParams, previousDecision);

            expect(agent.executeSubAgentCallOrder).toContain('ChildAgent1');
            expect(agent.executeSubAgentCallOrder).toContain('ChildAgent2');
            expect(agent.executeSubAgentCallOrder).toHaveLength(2);
        });
    });

    describe('finalizeAgentRun pending-save lifecycle', () => {
        it('flushes the queued step saves through finalizeAgentRun (queue drains)', async () => {
            let saved = 0;
            const step1 = new MockStepEntity('s1', async () => { saved++; return true; });
            const step2 = new MockStepEntity('s2', async () => { saved++; return true; });
            agent.testQueueStepSave(step1);
            agent.testQueueStepSave(step2);

            // Invoke finalizeAgentRun via reflection
            const fakeFinalStep: any = { step: 'Success', terminate: true, newPayload: {}, previousPayload: {} };
            // Mock the rest of finalize so it doesn't trip on missing internals
            (agent as any)._depth = 0;
            (agent as any)._mediaOutputs = [];
            (agent as any)._fileOutputs = [];
            (agent as any)._agentRun = {
                ID: 'mock-run-id',
                Steps: [],
                ErrorMessage: null,
                Save: vi.fn().mockResolvedValue(true)
            };
            // Stub out resolveMediaPlaceholdersInPayload/processMessageMediaPlaceholders so
            // finalize doesn't blow up before reaching the queue flush we care about.
            (agent as any).resolveMediaPlaceholdersInPayload = (x: any) => x;
            (agent as any).processMessageMediaPlaceholders = (x: any) => x;
            (agent as any).buildExecuteAgentResult = vi.fn().mockReturnValue({ success: true });

            try {
                await (agent as any).finalizeAgentRun(fakeFinalStep, {}, undefined);
            } catch {
                // We only care about the flush contract, not the rest of finalize
            }

            // finalize awaited the queue's flush, so both queued saves ran...
            expect(saved).toBe(2);
            // ...and the queue is drained: a subsequent flush reports no pending work.
            const after = await agent.testFlushStepSaves();
            expect(after.failures).toBe(0);
        });
    });
});
