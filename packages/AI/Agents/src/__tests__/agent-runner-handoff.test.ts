/**
 * Unit tests for VS-SAGE-3 server-side handoff execution:
 * - AgentRunner.FollowHandoffs
 * - HandoffBriefMessage
 * - BaseAgent.runWithholdsHandoff guest/widget guard
 * - MJAIAgentRequestEntityServer.resumeAgent handoff follow-through
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentConfigurationEntity } from '@memberjunction/core-entities';

const {
    mockResolveHandoffTarget,
    mockResolveConversationAgentPreset,
    mockBuildReplyOnBranchPathFilter,
    mockLoadBranchesFresh,
    mockFromMetadataProvider,
} = vi.hoisted(() => ({
    mockResolveHandoffTarget: vi.fn(),
    mockResolveConversationAgentPreset: vi.fn(),
    mockBuildReplyOnBranchPathFilter: vi.fn(),
    mockLoadBranchesFresh: vi.fn(),
    mockFromMetadataProvider: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            static FromMetadataProvider = mockFromMetadataProvider;
            async RunView() {
                return { Success: true, Results: [] };
            }
        },
        RunQuery: class {
            async RunQuery() {
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return {
        ...actual,
        ConversationEngine: {
            ...actual.ConversationEngine,
            LoadBranchesFresh: mockLoadBranchesFresh,
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return { Config: vi.fn(async () => undefined), AgentTypes: [], Agents: [] };
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-engine-base')>();
    return {
        ...actual,
        ResolveConversationAgentPreset: mockResolveConversationAgentPreset,
    };
});

vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-core-plus')>();
    return {
        ...actual,
        MJAIAgentRunEntityExtended: {
            ...actual.MJAIAgentRunEntityExtended,
            SettledStatuses: actual.MJAIAgentRunEntityExtended.SettledStatuses ?? ['Completed', 'Failed', 'Cancelled'],
            BuildReplyOnBranchPathFilter: mockBuildReplyOnBranchPathFilter,
        },
    };
});

vi.mock('../handoff-target', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../handoff-target')>();
    return {
        ...actual,
        ResolveHandoffTarget: mockResolveHandoffTarget,
    };
});

import { AgentRunner, HandoffBriefMessage, type ConversationExecutionResult } from '../AgentRunner';
import { BaseAgent } from '../base-agent';
import { MJAIAgentRequestEntityServer } from '../MJAIAgentRequestEntityServer';

const USER = { ID: '00000000-0000-4000-8000-000000000001', Email: 'it@example.com' } as unknown as UserInfo;
const CONV_ID = '00000000-0000-4000-8000-000000000010';
const BRANCH_1 = '00000000-0000-4000-8000-000000000020';
const BRANCH_X = '00000000-0000-4000-8000-000000000021';
const BRANCH_MAIN = '00000000-0000-4000-8000-000000000022';
const AGENT_SAGE_ID = '00000000-0000-4000-8000-000000000101';
const AGENT_STORYBOARD_ID = '00000000-0000-4000-8000-000000000102';
const AGENT_PRODUCER_ID = '00000000-0000-4000-8000-000000000103';

interface FakeDetail {
    ID: string;
    ConversationID: string;
    Role?: string;
    AgentID?: string | null;
    ParentID?: string | null;
    BranchID: string | null;
    Status?: string;
    HiddenToUser?: boolean;
    Message?: string;
    Error?: string | null;
    NewRecord: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    Load: ReturnType<typeof vi.fn>;
    EnsureSaveComplete: ReturnType<typeof vi.fn>;
    savedSnapshots: Array<{
        ID: string;
        Role?: string;
        AgentID?: string | null;
        ParentID?: string | null;
        BranchID: string | null;
        Status?: string;
        HiddenToUser?: boolean;
        Message?: string;
        Error?: string | null;
    }>;
}

function makeDetail(id: string, branchId: string | null, initialMessage = 'Source message'): FakeDetail {
    const detail: FakeDetail = {
        ID: id,
        ConversationID: CONV_ID,
        BranchID: branchId,
        Message: initialMessage,
        savedSnapshots: [],
        NewRecord: vi.fn(),
        Save: vi.fn(async () => {
            detail.savedSnapshots.push({
                ID: detail.ID,
                Role: detail.Role,
                AgentID: detail.AgentID,
                ParentID: detail.ParentID,
                BranchID: detail.BranchID,
                Status: detail.Status,
                HiddenToUser: detail.HiddenToUser,
                Message: detail.Message,
                Error: detail.Error,
            });
            return true;
        }),
        Load: vi.fn(async () => true),
        EnsureSaveComplete: vi.fn(async () => undefined),
    };
    return detail;
}

function makeAgent(id: string, name: string): MJAIAgentEntityExtended {
    return {
        ID: id,
        Name: name,
        Status: 'Active',
        InvocationMode: 'Any',
    } as unknown as MJAIAgentEntityExtended;
}

function makePreset(id: string, name: string, displayName: string | null, aiConfigId: string): MJAIAgentConfigurationEntity {
    return {
        ID: id,
        Name: name,
        DisplayName: displayName,
        AIConfigurationID: aiConfigId,
        Status: 'Active',
    } as unknown as MJAIAgentConfigurationEntity;
}

interface FakeHandoffStep {
    ID: string;
    StepType: string;
    Status: string;
    OutputData: string | null;
    ErrorMessage: string | null;
    CompletedAt: Date | null;
    Save: ReturnType<typeof vi.fn>;
}

function makeHandoffStep(
    initialOutput: Record<string, unknown> = { targetAgentId: AGENT_STORYBOARD_ID },
    id = '00000000-0000-4000-8000-000000000901'
): FakeHandoffStep {
    return {
        ID: id,
        StepType: 'Handoff',
        Status: 'Completed',
        OutputData: JSON.stringify(initialOutput),
        ErrorMessage: null,
        CompletedAt: null,
        Save: vi.fn(async () => true),
    };
}

function makeProvider(details: FakeDetail[]): IMetadataProvider {
    const queue = [...details];
    return {
        GetEntityObject: vi.fn(async () => queue.shift()),
    } as unknown as IMetadataProvider;
}

describe('VS-SAGE-3: Server-side Handoff Execution', () => {
    const sourceAgent = makeAgent(AGENT_SAGE_ID, 'Sage');
    const targetAgent = makeAgent(AGENT_STORYBOARD_ID, 'Storyboard Artist');
    const secondTargetAgent = makeAgent(AGENT_PRODUCER_ID, 'Producer');

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);

        mockResolveHandoffTarget.mockResolvedValue({
            Target: targetAgent,
            Candidates: [],
        });
        mockResolveConversationAgentPreset.mockResolvedValue({
            Preset: null,
            Source: 'None',
        });
        mockLoadBranchesFresh.mockResolvedValue([]);
        mockBuildReplyOnBranchPathFilter.mockReturnValue("ConversationDetailID IN ('d1')");
        mockFromMetadataProvider.mockReturnValue({
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('HandoffBriefMessage', () => {
        it('formats the system message with source agent name, brief, and optional reason', () => {
            const withReason = HandoffBriefMessage('Sage', 'Create a 30s product launch storyboard.', 'User approved brief.');
            expect(withReason).toContain('Sage');
            expect(withReason).toContain('Create a 30s product launch storyboard.');
            expect(withReason).toContain('User approved brief.');

            const withoutReason = HandoffBriefMessage('Sage', 'Draft scenes 1-4.');
            expect(withoutReason).toContain('Sage');
            expect(withoutReason).toContain('Draft scenes 1-4.');
            expect(withoutReason).not.toContain('Reason for transfer:');
        });
    });

    describe('AgentRunner.FollowHandoffs', () => {
        it('creates the target row before OnHopStart, stamps step OutputData, and executes a top-level target run', async () => {
            const sourceRow = makeDetail('detail-source', BRANCH_1);
            const targetRow = makeDetail('detail-target', null, '');
            const provider = makeProvider([sourceRow, targetRow]);
            const runner = new AgentRunner(provider);

            const handoffStep = makeHandoffStep({ targetAgentId: targetAgent.ID, brief: 'Build storyboard' });
            const preset = makePreset('preset-1', 'Fast', 'Fast Mode', 'ai-config-fast');
            mockResolveConversationAgentPreset.mockResolvedValue({
                Preset: preset,
                Source: 'Mention',
            });

            const callOrder: string[] = [];
            targetRow.Save.mockImplementation(async () => {
                callOrder.push('targetRow.Save');
                targetRow.savedSnapshots.push({
                    ID: targetRow.ID,
                    Role: targetRow.Role,
                    AgentID: targetRow.AgentID,
                    ParentID: targetRow.ParentID,
                    BranchID: targetRow.BranchID,
                    Status: targetRow.Status,
                    HiddenToUser: targetRow.HiddenToUser,
                    Message: targetRow.Message,
                    Error: targetRow.Error,
                });
                return true;
            });
            handoffStep.Save.mockImplementation(async () => {
                callOrder.push('handoffStep.Save');
                return true;
            });

            const onProgressFn = vi.fn();
            const onStreamingFn = vi.fn();

            const runInConvSpy = vi.spyOn(runner, 'RunAgentInConversation').mockImplementation(async () => {
                callOrder.push('RunAgentInConversation');
                return {
                    agentResult: {
                        success: true,
                        agentRun: { ID: 'run-target-1' } as unknown as MJAIAgentRunEntityExtended,
                    },
                    conversationId: CONV_ID,
                    agentResponseDetailId: targetRow.ID,
                    artifactInfo: { artifactId: 'art-1', versionId: 'ver-1', name: 'Storyboard', versionNumber: 1 },
                } as ConversationExecutionResult;
            });

            const sourceResult: ExecuteAgentResult = {
                success: true,
                agentRun: {
                    ID: 'run-source-1',
                    Steps: [handoffStep as unknown as MJAIAgentRunStepEntityExtended],
                } as unknown as MJAIAgentRunEntityExtended,
                handoff: {
                    targetAgentId: targetAgent.ID,
                    targetAgentName: targetAgent.Name!,
                    sourceAgentId: sourceAgent.ID,
                    brief: 'Build a 3-scene storyboard.',
                    reason: 'User asked for storyboard.',
                    runStepId: handoffStep.ID,
                },
            };

            const sourceParams: ExecuteAgentParams = {
                agent: sourceAgent,
                conversationMessages: [{ role: 'user', content: 'Make a storyboard' }],
                contextUser: USER,
                handoffChain: [],
                provider,
            };

            const outcomes = await runner.FollowHandoffs({
                params: sourceParams,
                sourceResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: sourceRow.ID,
                createArtifacts: true,
                hooks: {
                    OnHopStart: (hop, previous) => {
                        callOrder.push('OnHopStart');
                        expect(targetRow.savedSnapshots).toHaveLength(1);
                        expect(hop.targetConversationDetailId).toBe('detail-target');
                        expect(hop.sourceConversationDetailId).toBe('detail-source');
                        expect(hop.preset?.ID).toBe('preset-1');
                        expect(hop.presetSource).toBe('Mention');
                        expect(previous.conversationDetailId).toBe('detail-source');
                        return { onProgress: onProgressFn, onStreaming: onStreamingFn };
                    },
                    OnHopEnd: () => {
                        callOrder.push('OnHopEnd');
                    },
                },
            });

            expect(callOrder).toEqual([
                'targetRow.Save',
                'handoffStep.Save',
                'OnHopStart',
                'RunAgentInConversation',
                'OnHopEnd',
            ]);

            expect(targetRow.savedSnapshots[0]).toEqual({
                ID: 'detail-target',
                Role: 'AI',
                AgentID: targetAgent.ID,
                ParentID: 'detail-source',
                BranchID: BRANCH_1,
                Status: 'In-Progress',
                HiddenToUser: false,
                Message: '⏳ Starting...',
                Error: undefined,
            });

            const stepOutput = JSON.parse(handoffStep.OutputData!);
            expect(stepOutput).toMatchObject({
                targetAgentId: targetAgent.ID,
                brief: 'Build storyboard',
                TargetConversationDetailID: 'detail-target',
                PresetID: 'preset-1',
                PresetName: 'Fast Mode',
                PresetSource: 'Mention',
            });

            expect(runInConvSpy).toHaveBeenCalledTimes(1);
            const [targetParams, targetOpts] = runInConvSpy.mock.calls[0];
            expect(targetOpts).toEqual({
                conversationId: CONV_ID,
                conversationDetailId: 'detail-target',
                createArtifacts: true,
            });
            expect(targetParams.agent).toBe(targetAgent);
            expect(targetParams.parentRun).toBeUndefined();
            expect(targetParams.configurationId).toBe('ai-config-fast');
            expect(targetParams.handoffChain).toEqual([sourceAgent.ID]);
            expect(targetParams.onProgress).toBe(onProgressFn);
            expect(targetParams.onStreaming).toBe(onStreamingFn);
            expect(targetParams.conversationMessages).toHaveLength(2);
            expect(targetParams.conversationMessages[0].role).toBe('system');
            expect(targetParams.conversationMessages[0].content).toBe(
                HandoffBriefMessage('Sage', 'Build a 3-scene storyboard.', 'User asked for storyboard.')
            );
            expect(targetParams.conversationMessages[1]).toEqual({ role: 'user', content: 'Make a storyboard' });

            expect(outcomes).toHaveLength(1);
            expect(outcomes[0].targetConversationDetailId).toBe('detail-target');
            expect(outcomes[0].artifactInfo?.artifactId).toBe('art-1');
        });

        it.each([
            ['Mention', makePreset('p-mention', 'MentionPreset', 'Mention Display', 'cfg-mention'), 'cfg-mention'],
            ['UserSetting', makePreset('p-setting', 'SettingPreset', null, 'cfg-setting'), 'cfg-setting'],
            ['Default', makePreset('p-default', 'DefaultPreset', 'Default Display', 'cfg-default'), 'cfg-default'],
            ['None', null, undefined],
        ] as const)('sets configurationId from preset source %s', async (source, preset, expectedConfigId) => {
            const sourceRow = makeDetail('detail-source', null);
            const targetRow = makeDetail('detail-target', null);
            const provider = makeProvider([sourceRow, targetRow]);
            const runner = new AgentRunner(provider);

            mockResolveConversationAgentPreset.mockResolvedValue({
                Preset: preset,
                Source: source,
            });

            const runInConvSpy = vi.spyOn(runner, 'RunAgentInConversation').mockResolvedValue({
                agentResult: { success: true } as ExecuteAgentResult,
                conversationId: CONV_ID,
                agentResponseDetailId: targetRow.ID,
            });

            await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: [],
                    contextUser: USER,
                    handoffChain: [],
                    provider,
                },
                sourceResult: {
                    success: true,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: targetAgent.Name!,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Brief',
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: sourceRow.ID,
            });

            const [targetParams] = runInConvSpy.mock.calls[0];
            expect(targetParams.configurationId).toBe(expectedConfigId);
        });

        it('copies allowed context fields and never copies payload, lastRunId, configurationId, override, or parentRun from source', async () => {
            const sourceRow = makeDetail('detail-source', BRANCH_X);
            const targetRow = makeDetail('detail-target', null);
            const provider = makeProvider([sourceRow, targetRow]);
            const runner = new AgentRunner(provider);

            const runInConvSpy = vi.spyOn(runner, 'RunAgentInConversation').mockResolvedValue({
                agentResult: { success: true } as ExecuteAgentResult,
                conversationId: CONV_ID,
                agentResponseDetailId: targetRow.ID,
            });

            const historyFrom = new Date('2026-10-16T00:00:00Z');
            const cancellationToken = { cancelled: false };
            const customContext = { custom: 'ctx' };
            const inputArtifacts = [{ artifactId: 'a1', versionId: 'v1', name: 'Doc', versionNumber: 1 }];

            const sourceParams: ExecuteAgentParams<{ custom: string }> = {
                agent: sourceAgent,
                conversationMessages: [{ role: 'user', content: 'Hello' }],
                contextUser: USER,
                userId: 'u-1',
                companyId: 'c-1',
                PrimaryScopeEntityName: 'Projects',
                PrimaryScopeRecordID: 'proj-1',
                SecondaryScopes: [{ EntityName: 'Brands', RecordID: 'brand-1' }],
                CredentialScope: { organizationId: 'org-1' } as unknown as ExecuteAgentParams['CredentialScope'],
                apiKeys: [{ driverClass: 'OpenAILLM', apiKey: 'sk-test' }],
                Audience: 'Internal',
                data: { WORKSPACE_ID: 'ws-1', ALL_AVAILABLE_AGENTS: [{ ID: targetAgent.ID }] },
                TrustReservedRunData: true,
                inputArtifacts: inputArtifacts as unknown as ExecuteAgentParams['inputArtifacts'],
                planMode: false,
                requestedSkillIDs: ['skill-1'],
                ConversationHistoryFrom: historyFrom,
                ConversationBranchID: BRANCH_X,
                sessionID: 'sess-1',
                cancellationToken,
                provider,
                context: customContext,
                handoffChain: ['agent-initial'],
                // Fields that MUST NOT be copied from the source run:
                payload: { secretSourcePayload: true },
                lastRunId: 'source-last-run-id',
                autoPopulateLastRunPayload: true,
                configurationId: 'source-sage-config-id',
                override: { modelId: 'override-model' },
                parentRun: { ID: 'parent-run-id' } as unknown as MJAIAgentRunEntityExtended,
            };

            await runner.FollowHandoffs({
                params: sourceParams,
                sourceResult: {
                    success: true,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: targetAgent.Name!,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Brief',
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: sourceRow.ID,
            });

            const [targetParams] = runInConvSpy.mock.calls[0];
            // Copied fields:
            expect(targetParams.contextUser).toBe(USER);
            expect(targetParams.userId).toBe('u-1');
            expect(targetParams.companyId).toBe('c-1');
            expect(targetParams.PrimaryScopeEntityName).toBe('Projects');
            expect(targetParams.PrimaryScopeRecordID).toBe('proj-1');
            expect(targetParams.SecondaryScopes).toEqual([{ EntityName: 'Brands', RecordID: 'brand-1' }]);
            expect(targetParams.CredentialScope).toEqual({ organizationId: 'org-1' });
            expect(targetParams.apiKeys).toEqual([{ driverClass: 'OpenAILLM', apiKey: 'sk-test' }]);
            expect(targetParams.Audience).toBe('Internal');
            expect(targetParams.data).toEqual({ WORKSPACE_ID: 'ws-1', ALL_AVAILABLE_AGENTS: [{ ID: targetAgent.ID }] });
            expect(targetParams.TrustReservedRunData).toBe(true);
            expect(targetParams.inputArtifacts).toBe(inputArtifacts);
            expect(targetParams.planMode).toBe(false);
            expect(targetParams.requestedSkillIDs).toEqual(['skill-1']);
            expect(targetParams.ConversationHistoryFrom).toBe(historyFrom);
            expect(targetParams.ConversationBranchID).toBe(BRANCH_X);
            expect(targetParams.sessionID).toBe('sess-1');
            expect(targetParams.cancellationToken).toBe(cancellationToken);
            expect(targetParams.provider).toBe(provider);
            expect(targetParams.context).toBe(customContext);
            expect(targetParams.handoffChain).toEqual(['agent-initial', sourceAgent.ID]);

            // Never-copied fields:
            expect(targetParams.payload).toBeUndefined();
            expect(targetParams.lastRunId).toBeUndefined();
            expect(targetParams.autoPopulateLastRunPayload).toBeUndefined();
            expect(targetParams.configurationId).toBeUndefined();
            expect(targetParams.override).toBeUndefined();
            expect(targetParams.parentRun).toBeUndefined();
        });

        it('populates lastRunId and autoPopulateLastRunPayload when the target has a settled prior run on the branch path', async () => {
            const sourceRow = makeDetail('detail-source', BRANCH_1);
            const targetRow = makeDetail('detail-target', null);
            const provider = makeProvider([sourceRow, targetRow]);
            const runner = new AgentRunner(provider);

            mockFromMetadataProvider.mockReturnValue({
                RunView: vi.fn(async () => ({
                    Success: true,
                    Results: [{ ID: 'target-prior-run-99' }],
                })),
            });

            const runInConvSpy = vi.spyOn(runner, 'RunAgentInConversation').mockResolvedValue({
                agentResult: { success: true } as ExecuteAgentResult,
                conversationId: CONV_ID,
                agentResponseDetailId: targetRow.ID,
            });

            await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: [],
                    contextUser: USER,
                    handoffChain: [],
                    provider,
                },
                sourceResult: {
                    success: true,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: targetAgent.Name!,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Continue work',
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: sourceRow.ID,
            });

            expect(mockLoadBranchesFresh).toHaveBeenCalledWith(CONV_ID, USER, provider);
            expect(mockBuildReplyOnBranchPathFilter).toHaveBeenCalledWith(
                CONV_ID,
                BRANCH_1,
                []
            );
            const [targetParams] = runInConvSpy.mock.calls[0];
            expect(targetParams.lastRunId).toBe('target-prior-run-99');
            expect(targetParams.autoPopulateLastRunPayload).toBe(true);
        });

        it('follows a two-hop chain (A -> B -> C) and stops when the final run has no handoff', async () => {
            const rowA = makeDetail('detail-a', BRANCH_MAIN);
            const rowB = makeDetail('detail-b', BRANCH_MAIN);
            const rowBReloaded = makeDetail('detail-b', BRANCH_MAIN);
            const rowC = makeDetail('detail-c', BRANCH_MAIN);
            const provider = makeProvider([rowA, rowB, rowBReloaded, rowC]);
            const runner = new AgentRunner(provider);

            mockResolveHandoffTarget
                .mockResolvedValueOnce({ Target: targetAgent, Candidates: [] })
                .mockResolvedValueOnce({ Target: secondTargetAgent, Candidates: [] });

            const runInConvSpy = vi.spyOn(runner, 'RunAgentInConversation')
                .mockResolvedValueOnce({
                    agentResult: {
                        success: true,
                        handoff: {
                            targetAgentId: secondTargetAgent.ID,
                            targetAgentName: secondTargetAgent.Name!,
                            sourceAgentId: targetAgent.ID,
                            brief: 'Hand off from B to C',
                        },
                    } as ExecuteAgentResult,
                    conversationId: CONV_ID,
                    agentResponseDetailId: 'detail-b',
                })
                .mockResolvedValueOnce({
                    agentResult: {
                        success: true,
                    } as ExecuteAgentResult,
                    conversationId: CONV_ID,
                    agentResponseDetailId: 'detail-c',
                });

            const outcomes = await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: [{ role: 'user', content: 'Start chain' }],
                    contextUser: USER,
                    handoffChain: [],
                    provider,
                },
                sourceResult: {
                    success: true,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: targetAgent.Name!,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Hand off from A to B',
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: 'detail-a',
            });

            expect(outcomes).toHaveLength(2);
            expect(rowB.ParentID).toBe('detail-a');
            expect(rowC.ParentID).toBe('detail-b');

            const [paramsHop1] = runInConvSpy.mock.calls[0];
            const [paramsHop2] = runInConvSpy.mock.calls[1];
            expect(paramsHop1.handoffChain).toEqual([sourceAgent.ID]);
            expect(paramsHop2.handoffChain).toEqual([sourceAgent.ID, targetAgent.ID]);
        });

        it('handles re-resolution refusal: creates no target row, marks source Handoff step Failed, and appends clean reason-only notice to source row', async () => {
            const sourceRow = makeDetail('detail-source', null, 'Here is my analysis.');
            const provider = makeProvider([sourceRow]);
            const runner = new AgentRunner(provider);

            mockResolveHandoffTarget.mockResolvedValue({
                Refusal: {
                    Reason: 'NoRunPermission',
                    Message:
                        'The current user does not have permission to run Storyboard Artist. Hand off to one of: Producer, or call Find Candidate Agents.',
                },
                Candidates: [{ ID: AGENT_PRODUCER_ID, Name: 'Producer' }],
            });

            const handoffStep = makeHandoffStep({ targetAgentId: targetAgent.ID });
            const runInConvSpy = vi.spyOn(runner, 'RunAgentInConversation');

            const sourceResult: ExecuteAgentResult = {
                success: true,
                agentRun: {
                    ID: 'run-source-1',
                    Message: 'Here is my analysis.',
                    Steps: [handoffStep as unknown as MJAIAgentRunStepEntityExtended],
                } as unknown as MJAIAgentRunEntityExtended,
                handoff: {
                    targetAgentId: targetAgent.ID,
                    targetAgentName: 'Storyboard Artist',
                    sourceAgentId: sourceAgent.ID,
                    brief: 'Brief',
                    runStepId: handoffStep.ID,
                },
            };

            const outcomes = await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: [],
                    contextUser: USER,
                    handoffChain: [],
                    provider,
                },
                sourceResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: sourceRow.ID,
            });

            expect(outcomes).toEqual([]);
            expect(runInConvSpy).not.toHaveBeenCalled();
            expect(handoffStep.Status).toBe('Failed');
            expect(handoffStep.ErrorMessage).toBe(
                'The current user does not have permission to run Storyboard Artist.'
            );
            expect(handoffStep.Save).toHaveBeenCalledTimes(1);
            const expectedRefusalMessage =
                "Here is my analysis.\n\nI couldn't transfer you to Storyboard Artist: The current user does not have permission to run Storyboard Artist.";
            expect(sourceRow.Message).toBe(expectedRefusalMessage);
            expect(sourceResult.agentRun?.Message).toBe(expectedRefusalMessage);
            expect(sourceRow.Message).not.toContain('Producer');
            expect(sourceRow.Message).not.toContain('Find Candidate Agents');
            expect(sourceRow.Save).toHaveBeenCalledTimes(1);
        });

        it('catches a throwing target run, marks the target row Error, notifies OnHopEnd, and does not rethrow', async () => {
            const sourceRow = makeDetail('detail-source', null);
            const targetRow = makeDetail('detail-target', null);
            const provider = makeProvider([sourceRow, targetRow]);
            const runner = new AgentRunner(provider);

            vi.spyOn(runner, 'RunAgentInConversation').mockRejectedValue(new Error('Target LLM crashed'));
            const onHopEnd = vi.fn();

            const outcomes = await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: [],
                    contextUser: USER,
                    handoffChain: [],
                    provider,
                },
                sourceResult: {
                    success: true,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: targetAgent.Name!,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Brief',
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: sourceRow.ID,
                hooks: { OnHopEnd: onHopEnd },
            });

            expect(outcomes).toHaveLength(1);
            expect(outcomes[0].error).toBe('Target LLM crashed');
            expect(targetRow.Status).toBe('Error');
            expect(targetRow.Message).toBe('Target LLM crashed');
            expect(targetRow.Error).toBe('Target LLM crashed');
            expect(onHopEnd).toHaveBeenCalledTimes(1);
        });

        it('preserves prior hop outcomes and records refusal when a subsequent target row Save() returns false', async () => {
            const rowA = makeDetail('detail-a', BRANCH_MAIN);
            const rowB = makeDetail('detail-b', BRANCH_MAIN, 'Hop 1 output.');
            const rowBReloaded = rowB;
            const rowC = makeDetail('detail-c', BRANCH_MAIN);
            rowC.Save.mockResolvedValue(false);
            Object.assign(rowC, { LatestResult: { CompleteMessage: 'FK constraint failure' } });

            const provider = makeProvider([rowA, rowB, rowBReloaded, rowC]);
            const runner = new AgentRunner(provider);

            const hop1HandoffStep = makeHandoffStep(
                { targetAgentId: secondTargetAgent.ID },
                '00000000-0000-4000-8000-000000000902'
            );

            mockResolveHandoffTarget
                .mockResolvedValueOnce({ Target: targetAgent, Candidates: [] })
                .mockResolvedValueOnce({ Target: secondTargetAgent, Candidates: [] });

            vi.spyOn(runner, 'RunAgentInConversation').mockResolvedValueOnce({
                agentResult: {
                    success: true,
                    agentRun: {
                        ID: 'run-hop-1',
                        Message: 'Hop 1 output.',
                        Steps: [hop1HandoffStep as unknown as MJAIAgentRunStepEntityExtended],
                    } as unknown as MJAIAgentRunEntityExtended,
                    handoff: {
                        targetAgentId: secondTargetAgent.ID,
                        targetAgentName: secondTargetAgent.Name!,
                        sourceAgentId: targetAgent.ID,
                        brief: 'Hand off from B to C',
                        runStepId: hop1HandoffStep.ID,
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                agentResponseDetailId: 'detail-b',
            });

            const outcomes = await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: [{ role: 'user', content: 'Start chain' }],
                    contextUser: USER,
                    handoffChain: [],
                    provider,
                },
                sourceResult: {
                    success: true,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: targetAgent.Name!,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Hand off from A to B',
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: 'detail-a',
            });

            expect(outcomes).toHaveLength(1);
            expect(outcomes[0].targetConversationDetailId).toBe('detail-b');
            expect(hop1HandoffStep.Status).toBe('Failed');
            expect(hop1HandoffStep.ErrorMessage).toContain('FK constraint failure');
            expect(rowB.Message).toContain("I couldn't transfer you to Producer:");
            expect(outcomes[0].agentResult?.agentRun?.Message).toContain("I couldn't transfer you to Producer:");
        });

        it('does not overwrite a completed target row or double-call OnHopEnd when OnHopEnd throws', async () => {
            const sourceRow = makeDetail('detail-source', null);
            const targetRow = makeDetail('detail-target', null);
            const provider = makeProvider([sourceRow, targetRow]);
            const runner = new AgentRunner(provider);

            vi.spyOn(runner, 'RunAgentInConversation').mockImplementation(async () => {
                targetRow.Status = 'Complete';
                targetRow.Message = 'Completed storyboard output';
                return {
                    agentResult: {
                        success: true,
                        agentRun: { ID: 'run-target-ok' } as unknown as MJAIAgentRunEntityExtended,
                    } as ExecuteAgentResult,
                    conversationId: CONV_ID,
                    agentResponseDetailId: targetRow.ID,
                };
            });

            const onHopEnd = vi.fn().mockRejectedValue(new Error('Notification service down'));

            const outcomes = await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: [],
                    contextUser: USER,
                    handoffChain: [],
                    provider,
                },
                sourceResult: {
                    success: true,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: targetAgent.Name!,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Brief',
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: sourceRow.ID,
                hooks: { OnHopEnd: onHopEnd },
            });

            expect(onHopEnd).toHaveBeenCalledTimes(1);
            expect(outcomes).toHaveLength(1);
            expect(outcomes[0].error).toBeUndefined();
            expect(targetRow.Status).toBe('Complete');
            expect(targetRow.Message).toBe('Completed storyboard output');
        });

        it('does not leak in-place conversationMessages mutations from hop 1 into hop 2 or input.params', async () => {
            const rowA = makeDetail('detail-a', BRANCH_MAIN);
            const rowB = makeDetail('detail-b', BRANCH_MAIN);
            const rowBReloaded = makeDetail('detail-b', BRANCH_MAIN);
            const rowC = makeDetail('detail-c', BRANCH_MAIN);
            const provider = makeProvider([rowA, rowB, rowBReloaded, rowC]);
            const runner = new AgentRunner(provider);

            mockResolveHandoffTarget
                .mockResolvedValueOnce({ Target: targetAgent, Candidates: [] })
                .mockResolvedValueOnce({ Target: secondTargetAgent, Candidates: [] });

            const hop2MessagesSnapshot: Array<{ role: string; content: unknown }> = [];
            vi.spyOn(runner, 'RunAgentInConversation')
                .mockImplementationOnce(async (hop1Params) => {
                    // Simulate BaseAgent pushing a retry turn onto hop 1's conversationMessages in place.
                    hop1Params.conversationMessages.push({
                        role: 'user',
                        content: 'Retrying due to: malformed JSON',
                    });
                    return {
                        agentResult: {
                            success: true,
                            handoff: {
                                targetAgentId: secondTargetAgent.ID,
                                targetAgentName: secondTargetAgent.Name!,
                                sourceAgentId: targetAgent.ID,
                                brief: 'Brief for C',
                            },
                        } as ExecuteAgentResult,
                        conversationId: CONV_ID,
                        agentResponseDetailId: 'detail-b',
                    };
                })
                .mockImplementationOnce(async (hop2Params) => {
                    hop2MessagesSnapshot.push(...hop2Params.conversationMessages);
                    return {
                        agentResult: { success: true } as ExecuteAgentResult,
                        conversationId: CONV_ID,
                        agentResponseDetailId: 'detail-c',
                    };
                });

            const callerMessages = [{ role: 'user' as const, content: 'Original user turn' }];
            await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: callerMessages,
                    contextUser: USER,
                    handoffChain: [],
                    provider,
                },
                sourceResult: {
                    success: true,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: targetAgent.Name!,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Brief for B',
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: 'detail-a',
            });

            expect(callerMessages).toEqual([{ role: 'user', content: 'Original user turn' }]);
            expect(hop2MessagesSnapshot).toEqual([
                {
                    role: 'system',
                    content: HandoffBriefMessage('Storyboard Artist', 'Brief for C'),
                },
                { role: 'user', content: 'Original user turn' },
            ]);
        });

        it('trims trailing periods in refused handoff reason in linear time (< 200 ms) on 50,000 dots followed by x', async () => {
            const sourceRow = makeDetail('detail-source', BRANCH_1);
            const provider = makeProvider([sourceRow]);
            const runner = new AgentRunner(provider);

            const attackTargetName = '.'.repeat(50_000) + 'x...';
            mockResolveHandoffTarget.mockResolvedValueOnce({
                Refusal: {
                    Reason: 'NoRunPermission',
                    Message: 'Refused',
                },
                Candidates: [],
            });

            const handoffStep = makeHandoffStep({ targetAgentId: targetAgent.ID, brief: 'Build storyboard' });
            const sourceRun = {
                ID: 'run-source-1',
                Message: 'Initial reply',
                Steps: [handoffStep as unknown as MJAIAgentRunStepEntityExtended],
            } as unknown as MJAIAgentRunEntityExtended;

            const start = performance.now();
            await runner.FollowHandoffs({
                params: {
                    agent: sourceAgent,
                    conversationMessages: [{ role: 'user', content: 'Hi' }],
                    contextUser: USER,
                },
                sourceResult: {
                    success: true,
                    agentRun: sourceRun,
                    handoff: {
                        targetAgentId: targetAgent.ID,
                        targetAgentName: attackTargetName,
                        sourceAgentId: sourceAgent.ID,
                        brief: 'Build storyboard',
                        runStepId: handoffStep.ID,
                    },
                } as ExecuteAgentResult,
                conversationId: CONV_ID,
                sourceConversationDetailId: sourceRow.ID,
            });
            const elapsedMs = performance.now() - start;

            expect(elapsedMs).toBeLessThan(200);
            expect(sourceRow.Message).toContain(
                `The current user does not have permission to run ${'.'.repeat(50_000)}x.`
            );
        });
    });

    describe('BaseAgent.runWithholdsHandoff guest/widget guard', () => {
        const callWithholdsHandoff = (params: Partial<ExecuteAgentParams>): boolean => {
            const base = Object.create(BaseAgent.prototype) as {
                runWithholdsHandoff(p: ExecuteAgentParams): boolean;
            };
            return base.runWithholdsHandoff({
                agent: sourceAgent,
                conversationMessages: [],
                conversationDetailId: 'detail-1',
                ...params,
            } as ExecuteAgentParams);
        };

        it('withholds Handoff when handoffChain is absent', () => {
            expect(callWithholdsHandoff({ contextUser: USER })).toBe(true);
        });

        it('withholds Handoff for anonymous or widget guest users without an explicit allow-list even if handoffChain is present', () => {
            const magicLinkGuest = { ...USER, IsMagicLinkAnonymous: true } as unknown as UserInfo;
            const widgetGuest = { ...USER, WidgetGuestContext: { widgetId: 'w-1' } } as unknown as UserInfo;

            expect(callWithholdsHandoff({ contextUser: magicLinkGuest, handoffChain: [] })).toBe(true);
            expect(callWithholdsHandoff({ contextUser: widgetGuest, handoffChain: [] })).toBe(true);
        });

        it('withholds Handoff when ALL_AVAILABLE_AGENTS is supplied without TrustReservedRunData: true, and allows it when trusted', () => {
            const widgetGuest = { ...USER, WidgetGuestContext: { widgetId: 'w-1' } } as unknown as UserInfo;
            expect(
                callWithholdsHandoff({
                    contextUser: widgetGuest,
                    handoffChain: [],
                    data: { ALL_AVAILABLE_AGENTS: [{ ID: targetAgent.ID }] },
                })
            ).toBe(true);
            expect(
                callWithholdsHandoff({
                    contextUser: widgetGuest,
                    handoffChain: [],
                    data: { ALL_AVAILABLE_AGENTS: [{ ID: targetAgent.ID }] },
                    TrustReservedRunData: true,
                })
            ).toBe(false);
            expect(callWithholdsHandoff({ contextUser: USER, handoffChain: [] })).toBe(false);
        });
    });

    describe('MJAIAgentRequestEntityServer.resumeAgent handoff follow-through', () => {
        it('passes handoffChain: [] on resumed runs and invokes FollowHandoffs with clean initial messages even if RunAgentInConversation mutates its copy', async () => {
            const originatingRun = {
                ID: 'run-orig-1',
                AgentID: sourceAgent.ID,
                ConversationID: CONV_ID,
                ConversationDetailID: 'detail-orig-1',
                Load: vi.fn(async () => true),
            };
            const loadedAgent = {
                ...sourceAgent,
                Load: vi.fn(async () => true),
            };
            const originatingDetail = {
                ID: 'detail-orig-1',
                BranchID: BRANCH_1,
                Load: vi.fn(async () => true),
            };

            const md: IMetadataProvider = {
                GetEntityObject: vi.fn(async (entityName: string) => {
                    if (entityName === 'MJ: AI Agent Runs') return originatingRun;
                    if (entityName === 'MJ: AI Agents') return loadedAgent;
                    if (entityName === 'MJ: Conversation Details') return originatingDetail;
                    return { Load: vi.fn(async () => false) };
                }),
            } as unknown as IMetadataProvider;

            const handoffPayload = {
                targetAgentId: targetAgent.ID,
                targetAgentName: targetAgent.Name!,
                sourceAgentId: sourceAgent.ID,
                brief: 'Proceed after approval',
            };
            const runInConvSpy = vi.spyOn(AgentRunner.prototype, 'RunAgentInConversation').mockImplementation(
                async (resumedParams) => {
                    resumedParams.conversationMessages.push({
                        role: 'user',
                        content: 'Retrying due to: malformed JSON',
                    });
                    return {
                        agentResult: {
                            success: true,
                            agentRun: { ID: 'run-resumed-1' } as unknown as MJAIAgentRunEntityExtended,
                            handoff: handoffPayload,
                        },
                        conversationId: CONV_ID,
                        agentResponseDetailId: 'detail-resumed-1',
                    };
                }
            );
            const followHandoffsSpy = vi.spyOn(AgentRunner.prototype, 'FollowHandoffs').mockResolvedValue([]);

            const fakeRequest = Object.create(MJAIAgentRequestEntityServer.prototype) as MJAIAgentRequestEntityServer & {
                resumeAgent(): Promise<void>;
            };
            Object.defineProperties(fakeRequest, {
                ID: { value: 'req-1', configurable: true },
                ContextCurrentUser: { value: USER, configurable: true },
                ProviderToUse: { value: md, configurable: true },
                OriginatingAgentRunID: { value: 'run-orig-1', configurable: true },
                OriginatingAgentRunStepID: { value: null, configurable: true },
                ResponseData: { value: null, configurable: true },
                Response: { value: 'Looks good, go ahead.', configurable: true },
                Status: { value: 'Approved', configurable: true },
                ResumingAgentRunID: { value: null, writable: true, configurable: true },
            });
            vi.spyOn(
                Object.getPrototypeOf(MJAIAgentRequestEntityServer.prototype),
                'Save'
            ).mockResolvedValue(true);

            await fakeRequest.resumeAgent();

            expect(runInConvSpy).toHaveBeenCalledTimes(1);
            const [resumedParams] = runInConvSpy.mock.calls[0];
            expect(resumedParams.handoffChain).toEqual([]);
            expect(resumedParams.ConversationBranchID).toBe(BRANCH_1);

            expect(followHandoffsSpy).toHaveBeenCalledTimes(1);
            const followCall = followHandoffsSpy.mock.calls[0][0];
            expect(followCall.conversationId).toBe(CONV_ID);
            expect(followCall.sourceConversationDetailId).toBe('detail-resumed-1');
            expect(followCall.createArtifacts).toBe(true);
            expect(followCall.params.conversationMessages).toEqual([
                { role: 'user', content: 'Approved.\n\nLooks good, go ahead.' },
            ]);
        });
    });
});
