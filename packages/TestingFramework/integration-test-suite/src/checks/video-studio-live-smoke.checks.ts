/**
 * video-studio-live-smoke.checks.ts — the 'video-studio-live-smoke' bundle (VSLS1):
 * live-model + real render-driver smoke check for `Video Studio` (`IT152`).
 *
 * Gated on `RequiresLiveModel: true`. Runs one `Draft` 15-second `Social Short` production through
 * real models and the configured `VideoRenderEngine.Instance.Driver` (no generative clips unless
 * `VS_LIVE_GENERATION=1`). Skips with a loud reason when:
 * 1. `VideoRenderEngine.Instance.Driver.Health()` reports `!Healthy`, or
 * 2. `PreviewModelSelection` on `Video Studio`'s prompt under `Video Studio Draft` finds no
 *    credentialed model candidate.
 */
import { RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AgentRunner } from '@memberjunction/ai-agents';
import type {
    MJAIAgentEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentConfigurationEntity } from '@memberjunction/core-entities';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import {
    LoadVideoStudioAgent,
    VideoRenderEngine,
} from '@memberjunction/video-studio';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    settle,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import { UserTurn } from './agent-live-shared';
import { CollectRunTree, DeepDeleteRunTrees, DeleteMatching } from './_it-live-agent-harness';
import {
    RegisterFakeImageGenerator,
    RegisterFakeVideoGenerator,
} from './video-studio-fakes';

const BUNDLE = 'video-studio-live-smoke';
const SETTLE_MS = Number(process.env.AGENT_LIVE_SETTLE_MS ?? 3000);

interface VideoStudioLiveSmokeFixture {
    RootRunIDs: string[];
    ExtraPromptRunIDs: string[];
    FileIDs: string[];
}

let liveSmokeFixture: VideoStudioLiveSmokeFixture | undefined;

function resolveVideoStudioDraftPreset(agent: MJAIAgentEntityExtended): MJAIAgentConfigurationEntity | undefined {
    return AIEngine.Instance.AgentConfigurations.find(
        (ac) => UUIDsEqual(ac.AgentID, agent.ID) && ac.Name?.trim() === 'Draft' && ac.Status === 'Active',
    );
}

function resolvePrimaryAgentPrompt(agent: MJAIAgentEntityExtended): MJAIPromptEntityExtended | undefined {
    const binding = AIEngine.Instance.AgentPrompts.find((ap) => UUIDsEqual(ap.AgentID, agent.ID));
    if (!binding) {
        return undefined;
    }
    return AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, binding.PromptID));
}

export const VideoStudioLiveSmokeChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.VSLS1`,
        Name: 'VSLS1: Live Draft 15-second Social Short completes end-to-end with real models and real render driver',
        RequiresLiveModel: true,
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            if (!liveSmokeFixture) {
                throw new Error(`${BUNDLE} fixture is not initialized (Setup has not run).`);
            }

            const agent = AIEngine.Instance.Agents.find((a) => a.Name?.trim() === 'Video Studio');
            if (!agent || agent.Status !== 'Active') {
                console.log("      → SKIPPED: 'Video Studio' agent is absent or non-Active in metadata.");
                return;
            }

            // 1. Check render driver health
            const driver = VideoRenderEngine.Instance.Driver;
            const health = await driver.Health();
            if (!health.Healthy) {
                console.log(
                    `      → SKIPPED: VideoRenderEngine driver '${driver.constructor.name}' is not healthy: ${JSON.stringify(health)}`,
                );
                return;
            }

            // 2. Check model credential availability via AIPromptRunner.PreviewModelSelection
            const draftPreset = resolveVideoStudioDraftPreset(agent);
            const prompt = resolvePrimaryAgentPrompt(agent);
            if (!prompt) {
                console.log("      → SKIPPED: 'Video Studio' has no bound primary prompt in metadata.");
                return;
            }
            const candidates = new AIPromptRunner().PreviewModelSelection(
                prompt,
                draftPreset?.AIConfigurationID ?? undefined,
            );
            if (!candidates.some((c) => c.HasCredentials)) {
                console.log(
                    `      → SKIPPED: PreviewModelSelection found no credentialed model candidate for '${prompt.Name}' (${candidates.length} candidate(s) inspected).`,
                );
                return;
            }

            const allowLiveGen = process.env.VS_LIVE_GENERATION === '1';
            const specSeed: Partial<VideoGenerationSpec> = {
                Archetype: { Name: 'Social Short' },
                Film: {
                    OneSentence: 'Onboarding is 42 percent faster.',
                    Audience: 'Social viewers',
                    Purpose: 'Highlight 42 percent faster onboarding',
                    DurationSeconds: 15,
                    Formats: ['9:16'],
                    Language: 'en-US',
                },
                DataSnapshot: {
                    AsOf: '',
                    Sources: [],
                    Inline: {
                        headline_stat: 42,
                        unit: 'percent faster onboarding',
                    },
                },
            };

            const promptText = allowLiveGen
                ? 'Create a 15-second Draft Social Short (9:16) highlighting 42 percent faster onboarding. Keep narration brief.'
                : 'Create a 15-second Draft Social Short (9:16) highlighting 42 percent faster onboarding using motion graphics only (0 generative video clips, no TTS narration).';

            const videoFake = allowLiveGen ? undefined : RegisterFakeVideoGenerator();
            const imageFake = allowLiveGen ? undefined : RegisterFakeImageGenerator();
            videoFake?.Driver.Disarm();

            let result;
            try {
                const runner = new AgentRunner(ctx.Provider);
                result = await runner.RunAgent<VideoGenerationSpec>({
                    agent,
                    conversationMessages: UserTurn(promptText),
                    payload: specSeed as VideoGenerationSpec,
                    configurationId: draftPreset?.AIConfigurationID ?? undefined,
                    contextUser: ctx.User,
                });
                await settle(SETTLE_MS);
            } finally {
                videoFake?.restore();
                imageFake?.restore();
            }

            if (result.agentRun?.ID) {
                liveSmokeFixture.RootRunIDs.push(result.agentRun.ID);
            }
            const spec = result.payload as VideoGenerationSpec | undefined;
            if (spec) {
                for (const asset of spec.Assets?.Approved ?? []) {
                    if (asset.Generation?.PromptRunID) {
                        liveSmokeFixture.ExtraPromptRunIDs.push(asset.Generation.PromptRunID);
                    }
                    if (asset.FileID) {
                        liveSmokeFixture.FileIDs.push(asset.FileID);
                    }
                }
                for (const line of spec.Audio?.Narration?.Script ?? []) {
                    if (line.AudioFileID) {
                        liveSmokeFixture.FileIDs.push(line.AudioFileID);
                    }
                }
                for (const entry of Object.values(spec.Output?.Videos ?? {})) {
                    if (entry?.FileID) {
                        liveSmokeFixture.FileIDs.push(entry.FileID);
                    }
                }
                if (spec.Output?.PosterFileID) {
                    liveSmokeFixture.FileIDs.push(spec.Output.PosterFileID);
                }
                if (spec.Output?.CaptionsFileID) {
                    liveSmokeFixture.FileIDs.push(spec.Output.CaptionsFileID);
                }
                for (const ids of Object.values(spec.Output?.ContactSheetFileIDs ?? {})) {
                    for (const id of ids ?? []) {
                        if (id) {
                            liveSmokeFixture.FileIDs.push(id);
                        }
                    }
                }
            }

            if (!allowLiveGen) {
                AssertEqual(
                    videoFake!.Driver.SubmitCount,
                    0,
                    'VSLS1: Video generator SubmitCount must be 0 when VS_LIVE_GENERATION !== "1"',
                );
                AssertEqual(
                    imageFake!.Driver.SubmitCount,
                    0,
                    'VSLS1: Image generator SubmitCount must be 0 when VS_LIVE_GENERATION !== "1"',
                );
            }

            AssertEqual(result.success, true, `VSLS1: Live Video Studio run failed: ${result.agentRun?.ErrorMessage ?? 'unknown'}`);
            Assert(Boolean(spec), 'VSLS1: result.payload must be populated');
            AssertEqual(spec!.Status, 'Delivered', 'VSLS1: VideoGenerationSpec.Status must be Delivered');

            const mp4Entry = spec!.Output?.Videos?.['9:16'] ?? spec!.Output?.Videos?.['16:9'];
            const mp4FileId = mp4Entry?.FileID;
            Assert(Boolean(mp4FileId), 'VSLS1: Output.Videos MP4 FileID must be populated');

            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const fileRes = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: Files',
                ExtraFilter: `ID='${EscapeSQLString(mp4FileId!)}'`,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                BypassCache: true,
            }, ctx.User);
            Assert(fileRes.Success && fileRes.Results.length === 1, `VSLS1: Mp4FileID ${mp4FileId} must exist in MJ: Files`);

            const actualDuration = mp4Entry?.DurationSeconds ?? 0;
            const targetDuration = spec!.Film?.DurationSeconds ?? 15;
            Assert(
                Math.abs(actualDuration - targetDuration) <= 1,
                `VSLS1: Output.Videos DurationSeconds (${actualDuration}s) must be within 1s of Film.DurationSeconds (${targetDuration}s)`,
            );
        },
    },
];

for (const check of VideoStudioLiveSmokeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        LoadVideoStudioAgent();
        await AIEngine.Instance.Config(false, ctx.User);
        await AIEngineBase.Instance.Config(false, ctx.User);
        liveSmokeFixture = {
            RootRunIDs: [],
            ExtraPromptRunIDs: [],
            FileIDs: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const f = liveSmokeFixture;
        liveSmokeFixture = undefined;
        if (!f) {
            return;
        }

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

        await DeepDeleteRunTrees(ctx.Provider, ctx.User, f.RootRunIDs);

        const uniquePromptRuns = [...new Set(f.ExtraPromptRunIDs)];
        if (uniquePromptRuns.length > 0) {
            const quotedPr = uniquePromptRuns.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            await DeleteMatching(ctx.Provider, ctx.User, 'MJ: AI Prompt Runs', `ID IN (${quotedPr})`);
        }

        const uniqueFiles = [...new Set(f.FileIDs)];
        if (uniqueFiles.length > 0) {
            const quotedFiles = uniqueFiles.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            await DeleteMatching(ctx.Provider, ctx.User, 'MJ: Files', `ID IN (${quotedFiles})`);
        }
    },
});
