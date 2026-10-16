/**
 * Unit tests for VS-CON-7: Sub-Agent Configuration Presets (Relationship Default + Per-Call Override).
 *
 * Covers:
 * 1. Precedence: per-call `presetName` (matching `Name`, then `DisplayName`, trimmed and case-insensitive)
 *    wins over relationship `ConfigurationPresetID`; relationship wins over inherit; neither -> parent's
 *    `configurationId`.
 * 2. Preset with NULL `AIConfigurationID` yields `configurationId: undefined` on the child even when
 *    the parent has a `configurationId`.
 * 3. Relationship preset that is inactive, missing, or owned by another agent logs a warning and falls
 *    through to inherit the parent's `configurationId`.
 * 4. Unknown `presetName`: `validateSubAgentNextStep` returns Retry naming the available presets (or "none").
 * 5. Child run records the resolved `ConfigurationID` through `initializeAgentRun`, `ExecuteSubAgent` passes
 *    it to `AgentRunner.RunAgent`, and the `Sub-Agent` step `InputData` records `presetName` and `presetId`.
 * 6. Catalog: `buildAgentBaseCatalog` / `formatSubAgentDetails` formats active presets on each sub-agent, and
 *    `gatherPromptTemplateData` sets `subAgentPresetsAvailable` only when at least one sub-agent has presets.
 * 7. Parsing: explicit single `subAgent`, explicit parallel `subAgents[]`, native `delegate_to_*` call, and
 *    the single-node task-graph fold path carry `presetName`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import '../agent-types/loop-agent-type';
import type { LoopAgentResponse } from '../agent-types/loop-agent-response-type';
import type {
    AIPromptParams,
    AgentContextData,
    AgentSubAgentRequest,
     BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentConfigurationEntity, MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { RecordToolCallingDecision } from '@memberjunction/ai-prompts';
import type { ChatResult } from '@memberjunction/ai';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { NativeToolBinding } from '../native-tools/control-tools';
import type { AIEngine } from '@memberjunction/aiengine';

// ============================================================================
// Module mocks
// ============================================================================

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

const engineState = {
    Agents: [] as MJAIAgentEntityExtended[],
    AgentRelationships: [] as MJAIAgentRelationshipEntity[],
    AgentConfigurations: [] as MJAIAgentConfigurationEntity[],
    AgentActions: [] as unknown[],
    Actions: [] as unknown[],
    Prompts: [] as unknown[],
    AgentPrompts: [] as unknown[],
    AgentTypes: [] as unknown[],
    GetSubAgents: vi.fn((agentId: string) => {
        const children = engineState.Agents.filter((a) => a.ParentID === agentId && a.Status === 'Active');
        const relatedIds = new Set(
            engineState.AgentRelationships
                .filter((r) => r.AgentID === agentId && r.Status === 'Active')
                .map((r) => r.SubAgentID)
        );
        const related = engineState.Agents.filter((a) => relatedIds.has(a.ID) && a.Status === 'Active');
        return [...children, ...related];
    }),
    GetAgentConfigurationPresets: vi.fn((agentId: string, activeOnly = true) =>
        engineState.AgentConfigurations.filter(
            (c) => c.AgentID === agentId && (!activeOnly || c.Status === 'Active')
        )
    ),
    FindActiveAgentConfigurationPreset: vi.fn((agentId: string, presetName: string) => {
        const target = presetName.trim().toLowerCase();
        if (!target) return undefined;
        const presets = engineState.GetAgentConfigurationPresets(agentId, true);
        return presets.find((p) => p.Name?.trim().toLowerCase() === target)
            ?? presets.find((p) => p.DisplayName?.trim().toLowerCase() === target);
    }),
    GetAgentBaseCatalog: vi.fn(() => undefined),
    SetAgentBaseCatalog: vi.fn(),
    GetAutoActivatableSkillsForAgent: vi.fn(() => []),
    GetClientToolsForAgent: vi.fn(() => []),
};

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return engineState;
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return { Actions: [] };
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: async (): Promise<boolean> => true,
    },
}));

const mockRunAgent = vi.fn();

vi.mock('../AgentRunner', () => ({
    AgentRunner: class {
        RunAgent = mockRunAgent;
    },
}));

// ============================================================================
// Fixed UUIDs & fixtures
// ============================================================================

const PARENT_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const SUB_AGENT_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const CHILD_SUB_AGENT_ID = 'cccccccc-0000-4000-8000-000000000001';
const OTHER_AGENT_ID = 'dddddddd-0000-4000-8000-000000000001';
const REL_ID = 'eeeeeeee-0000-4000-8000-000000000001';

const PRESET_DRAFT_ID = '11111111-0000-4000-8000-000000000001';
const PRESET_STD_ID = '11111111-0000-4000-8000-000000000002';
const PRESET_HIGH_ID = '11111111-0000-4000-8000-000000000003';
const PRESET_DEFAULT_NULL_CFG_ID = '11111111-0000-4000-8000-000000000004';
const PRESET_INACTIVE_ID = '11111111-0000-4000-8000-000000000005';
const PRESET_OTHER_AGENT_ID = '11111111-0000-4000-8000-000000000006';

const AI_CONFIG_PARENT = '99999999-0000-4000-8000-000000000000';
const AI_CONFIG_DRAFT = '99999999-0000-4000-8000-000000000001';
const AI_CONFIG_STD = '99999999-0000-4000-8000-000000000002';
const AI_CONFIG_HIGH = '99999999-0000-4000-8000-000000000003';

function makePreset(overrides: Partial<MJAIAgentConfigurationEntity> & { ID: string; AgentID: string; Name: string }): MJAIAgentConfigurationEntity {
    return {
        DisplayName: overrides.Name,
        Description: null,
        AIConfigurationID: null,
        IsDefault: false,
        Priority: 100,
        Status: 'Active',
        ...overrides,
    } as unknown as MJAIAgentConfigurationEntity;
}

function makeSubAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return {
        ID: SUB_AGENT_ID,
        Name: 'Storyboard Artist',
        Description: 'Draws storyboards.',
        ParentID: null,
        Status: 'Active',
        ExecutionMode: 'Sequential',
        ExecutionOrder: 1,
        ...overrides,
    } as unknown as MJAIAgentEntityExtended;
}

function makeRelationship(overrides: Partial<MJAIAgentRelationshipEntity> = {}): MJAIAgentRelationshipEntity {
    return {
        ID: REL_ID,
        AgentID: PARENT_AGENT_ID,
        SubAgentID: SUB_AGENT_ID,
        SubAgent: 'Storyboard Artist',
        Status: 'Active',
        ConfigurationPresetID: null,
        SubAgentOutputMapping: null,
        SubAgentInputMapping: null,
        SubAgentContextPaths: null,
        ChatHandlingOption: null,
        MaxSubAgentConsultRounds: null,
        ...overrides,
    } as unknown as MJAIAgentRelationshipEntity;
}

class TestablePresetAgent extends BaseAgent {
    public statusLogs: string[] = [];

    protected override logStatus(message: string, verboseOnly?: boolean, params?: ExecuteAgentParams): void {
        this.statusLogs.push(message);
        super.logStatus(message, verboseOnly, params);
    }

    public async invokeExecuteSubAgent(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended
    ): Promise<ExecuteAgentResult> {
        return this.ExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity);
    }

    public async invokeValidateSubAgentNextStep(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        return (
            this as unknown as {
                validateSubAgentNextStep: (
                    p: ExecuteAgentParams,
                    n: BaseAgentNextStep
                ) => Promise<BaseAgentNextStep>;
            }
        ).validateSubAgentNextStep(params, nextStep);
    }

    public invokeBuildAgentBaseCatalog(agent: MJAIAgentEntityExtended) {
        return (
            this as unknown as {
                buildAgentBaseCatalog: (a: MJAIAgentEntityExtended, e: AIEngine) => {
                    subAgentCount: number;
                    subAgentDetails: string;
                    actionCount: number;
                    actionDetails: string;
                };
            }
        ).buildAgentBaseCatalog(agent, engineState as unknown as AIEngine);
    }

    public async invokeGatherPromptTemplateData(
        params: ExecuteAgentParams,
        contextData?: AgentContextData
    ): Promise<AgentContextData> {
        return (
            this as unknown as {
                gatherPromptTemplateData: (
                    p: ExecuteAgentParams,
                    u?: UserInfo,
                    c?: AgentContextData
                ) => Promise<AgentContextData>;
            }
        ).gatherPromptTemplateData(params, params.contextUser, contextData);
    }

    public invokeApplyNativeTools(
        promptParams: AIPromptParams,
        params: ExecuteAgentParams
    ): Map<string, NativeToolBinding> | undefined {
        (this as unknown as { _agentTypeInstance: { SupportsNativeToolCalls: boolean } })._agentTypeInstance = {
            SupportsNativeToolCalls: true,
        };
        (
            this as unknown as {
                applyNativeTools: (pp: AIPromptParams, p: ExecuteAgentParams) => void;
            }
        ).applyNativeTools(promptParams, params);
        return (this as unknown as { _nativeToolBindings?: Map<string, NativeToolBinding> })._nativeToolBindings;
    }

    public async invokeInitializeAgentRun(params: ExecuteAgentParams): Promise<MJAIAgentRunEntityExtended> {
        (this as unknown as { _activeProvider: IMetadataProvider | undefined })._activeProvider = params.provider;
        await (
            this as unknown as {
                initializeAgentRun: (p: ExecuteAgentParams) => Promise<void>;
            }
        ).initializeAgentRun(params);
        return (this as unknown as { _agentRun: MJAIAgentRunEntityExtended })._agentRun;
    }
}

// ============================================================================
// Tests
// ============================================================================

describe('VS-CON-7: Sub-Agent Configuration Presets', () => {
    let parentAgent: MJAIAgentEntityExtended;
    let relatedSubAgent: MJAIAgentEntityExtended;
    let childSubAgent: MJAIAgentEntityExtended;

    beforeEach(() => {
        vi.clearAllMocks();
        parentAgent = {
            ID: PARENT_AGENT_ID,
            Name: 'Director',
            Status: 'Active',
            ParentID: null,
        } as unknown as MJAIAgentEntityExtended;
        relatedSubAgent = makeSubAgent({ ID: SUB_AGENT_ID, Name: 'Storyboard Artist', ParentID: null });
        childSubAgent = makeSubAgent({
            ID: CHILD_SUB_AGENT_ID,
            Name: 'Scene Writer',
            ParentID: PARENT_AGENT_ID,
        });

        engineState.Agents = [parentAgent, relatedSubAgent, childSubAgent];
        engineState.AgentRelationships = [makeRelationship()];
        engineState.AgentConfigurations = [
            makePreset({
                ID: PRESET_DRAFT_ID,
                AgentID: SUB_AGENT_ID,
                Name: 'Draft',
                DisplayName: 'Draft Mode (Fast)',
                Description: 'Fast/Lower Quality',
                AIConfigurationID: AI_CONFIG_DRAFT,
                IsDefault: false,
                Priority: 10,
            }),
            makePreset({
                ID: PRESET_STD_ID,
                AgentID: SUB_AGENT_ID,
                Name: 'Standard',
                DisplayName: 'Standard Quality',
                Description: 'Balanced Quality/Speed',
                AIConfigurationID: AI_CONFIG_STD,
                IsDefault: true,
                Priority: 20,
            }),
            makePreset({
                ID: PRESET_HIGH_ID,
                AgentID: SUB_AGENT_ID,
                Name: 'High',
                DisplayName: 'High Fidelity',
                Description: 'Highest Quality/Slower',
                AIConfigurationID: AI_CONFIG_HIGH,
                IsDefault: false,
                Priority: 30,
            }),
        ];

        mockRunAgent.mockResolvedValue({
            success: true,
            agentRun: { ID: 'child-run-1', Status: 'Completed' },
            payload: {},
        });
    });

    // ------------------------------------------------------------------------
    // 1. Precedence: per-call > relationship > inherit
    // ------------------------------------------------------------------------
    describe('1. Resolution precedence (per-call > relationship > inherit)', () => {
        it('uses per-call presetName over relationship ConfigurationPresetID and parent configurationId', async () => {
            engineState.AgentRelationships = [
                makeRelationship({ ConfigurationPresetID: PRESET_STD_ID }),
            ];
            const caller = new TestablePresetAgent();
            const stepEntity = { ID: 'step-1', TargetLogID: null, InputData: '{}' } as unknown as MJAIAgentRunStepEntityExtended;

            await caller.invokeExecuteSubAgent(
                {
                    agent: parentAgent,
                    conversationMessages: [],
                    configurationId: AI_CONFIG_PARENT,
                },
                {
                    name: 'Storyboard Artist',
                    message: 'Sketch scene 1',
                    terminateAfter: false,
                    presetName: 'High',
                },
                relatedSubAgent,
                stepEntity
            );

            expect(mockRunAgent).toHaveBeenCalledTimes(1);
            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.configurationId).toBe(AI_CONFIG_HIGH);
            expect(JSON.parse(stepEntity.InputData!)).toMatchObject({
                presetName: 'High',
                presetId: PRESET_HIGH_ID,
            });
        });

        it('matches per-call presetName against Name first, then DisplayName, trimmed and case-insensitively', async () => {
            const caller = new TestablePresetAgent();
            const stepEntity = { ID: 'step-1', TargetLogID: null, InputData: '{}' } as unknown as MJAIAgentRunStepEntityExtended;

            await caller.invokeExecuteSubAgent(
                { agent: parentAgent, conversationMessages: [], configurationId: AI_CONFIG_PARENT },
                {
                    name: 'Storyboard Artist',
                    message: 'Sketch quickly',
                    terminateAfter: false,
                    presetName: '  draft mode (fast)  ',
                },
                relatedSubAgent,
                stepEntity
            );

            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.configurationId).toBe(AI_CONFIG_DRAFT);
            expect(JSON.parse(stepEntity.InputData!)).toMatchObject({
                presetName: 'Draft',
                presetId: PRESET_DRAFT_ID,
            });
        });

        it('uses relationship ConfigurationPresetID when per-call presetName is omitted', async () => {
            engineState.AgentRelationships = [
                makeRelationship({ ConfigurationPresetID: PRESET_STD_ID }),
            ];
            const caller = new TestablePresetAgent();
            const stepEntity = { ID: 'step-2', TargetLogID: null, InputData: '{}' } as unknown as MJAIAgentRunStepEntityExtended;

            await caller.invokeExecuteSubAgent(
                {
                    agent: parentAgent,
                    conversationMessages: [],
                    configurationId: AI_CONFIG_PARENT,
                },
                {
                    name: 'Storyboard Artist',
                    message: 'Sketch scene 2',
                    terminateAfter: false,
                },
                relatedSubAgent,
                stepEntity
            );

            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.configurationId).toBe(AI_CONFIG_STD);
            expect(JSON.parse(stepEntity.InputData!)).toMatchObject({
                presetName: 'Standard',
                presetId: PRESET_STD_ID,
            });
        });

        it('inherits parent configurationId when neither per-call presetName nor relationship ConfigurationPresetID is set', async () => {
            const caller = new TestablePresetAgent();
            const stepEntity = { ID: 'step-3', TargetLogID: null, InputData: '{}' } as unknown as MJAIAgentRunStepEntityExtended;

            await caller.invokeExecuteSubAgent(
                {
                    agent: parentAgent,
                    conversationMessages: [],
                    configurationId: AI_CONFIG_PARENT,
                },
                {
                    name: 'Storyboard Artist',
                    message: 'Sketch scene 3',
                    terminateAfter: false,
                },
                relatedSubAgent,
                stepEntity
            );

            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.configurationId).toBe(AI_CONFIG_PARENT);
            expect(JSON.parse(stepEntity.InputData!)).toEqual({});
        });
    });

    // ------------------------------------------------------------------------
    // 2. Preset with NULL AIConfigurationID -> undefined (not parent's configurationId)
    // ------------------------------------------------------------------------
    describe('2. Preset with NULL AIConfigurationID', () => {
        it('gives the child configurationId: undefined even when the parent has a configurationId', async () => {
            engineState.AgentConfigurations.push(
                makePreset({
                    ID: PRESET_DEFAULT_NULL_CFG_ID,
                    AgentID: SUB_AGENT_ID,
                    Name: 'SystemDefault',
                    AIConfigurationID: null,
                })
            );
            const caller = new TestablePresetAgent();
            const stepEntity = { ID: 'step-null-cfg', TargetLogID: null, InputData: '{}' } as unknown as MJAIAgentRunStepEntityExtended;

            await caller.invokeExecuteSubAgent(
                {
                    agent: parentAgent,
                    conversationMessages: [],
                    configurationId: AI_CONFIG_PARENT,
                },
                {
                    name: 'Storyboard Artist',
                    message: 'Use system default rows',
                    terminateAfter: false,
                    presetName: 'SystemDefault',
                },
                relatedSubAgent,
                stepEntity
            );

            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.configurationId).toBeUndefined();
            expect(JSON.parse(stepEntity.InputData!)).toMatchObject({
                presetName: 'SystemDefault',
                presetId: PRESET_DEFAULT_NULL_CFG_ID,
            });
        });
    });

    // ------------------------------------------------------------------------
    // 3. Inactive or wrong-agent relationship preset -> warning + inherit
    // ------------------------------------------------------------------------
    describe('3. Relationship preset inactive or owned by another agent', () => {
        it('logs a warning and inherits parent configurationId when the relationship preset is Inactive', async () => {
            engineState.AgentConfigurations.push(
                makePreset({
                    ID: PRESET_INACTIVE_ID,
                    AgentID: SUB_AGENT_ID,
                    Name: 'Retired',
                    AIConfigurationID: AI_CONFIG_DRAFT,
                    Status: 'Inactive',
                })
            );
            engineState.AgentRelationships = [
                makeRelationship({ ConfigurationPresetID: PRESET_INACTIVE_ID }),
            ];

            const caller = new TestablePresetAgent();
            const stepEntity = { ID: 'step-inactive', TargetLogID: null } as unknown as MJAIAgentRunStepEntityExtended;

            await caller.invokeExecuteSubAgent(
                {
                    agent: parentAgent,
                    conversationMessages: [],
                    configurationId: AI_CONFIG_PARENT,
                },
                { name: 'Storyboard Artist', message: 'Go', terminateAfter: false },
                relatedSubAgent,
                stepEntity
            );

            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.configurationId).toBe(AI_CONFIG_PARENT);
            expect(caller.statusLogs.some((m) => m.includes(PRESET_INACTIVE_ID) && m.includes('inheriting parent configuration'))).toBe(true);
        });

        it('logs a warning and inherits parent configurationId when the relationship preset belongs to another agent', async () => {
            engineState.AgentConfigurations.push(
                makePreset({
                    ID: PRESET_OTHER_AGENT_ID,
                    AgentID: OTHER_AGENT_ID,
                    Name: 'OtherAgentPreset',
                    AIConfigurationID: AI_CONFIG_DRAFT,
                    Status: 'Active',
                })
            );
            engineState.AgentRelationships = [
                makeRelationship({ ConfigurationPresetID: PRESET_OTHER_AGENT_ID }),
            ];

            const caller = new TestablePresetAgent();
            const stepEntity = { ID: 'step-wrong-owner', TargetLogID: null } as unknown as MJAIAgentRunStepEntityExtended;

            await caller.invokeExecuteSubAgent(
                {
                    agent: parentAgent,
                    conversationMessages: [],
                    configurationId: AI_CONFIG_PARENT,
                },
                { name: 'Storyboard Artist', message: 'Go', terminateAfter: false },
                relatedSubAgent,
                stepEntity
            );

            const passedParams: ExecuteAgentParams = mockRunAgent.mock.calls[0][0];
            expect(passedParams.configurationId).toBe(AI_CONFIG_PARENT);
            expect(caller.statusLogs.some((m) => m.includes(PRESET_OTHER_AGENT_ID) && m.includes('inheriting parent configuration'))).toBe(true);
        });
    });

    // ------------------------------------------------------------------------
    // 4. Unknown presetName in validateSubAgentNextStep -> Retry naming available presets
    // ------------------------------------------------------------------------
    describe('4. validateSubAgentNextStep on unknown presetName', () => {
        it('returns Retry listing the sub-agent available presets when presetName is unknown', async () => {
            const caller = new TestablePresetAgent();
            const params: ExecuteAgentParams = {
                agent: parentAgent,
                conversationMessages: [],
            };
            const decision: BaseAgentNextStep = {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: {
                    name: 'Storyboard Artist',
                    message: 'Draw frame',
                    terminateAfter: false,
                    presetName: 'UltraMax',
                },
            };

            const validated = await caller.invokeValidateSubAgentNextStep(params, decision);
            expect(validated.step).toBe('Retry');
            expect(validated.errorMessage).toBe(
                "Sub-agent 'Storyboard Artist' has no preset 'UltraMax'. Available: Draft, Standard, High."
            );
        });

        it('returns Retry with "Available: none." when the sub-agent has no active presets', async () => {
            const caller = new TestablePresetAgent();
            const params: ExecuteAgentParams = {
                agent: parentAgent,
                conversationMessages: [],
            };
            const decision: BaseAgentNextStep = {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: {
                    name: 'Scene Writer',
                    message: 'Write dialogue',
                    terminateAfter: false,
                    presetName: 'Draft',
                },
            };

            const validated = await caller.invokeValidateSubAgentNextStep(params, decision);
            expect(validated.step).toBe('Retry');
            expect(validated.errorMessage).toBe(
                "Sub-agent 'Scene Writer' has no preset 'Draft'. Available: none."
            );
        });

        it('validates presetName on parallel subAgents[] entries as well', async () => {
            const caller = new TestablePresetAgent();
            const params: ExecuteAgentParams = {
                agent: parentAgent,
                conversationMessages: [],
            };
            const decision: BaseAgentNextStep = {
                step: 'Sub-Agents',
                terminate: false,
                subAgents: [
                    { name: 'Storyboard Artist', message: 'A', terminateAfter: false, presetName: 'Draft' },
                    { name: 'Storyboard Artist', message: 'B', terminateAfter: false, presetName: 'Bogus' },
                ],
            };

            const validated = await caller.invokeValidateSubAgentNextStep(params, decision);
            expect(validated.step).toBe('Retry');
            expect(validated.errorMessage).toBe(
                "Sub-agent 'Storyboard Artist' has no preset 'Bogus'. Available: Draft, Standard, High."
            );
        });
    });

    // ------------------------------------------------------------------------
    // 5. Child run records ConfigurationID via initializeAgentRun
    // ------------------------------------------------------------------------
    describe('5. Child run records ConfigurationID through initializeAgentRun', () => {
        it('records the resolved configurationId on the child AgentRun entity', async () => {
            const caller = new TestablePresetAgent();
            const savedRun: Record<string, unknown> = {
                NewRecord: vi.fn(),
                Save: vi.fn().mockResolvedValue(true),
                Steps: [],
            };
            const provider = {
                GetEntityObject: vi.fn().mockResolvedValue(savedRun),
            } as unknown as IMetadataProvider;

            const run = await caller.invokeInitializeAgentRun({
                agent: relatedSubAgent,
                conversationMessages: [],
                configurationId: AI_CONFIG_HIGH,
                provider,
                contextUser: { ID: 'u-1' } as unknown as UserInfo,
            });

            expect(run.ConfigurationID).toBe(AI_CONFIG_HIGH);
        });
    });

    // ------------------------------------------------------------------------
    // 6. Catalog & gatherPromptTemplateData
    // ------------------------------------------------------------------------
    describe('6. Catalog formatting and subAgentPresetsAvailable gating', () => {
        it('lists active presets with default and description in buildAgentBaseCatalog', () => {
            const caller = new TestablePresetAgent();
            const catalog = caller.invokeBuildAgentBaseCatalog(parentAgent);

            expect(catalog.subAgentCount).toBe(2);
            expect(catalog.subAgentDetails).toContain(
                '  Presets: Draft (Fast/Lower Quality), Standard (default: Balanced Quality/Speed), High (Highest Quality/Slower)'
            );
            // Scene Writer has no presets, so it should not have a Presets line
            const writerBlock = catalog.subAgentDetails.split('\n').filter((l) => l.includes('Scene Writer'));
            expect(writerBlock).toHaveLength(1);
        });

        it('sets subAgentPresetsAvailable to true when any sub-agent has an active preset, and omits it otherwise', async () => {
            const caller = new TestablePresetAgent();
            const withPresets = await caller.invokeGatherPromptTemplateData({
                agent: parentAgent,
                conversationMessages: [],
            });
            expect(withPresets.subAgentPresetsAvailable).toBe(true);

            engineState.AgentConfigurations = [];
            const withoutPresets = await caller.invokeGatherPromptTemplateData({
                agent: parentAgent,
                conversationMessages: [],
            });
            expect(withoutPresets.subAgentPresetsAvailable).toBeUndefined();
        });

        it('adds presetName enum to BuildSubAgentTool via applyNativeTools only for sub-agents with presets', () => {
            const caller = new TestablePresetAgent();
            const promptParams = {
                contextUser: { ID: 'u-1' },
            } as unknown as AIPromptParams;
            RecordToolCallingDecision(promptParams, 'native');

            const map = caller.invokeApplyNativeTools(promptParams, {
                agent: parentAgent,
                conversationMessages: [],
            });
            expect(map).toBeDefined();

            const tools = promptParams.tools ?? [];
            const storyboardTool = tools.find((t) => t.name === 'delegate_to_storyboard_artist')!;
            const writerTool = tools.find((t) => t.name === 'delegate_to_scene_writer')!;

            const sbProps = storyboardTool.inputSchema.properties as Record<string, { type: string; enum?: string[] }>;
            expect(sbProps.presetName).toEqual({
                type: 'string',
                enum: ['Draft', 'Standard', 'High'],
                description: expect.stringContaining('Configuration preset for this sub-agent'),
            });

            const writerProps = writerTool.inputSchema.properties as Record<string, unknown>;
            expect(writerProps.presetName).toBeUndefined();
        });
    });

    // ------------------------------------------------------------------------
    // 7. Parsing (explicit single, explicit parallel, native call, single-node task-graph fold)
    // ------------------------------------------------------------------------
    describe('7. LoopAgentType parsing of presetName', () => {
        const loopType = new LoopAgentType();

        async function runDetermine(
            response: LoopAgentResponse,
            extraParams: Partial<ExecuteAgentParams> = {}
        ): Promise<BaseAgentNextStep> {
            const promptResult = {
                success: true,
                result: JSON.stringify(response),
                chatResult: {
                    success: true,
                    data: { choices: [{ message: { role: 'assistant', content: JSON.stringify(response) } }] },
                } as unknown as ChatResult,
            };
            return loopType.DetermineNextStep(
                promptResult as never,
                {
                    agent: parentAgent,
                    conversationMessages: [],
                    ...extraParams,
                },
                {},
                {}
            );
        }

        it('parses presetName on an explicit single subAgent response', async () => {
            const step = await runDetermine({
                taskComplete: false,
                nextStep: {
                    type: 'Sub-Agent',
                    subAgent: {
                        name: 'Storyboard Artist',
                        message: 'Sketch',
                        terminateAfter: false,
                        presetName: '  Draft  ',
                    },
                },
            });
            expect(step.step).toBe('Sub-Agent');
            expect(step.subAgent?.presetName).toBe('Draft');
        });

        it('parses presetName on explicit parallel subAgents[] entries', async () => {
            const step = await runDetermine({
                taskComplete: false,
                nextStep: {
                    type: 'Sub-Agent',
                    subAgents: [
                        { name: 'Storyboard Artist', message: 'A', terminateAfter: false, presetName: 'Draft' },
                        { name: 'Scene Writer', message: 'B', terminateAfter: false },
                    ],
                },
            });
            expect(step.step).toBe('Sub-Agent');
            expect(step.subAgents?.[0].presetName).toBe('Draft');
            expect(step.subAgents?.[1].presetName).toBeUndefined();
        });

        it('parses presetName from a native delegate_to_* tool call', async () => {
            const byToolName = new Map<string, NativeToolBinding>([
                [
                    'delegate_to_storyboard_artist',
                    { kind: 'subAgent', agent: relatedSubAgent },
                ],
            ]);
            const promptResult = {
                success: true,
                result: ' ',
                promptRun: { ToolCallingMode: 'NativeImplicit' },
                chatResult: {
                    success: true,
                    data: {
                        choices: [
                            {
                                message: {
                                    role: 'assistant',
                                    content: '',
                                    toolCalls: [
                                        {
                                            id: 'call-1',
                                            name: 'delegate_to_storyboard_artist',
                                            arguments: {
                                                message: 'Sketch fast',
                                                terminateAfter: false,
                                                presetName: 'Draft',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                } as unknown as ChatResult,
            };
            const step = await loopType.DetermineNextStep(
                promptResult as never,
                {
                    agent: parentAgent,
                    conversationMessages: [],
                },
                {},
                {},
                byToolName
            );

            expect(step.step).toBe('Sub-Agent');
            expect(step.subAgent).toMatchObject({
                name: 'Storyboard Artist',
                message: 'Sketch fast',
                terminateAfter: false,
                presetName: 'Draft',
            });
        });

        it('carries presetName when folding a single-node Agent task graph into a Sub-Agent step', async () => {
            const step = await runDetermine(
                {
                    taskComplete: false,
                    nextStep: {
                        type: 'Tasks',
                        tasks: {
                            workflowName: 'Storyboard Flow',
                            tasks: [
                                {
                                    tempId: 't1',
                                    name: 'Storyboard Task',
                                    description: 'Draw frames',
                                    kind: 'Agent',
                                    configuration: {
                                        agentName: 'Storyboard Artist',
                                        presetName: 'High',
                                    },
                                },
                            ],
                        },
                    },
                },
                {
                    data: {
                        __agentTypePromptParams: {
                            enableTaskGraphs: true,
                        },
                    },
                }
            );
            expect(step.step).toBe('Sub-Agent');
            expect(step.subAgent).toMatchObject({
                name: 'Storyboard Artist',
                message: 'Draw frames',
                terminateAfter: false,
                presetName: 'High',
            });
        });
    });
});
