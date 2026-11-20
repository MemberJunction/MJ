import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

const { mockAgentsRef, runViewCalls } = vi.hoisted(() => ({
    mockAgentsRef: { value: [] as Array<{ ID: string; Name: string; ArtifactCreationMode?: string; DefaultArtifactTypeID?: string | null }> },
    runViewCalls: [] as Array<{ EntityName?: string }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        public static FromMetadataProvider(): MockRunView {
            return new MockRunView();
        }
        async RunView(params: { EntityName?: string }) {
            runViewCalls.push(params);
            return { Success: true, Results: [] };
        }
    }
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: MockRunView,
        RunQuery: class {
            async RunQuery() {
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: vi.fn(async () => undefined),
                get Agents() {
                    return mockAgentsRef.value;
                },
                AgentTypes: [],
            };
        },
    },
}));

import { AgentRunner } from '../AgentRunner';

const USER = { ID: '11111111-1111-4111-8111-111111111111', Email: 'test@example.com' } as unknown as UserInfo;
const ORCHESTRATOR_ID = '22222222-2222-4222-8222-222222222222';
const SPECIALIST_ID = '33333333-3333-4333-8333-333333333333';

interface Deferred<T = void> {
    promise: Promise<T>;
    resolve: (v: T) => void;
}

function makeDeferred<T = void>(): Deferred<T> {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

interface FakeDetail {
    ID: string;
    ConversationID?: string;
    Status?: string;
    Message?: string;
    Error?: string;
    LatestResult: { CompleteMessage: string } | null;
    Save: ReturnType<typeof vi.fn>;
    Load: ReturnType<typeof vi.fn>;
    EnsureSaveComplete: ReturnType<typeof vi.fn>;
    MarkServerAuthoredReply: ReturnType<typeof vi.fn>;
}

function makeDetail(id: string, saveImpl?: () => Promise<boolean>): FakeDetail {
    return {
        ID: id,
        ConversationID: 'conv-1',
        Status: 'In-Progress',
        LatestResult: null,
        Save: vi.fn(saveImpl ?? (async () => true)),
        Load: vi.fn(async () => true),
        EnsureSaveComplete: vi.fn(async () => undefined),
        MarkServerAuthoredReply: vi.fn(),
    };
}

function makeProvider(details: FakeDetail[]): IMetadataProvider {
    const queue = [...details];
    return {
        GetEntityObject: vi.fn(async () => queue.shift()),
    } as unknown as IMetadataProvider;
}

interface RunAgentStub {
    RunAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>;
}

interface HydrationBridge {
    hydrateConversationArtifacts(params: ExecuteAgentParams): Promise<ExecuteAgentParams>;
}

describe('AgentRunner — hot-path latency optimizations', () => {
    beforeEach(() => {
        mockAgentsRef.value = [];
        runViewCalls.length = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('non-blocking coalesced progress saves', () => {
        it('returns from wrappedOnProgress immediately without waiting on DB Save(), coalesces intermediate messages, and drains before final Status=Complete', async () => {
            const firstProgressGate = makeDeferred<boolean>();
            const savedMessages: string[] = [];
            let saveCallCount = 0;
            const events: string[] = [];

            const agentDetail = makeDetail('agent-detail', async () => {
                saveCallCount++;
                const callNum = saveCallCount;
                const msg = agentDetail.Message ?? '';
                // Call 1 is the initial CreateAgentReplyDetail save
                if (callNum === 1) {
                    return true;
                }
                // Call 2 is the first progress save — block it to prove onProgress does not wait
                if (callNum === 2) {
                    events.push(`save:start:${msg}`);
                    savedMessages.push(msg);
                    const ok = await firstProgressGate.promise;
                    events.push(`save:end:${msg}`);
                    return ok;
                }
                // Subsequent saves complete immediately
                events.push(`save:${agentDetail.Status}:${msg}`);
                savedMessages.push(msg);
                return true;
            });

            const runner = new AgentRunner(makeProvider([makeDetail('user-detail'), agentDetail]));

            vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockImplementation(async (params) => {
                await params.onProgress?.({ step: 'prompt_execution', percentage: 10, message: 'step-1' } as never);
                events.push('after-onProgress-1');

                // While step-1's DB Save() is still blocked, emit step-2 and step-3 — they must coalesce to step-3
                await params.onProgress?.({ step: 'prompt_execution', percentage: 40, message: 'step-2' } as never);
                await params.onProgress?.({ step: 'prompt_execution', percentage: 80, message: 'step-3' } as never);
                events.push('after-onProgress-3');

                // Release step-1 save right before finishing so updateDetail can drain the chain
                firstProgressGate.resolve(true);

                return {
                    success: true,
                    payload: undefined,
                    agentRun: { ID: 'run-1', AgentID: ORCHESTRATOR_ID, Status: 'Completed', FinalStep: 'Success', Message: 'Final reply' },
                } as unknown as ExecuteAgentResult;
            });

            await runner.RunAgentInConversation(
                {
                    agent: { ID: ORCHESTRATOR_ID, Name: 'Fast Agent' },
                    conversationMessages: [],
                    contextUser: USER,
                    onProgress: () => {
                        events.push('live-callback');
                    },
                } as unknown as ExecuteAgentParams,
                { conversationId: 'conv-1', userMessage: 'hi' },
            );

            // Prove wrappedOnProgress returned BEFORE step-1's Save() resolved
            expect(events.indexOf('after-onProgress-1')).toBeLessThan(events.indexOf('save:end:step-1'));
            expect(events.indexOf('after-onProgress-3')).toBeLessThan(events.indexOf('save:end:step-1'));
            // Prove live callbacks fired for all 3 progress emissions
            expect(events.filter((e) => e === 'live-callback')).toHaveLength(3);
            // Prove step-2 was coalesced away (never written to DB), while final reply landed last
            expect(savedMessages).not.toContain('step-2');
            expect(savedMessages[savedMessages.length - 1]).toBe('Final reply');
            expect(agentDetail.Status).toBe('Complete');
        });
    });

    describe('sub-agent hydrateConversationArtifacts skip', () => {
        it('skips conversation artifact DB queries when params.parentRun is set', async () => {
            const getEntitySpy = vi.fn();
            const provider = { GetEntityObject: getEntitySpy } as unknown as IMetadataProvider;
            const bridge = new AgentRunner(provider) as unknown as HydrationBridge;

            const params = {
                agent: { ID: SPECIALIST_ID, Name: 'Sub Agent' },
                conversationMessages: [],
                contextUser: USER,
                conversationId: 'conv-1',
                conversationDetailId: 'detail-1',
                parentRun: { ID: 'parent-run-1' },
            } as unknown as ExecuteAgentParams;

            const result = await bridge.hydrateConversationArtifacts(params);

            expect(result).toBe(params);
            expect(runViewCalls).toHaveLength(0);
            expect(getEntitySpy).not.toHaveBeenCalled();
        });

        it('still scans conversation artifacts when params.parentRun is absent', async () => {
            const provider = { GetEntityObject: vi.fn() } as unknown as IMetadataProvider;
            const bridge = new AgentRunner(provider) as unknown as HydrationBridge;

            const params = {
                agent: { ID: ORCHESTRATOR_ID, Name: 'Top-Level Agent' },
                conversationMessages: [],
                contextUser: USER,
                conversationId: 'conv-1',
            } as unknown as ExecuteAgentParams;

            await bridge.hydrateConversationArtifacts(params);

            expect(runViewCalls.some((c) => c.EntityName === 'MJ: Conversation Details')).toBe(true);
        });
    });

    describe('deferred System Only payload artifacts', () => {
        it('does not block RunAgentInConversation on ProcessAgentArtifacts when ArtifactCreationMode is System Only and no artifactDirective is set', async () => {
            mockAgentsRef.value = [
                { ID: ORCHESTRATOR_ID, Name: 'Koala', ArtifactCreationMode: 'System Only', DefaultArtifactTypeID: null },
            ];
            const artifactGate = makeDeferred<{ artifactId: string; versionId: string; versionNumber: number } | undefined>();
            const runner = new AgentRunner(makeProvider([makeDetail('user-detail'), makeDetail('agent-detail')]));

            vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue({
                success: true,
                payload: { internalState: true },
                agentRun: { ID: 'run-1', AgentID: ORCHESTRATOR_ID, Status: 'Completed', FinalStep: 'Success', Message: 'Done', Steps: [] },
            } as unknown as ExecuteAgentResult);

            const processArtifactsSpy = vi.spyOn(runner, 'ProcessAgentArtifacts').mockImplementation(() => artifactGate.promise);

            // Must resolve BEFORE artifactGate settles
            const result = await runner.RunAgentInConversation(
                {
                    agent: { ID: ORCHESTRATOR_ID, Name: 'Koala', ArtifactCreationMode: 'System Only' },
                    conversationMessages: [],
                    contextUser: USER,
                } as unknown as ExecuteAgentParams,
                { conversationId: 'conv-1', userMessage: 'hi' },
            );

            expect(result.artifactInfo).toBeUndefined();
            expect(processArtifactsSpy).toHaveBeenCalledTimes(1);

            // Clean up deferred background promise
            artifactGate.resolve(undefined);
            await Promise.resolve();
        });

        it('awaits ProcessAgentArtifacts synchronously when an explicit artifactDirective is set', async () => {
            mockAgentsRef.value = [
                { ID: ORCHESTRATOR_ID, Name: 'Koala', ArtifactCreationMode: 'System Only', DefaultArtifactTypeID: null },
            ];
            const runner = new AgentRunner(makeProvider([makeDetail('user-detail'), makeDetail('agent-detail')]));

            vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue({
                success: true,
                payload: { deliverable: 'doc' },
                artifactDirective: { behavior: 'new', name: 'Deliverable' },
                agentRun: { ID: 'run-1', AgentID: ORCHESTRATOR_ID, Status: 'Completed', FinalStep: 'Success', Message: 'Done', Steps: [] },
            } as unknown as ExecuteAgentResult);

            const expectedArtifact = { artifactId: 'art-1', versionId: 'ver-1', versionNumber: 1 };
            const processArtifactsSpy = vi.spyOn(runner, 'ProcessAgentArtifacts').mockResolvedValue(expectedArtifact);

            const result = await runner.RunAgentInConversation(
                {
                    agent: { ID: ORCHESTRATOR_ID, Name: 'Koala', ArtifactCreationMode: 'System Only' },
                    conversationMessages: [],
                    contextUser: USER,
                } as unknown as ExecuteAgentParams,
                { conversationId: 'conv-1', userMessage: 'hi' },
            );

            expect(processArtifactsSpy).toHaveBeenCalledTimes(1);
            expect(result.artifactInfo).toEqual(expectedArtifact);
        });

        it('awaits ProcessAgentArtifacts synchronously when a System Only orchestrator delegates to a user-visible specialist sub-agent', async () => {
            mockAgentsRef.value = [
                { ID: ORCHESTRATOR_ID, Name: 'Sage', ArtifactCreationMode: 'System Only', DefaultArtifactTypeID: null },
                { ID: SPECIALIST_ID, Name: 'Research Agent', ArtifactCreationMode: 'Always', DefaultArtifactTypeID: 'type-1' },
            ];
            const runner = new AgentRunner(makeProvider([makeDetail('user-detail'), makeDetail('agent-detail')]));

            vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockResolvedValue({
                success: true,
                payload: { report: 'full report' },
                agentRun: {
                    ID: 'run-1',
                    AgentID: ORCHESTRATOR_ID,
                    Status: 'Completed',
                    FinalStep: 'Success',
                    Message: 'Done',
                    Steps: [{ StepType: 'Sub-Agent', Success: true, TargetID: SPECIALIST_ID }],
                },
            } as unknown as ExecuteAgentResult);

            const expectedArtifact = { artifactId: 'art-specialist', versionId: 'ver-1', versionNumber: 1 };
            const processArtifactsSpy = vi.spyOn(runner, 'ProcessAgentArtifacts').mockResolvedValue(expectedArtifact);

            const result = await runner.RunAgentInConversation(
                {
                    agent: { ID: ORCHESTRATOR_ID, Name: 'Sage', ArtifactCreationMode: 'System Only' },
                    conversationMessages: [],
                    contextUser: USER,
                } as unknown as ExecuteAgentParams,
                { conversationId: 'conv-1', userMessage: 'hi' },
            );

            expect(processArtifactsSpy).toHaveBeenCalledTimes(1);
            expect(result.artifactInfo).toEqual(expectedArtifact);
        });
    });
});
