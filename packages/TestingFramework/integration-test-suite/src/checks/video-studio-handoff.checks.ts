/**
 * video-studio-handoff.checks.ts — the 'video-studio-handoff' bundle (VSH1–VSH3): top-level
 * peer-to-peer handoff to the shipped `Video Studio` agent (`VS-INV-1`).
 *
 * WHAT IT PROVES, against this database's metadata:
 * - VSH1: `Video Studio` is directly discoverable (`AIAgentPermissionHelper.IsDirectlyDiscoverable`),
 *   and a top-level transfer from `IT: Handoff Source` to `Video Studio` via
 *   `RunAgentInConversation` + `FollowHandoffs` records a completed `Handoff` step on the source run
 *   (`TargetID`, `HandoffToAgentID`, `TargetConversationDetailID`), creates a new
 *   `MJ: Conversation Details` row for `Video Studio` (`ParentID` = source detail row, `Role = 'AI'`,
 *   `Status = 'Complete'`), and runs `Video Studio` as a root run (`ParentRunID IS NULL`) on the same
 *   `ConversationID`.
 * - VSH2: `Video Studio` target preset resolution drops the source's configuration: when the source
 *   runs with `Video Studio Draft`'s `AIConfigurationID`, the source run records `Draft`'s
 *   `ConfigurationID` while the target run's `ConfigurationID` resolves to `Video Studio Standard`
 *   (`presetSource = 'Default'`) without a saved setting and to `Video Studio High`
 *   (`presetSource = 'UserSetting'`) with `MJ: User Settings`
 *   `mj.agentMode.<video studio id lowercased> = 'High'`.
 * - VSH3: Continuity data on the conversation: the newest `Role = 'AI'` row whose `AgentID` differs
 *   from the source agent (`IT: Handoff Source`) is the `Video Studio` reply row (the same newest
 *   non-manager AI row rule).
 *
 * NO LIVE MODEL CALLS. Every run passes `CredentialScope: 'RuntimeOnly'` and placeholder `apiKeys`
 * for every candidate chat driver class (`TestLLM` registered via `RegisterTestLLM`), and each check
 * asserts `TestLLM.CallCount` equals the exact scripted call count.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIAgentPermissionHelper, AgentModeSettingKey } from '@memberjunction/ai-engine-base';
import { AgentRunner, type HandoffHopOutcome } from '@memberjunction/ai-agents';
import type {
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentConfigurationEntity,
    MJUserSettingEntity,
} from '@memberjunction/core-entities';
import { LoadVideoStudioAgent } from '@memberjunction/video-studio';
import { TestLLM, RegisterTestLLM, type TestLLMOutcome } from '@memberjunction/unit-testing';
import { Assert, AssertEqual, IntegrationCheckRegistry, settle } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteById, UserTurn } from './agent-live-shared';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const BUNDLE = 'video-studio-handoff';

const AGENT_NAMES = {
    Source: 'IT: Handoff Source',
    Target: 'Video Studio',
} as const;

const PRESET_NAMES = {
    Draft: 'Draft',
    Standard: 'Standard',
    High: 'High',
} as const;

/**
 * Every chat driver class a candidate for the seeded prompt could resolve to. Each receives the
 * `TestLLM` stand-in and a placeholder runtime key; with `CredentialScope: 'RuntimeOnly'`, `.env`
 * vendor keys can never select a live vendor.
 */
const CHAT_DRIVER_CLASSES: readonly string[] = [
    'OpenAILLM',
    'AzureLLM',
    'OpenRouterLLM',
    'AnthropicLLM',
    'GeminiLLM',
    'VertexLLM',
    'CerebrasLLM',
    'GroqLLM',
];

const SCRIPTED_API_KEYS = CHAT_DRIVER_CLASSES.map(driverClass => ({
    driverClass,
    apiKey: 'it-video-studio-handoff-scripted-no-network',
}));

const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 1500);

const PROMPT_RUN_STEP_TYPES: readonly string[] = ['Prompt', 'Compaction', 'Tool', 'Decision'];

// ─── Fixture State ───────────────────────────────────────────────────────────────────────────────

interface VideoStudioHandoffFixture {
    Agents: {
        Source: MJAIAgentEntityExtended;
        Target: MJAIAgentEntityExtended;
    };
    Presets: {
        Draft: MJAIAgentConfigurationEntity;
        Standard: MJAIAgentConfigurationEntity;
        High: MJAIAgentConfigurationEntity;
    };
    Llm: TestLLM;
    Restore: () => void;
    ConversationIDs: string[];
    RunIDs: string[];
}

let handoffFixture: VideoStudioHandoffFixture | undefined;

function requireFixture(): VideoStudioHandoffFixture {
    if (!handoffFixture) {
        throw new Error(`${BUNDLE}: fixture is not initialized — did the bundle Setup lifecycle run?`);
    }
    return handoffFixture;
}

function loadAgent(name: string): MJAIAgentEntityExtended {
    const agent = AIEngine.Instance.Agents.find(a => a.Name === name);
    if (!agent) {
        throw new Error(
            `${BUNDLE}: agent '${name}' is not in this database — sync metadata and metadata-optional/integration-test`
        );
    }
    return agent;
}

function loadPreset(agentId: string, presetName: string): MJAIAgentConfigurationEntity {
    const presets = AIEngine.Instance.GetAgentConfigurationPresets(agentId, true);
    const match = presets.find(p => p.Name === presetName);
    if (!match || !match.AIConfigurationID) {
        throw new Error(
            `${BUNDLE}: active preset '${presetName}' (with AIConfigurationID) on agent ${agentId} is missing — ` +
            `sync metadata/agents`
        );
    }
    return match;
}

// ─── Script & Run Helpers ────────────────────────────────────────────────────────────────────────

function armScript(f: VideoStudioHandoffFixture, replies: Array<Record<string, unknown>>): void {
    f.Llm.Reset();
    f.Llm.SetDefaultOutcome({
        kind: 'fail',
        error: new Error(`${BUNDLE}: TestLLM script exhausted — unexpected extra LLM call`),
    });
    const outcomes: TestLLMOutcome[] = replies.map(r => ({
        kind: 'succeed',
        content: JSON.stringify(r),
    }));
    f.Llm.Script(...outcomes);
}

function handoffReply(
    agentName: string,
    brief: string,
    reason: string,
    message = `Routing to ${agentName}.`
): Record<string, unknown> {
    return {
        taskComplete: false,
        message,
        nextStep: {
            type: 'Handoff',
            handoff: {
                agentName,
                brief,
                reason,
            },
        },
    };
}

function chatClarifyingReply(message: string): Record<string, unknown> {
    return {
        taskComplete: false,
        message,
        nextStep: {
            type: 'Chat',
        },
    };
}

interface ConversationHandoffRun {
    ConversationID: string;
    UserDetailID: string;
    SourceDetailID: string;
    SourceResult: ExecuteAgentResult;
    Outcomes: HandoffHopOutcome[];
}

async function runSourceWithFollowHandoffs(
    ctx: IntegrationCheckContext,
    userMessage: string,
    conversationName: string,
    sourceConfigurationId?: string
): Promise<ConversationHandoffRun> {
    const f = requireFixture();
    const runner = new AgentRunner(ctx.Provider);
    const initialMessages = UserTurn(userMessage);
    const params: ExecuteAgentParams = {
        agent: f.Agents.Source,
        conversationMessages: [...initialMessages],
        contextUser: ctx.User,
        provider: ctx.Provider,
        apiKeys: SCRIPTED_API_KEYS,
        CredentialScope: 'RuntimeOnly',
        handoffChain: [],
        ...(sourceConfigurationId ? { configurationId: sourceConfigurationId } : {}),
    };

    const convRun = await runner.RunAgentInConversation(params, {
        userMessage,
        conversationName,
        createArtifacts: false,
    });

    if (convRun.conversationId && !f.ConversationIDs.some(id => UUIDsEqual(id, convRun.conversationId))) {
        f.ConversationIDs.push(convRun.conversationId);
    }
    if (convRun.agentResult?.agentRun?.ID) {
        f.RunIDs.push(convRun.agentResult.agentRun.ID);
    }

    let outcomes: HandoffHopOutcome[] = [];
    if (convRun.agentResult?.handoff && convRun.agentResponseDetailId) {
        outcomes = await runner.FollowHandoffs({
            params: {
                ...params,
                conversationMessages: initialMessages,
            },
            sourceResult: convRun.agentResult,
            conversationId: convRun.conversationId,
            sourceConversationDetailId: convRun.agentResponseDetailId,
            createArtifacts: false,
        });
        for (const outcome of outcomes) {
            if (outcome.agentResult?.agentRun?.ID) {
                f.RunIDs.push(outcome.agentResult.agentRun.ID);
            }
        }
    }

    await settle(SETTLE_MS);

    return {
        ConversationID: convRun.conversationId,
        UserDetailID: convRun.userMessageDetailId,
        SourceDetailID: convRun.agentResponseDetailId!,
        SourceResult: convRun.agentResult,
        Outcomes: outcomes,
    };
}

interface StepRow {
    ID: string;
    StepNumber: number;
    StepName: string;
    StepType: string;
    Status: string;
    TargetID: string | null;
    TargetLogID: string | null;
    ParentID: string | null;
    OutputData: string | null;
    ErrorMessage: string | null;
}

async function readSteps(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<StepRow[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<StepRow>(
        {
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${EscapeSQLString(runId)}'`,
            OrderBy: 'StepNumber ASC',
            Fields: [
                'ID',
                'StepNumber',
                'StepName',
                'StepType',
                'Status',
                'TargetID',
                'TargetLogID',
                'ParentID',
                'OutputData',
                'ErrorMessage',
            ],
            ResultType: 'simple',
            BypassCache: true,
        },
        user
    );
    if (!res.Success) {
        throw new Error(`${BUNDLE}: failed to read steps for run ${runId}: ${res.ErrorMessage}`);
    }
    return res.Results ?? [];
}

interface DetailRow {
    ID: string;
    ConversationID: string;
    ParentID: string | null;
    Role: string;
    Status: string;
    AgentID: string | null;
    Message: string | null;
    __mj_CreatedAt: Date | string;
}

async function readConversationDetails(
    provider: IMetadataProvider,
    user: UserInfo,
    conversationId: string
): Promise<DetailRow[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<DetailRow>(
        {
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `ConversationID='${EscapeSQLString(conversationId)}'`,
            OrderBy: '__mj_CreatedAt ASC',
            Fields: ['ID', 'ConversationID', 'ParentID', 'Role', 'Status', 'AgentID', 'Message', '__mj_CreatedAt'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user
    );
    if (!res.Success) {
        throw new Error(`${BUNDLE}: failed to read Conversation Details for ${conversationId}: ${res.ErrorMessage}`);
    }
    return res.Results ?? [];
}

async function deleteTargetModeSetting(ctx: IntegrationCheckContext, targetAgentId: string): Promise<void> {
    const settingKey = AgentModeSettingKey(targetAgentId);
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const res = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: User Settings',
            ExtraFilter:
                `UserID='${EscapeSQLString(ctx.User.ID)}'` +
                ` AND Setting='${EscapeSQLString(settingKey)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User
    );
    for (const row of res.Success ? res.Results : []) {
        await DeleteById('MJ: User Settings', row.ID, ctx.Provider, ctx.User);
    }
}

async function writeTargetModeSetting(
    ctx: IntegrationCheckContext,
    targetAgentId: string,
    presetName: string
): Promise<void> {
    await deleteTargetModeSetting(ctx, targetAgentId);
    const entity = await ctx.Provider.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', ctx.User);
    entity.NewRecord();
    entity.UserID = ctx.User.ID;
    entity.Setting = AgentModeSettingKey(targetAgentId);
    entity.Value = presetName;
    const saved = await entity.Save();
    Assert(
        saved,
        `${BUNDLE}: failed to save MJ: User Settings (${entity.Setting}=${presetName}): ` +
        `${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`
    );
}

// ─── Checks (VSH1–VSH3) ──────────────────────────────────────────────────────────────────────────

export const VideoStudioHandoffChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.VSH1`,
        Name:
            'VSH1: Top-level transfer to Video Studio — Video Studio is directly discoverable, source records a completed Handoff step targeting Video Studio, FollowHandoffs creates the Video Studio ConversationDetail row as a child of the source row, and Video Studio runs as a root run on the same ConversationID',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            await deleteTargetModeSetting(ctx, f.Agents.Target.ID);

            Assert(
                AIAgentPermissionHelper.IsDirectlyDiscoverable(f.Agents.Target),
                'VSH1: Video Studio must be directly discoverable (root ParentID null and InvocationMode = Any)'
            );

            armScript(f, [
                handoffReply(
                    AGENT_NAMES.Target,
                    '60-second explainer about X',
                    'Video Studio owns short explainer video production'
                ),
                chatClarifyingReply(
                    'Who is the target audience and what call to action should close the 60-second explainer about X?'
                ),
            ]);

            const run = await runSourceWithFollowHandoffs(
                ctx,
                'Make a 60-second explainer video about X.',
                'IT150 VSH1 Video Studio Transfer'
            );

            // Source run assertions
            const sourceRun = run.SourceResult.agentRun;
            Assert(!!sourceRun, 'VSH1: source run missing');
            AssertEqual(sourceRun.Status, 'Completed', `VSH1: source run Status (${sourceRun.ErrorMessage ?? 'no error'})`);

            const sourceSteps = await readSteps(ctx.Provider, ctx.User, sourceRun.ID);
            const handoffSteps = sourceSteps.filter(s => s.StepType === 'Handoff');
            AssertEqual(handoffSteps.length, 1, 'VSH1: source run Handoff step count');
            const handoffStep = handoffSteps[0];
            AssertEqual(handoffStep.Status, 'Completed', 'VSH1: source Handoff step Status');
            Assert(
                UUIDsEqual(handoffStep.TargetID, f.Agents.Target.ID),
                `VSH1: source Handoff step TargetID ${handoffStep.TargetID}, expected Video Studio ${f.Agents.Target.ID}`
            );
            Assert(!!handoffStep.OutputData, 'VSH1: source Handoff step OutputData is empty');
            const handoffOutput = JSON.parse(handoffStep.OutputData!) as Record<string, unknown>;
            Assert(
                UUIDsEqual(handoffOutput.HandoffToAgentID as string, f.Agents.Target.ID),
                `VSH1: Handoff step OutputData.HandoffToAgentID ${handoffOutput.HandoffToAgentID}, expected Video Studio`
            );

            // FollowHandoffs outcome & Video Studio target run assertions
            AssertEqual(run.Outcomes.length, 1, 'VSH1: FollowHandoffs hop count');
            const outcome = run.Outcomes[0];
            Assert(
                UUIDsEqual(handoffOutput.TargetConversationDetailID as string, outcome.targetConversationDetailId),
                'VSH1: Handoff step OutputData.TargetConversationDetailID must equal outcome.targetConversationDetailId'
            );

            const targetRun = outcome.agentResult?.agentRun;
            Assert(!!targetRun, 'VSH1: Video Studio target run missing from outcome');
            AssertEqual(
                targetRun!.Status,
                'AwaitingFeedback',
                `VSH1: Video Studio run Status (${targetRun!.ErrorMessage ?? 'no error'})`
            );
            AssertEqual(targetRun!.FinalStep, 'Chat', 'VSH1: Video Studio run FinalStep');
            Assert(targetRun!.ParentRunID == null, `VSH1: Video Studio run ParentRunID must be NULL, got ${targetRun!.ParentRunID}`);
            Assert(
                UUIDsEqual(targetRun!.AgentID, f.Agents.Target.ID),
                `VSH1: target run AgentID ${targetRun!.AgentID}, expected Video Studio ${f.Agents.Target.ID}`
            );
            Assert(
                UUIDsEqual(targetRun!.ConversationID, run.ConversationID),
                `VSH1: target run ConversationID ${targetRun!.ConversationID}, expected conversation ${run.ConversationID}`
            );
            Assert(
                UUIDsEqual(targetRun!.ConversationDetailID, outcome.targetConversationDetailId),
                'VSH1: target run ConversationDetailID must equal outcome.targetConversationDetailId'
            );

            // Video Studio ConversationDetail row assertions
            const details = await readConversationDetails(ctx.Provider, ctx.User, run.ConversationID);
            const targetDetail = details.find(d => UUIDsEqual(d.ID, outcome.targetConversationDetailId));
            Assert(!!targetDetail, 'VSH1: Video Studio ConversationDetail row not found in database');
            Assert(
                UUIDsEqual(targetDetail!.AgentID, f.Agents.Target.ID),
                `VSH1: target ConversationDetail.AgentID ${targetDetail!.AgentID}, expected Video Studio`
            );
            Assert(
                UUIDsEqual(targetDetail!.ParentID, run.SourceDetailID),
                `VSH1: target ConversationDetail.ParentID ${targetDetail!.ParentID}, expected source detail ${run.SourceDetailID}`
            );
            AssertEqual(targetDetail!.Role, 'AI', 'VSH1: target ConversationDetail.Role');
            AssertEqual(targetDetail!.Status, 'Complete', 'VSH1: target ConversationDetail.Status');

            AssertEqual(f.Llm.CallCount, 2, 'VSH1: TestLLM.CallCount');
        },
    },
    {
        Id: `${BUNDLE}.VSH2`,
        Name:
            'VSH2: Video Studio preset resolution — source runs with Video Studio Draft, and target ConfigurationID resolves to Video Studio Standard without a saved setting and Video Studio High with mj.agentMode.<video studio id lowercased>=High',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            try {
                // 1. Default preset without saved setting -> Video Studio Standard (dropping source's Draft configuration)
                await deleteTargetModeSetting(ctx, f.Agents.Target.ID);

                armScript(f, [
                    handoffReply(
                        AGENT_NAMES.Target,
                        '60-second explainer about X',
                        'Default preset resolution to Video Studio Standard'
                    ),
                    chatClarifyingReply(
                        'Who is the target audience and what call to action should close the 60-second explainer about X?'
                    ),
                ]);

                const defaultRun = await runSourceWithFollowHandoffs(
                    ctx,
                    'Make a 60-second explainer about X with the default mode.',
                    'IT150 VSH2 Default Standard',
                    f.Presets.Draft.AIConfigurationID!
                );
                Assert(
                    UUIDsEqual(defaultRun.SourceResult.agentRun!.ConfigurationID, f.Presets.Draft.AIConfigurationID),
                    `VSH2 (Standard): source ConfigurationID ${defaultRun.SourceResult.agentRun!.ConfigurationID}, expected Video Studio Draft ${f.Presets.Draft.AIConfigurationID}`
                );
                AssertEqual(defaultRun.Outcomes.length, 1, 'VSH2 (Standard): FollowHandoffs hop count');
                const defaultTargetRun = defaultRun.Outcomes[0].agentResult?.agentRun;
                Assert(!!defaultTargetRun, 'VSH2 (Standard): target run missing');
                AssertEqual(defaultRun.Outcomes[0].presetSource, 'Default', 'VSH2 (Standard): outcome.presetSource');
                Assert(
                    UUIDsEqual(defaultTargetRun!.ConfigurationID, f.Presets.Standard.AIConfigurationID),
                    `VSH2 (Standard): target ConfigurationID ${defaultTargetRun!.ConfigurationID}, expected Video Studio Standard ${f.Presets.Standard.AIConfigurationID}`
                );
                AssertEqual(f.Llm.CallCount, 2, 'VSH2 (Standard): TestLLM.CallCount');

                // 2. Saved MJ: User Settings mj.agentMode.<video studio id lowercased> = 'High' -> Video Studio High (dropping source's Draft configuration)
                await writeTargetModeSetting(ctx, f.Agents.Target.ID, PRESET_NAMES.High);

                armScript(f, [
                    handoffReply(
                        AGENT_NAMES.Target,
                        '60-second explainer about X',
                        'UserSetting preset resolution to Video Studio High'
                    ),
                    chatClarifyingReply(
                        'Who is the target audience and what call to action should close the 60-second explainer about X?'
                    ),
                ]);

                const highRun = await runSourceWithFollowHandoffs(
                    ctx,
                    'Make a 60-second explainer about X with the saved High mode.',
                    'IT150 VSH2 UserSetting High',
                    f.Presets.Draft.AIConfigurationID!
                );
                Assert(
                    UUIDsEqual(highRun.SourceResult.agentRun!.ConfigurationID, f.Presets.Draft.AIConfigurationID),
                    `VSH2 (High): source ConfigurationID ${highRun.SourceResult.agentRun!.ConfigurationID}, expected Video Studio Draft ${f.Presets.Draft.AIConfigurationID}`
                );
                AssertEqual(highRun.Outcomes.length, 1, 'VSH2 (High): FollowHandoffs hop count');
                const highTargetRun = highRun.Outcomes[0].agentResult?.agentRun;
                Assert(!!highTargetRun, 'VSH2 (High): target run missing');
                AssertEqual(highRun.Outcomes[0].presetSource, 'UserSetting', 'VSH2 (High): outcome.presetSource');
                Assert(
                    UUIDsEqual(highTargetRun!.ConfigurationID, f.Presets.High.AIConfigurationID),
                    `VSH2 (High): target ConfigurationID ${highTargetRun!.ConfigurationID}, expected Video Studio High ${f.Presets.High.AIConfigurationID}`
                );
                AssertEqual(f.Llm.CallCount, 2, 'VSH2 (High): TestLLM.CallCount');
            } finally {
                await deleteTargetModeSetting(ctx, f.Agents.Target.ID);
            }
        },
    },
    {
        Id: `${BUNDLE}.VSH3`,
        Name:
            'VSH3: Continuity data — after a handoff to Video Studio, the newest Role=AI ConversationDetail row on the conversation with an AgentID other than the source is the Video Studio reply row',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            await deleteTargetModeSetting(ctx, f.Agents.Target.ID);

            armScript(f, [
                handoffReply(
                    AGENT_NAMES.Target,
                    '60-second explainer about X',
                    'Video Studio should own follow-up turns'
                ),
                chatClarifyingReply(
                    'Who is the target audience and what call to action should close the 60-second explainer about X?'
                ),
            ]);

            const run = await runSourceWithFollowHandoffs(
                ctx,
                'Make a 60-second explainer about X and keep going on follow-ups.',
                'IT150 VSH3 Continuity'
            );
            AssertEqual(run.Outcomes.length, 1, 'VSH3: FollowHandoffs hop count');
            const targetDetailId = run.Outcomes[0].targetConversationDetailId;

            const details = await readConversationDetails(ctx.Provider, ctx.User, run.ConversationID);
            const lastNonSourceAiReply = [...details]
                .reverse()
                .find(d => d.Role === 'AI' && !!d.AgentID && !UUIDsEqual(d.AgentID, f.Agents.Source.ID));

            Assert(!!lastNonSourceAiReply, 'VSH3: found no Role=AI row for an agent other than source');
            Assert(
                UUIDsEqual(lastNonSourceAiReply!.ID, targetDetailId),
                `VSH3: newest non-source AI row ID ${lastNonSourceAiReply!.ID}, expected Video Studio detail ${targetDetailId}`
            );
            Assert(
                UUIDsEqual(lastNonSourceAiReply!.AgentID, f.Agents.Target.ID),
                `VSH3: newest non-source AI row AgentID ${lastNonSourceAiReply!.AgentID}, expected Video Studio ${f.Agents.Target.ID}`
            );
            AssertEqual(lastNonSourceAiReply!.Status, 'Complete', 'VSH3: Video Studio reply Status');
            AssertEqual(f.Llm.CallCount, 2, 'VSH3: TestLLM.CallCount');
        },
    },
];

for (const check of VideoStudioHandoffChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle & Teardown ────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        LoadVideoStudioAgent();
        await AIEngine.Instance.Config(false, ctx.User);
        const source = loadAgent(AGENT_NAMES.Source);
        const target = loadAgent(AGENT_NAMES.Target);
        const presets = {
            Draft: loadPreset(target.ID, PRESET_NAMES.Draft),
            Standard: loadPreset(target.ID, PRESET_NAMES.Standard),
            High: loadPreset(target.ID, PRESET_NAMES.High),
        };
        const llm = new TestLLM();
        const restore = RegisterTestLLM(llm, [...CHAT_DRIVER_CLASSES]);

        handoffFixture = {
            Agents: {
                Source: source,
                Target: target,
            },
            Presets: presets,
            Llm: llm,
            Restore: restore,
            ConversationIDs: [],
            RunIDs: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const f = handoffFixture;
        handoffFixture = undefined;
        if (!f) {
            return;
        }
        f.Llm.Reset();
        f.Llm.SetDefaultOutcome({
            kind: 'fail',
            error: new Error(`The ${BUNDLE} TestLLM is not armed: its bundle has finished`),
        });
        f.Restore();

        // 1. Delete user setting if still present
        await deleteTargetModeSetting(ctx, f.Agents.Target.ID).catch(err =>
            console.error(`[${BUNDLE}] cleanup of user setting failed:`, err)
        );

        // 2. Sweep any IT150 conversations created during the bundle (including any from aborted runs)
        const allConversationIds = await collectAllConversationIds(ctx, f.ConversationIDs);

        // 3. Discover any runs linked to our conversations as well as explicitly recorded RunIDs
        const allRunIds = await collectAllRunIds(ctx, allConversationIds, f.RunIDs);

        // 4. Delete all requests, steps, and prompt runs for each run, then delete runs leaves-first
        await purgeRuns(ctx, allRunIds).catch(err =>
            console.error(`[${BUNDLE}] cleanup of runs failed:`, err)
        );

        // 5. Delete Conversation Details leaves-first (ParentID children before parents), then Conversations
        for (const convId of allConversationIds) {
            await purgeConversation(ctx, convId).catch(err =>
                console.error(`[${BUNDLE}] cleanup of conversation ${convId} failed:`, err)
            );
        }
    },
});

async function collectAllConversationIds(
    ctx: IntegrationCheckContext,
    trackedIds: string[]
): Promise<string[]> {
    const ids = new Set<string>(trackedIds);
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const res = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Conversations',
            ExtraFilter: `Name LIKE 'IT150 %' AND UserID='${EscapeSQLString(ctx.User.ID)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User
    );
    for (const row of res.Success ? res.Results : []) {
        ids.add(row.ID);
    }
    return [...ids];
}

async function collectAllRunIds(
    ctx: IntegrationCheckContext,
    conversationIds: string[],
    trackedRunIds: string[]
): Promise<string[]> {
    const ids = new Set<string>(trackedRunIds);
    if (conversationIds.length > 0) {
        const quoted = conversationIds.map(id => `'${EscapeSQLString(id)}'`).join(',');
        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const res = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ConversationID IN (${quoted})`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            ctx.User
        );
        for (const row of res.Success ? res.Results : []) {
            ids.add(row.ID);
        }
    }
    return [...ids];
}

async function deletePromptRunTree(ctx: IntegrationCheckContext, promptRunId: string): Promise<void> {
    const children = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        {
            EntityName: 'MJ: AI Prompt Runs',
            ExtraFilter: `ParentID='${EscapeSQLString(promptRunId)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User
    );
    for (const child of children.Success ? children.Results : []) {
        await deletePromptRunTree(ctx, child.ID);
    }
    await DeleteById('MJ: AI Prompt Runs', promptRunId, ctx.Provider, ctx.User);
}

async function purgeRuns(ctx: IntegrationCheckContext, runIds: string[]): Promise<void> {
    if (runIds.length === 0) {
        return;
    }
    const quotedRuns = runIds.map(id => `'${EscapeSQLString(id)}'`).join(',');
    const rv = RunView.FromMetadataProvider(ctx.Provider);

    // 1. Delete MJ: AI Agent Requests referencing any of these runs (every root agent's Chat step raises an
    // MJ: AI Agent Requests row referencing OriginatingAgentRunID & OriginatingAgentRunStepID and ends AwaitingFeedback;
    // ChatHandlingOption = 'Consult' governs only a sub-agent's Chat step)
    const reqsResult = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: AI Agent Requests',
            ExtraFilter: `OriginatingAgentRunID IN (${quotedRuns}) OR ResumingAgentRunID IN (${quotedRuns})`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User
    );
    for (const req of reqsResult.Success ? reqsResult.Results : []) {
        await DeleteById('MJ: AI Agent Requests', req.ID, ctx.Provider, ctx.User).catch(err =>
            console.error(`[${BUNDLE}] cleanup of request ${req.ID} failed:`, err)
        );
    }

    const promptRunIds = new Set<string>();

    // 2. Delete steps leaves-first for each run
    for (const runId of runIds) {
        const steps = await readSteps(ctx.Provider, ctx.User, runId);
        for (const step of steps) {
            if (step.TargetLogID && PROMPT_RUN_STEP_TYPES.includes(step.StepType)) {
                promptRunIds.add(step.TargetLogID);
            }
        }
        let remaining = [...steps];
        while (remaining.length > 0) {
            const parents = new Set(
                remaining
                    .map(s => (s.ParentID ? NormalizeUUID(s.ParentID) : null))
                    .filter((id): id is string => !!id)
            );
            const leaves = remaining.filter(s => !parents.has(NormalizeUUID(s.ID)));
            for (const step of leaves.length > 0 ? leaves : remaining) {
                await DeleteById('MJ: AI Agent Run Steps', step.ID, ctx.Provider, ctx.User);
            }
            remaining = leaves.length > 0 ? remaining.filter(s => !leaves.includes(s)) : [];
        }
    }

    // 3. Delete prompt runs
    for (const promptRunId of promptRunIds) {
        await deletePromptRunTree(ctx, promptRunId).catch(err =>
            console.error(`[${BUNDLE}] cleanup of prompt run ${promptRunId} failed:`, err)
        );
    }

    // 4. Delete runs leaves-first across ParentRunID and LastRunID
    const runsResult = await rv.RunView<{ ID: string; ParentRunID: string | null; LastRunID: string | null }>(
        {
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ID IN (${quotedRuns})`,
            Fields: ['ID', 'ParentRunID', 'LastRunID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User
    );
    let remainingRuns = runsResult.Success
        ? [...runsResult.Results]
        : runIds.map(ID => ({ ID, ParentRunID: null, LastRunID: null }));
    while (remainingRuns.length > 0) {
        const referencedIds = new Set<string>();
        for (const r of remainingRuns) {
            if (r.ParentRunID) referencedIds.add(NormalizeUUID(r.ParentRunID));
            if (r.LastRunID) referencedIds.add(NormalizeUUID(r.LastRunID));
        }
        const leaves = remainingRuns.filter(r => !referencedIds.has(NormalizeUUID(r.ID)));
        for (const run of leaves.length > 0 ? leaves : remainingRuns) {
            await DeleteById('MJ: AI Agent Runs', run.ID, ctx.Provider, ctx.User);
        }
        remainingRuns = leaves.length > 0 ? remainingRuns.filter(r => !leaves.includes(r)) : [];
    }
}

async function purgeConversation(ctx: IntegrationCheckContext, conversationId: string): Promise<void> {
    const details = await readConversationDetails(ctx.Provider, ctx.User, conversationId);
    let remaining = [...details];
    while (remaining.length > 0) {
        const parentIds = new Set(
            remaining
                .map(d => (d.ParentID ? NormalizeUUID(d.ParentID) : null))
                .filter((id): id is string => !!id)
        );
        const leaves = remaining.filter(d => !parentIds.has(NormalizeUUID(d.ID)));
        for (const detail of leaves.length > 0 ? leaves : remaining) {
            await DeleteById('MJ: Conversation Details', detail.ID, ctx.Provider, ctx.User);
        }
        remaining = leaves.length > 0 ? remaining.filter(d => !leaves.includes(d)) : [];
    }
    await DeleteById('MJ: Conversations', conversationId, ctx.Provider, ctx.User);
}
