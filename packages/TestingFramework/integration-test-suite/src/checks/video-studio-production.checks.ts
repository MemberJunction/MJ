/**
 * video-studio-production.checks.ts — the 'video-studio-production' bundle (VSP1–VSP5):
 * deterministic end-to-end integration checks for the `Video Studio` production pipeline (`IT151`).
 *
 * Every external dependency is replaced with a deterministic in-process fake from
 * `./video-studio-fakes`:
 * - LLM calls use `TestLLM` (from `@memberjunction/unit-testing`) scripted with checked-in JSON
 *   replies under `./fixtures/video-studio/`.
 * - Render driver uses `FakeRenderDriver` (`UseFakeRenderDriver`).
 * - Video generation uses `ScriptedITVideoGenerator` (`RegisterFakeVideoGenerator`).
 * - Text-to-speech uses `ScriptedITTextToSpeech` (`RegisterFakeTextToSpeech`).
 * - File storage uses `MemoryFileStorageDriver` (`UseMemoryStorage`).
 * - Vendor API keys are locked to the registered fake driver classes (`RegisterFakeAPIKeys`), and
 *   every run passes `CredentialScope: 'RuntimeOnly'`.
 *
 * Checks:
 * - VSP1: Standalone Social Short under Draft walks Director -> Art Director -> Storyboard ->
 *   Pre-Production -> Motion Engineer -> Render -> Critic -> Delivered, passes all 6 gates (G1..G6),
 *   persists Output.Videos['16:9'].FileID, Output.PosterFileID, and Output.ContactSheetFileIDs['16:9'][0]
 *   in MJ: Files, leaves InlineBase64 unset and zero MP4 bytes in MJ: AI Agent Run Medias.InlineData,
 *   and calls FakeRenderDriver once (13 scripted LLM calls).
 * - VSP2: Related-agent invocation (IT: VS Data Caller -> Video Studio) over a runtime copy of the
 *   shipped Query Builder -> Video Studio relationship resolves Video Studio Standard preset on the
 *   child run, captures the caller's rows in DataSnapshot, and maps video.Status / video.Videos and
 *   result.fileOutputs back to the caller (15 scripted LLM calls).
 * - VSP3: Headless Produce Video action runs Video Studio under Draft and returns ResultCode === 'SUCCESS'
 *   with output parameters AgentRunID, ArtifactID, ArtifactVersionID, VideoFileIDs['16:9'], and PosterFileID,
 *   persisting a Video Production artifact whose version JSON matches the output FileIDs (13 scripted LLM calls).
 * - VSP4: Generative clip asset (Provenance: 'Generated', 4s) exercises AIVideoRunner through the fake
 *   video generator (SubmitCount === 1), persists an MJ: AI Prompt Runs row with Per Second cost > 0,
 *   records Output.GenerationProvenance.TotalVideoSeconds === 4, emits "AI-generated assets (1)" in
 *   Review.HumanReviewNotes, and saves an MJ: Artifacts / MJ: Artifact Versions record via ProcessAgentArtifacts.
 * - VSP5: Guards before spend: (a) a generation request naming "our CEO speaking" against NeverInvent: ['real people']
 *   is blocked before spend (Status: 'Blocked', FinalStep: 'Chat', SubmitCount === 0, RenderCallCount === 0);
 *   (b) a generation request of 25 seconds under Draft (cap 20s) is refused at Gate G2 before Pre-Production.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIVideoRunner } from '@memberjunction/ai-prompts';
import { AgentRunner } from '@memberjunction/ai-agents';
import type {
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentConfigurationEntity,
    MJAIAgentRelationshipEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import type { VideoFormat, VideoGenerationSpec } from '@memberjunction/video-studio-core';
import {
    LoadVideoStudioAgent,
    LoadProduceVideoAction,
} from '@memberjunction/video-studio';
import { TestLLM, RegisterTestLLM, type TestLLMOutcome } from '@memberjunction/unit-testing';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    settle,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { ResolvePromptRunIdsForAgentRuns, UserTurn } from './agent-live-shared';
import { CollectRunTree, DeepDeleteRunTrees, DeleteMatching } from './_it-live-agent-harness';
import {
    UseFakeRenderDriver,
    RegisterFakeVideoGenerator,
    RegisterFakeTextToSpeech,
    RegisterFakeAPIKeys,
    UseMemoryStorage,
    SCRIPTED_API_KEY,
} from './video-studio-fakes';

const BUNDLE = 'video-studio-production';
const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 1500);

const CURRENT_DIR = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
// tsc does not copy JSON fixtures to dist, and the package is private and repo-local.
const FIXTURES_DIR = path.resolve(CURRENT_DIR, '..', '..', 'src', 'checks', 'fixtures', 'video-studio');

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

const VIDEO_STUDIO_STAGE_AGENT_NAMES: readonly string[] = [
    'Video Studio',
    'Video Studio - Director',
    'Video Studio - Art Director',
    'Video Studio - Storyboard',
    'Video Studio - Pre-Production',
    'Video Studio - Motion Engineer',
    'Video Studio - Critic',
    'IT: VS Data Caller',
];

interface VideoStudioProductionFixture {
    SetupStartedAtIso: string;
    VideoStudioAgent?: MJAIAgentEntityExtended;
    CallerAgent?: MJAIAgentEntityExtended;
    Llm: TestLLM;
    RestoreLlm?: () => void;
    Render?: ReturnType<typeof UseFakeRenderDriver>;
    VideoGen?: ReturnType<typeof RegisterFakeVideoGenerator>;
    Tts?: ReturnType<typeof RegisterFakeTextToSpeech>;
    Storage?: Awaited<ReturnType<typeof UseMemoryStorage>>;
    RestoreApiKeys?: () => void;
    AllowedDriverClasses: readonly string[];
    RuntimeRelationshipID?: string;
    RootRunIDs: string[];
    ExtraPromptRunIDs: string[];
    FileIDs: string[];
    ArtifactIDs: string[];
    ArtifactVersionIDs: string[];
}

type InitializedVideoStudioProductionFixture = Required<
    Pick<
        VideoStudioProductionFixture,
        | 'SetupStartedAtIso'
        | 'VideoStudioAgent'
        | 'CallerAgent'
        | 'Llm'
        | 'RestoreLlm'
        | 'Render'
        | 'VideoGen'
        | 'Tts'
        | 'Storage'
        | 'RestoreApiKeys'
        | 'AllowedDriverClasses'
        | 'RootRunIDs'
        | 'ExtraPromptRunIDs'
        | 'FileIDs'
        | 'ArtifactIDs'
        | 'ArtifactVersionIDs'
    >
> & {
    RuntimeRelationshipID?: string;
};

let productionFixture: VideoStudioProductionFixture | undefined;

function requireFixture(): InitializedVideoStudioProductionFixture {
    if (
        !productionFixture?.VideoStudioAgent ||
        !productionFixture.CallerAgent ||
        !productionFixture.RestoreLlm ||
        !productionFixture.Render ||
        !productionFixture.VideoGen ||
        !productionFixture.Tts ||
        !productionFixture.Storage ||
        !productionFixture.RestoreApiKeys
    ) {
        throw new Error(`${BUNDLE} fixture is not initialized (Setup has not completed).`);
    }
    return productionFixture as InitializedVideoStudioProductionFixture;
}

function loadAgent(name: string): MJAIAgentEntityExtended {
    const agent = AIEngine.Instance.Agents.find((a) => a.Name?.trim() === name);
    if (!agent) {
        throw new Error(
            `Agent '${name}' not found in AIEngine. Push metadata and metadata-optional/integration-test before running ${BUNDLE}.`,
        );
    }
    return agent;
}

function resolveAgentPreset(
    agent: MJAIAgentEntityExtended,
    presetName: string,
): MJAIAgentConfigurationEntity | undefined {
    return AIEngine.Instance.AgentConfigurations.find(
        (ac) => UUIDsEqual(ac.AgentID, agent.ID) && ac.Name?.trim() === presetName && ac.Status === 'Active',
    );
}

function armScriptFromFiles(f: VideoStudioProductionFixture, filenames: readonly string[]): void {
    f.Llm.Reset();
    f.Llm.SetDefaultOutcome({
        kind: 'fail',
        error: new Error(`${BUNDLE}: TestLLM script exhausted (${filenames.length} step(s) configured)`),
    });
    const outcomes: TestLLMOutcome[] = filenames.map((file) => ({
        kind: 'succeed',
        content: fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'),
    }));
    f.Llm.Script(...outcomes);
}

function runtimeApiKeys(f: VideoStudioProductionFixture): Array<{ driverClass: string; apiKey: string }> {
    return f.AllowedDriverClasses.map((driverClass) => ({
        driverClass,
        apiKey: SCRIPTED_API_KEY,
    }));
}

function seedInlineArrSpec(): Partial<VideoGenerationSpec> {
    return {
        DataSnapshot: {
            AsOf: '',
            Sources: [],
            Inline: {
                arr_total: 42400000,
            },
        },
    };
}

function collectSpecCleanupIds(spec: VideoGenerationSpec | undefined, f: VideoStudioProductionFixture): void {
    if (!spec) {
        return;
    }
    for (const asset of spec.Assets?.Approved ?? []) {
        if (asset.Generation?.PromptRunID) {
            f.ExtraPromptRunIDs.push(asset.Generation.PromptRunID);
        }
        if (asset.FileID) {
            f.FileIDs.push(asset.FileID);
        }
    }
    for (const line of spec.Audio?.Narration?.Script ?? []) {
        if (line.AudioFileID) {
            f.FileIDs.push(line.AudioFileID);
        }
    }
    for (const entry of Object.values(spec.Output?.Videos ?? {})) {
        if (entry?.FileID) {
            f.FileIDs.push(entry.FileID);
        }
    }
    if (spec.Output?.PosterFileID) {
        f.FileIDs.push(spec.Output.PosterFileID);
    }
    if (spec.Output?.CaptionsFileID) {
        f.FileIDs.push(spec.Output.CaptionsFileID);
    }
    for (const ids of Object.values(spec.Output?.ContactSheetFileIDs ?? {})) {
        for (const id of ids ?? []) {
            if (id) {
                f.FileIDs.push(id);
            }
        }
    }
}

const HAPPY_PATH_13_STEPS: readonly string[] = [
    '01-root-to-director.json',
    '02-director.json',
    '03-root-to-art-director.json',
    '04-art-director.json',
    '05-root-to-storyboard.json',
    '06-storyboard.json',
    '07-root-to-pre-production.json',
    '08-root-to-motion-engineer.json',
    '09-motion-engineer.json',
    '10-root-to-render.json',
    '11-root-to-critic.json',
    '12-critic-pass.json',
    '13-root-finish.json',
];

export type StepDiagnosticInput = Partial<
    Pick<
        MJAIAgentRunStepEntityExtended,
        | 'StepName'
        | 'StepNumber'
        | 'StepType'
        | 'Status'
        | 'ErrorMessage'
        | 'FinalPayloadValidationResult'
        | 'FinalPayloadValidationMessages'
        | 'InputData'
        | 'OutputData'
        | 'SubAgentRun'
    >
> & {
    Agent?: string | null;
};

export interface RunDiagnosticInput {
    Agent?: string | null;
    AgentID?: string | null;
    Steps?: ReadonlyArray<StepDiagnosticInput> | null;
}

export interface StepDiagnostic {
    StepName: string;
    Agent: string;
    Message: string;
}

function parseJsonObject(raw: unknown): Record<string, unknown> | undefined {
    if (!raw) {
        return undefined;
    }
    if (typeof raw === 'object') {
        return raw as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
        try {
            const parsed: unknown = JSON.parse(raw);
            return typeof parsed === 'object' && parsed !== null
                ? (parsed as Record<string, unknown>)
                : undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

function resolveStepAgentName(
    step: StepDiagnosticInput,
    run?: RunDiagnosticInput | null,
    defaultAgent?: string,
): string {
    if (step.Agent?.trim()) {
        return step.Agent.trim();
    }
    const inputObj = parseJsonObject(step.InputData);
    const ctx = inputObj?.context as { agentHierarchy?: unknown } | undefined;
    if (Array.isArray(ctx?.agentHierarchy) && ctx.agentHierarchy.length > 0) {
        const last = ctx.agentHierarchy[ctx.agentHierarchy.length - 1];
        if (typeof last === 'string' && last.trim()) {
            return last.trim();
        }
    }
    if (run?.Agent?.trim()) {
        return run.Agent.trim();
    }
    if (run?.AgentID) {
        try {
            const found = AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, run.AgentID))?.Name?.trim();
            if (found) {
                return found;
            }
        } catch {
            // AIEngine may be uninitialized in unit tests without a DB.
        }
    }
    return defaultAgent ?? 'unknown';
}

/**
 * Returns the first step of a run with a non-empty error or a `Retry` rewrite:
 * `{ StepName, Agent, Message }`, or `null` when every step succeeded without retry/error.
 */
export function FirstFailedOrRetryStep(
    runOrSteps: RunDiagnosticInput | ReadonlyArray<StepDiagnosticInput> | null | undefined,
    defaultAgent?: string,
): StepDiagnostic | null {
    if (!runOrSteps) {
        return null;
    }
    const isArray = Array.isArray(runOrSteps);
    const run: RunDiagnosticInput | undefined = isArray ? undefined : (runOrSteps as RunDiagnosticInput);
    const steps: ReadonlyArray<StepDiagnosticInput> = isArray
        ? (runOrSteps as ReadonlyArray<StepDiagnosticInput>)
        : (run?.Steps ?? []);

    for (const step of steps) {
        const outputObj = parseJsonObject(step.OutputData);
        const nextStepObj =
            typeof outputObj?.nextStep === 'object' && outputObj.nextStep !== null
                ? (outputObj.nextStep as Record<string, unknown>)
                : undefined;
        const nextStepKind =
            typeof nextStepObj?.step === 'string'
                ? nextStepObj.step
                : typeof nextStepObj?.type === 'string'
                  ? nextStepObj.type
                  : undefined;
        const nextStepError =
            typeof nextStepObj?.errorMessage === 'string' ? nextStepObj.errorMessage.trim() : '';
        const nextStepRetryInstructions =
            typeof nextStepObj?.retryInstructions === 'string' ? nextStepObj.retryInstructions.trim() : '';
        const nextStepMessage =
            typeof nextStepObj?.message === 'string'
                ? nextStepObj.message.trim()
                : typeof nextStepObj?.reason === 'string'
                  ? nextStepObj.reason.trim()
                  : '';

        const subAgentResult =
            typeof outputObj?.subAgentResult === 'object' && outputObj.subAgentResult !== null
                ? (outputObj.subAgentResult as Record<string, unknown>)
                : undefined;
        const subAgentFailedMsg =
            subAgentResult?.success === false && typeof subAgentResult.errorMessage === 'string'
                ? subAgentResult.errorMessage.trim()
                : '';

        const stepError = typeof step.ErrorMessage === 'string' ? step.ErrorMessage.trim() : '';
        const validationMsg =
            typeof step.FinalPayloadValidationMessages === 'string'
                ? step.FinalPayloadValidationMessages.trim()
                : '';
        const isRetryRewrite =
            nextStepKind === 'Retry' ||
            step.FinalPayloadValidationResult === 'Retry' ||
            Boolean(nextStepRetryInstructions);
        const hasError =
            Boolean(stepError) ||
            Boolean(nextStepError) ||
            Boolean(subAgentFailedMsg) ||
            step.Status === 'Failed' ||
            step.FinalPayloadValidationResult === 'Fail';

        if (isRetryRewrite || hasError) {
            const StepName =
                step.StepName?.trim() ||
                (step.StepNumber != null ? `Step ${step.StepNumber}` : step.StepType ?? 'unknown');
            const Agent = resolveStepAgentName(step, run, defaultAgent);
            const Message =
                nextStepError ||
                nextStepRetryInstructions ||
                stepError ||
                validationMsg ||
                subAgentFailedMsg ||
                nextStepMessage ||
                (isRetryRewrite ? 'Retry rewrite' : `Status=${step.Status ?? 'Failed'}`);
            return { StepName, Agent, Message };
        }
    }
    return null;
}

function formatRunDiagnostic(
    run: MJAIAgentRunEntityExtended | RunDiagnosticInput | null | undefined,
    defaultAgent?: string,
): string {
    if (!run) {
        return '';
    }
    const parts: string[] = [];
    const primary = FirstFailedOrRetryStep(run, defaultAgent);
    if (primary) {
        parts.push(`[${primary.Agent} :: ${primary.StepName}: ${primary.Message}]`);
    }
    for (const step of run.Steps ?? []) {
        if (step.SubAgentRun) {
            const childDiag = FirstFailedOrRetryStep(
                step.SubAgentRun,
                step.StepName?.trim() || 'Video Studio',
            );
            if (childDiag) {
                parts.push(`child [${childDiag.Agent} :: ${childDiag.StepName}: ${childDiag.Message}]`);
            }
        }
    }
    return parts.length > 0 ? ` (${parts.join('; ')})` : '';
}

const STEP_DIAGNOSTIC_FIELDS: string[] = [
    'StepName',
    'StepNumber',
    'StepType',
    'Status',
    'ErrorMessage',
    'FinalPayloadValidationResult',
    'FinalPayloadValidationMessages',
    'InputData',
    'OutputData',
];

async function loadChildStepDiagnostic(
    rv: RunView,
    childRunId: string,
    user: IntegrationCheckContext['User'],
    defaultAgent: string = 'Video Studio',
): Promise<StepDiagnostic | null> {
    const stepsRes = await rv.RunView<StepDiagnosticInput>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${EscapeSQLString(childRunId)}'`,
        OrderBy: 'StepNumber',
        Fields: STEP_DIAGNOSTIC_FIELDS,
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    if (!stepsRes.Success) {
        return {
            StepName: 'RunView(MJ: AI Agent Run Steps)',
            Agent: defaultAgent,
            Message: `step lookup failed: ${stepsRes.ErrorMessage}`,
        };
    }
    if (!stepsRes.Results?.length) {
        return null;
    }
    return FirstFailedOrRetryStep(stepsRes.Results, defaultAgent);
}

export const VideoStudioProductionChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.VSP1`,
        Name: 'VSP1: Standalone Social Short under Draft reaches Delivered, passes G1..G6, persists MP4/poster/contact-sheet in MJ: Files, and leaves InlineBase64 unset',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            f.Render.Driver.RenderCallCount = 0;
            f.VideoGen.Driver.ResetSubmits();
            armScriptFromFiles(f, HAPPY_PATH_13_STEPS);

            const draftPreset = resolveAgentPreset(f.VideoStudioAgent, 'Draft');
            const runner = new AgentRunner(ctx.Provider);
            const result = await runner.RunAgent<VideoGenerationSpec>({
                agent: f.VideoStudioAgent,
                conversationMessages: UserTurn('Create a 15-second Social Short video.'),
                payload: seedInlineArrSpec() as VideoGenerationSpec,
                configurationId: draftPreset?.AIConfigurationID ?? undefined,
                contextUser: ctx.User,
                CredentialScope: 'RuntimeOnly',
                apiKeys: runtimeApiKeys(f),
            });
            await settle(SETTLE_MS);

            if (result.agentRun?.ID) {
                f.RootRunIDs.push(result.agentRun.ID);
            }
            const spec = result.payload as VideoGenerationSpec | undefined;
            collectSpecCleanupIds(spec, f);

            const vsp1Diag = formatRunDiagnostic(result.agentRun, 'Video Studio');
            AssertEqual(
                result.success,
                true,
                `VSP1: RunAgent failed: ${result.agentRun?.ErrorMessage ?? 'unknown'}${vsp1Diag}`,
            );
            Assert(Boolean(spec), 'VSP1: result.payload must be defined');
            AssertEqual(spec!.Status, 'Delivered', `VSP1: VideoGenerationSpec.Status must be Delivered${vsp1Diag}`);

            const gates = spec!.Review?.Gates ?? [];
            for (const gateId of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const) {
                const gateRecord = gates.find((g) => g.Gate === gateId);
                AssertEqual(gateRecord?.Status, 'Passed', `VSP1: Gate ${gateId} must pass`);
            }

            const video16x9 = spec!.Output?.Videos?.['16:9'];
            const mp4FileId = video16x9?.FileID;
            const posterFileId = spec!.Output?.PosterFileID;
            const contactSheetFileId =
                spec!.Review?.Rounds?.[0]?.ContactSheetFileIDs?.['16:9']?.[0] ??
                spec!.Output?.ContactSheetFileIDs?.['16:9']?.[0];

            Assert(Boolean(mp4FileId), 'VSP1: Output.Videos["16:9"].FileID must be set');
            Assert(Boolean(posterFileId), 'VSP1: Output.PosterFileID must be set');
            Assert(Boolean(contactSheetFileId), 'VSP1: ContactSheetFileIDs["16:9"][0] must be set');
            Assert(!video16x9?.InlineBase64, 'VSP1: Output.Videos["16:9"].InlineBase64 must be unset');

            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const quotedIds = [mp4FileId!, posterFileId!, contactSheetFileId!]
                .map((id) => `'${EscapeSQLString(id)}'`)
                .join(',');
            const fileRes = await rv.RunView<{ ID: string; Name: string; ContentType: string }>({
                EntityName: 'MJ: Files',
                ExtraFilter: `ID IN (${quotedIds})`,
                Fields: ['ID', 'Name', 'ContentType'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(
                fileRes.Success && fileRes.Results.length === 3,
                `VSP1: MP4, poster, and contact sheet FileIDs must resolve in MJ: Files (found ${fileRes.Results?.length ?? 0})`,
            );

            // Assert 0 MJ: AI Agent Run Medias rows across the run tree hold inline MP4 bytes
            const treeIds = result.agentRun?.ID
                ? await CollectRunTree(ctx.Provider, ctx.User, result.agentRun.ID)
                : [];
            if (treeIds.length > 0) {
                const quotedTree = treeIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
                const mediaRes = await rv.RunView<{ ID: string; MimeType: string | null }>({
                    EntityName: 'MJ: AI Agent Run Medias',
                    ExtraFilter: `AgentRunID IN (${quotedTree}) AND InlineData IS NOT NULL`,
                    Fields: ['ID', 'MimeType'],
                    ResultType: 'simple',
                    BypassCache: true,
                }, ctx.User);
                const inlineMp4s = (mediaRes.Results ?? []).filter((m) =>
                    (m.MimeType ?? '').toLowerCase().includes('mp4'),
                );
                AssertEqual(inlineMp4s.length, 0, 'VSP1: MJ: AI Agent Run Medias rows with InlineData for MP4');
            }

            AssertEqual(f.Render.Driver.RenderCallCount, 1, 'VSP1: FakeRenderDriver.RenderCallCount');
            AssertEqual(f.Llm.CallCount, 13, 'VSP1: TestLLM.CallCount');
        },
    },
    {
        Id: `${BUNDLE}.VSP2`,
        Name: 'VSP2: Related agent (IT: VS Data Caller) invokes Video Studio over Query Builder relationship contract, resolves Standard preset, maps DataSnapshot.Inline.caller, and bubbles fileOutputs',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            f.Render.Driver.RenderCallCount = 0;
            f.VideoGen.Driver.ResetSubmits();

            armScriptFromFiles(f, [
                'caller-01-to-video-studio.json',
                '01-root-to-director.json',
                '02-director-caller.json',
                '03-root-to-art-director.json',
                '04-art-director.json',
                '05-root-to-storyboard.json',
                '06-storyboard.json',
                '07-root-to-pre-production.json',
                '08-root-to-motion-engineer.json',
                '09-motion-engineer.json',
                '10-root-to-render.json',
                '11-root-to-critic.json',
                '12-critic-pass.json',
                '13-root-finish.json',
                'caller-02-finish.json',
            ]);

            const standardPreset = resolveAgentPreset(f.VideoStudioAgent, 'Standard');
            const runner = new AgentRunner(ctx.Provider);
            const result = await runner.RunAgent<Record<string, unknown>>({
                agent: f.CallerAgent,
                conversationMessages: UserTurn('Render a Social Short video for our Q3 revenue breakdown.'),
                contextUser: ctx.User,
                CredentialScope: 'RuntimeOnly',
                apiKeys: runtimeApiKeys(f),
            });
            await settle(SETTLE_MS);

            if (result.agentRun?.ID) {
                f.RootRunIDs.push(result.agentRun.ID);
            }

            // Inspect the child Video Studio run row before asserting caller success so child diagnostics are included on failure
            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const childRunsRes = result.agentRun?.ID
                ? await rv.RunView<{
                      ID: string;
                      ConfigurationID: string | null;
                      FinalPayload: string | null;
                  }>({
                      EntityName: 'MJ: AI Agent Runs',
                      ExtraFilter: `ParentRunID='${EscapeSQLString(result.agentRun.ID)}' AND AgentID='${EscapeSQLString(f.VideoStudioAgent.ID)}'`,
                      Fields: ['ID', 'ConfigurationID', 'FinalPayload'],
                      ResultType: 'simple',
                      BypassCache: true,
                  }, ctx.User)
                : undefined;

            let vsp2Diag = formatRunDiagnostic(result.agentRun, 'IT: VS Data Caller');
            if (!result.success && childRunsRes?.Success && childRunsRes.Results[0]?.ID) {
                const childStepDiag = await loadChildStepDiagnostic(
                    rv,
                    childRunsRes.Results[0].ID,
                    ctx.User,
                    'Video Studio',
                );
                if (childStepDiag) {
                    const formattedChild = `child [${childStepDiag.Agent} :: ${childStepDiag.StepName}: ${childStepDiag.Message}]`;
                    vsp2Diag = vsp2Diag
                        ? `${vsp2Diag.slice(0, -1)}; ${formattedChild})`
                        : ` (${formattedChild})`;
                }
            }
            AssertEqual(
                result.success,
                true,
                `VSP2: Caller RunAgent failed: ${result.agentRun?.ErrorMessage ?? 'unknown'}${vsp2Diag}`,
            );

            Assert(
                Boolean(childRunsRes?.Success && childRunsRes.Results.length === 1),
                'VSP2: Child Video Studio agent run must exist under caller run',
            );
            const childRun = childRunsRes!.Results[0];
            Assert(
                Boolean(standardPreset?.AIConfigurationID),
                'VSP2: Video Studio Standard preset must define AIConfigurationID in metadata',
            );
            Assert(
                UUIDsEqual(childRun.ConfigurationID, standardPreset!.AIConfigurationID),
                `VSP2: Child Video Studio run ConfigurationID (${childRun.ConfigurationID}) must match Video Studio Standard preset (${standardPreset!.AIConfigurationID})`,
            );

            const childSpec = childRun.FinalPayload
                ? (JSON.parse(childRun.FinalPayload) as VideoGenerationSpec)
                : undefined;
            collectSpecCleanupIds(childSpec, f);
            Assert(Boolean(childSpec), 'VSP2: Child Video Studio run FinalPayload must parse to VideoGenerationSpec');

            const callerInline = (childSpec!.DataSnapshot?.Inline as Record<string, unknown> | undefined)?.caller as
                | { rows?: Array<Record<string, unknown>> }
                | undefined;
            Assert(Array.isArray(callerInline?.rows), 'VSP2: DataSnapshot.Inline.caller.rows must be populated');
            AssertEqual(callerInline!.rows!.length, 2, 'VSP2: DataSnapshot.Inline.caller.rows length');

            const callerPayload = (result.payload ?? {}) as {
                video?: {
                    Status?: string;
                    Videos?: Partial<Record<VideoFormat, { FileID?: string }>>;
                    PosterFileID?: string;
                    HumanReviewNotes?: string;
                };
            };
            const mappedVideo = callerPayload.video;
            Assert(Boolean(mappedVideo), 'VSP2: caller payload.video must be populated by SubAgentOutputMapping');
            AssertEqual(mappedVideo!.Status, 'Delivered', 'VSP2: caller payload.video.Status must be Delivered');
            const mappedMp4FileId = mappedVideo!.Videos?.['16:9']?.FileID;
            Assert(Boolean(mappedMp4FileId), 'VSP2: caller payload.video.Videos["16:9"].FileID must be set');

            const fileOutputs = result.fileOutputs ?? [];
            Assert(fileOutputs.length >= 1, 'VSP2: result.fileOutputs must bubble up at least the MP4 deliverable');
            Assert(
                fileOutputs.some((fo) => UUIDsEqual(fo.fileId, mappedMp4FileId)),
                'VSP2: result.fileOutputs must include mapped Videos["16:9"].FileID',
            );
            AssertEqual(f.Llm.CallCount, 15, 'VSP2: TestLLM.CallCount');
        },
    },
    {
        Id: `${BUNDLE}.VSP3`,
        Name: 'VSP3: Produce Video action invokes Video Studio headlessly, persists a Video Production artifact, and populates output Params',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            f.Render.Driver.RenderCallCount = 0;
            f.VideoGen.Driver.ResetSubmits();
            f.Tts.Driver.CallCount = 0;

            armScriptFromFiles(f, [
                '01-root-to-director.json',
                '02-director-action.json',
                '03-root-to-art-director.json',
                '04-art-director.json',
                '05-root-to-storyboard.json',
                '06-storyboard.json',
                '07-root-to-pre-production.json',
                '08-root-to-motion-engineer.json',
                '09-motion-engineer.json',
                '10-root-to-render.json',
                '11-root-to-critic.json',
                '12-critic-pass.json',
                '13-root-finish.json',
            ]);

            await ActionEngineServer.Instance.Config(false, ctx.User);
            const action = ActionEngineServer.Instance.Actions.find((a) => a.Name?.trim() === 'Produce Video');
            Assert(Boolean(action), 'VSP3: Produce Video action must exist in metadata');

            const params = new RunActionParams();
            params.Action = action!;
            params.ContextUser = ctx.User;
            params.Provider = ctx.Provider;
            params.SkipActionLog = true;
            params.CredentialScope = 'Any';
            params.Params = [
                { Name: 'Topic', Type: 'Input', Value: '15-second Social Short' },
                { Name: 'Archetype', Type: 'Input', Value: 'Social Short' },
                { Name: 'DurationSeconds', Type: 'Input', Value: 15 },
                { Name: 'PowerLevel', Type: 'Input', Value: 'Draft' },
            ];

            const vsp3StartIso = new Date().toISOString();
            const actionResult = await ActionEngineServer.Instance.RunAction(params);
            await settle(SETTLE_MS);

            const getOut = (name: string): unknown =>
                params.Params.find((p) => p.Name === name)?.Value;

            const agentRunId = getOut('AgentRunID') as string | undefined;
            const artifactId = getOut('ArtifactID') as string | undefined;
            const artifactVersionId = getOut('ArtifactVersionID') as string | undefined;
            const videoFileIds = getOut('VideoFileIDs') as Partial<Record<VideoFormat, string>> | undefined;
            const posterFileId = getOut('PosterFileID') as string | undefined;

            if (agentRunId) {
                f.RootRunIDs.push(agentRunId);
            }
            if (artifactId) {
                f.ArtifactIDs.push(artifactId);
            }
            if (artifactVersionId) {
                f.ArtifactVersionIDs.push(artifactVersionId);
            }

            const rv = RunView.FromMetadataProvider(ctx.Provider);
            let vsp3Diag = '';
            if (!actionResult.Success && agentRunId) {
                const childStepDiag = await loadChildStepDiagnostic(
                    rv,
                    agentRunId,
                    ctx.User,
                    'Video Studio',
                );
                if (childStepDiag) {
                    vsp3Diag = ` (child [${childStepDiag.Agent} :: ${childStepDiag.StepName}: ${childStepDiag.Message}])`;
                }
            }

            AssertEqual(
                actionResult.Success,
                true,
                `VSP3: Produce Video action failed: ${actionResult.Message ?? 'unknown'}${vsp3Diag}`,
            );
            AssertEqual(actionResult.ResultCode, 'SUCCESS', 'VSP3: Produce Video ResultCode');

            Assert(Boolean(agentRunId), 'VSP3: AgentRunID output param must be populated');
            Assert(Boolean(artifactId), 'VSP3: ArtifactID output param must be populated');
            Assert(Boolean(artifactVersionId), 'VSP3: ArtifactVersionID output param must be populated');
            Assert(Boolean(videoFileIds?.['16:9']), 'VSP3: VideoFileIDs["16:9"] output param must be populated');
            Assert(Boolean(posterFileId), 'VSP3: PosterFileID output param must be populated');

            const artRes = await rv.RunView<{ ID: string; Type: string }>({
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID='${EscapeSQLString(artifactId!)}'`,
                Fields: ['ID', 'Type'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(artRes.Success && artRes.Results.length === 1, 'VSP3: MJ: Artifacts row must exist');
            AssertEqual(artRes.Results[0].Type, 'Video Production', 'VSP3: Artifact Type must be Video Production');

            const verRes = await rv.RunView<{ ID: string; Content: string | null }>({
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID='${EscapeSQLString(artifactVersionId!)}'`,
                Fields: ['ID', 'Content'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(verRes.Success && verRes.Results.length === 1, 'VSP3: MJ: Artifact Versions row must exist');
            const versionSpec = JSON.parse(verRes.Results[0].Content ?? '{}') as VideoGenerationSpec;
            collectSpecCleanupIds(versionSpec, f);

            AssertEqual(versionSpec.Status, 'Delivered', 'VSP3: Saved artifact version Status');
            AssertEqual(
                versionSpec.Output?.Videos?.['16:9']?.FileID,
                videoFileIds!['16:9'],
                'VSP3: Saved artifact version Output.Videos["16:9"].FileID must match VideoFileIDs["16:9"]',
            );
            AssertEqual(
                versionSpec.Output?.PosterFileID,
                posterFileId,
                'VSP3: Saved artifact version Output.PosterFileID must match PosterFileID',
            );

            // Verify every prompt run in the action's agent run tree used a model handled by the fake drivers
            const actionRunTreeIds = await CollectRunTree(ctx.Provider, ctx.User, agentRunId!);
            const stepPromptRunIds = await ResolvePromptRunIdsForAgentRuns(actionRunTreeIds, ctx.User, ctx.Provider);
            const stageAgentIds = VIDEO_STUDIO_STAGE_AGENT_NAMES
                .map((name) => AIEngine.Instance.GetAgentByName(name)?.ID)
                .filter((id): id is string => Boolean(id));
            const filterParts: string[] = [];
            if (stepPromptRunIds.length > 0) {
                const quotedStepPrIds = stepPromptRunIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
                filterParts.push(`ID IN (${quotedStepPrIds})`);
            }
            if (stageAgentIds.length > 0) {
                const quotedStageIds = stageAgentIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
                filterParts.push(`(AgentID IN (${quotedStageIds}) AND __mj_CreatedAt >= '${vsp3StartIso}')`);
            }
            const actionPrRes = await rv.RunView<{ ID: string; ModelID: string | null; VendorID: string | null }>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: filterParts.join(' OR '),
                Fields: ['ID', 'ModelID', 'VendorID'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(
                actionPrRes.Success && actionPrRes.Results.length >= 13,
                `VSP3: Expected at least 13 prompt runs in action agent run tree, got ${actionPrRes.Results.length}`,
            );
            const allowedUpper = new Set(f.AllowedDriverClasses.map((d) => d.trim().toUpperCase()));
            const allowedVendorsByModel = new UUIDMap<UUIDSet>();
            for (const mv of AIEngine.Instance.ModelVendors) {
                if (!allowedUpper.has((mv.DriverClass ?? '').trim().toUpperCase())) {
                    continue;
                }
                let vendorSet = allowedVendorsByModel.Get(mv.ModelID);
                if (!vendorSet) {
                    vendorSet = new UUIDSet();
                    allowedVendorsByModel.Set(mv.ModelID, vendorSet);
                }
                vendorSet.Add(mv.VendorID);
            }
            for (const pr of actionPrRes.Results) {
                Assert(Boolean(pr.ModelID), `VSP3: PromptRun ${pr.ID} must have a ModelID`);
                Assert(Boolean(pr.VendorID), `VSP3: PromptRun ${pr.ID} must have a VendorID`);
                Assert(
                    allowedVendorsByModel.Get(pr.ModelID)?.Has(pr.VendorID) === true,
                    `VSP3: PromptRun ${pr.ID} (ModelID ${pr.ModelID}, VendorID ${pr.VendorID}) must be served by a registered fake driver`,
                );
            }
            AssertEqual(f.Render.Driver.RenderCallCount, 1, 'VSP3: FakeRenderDriver RenderCallCount');
            AssertEqual(f.VideoGen.Driver.SubmitCount, 0, 'VSP3: FakeVideoGenerator SubmitCount');
            Assert(f.Tts.Driver.CallCount >= 1, 'VSP3: FakeTextToSpeech CallCount must be >= 1');
            AssertEqual(f.Llm.CallCount, 13, 'VSP3: TestLLM.CallCount');
        },
    },
    {
        Id: `${BUNDLE}.VSP4`,
        Name: 'VSP4: Disclosed generated clip exercises AIVideoRunner, records PromptRunID cost and GenerationProvenance, emits HumanReviewNotes disclosure, and saves MJ: Artifacts',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            f.Render.Driver.RenderCallCount = 0;
            f.VideoGen.Driver.ResetSubmits();
            f.VideoGen.Driver.Arm({
                JobID: 'it151-vsp4-job',
                DurationSeconds: 4,
            });

            armScriptFromFiles(f, [
                '01-root-to-director.json',
                '02-director-gen-clip.json',
                '03-root-to-art-director.json',
                '04-art-director.json',
                '05-root-to-storyboard.json',
                '06-storyboard.json',
                '07-root-to-pre-production.json',
                '08-root-to-motion-engineer.json',
                '09-motion-engineer.json',
                '10-root-to-render.json',
                '11-root-to-critic.json',
                '12-critic-pass.json',
                '13-root-finish.json',
            ]);

            const draftPreset = resolveAgentPreset(f.VideoStudioAgent, 'Draft');
            const runner = new AgentRunner(ctx.Provider);
            const result = await runner.RunAgent<VideoGenerationSpec>({
                agent: f.VideoStudioAgent,
                conversationMessages: UserTurn('Create a 15-second Social Short with a 4s generative hero B-roll clip.'),
                payload: seedInlineArrSpec() as VideoGenerationSpec,
                configurationId: draftPreset?.AIConfigurationID ?? undefined,
                contextUser: ctx.User,
                CredentialScope: 'RuntimeOnly',
                apiKeys: runtimeApiKeys(f),
            });
            await settle(SETTLE_MS);

            if (result.agentRun?.ID) {
                f.RootRunIDs.push(result.agentRun.ID);
            }
            const spec = result.payload as VideoGenerationSpec | undefined;
            collectSpecCleanupIds(spec, f);

            const vsp4Diag = formatRunDiagnostic(result.agentRun, 'Video Studio');
            AssertEqual(
                result.success,
                true,
                `VSP4: RunAgent failed: ${result.agentRun?.ErrorMessage ?? 'unknown'}${vsp4Diag}`,
            );
            AssertEqual(f.VideoGen.Driver.SubmitCount, 1, 'VSP4: FakeVideoGenerator SubmitCount must be 1');

            const genAsset = spec?.Assets?.Approved?.find((a) => a.Key === 'hero_broll');
            Assert(Boolean(genAsset), 'VSP4: Approved asset hero_broll must exist');
            AssertEqual(genAsset!.Provenance, 'Generated', 'VSP4: hero_broll Provenance must be Generated');
            const promptRunId = genAsset!.Generation?.PromptRunID;
            Assert(Boolean(promptRunId), 'VSP4: hero_broll Generation.PromptRunID must be recorded');

            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const prRes = await rv.RunView<{ ID: string; Status: string; OutputUnitsUsed: number | null; Cost: number | null; TotalCost: number | null }>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `ID='${EscapeSQLString(promptRunId!)}'`,
                Fields: ['ID', 'Status', 'OutputUnitsUsed', 'Cost', 'TotalCost'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(prRes.Success && prRes.Results.length === 1, `VSP4: PromptRun ${promptRunId} must exist in MJ: AI Prompt Runs`);
            AssertEqual(prRes.Results[0].Status, 'Completed', 'VSP4: Generative video PromptRun Status');
            AssertEqual(Number(prRes.Results[0].OutputUnitsUsed), 4, 'VSP4: Generative video OutputUnitsUsed (4s)');
            const recordedCost = Number(prRes.Results[0].TotalCost ?? prRes.Results[0].Cost ?? 0);
            Assert(recordedCost > 0, `VSP4: Generative video Cost/TotalCost must be > 0, got ${recordedCost}`);

            AssertEqual(
                spec!.Output?.GenerationProvenance?.TotalVideoSeconds,
                4,
                'VSP4: Output.GenerationProvenance.TotalVideoSeconds must be 4',
            );
            Assert(
                (spec!.Review?.HumanReviewNotes ?? '').includes('AI-generated assets (1)'),
                `VSP4: Review.HumanReviewNotes must include 'AI-generated assets (1)', got: ${spec!.Review?.HumanReviewNotes}`,
            );

            const artifactInfo = await runner.ProcessAgentArtifacts(result, undefined, undefined, ctx.User, ctx.Provider);
            Assert(Boolean(artifactInfo?.artifactId), 'VSP4: ProcessAgentArtifacts must create an MJ: Artifacts record');
            if (artifactInfo?.artifactId) {
                f.ArtifactIDs.push(artifactInfo.artifactId);
            }
            if (artifactInfo?.versionId) {
                f.ArtifactVersionIDs.push(artifactInfo.versionId);
            }

            const versionRes = await rv.RunView<{ ID: string; Content: string | null }>({
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID='${EscapeSQLString(artifactInfo!.versionId)}'`,
                Fields: ['ID', 'Content'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(versionRes.Success && versionRes.Results.length === 1, 'VSP4: MJ: Artifact Versions row must exist');
            const parsedArtifact = JSON.parse(versionRes.Results[0].Content ?? '{}') as VideoGenerationSpec;
            AssertEqual(parsedArtifact.Status, 'Delivered', 'VSP4: Saved artifact Content Status must be Delivered');
            AssertEqual(
                parsedArtifact.Output?.GenerationProvenance?.TotalVideoSeconds,
                4,
                'VSP4: Saved artifact GenerationProvenance.TotalVideoSeconds must be 4',
            );
            Assert(
                (parsedArtifact.Review?.HumanReviewNotes ?? '').includes('AI-generated assets (1)'),
                'VSP4: Saved artifact HumanReviewNotes must include AI-generated assets (1)',
            );
            AssertEqual(f.Llm.CallCount, 13, 'VSP4: TestLLM.CallCount');
        },
    },
    {
        Id: `${BUNDLE}.VSP5`,
        Name: 'VSP5: Guards before spend: (a) NeverInvent blocks synthetic depiction of real people and (b) Draft 20s cap blocks a 25s request at Gate G2 with zero vendor/render calls',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            const draftPreset = resolveAgentPreset(f.VideoStudioAgent, 'Draft');
            const runner = new AgentRunner(ctx.Provider);
            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const genPrompt = AIEngine.Instance.Prompts.find(
                (p) => p.Name?.trim() === AIVideoRunner.GENERATIVE_PROMPT_NAME,
            );
            Assert(
                Boolean(genPrompt),
                `VSP5: Canonical generative video prompt '${AIVideoRunner.GENERATIVE_PROMPT_NAME}' must exist in metadata`,
            );

            // (a) NeverInvent subject guard ("our CEO speaking" against NeverInvent: ['real people'])
            const caseAStartIso = new Date().toISOString();
            f.Render.Driver.RenderCallCount = 0;
            f.VideoGen.Driver.ResetSubmits();
            armScriptFromFiles(f, [
                '01-root-to-director.json',
                '02-director-never-invent.json',
                '03-root-to-art-director.json',
                '04-art-director.json',
                '05-root-to-storyboard.json',
                '06-storyboard.json',
                '07-root-to-pre-production.json',
                '08-root-blocked-ask.json',
            ]);

            const resultA = await runner.RunAgent<VideoGenerationSpec>({
                agent: f.VideoStudioAgent,
                conversationMessages: UserTurn('Create a Social Short with a generated clip of our CEO speaking.'),
                payload: seedInlineArrSpec() as VideoGenerationSpec,
                configurationId: draftPreset?.AIConfigurationID ?? undefined,
                contextUser: ctx.User,
                CredentialScope: 'RuntimeOnly',
                apiKeys: runtimeApiKeys(f),
            });
            await settle(SETTLE_MS);

            if (resultA.agentRun?.ID) {
                f.RootRunIDs.push(resultA.agentRun.ID);
            }
            const specA = resultA.payload as VideoGenerationSpec | undefined;
            collectSpecCleanupIds(specA, f);

            const vsp5aDiag = formatRunDiagnostic(resultA.agentRun, 'Video Studio');
            Assert(Boolean(specA), `VSP5(a): result.payload must be defined${vsp5aDiag}`);
            const genReqA = specA!.Assets?.Generate?.[0];
            AssertEqual(genReqA?.Status, 'Blocked', `VSP5(a): Assets.Generate[0].Status must be Blocked${vsp5aDiag}`);
            AssertEqual(specA!.Status, 'Blocked', `VSP5(a): spec.Status must be Blocked${vsp5aDiag}`);
            AssertEqual(resultA.agentRun?.FinalStep, 'Chat', `VSP5(a): agentRun.FinalStep must be Chat${vsp5aDiag}`);
            AssertEqual(f.VideoGen.Driver.SubmitCount, 0, 'VSP5(a): FakeVideoGenerator SubmitCount must be 0');
            AssertEqual(f.Render.Driver.RenderCallCount, 0, 'VSP5(a): FakeRenderDriver RenderCallCount must be 0');
            const genPrResA = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `PromptID='${EscapeSQLString(genPrompt!.ID)}' AND __mj_CreatedAt >= '${EscapeSQLString(caseAStartIso)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(genPrResA.Success, `VSP5(a): PromptRun query failed: ${genPrResA.ErrorMessage}`);
            AssertEqual(genPrResA.Results.length, 0, 'VSP5(a): Zero Video Generation prompt runs must be created');
            AssertEqual(f.Llm.CallCount, 8, 'VSP5(a): TestLLM.CallCount');

            // (b) Draft 20s generated-video duration cap guard (25s requested) refused at Gate G2 before Pre-Production
            const caseBStartIso = new Date().toISOString();
            f.Render.Driver.RenderCallCount = 0;
            f.VideoGen.Driver.ResetSubmits();
            armScriptFromFiles(f, [
                '01-root-to-director.json',
                '02-director-over-cap.json',
                '03-root-to-art-director.json',
                '04-art-director.json',
                '05-root-to-storyboard.json',
                '06-storyboard.json',
                '08-root-blocked-ask.json',
            ]);

            const resultB = await runner.RunAgent<VideoGenerationSpec>({
                agent: f.VideoStudioAgent,
                conversationMessages: UserTurn('Create a Social Short with a 25-second generated background clip.'),
                payload: seedInlineArrSpec() as VideoGenerationSpec,
                configurationId: draftPreset?.AIConfigurationID ?? undefined,
                contextUser: ctx.User,
                CredentialScope: 'RuntimeOnly',
                apiKeys: runtimeApiKeys(f),
            });
            await settle(SETTLE_MS);

            if (resultB.agentRun?.ID) {
                f.RootRunIDs.push(resultB.agentRun.ID);
            }
            const specB = resultB.payload as VideoGenerationSpec | undefined;
            collectSpecCleanupIds(specB, f);

            const vsp5bDiag = formatRunDiagnostic(resultB.agentRun, 'Video Studio');
            Assert(Boolean(specB), `VSP5(b): result.payload must be defined${vsp5bDiag}`);
            const g2GateB = specB!.Review?.Gates?.find((g) => g.Gate === 'G2');
            AssertEqual(g2GateB?.Status, 'Failed', `VSP5(b): Gate G2 Status must be Failed${vsp5bDiag}`);
            Assert(
                (g2GateB?.Notes ?? '').includes('GenerationDurationExceedsLimit'),
                `VSP5(b): Gate G2 Notes must include GenerationDurationExceedsLimit, got: ${g2GateB?.Notes ?? '(empty)'}${vsp5bDiag}`,
            );

            const preProdAgent = loadAgent('Video Studio - Pre-Production');
            const childRunsB = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ParentRunID='${EscapeSQLString(resultB.agentRun!.ID)}' AND AgentID='${EscapeSQLString(preProdAgent.ID)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(childRunsB.Success, `VSP5(b): Child run query failed: ${childRunsB.ErrorMessage}`);
            AssertEqual(
                childRunsB.Results.length,
                0,
                'VSP5(b): Video Studio - Pre-Production must not execute when Gate G2 fails',
            );

            AssertEqual(resultB.agentRun?.FinalStep, 'Chat', `VSP5(b): agentRun.FinalStep must be Chat${vsp5bDiag}`);
            AssertEqual(f.VideoGen.Driver.SubmitCount, 0, 'VSP5(b): FakeVideoGenerator SubmitCount must be 0');
            AssertEqual(f.Render.Driver.RenderCallCount, 0, 'VSP5(b): FakeRenderDriver RenderCallCount must be 0');
            const genPrResB = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `PromptID='${EscapeSQLString(genPrompt!.ID)}' AND __mj_CreatedAt >= '${EscapeSQLString(caseBStartIso)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(genPrResB.Success, `VSP5(b): PromptRun query failed: ${genPrResB.ErrorMessage}`);
            AssertEqual(genPrResB.Results.length, 0, 'VSP5(b): Zero Video Generation prompt runs must be created');
            AssertEqual(f.Llm.CallCount, 7, 'VSP5(b): TestLLM.CallCount');
        },
    },
];

for (const check of VideoStudioProductionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const llm = new TestLLM();
        productionFixture = {
            SetupStartedAtIso: new Date().toISOString(),
            Llm: llm,
            AllowedDriverClasses: [],
            RootRunIDs: [],
            ExtraPromptRunIDs: [],
            FileIDs: [],
            ArtifactIDs: [],
            ArtifactVersionIDs: [],
        };

        LoadVideoStudioAgent();
        LoadProduceVideoAction();
        await AIEngine.Instance.Config(false, ctx.User);
        await AIEngineBase.Instance.Config(false, ctx.User);

        const videoStudioAgent = loadAgent('Video Studio');
        const callerAgent = loadAgent('IT: VS Data Caller');
        productionFixture.VideoStudioAgent = videoStudioAgent;
        productionFixture.CallerAgent = callerAgent;

        // Require the shipped Query Builder -> Video Studio relationship and Video Studio Standard preset in metadata
        const queryBuilderAgent = loadAgent('Query Builder');
        const templateRel = AIEngine.Instance.AgentRelationships.find(
            (r) => UUIDsEqual(r.AgentID, queryBuilderAgent.ID) && UUIDsEqual(r.SubAgentID, videoStudioAgent.ID),
        );
        if (!templateRel) {
            throw new Error(
                `Setup: Shipped 'Query Builder -> Video Studio' relationship row is missing from AIEngine.Instance.AgentRelationships. Push metadata before running ${BUNDLE}.`,
            );
        }
        const standardPreset = resolveAgentPreset(videoStudioAgent, 'Standard');
        if (!standardPreset || !standardPreset.AIConfigurationID) {
            throw new Error(
                `Setup: Shipped 'Video Studio Standard' preset (with AIConfigurationID) is missing from AIEngine.Instance.AgentConfigurations. Push metadata before running ${BUNDLE}.`,
            );
        }

        // Remove any stale runtime relationship row before creating a fresh copy from templateRel
        const existingRel = AIEngine.Instance.AgentRelationships.find(
            (r) => UUIDsEqual(r.AgentID, callerAgent.ID) && UUIDsEqual(r.SubAgentID, videoStudioAgent.ID),
        );
        if (existingRel) {
            await DeleteMatching(
                ctx.Provider,
                ctx.User,
                'MJ: AI Agent Relationships',
                `ID='${EscapeSQLString(existingRel.ID)}'`,
            );
        }

        const relEntity = await ctx.Provider.GetEntityObject<MJAIAgentRelationshipEntity>(
            'MJ: AI Agent Relationships',
            ctx.User,
        );
        relEntity.NewRecord();
        relEntity.AgentID = callerAgent.ID;
        relEntity.SubAgentID = videoStudioAgent.ID;
        relEntity.Status = 'Active';
        relEntity.SubAgentInputMapping = templateRel.SubAgentInputMapping;
        relEntity.SubAgentOutputMapping = templateRel.SubAgentOutputMapping;
        relEntity.SubAgentContextPaths = templateRel.SubAgentContextPaths;
        relEntity.ChatHandlingOption = templateRel.ChatHandlingOption;
        relEntity.ConfigurationPresetID = templateRel.ConfigurationPresetID;
        const saved = await relEntity.Save();
        Assert(saved, `Setup: Failed to save runtime MJ: AI Agent Relationships row: ${relEntity.LatestResult?.CompleteMessage ?? ''}`);
        productionFixture.RuntimeRelationshipID = relEntity.ID;
        await AIEngine.Instance.Config(true, ctx.User);
        await AIEngineBase.Instance.Config(true, ctx.User);

        productionFixture.RestoreLlm = RegisterTestLLM(llm, [...CHAT_DRIVER_CLASSES]);
        productionFixture.Render = UseFakeRenderDriver();
        const videoGen = RegisterFakeVideoGenerator();
        productionFixture.VideoGen = videoGen;
        const tts = RegisterFakeTextToSpeech();
        productionFixture.Tts = tts;
        productionFixture.Storage = await UseMemoryStorage(ctx);

        const allowedDriverClasses = [
            ...CHAT_DRIVER_CLASSES,
            ...videoGen.DriverClasses,
            ...tts.DriverClasses,
        ];
        productionFixture.AllowedDriverClasses = allowedDriverClasses;
        productionFixture.RestoreApiKeys = RegisterFakeAPIKeys(allowedDriverClasses);
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const f = productionFixture;
        productionFixture = undefined;
        if (!f) {
            return;
        }

        f.Llm.Reset();
        f.Llm.SetDefaultOutcome({
            kind: 'fail',
            error: new Error(`The ${BUNDLE} TestLLM is not armed: its bundle has finished`),
        });
        f.RestoreLlm?.();
        f.Render?.restore();
        f.VideoGen?.restore();
        f.Tts?.restore();
        f.RestoreApiKeys?.();

        const rv = RunView.FromMetadataProvider(ctx.Provider);

        // 1. Collect all agent run IDs in the run trees so we can delete MJ: AI Agent Requests first
        const allRunIds = new Set<string>();
        for (const rootId of f.RootRunIDs) {
            try {
                for (const id of await CollectRunTree(ctx.Provider, ctx.User, rootId)) {
                    allRunIds.add(id);
                }
            } catch {
                allRunIds.add(rootId);
            }
        }
        if (allRunIds.size > 0) {
            const quoted = [...allRunIds].map((id) => `'${EscapeSQLString(id)}'`).join(',');
            await DeleteMatching(
                ctx.Provider,
                ctx.User,
                'MJ: AI Agent Requests',
                `OriginatingAgentRunID IN (${quoted}) OR ResumingAgentRunID IN (${quoted})`,
            );
        }

        // 2. Delete agent run trees (steps -> prompt runs -> runs)
        await DeepDeleteRunTrees(ctx.Provider, ctx.User, f.RootRunIDs);

        // 3. Delete any extra prompt runs created by Pre-Production (video gen / TTS) or stage agents during the window
        const uniquePromptRuns = [...new Set(f.ExtraPromptRunIDs)];
        if (uniquePromptRuns.length > 0) {
            const quotedPr = uniquePromptRuns.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            await DeleteMatching(ctx.Provider, ctx.User, 'MJ: AI Prompt Runs', `ID IN (${quotedPr})`);
        }
        const stageAgentIds = AIEngine.Instance.Agents
            .filter((a) => VIDEO_STUDIO_STAGE_AGENT_NAMES.includes(a.Name?.trim() ?? ''))
            .map((a) => `'${EscapeSQLString(a.ID)}'`);
        if (stageAgentIds.length > 0 && f.SetupStartedAtIso) {
            await DeleteMatching(
                ctx.Provider,
                ctx.User,
                'MJ: AI Prompt Runs',
                `AgentID IN (${stageAgentIds.join(',')}) AND __mj_CreatedAt >= '${EscapeSQLString(f.SetupStartedAtIso)}'`,
            );
        }

        // 4. Delete artifact version attributes, artifact versions, permissions, and artifacts created in VSP3 / VSP4
        const versionFilters: string[] = [];
        if (f.ArtifactVersionIDs.length > 0) {
            const quotedVers = [...new Set(f.ArtifactVersionIDs)].map((id) => `'${EscapeSQLString(id)}'`).join(',');
            versionFilters.push(`ID IN (${quotedVers})`);
        }
        if (f.ArtifactIDs.length > 0) {
            const quotedArts = [...new Set(f.ArtifactIDs)].map((id) => `'${EscapeSQLString(id)}'`).join(',');
            versionFilters.push(`ArtifactID IN (${quotedArts})`);
        }
        if (versionFilters.length > 0) {
            const versionsRes = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: versionFilters.join(' OR '),
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            const allVersionIds = new Set<string>([
                ...f.ArtifactVersionIDs,
                ...(versionsRes.Success ? versionsRes.Results.map((r) => r.ID) : []),
            ]);
            if (allVersionIds.size > 0) {
                const quotedAllVers = [...allVersionIds].map((id) => `'${EscapeSQLString(id)}'`).join(',');
                await DeleteMatching(
                    ctx.Provider,
                    ctx.User,
                    'MJ: Artifact Version Attributes',
                    `ArtifactVersionID IN (${quotedAllVers})`,
                );
                await DeleteMatching(
                    ctx.Provider,
                    ctx.User,
                    'MJ: Artifact Versions',
                    `ID IN (${quotedAllVers})`,
                );
            }
        }
        for (const artifactId of f.ArtifactIDs) {
            await DeleteMatching(ctx.Provider, ctx.User, 'MJ: Artifact Versions', `ArtifactID='${EscapeSQLString(artifactId)}'`);
            await DeleteMatching(ctx.Provider, ctx.User, 'MJ: Artifact Permissions', `ArtifactID='${EscapeSQLString(artifactId)}'`);
            await DeleteMatching(ctx.Provider, ctx.User, 'MJ: Artifacts', `ID='${EscapeSQLString(artifactId)}'`);
        }

        // 5. Delete any created MJ: Files rows (by FileIDs or in-memory ProviderKey) before restoring storage
        const fileFilters: string[] = [];
        const uniqueFiles = [...new Set(f.FileIDs)];
        if (uniqueFiles.length > 0) {
            const quotedFiles = uniqueFiles.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            fileFilters.push(`ID IN (${quotedFiles})`);
        }
        const storageKeys = f.Storage?.Driver.Keys ?? [];
        if (storageKeys.length > 0) {
            const quotedKeys = storageKeys.map((k) => `'${EscapeSQLString(k)}'`).join(',');
            fileFilters.push(`ProviderKey IN (${quotedKeys})`);
        }
        if (fileFilters.length > 0) {
            await DeleteMatching(ctx.Provider, ctx.User, 'MJ: Files', fileFilters.join(' OR '));
        }

        // 6. Delete runtime relationship row if created
        if (f.RuntimeRelationshipID) {
            await DeleteMatching(
                ctx.Provider,
                ctx.User,
                'MJ: AI Agent Relationships',
                `ID='${EscapeSQLString(f.RuntimeRelationshipID)}'`,
            );
            await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
            await AIEngineBase.Instance.Config(true, ctx.User).catch(() => undefined);
        }

        // 7. Restore storage (deletes temporary MJ: File Storage Accounts)
        await f.Storage?.restore();
    },
});
