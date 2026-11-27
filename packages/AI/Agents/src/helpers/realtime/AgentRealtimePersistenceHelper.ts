/**
 * @fileoverview Cohesive internal collaborator handling realtime prompt-run creation,
 * per-role serialized transcript persistence, audio recording resolution/finalization,
 * and incremental usage checkpointing.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s4`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import type { RealtimeTranscript, RealtimeUsage } from '@memberjunction/ai';
import {
    type AgentConfiguration,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIPromptRunEntityExtended,
    ResolvePromptRunUserID,
} from '@memberjunction/ai-core-plus';
import type {
    MJConversationDetailEntity,
    MJConversationDetailEntityExtended,
} from '@memberjunction/core-entities';
import {
    RealtimeRecordingController,
    type RealtimeRecordingMedia,
} from '../../realtime/realtime-recording-capture';
import {
    ResolveRecordingStorageAccountID,
    StoreRealtimeRecording,
} from '../../realtime/realtime-recording-store';
import type { AgentRunContext } from '../AgentRunContext';

/**
 * Handles realtime observability persistence (long-lived prompt runs, transcript turns,
 * WAV audio recordings, and incremental token/modality usage checkpoints) on behalf of
 * {@link AgentRealtimeHelper}.
 */
export class AgentRealtimePersistenceHelper {
    public async CreateRealtimePromptRun(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        modelResolution: { modelID: string; vendorID: string }
    ): Promise<MJAIPromptRunEntityExtended | null> {
        try {
            const md = params.provider || ctx.ActiveProvider;
            const promptRun = await md.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', params.contextUser);
            promptRun.NewRecord();
            if (config.systemPrompt) {
                promptRun.PromptID = config.systemPrompt.ID;
            }
            promptRun.ModelID = modelResolution.modelID;
            promptRun.VendorID = modelResolution.vendorID || null;
            promptRun.AgentID = params.agent.ID;
            promptRun.UserID = ResolvePromptRunUserID({
                UserID: params.userId,
                AgentRun: ctx.AgentRun,
                ContextUser: params.contextUser,
            });
            promptRun.Status = 'Running';
            promptRun.RunAt = new Date();
            promptRun.StreamingEnabled = true;
            promptRun.Cancelled = false;
            promptRun.CacheHit = false;

            if (!(await promptRun.Save({ SaveReturnMode: 'datestamps_only' }))) {
                ctx.Hooks.LogError(
                    `Failed to create realtime AIPromptRun: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    { agent: params.agent, category: 'RealtimeSession' }
                );
                return null;
            }
            return promptRun;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            ctx.Hooks.LogError(`Error creating realtime AIPromptRun: ${msg}`, {
                agent: params.agent,
                category: 'RealtimeSession',
            });
            return null;
        }
    }

    public PersistRealtimeTranscript(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        transcript: RealtimeTranscript
    ): Promise<string | null> {
        const roleKey = transcript.Role;
        const run = () => this.persistRealtimeTranscriptSerialized(ctx, params, transcript);
        const prior = ctx.RealtimePersistQueues.get(roleKey) ?? Promise.resolve();
        const result = prior.then(run, run);
        ctx.RealtimePersistQueues.set(
            roleKey,
            result.then(
                () => undefined,
                () => undefined
            )
        );
        return result;
    }

    public async FlushRealtimeTranscriptQueues(ctx: AgentRunContext): Promise<void> {
        const pending = [...ctx.RealtimePersistQueues.values()];
        if (pending.length === 0) {
            return;
        }
        await Promise.all(pending);
    }

    private async persistRealtimeTranscriptSerialized(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        transcript: RealtimeTranscript
    ): Promise<string | null> {
        if (!transcript.Text?.trim()) {
            return null;
        }
        const conversationID = params.data?.conversationId as string | undefined;
        if (!conversationID) {
            return null;
        }

        const md = params.provider || ctx.ActiveProvider;
        const roleKey = transcript.Role;
        const mjRole: 'User' | 'AI' = transcript.Role === 'user' ? 'User' : 'AI';

        if (!transcript.IsFinal) {
            if (ctx.RealtimeInFlightTurns.get(roleKey)?.open) {
                return null;
            }
            const detail = await md.GetEntityObject<MJConversationDetailEntityExtended>(
                'MJ: Conversation Details',
                params.contextUser
            );
            detail.NewRecord();
            detail.MarkServerAuthoredReply();
            detail.ConversationID = conversationID;
            detail.Role = mjRole;
            detail.Message = transcript.Text;
            detail.Status = 'In-Progress';
            this.applyRealtimeTurnSpeakerAndMedia(ctx, detail, transcript, params, true);
            if (params.agentSessionID) {
                detail.AgentSessionID = params.agentSessionID;
            }
            if (!(await detail.Save())) {
                ctx.Hooks.LogError(
                    `Failed to create in-progress realtime transcript turn: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    { agent: params.agent, category: 'RealtimeSession' }
                );
                return null;
            }
            ctx.RealtimeInFlightTurns.set(roleKey, { id: detail.ID, open: true });
            return detail.ID;
        }

        const inFlight = ctx.RealtimeInFlightTurns.get(roleKey);
        let detail: MJConversationDetailEntityExtended | null = null;
        if (inFlight && (transcript.ReplacesPrevious || inFlight.open)) {
            const candidate = await md.GetEntityObject<MJConversationDetailEntityExtended>(
                'MJ: Conversation Details',
                params.contextUser
            );
            if (await candidate.Load(inFlight.id)) {
                detail = candidate;
            }
        }
        let created = false;
        if (!detail) {
            detail = await md.GetEntityObject<MJConversationDetailEntityExtended>(
                'MJ: Conversation Details',
                params.contextUser
            );
            detail.NewRecord();
            detail.ConversationID = conversationID;
            detail.Role = mjRole;
            this.applyRealtimeTurnSpeakerAndMedia(ctx, detail, transcript, params, true);
            if (params.agentSessionID) {
                detail.AgentSessionID = params.agentSessionID;
            }
            created = true;
        }
        detail.MarkServerAuthoredReply();
        detail.Message = transcript.Text;
        detail.Status = 'Complete';
        detail.TurnEndedAt = new Date();
        if (ctx.RealtimeRecording) {
            detail.UtteranceEndMs = ctx.RealtimeRecording.NowOffsetMs();
        }
        const saved = await detail.Save();
        if (!saved) {
            ctx.Hooks.LogError(
                `Failed to finalize realtime transcript turn: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                { agent: params.agent, category: 'RealtimeSession' }
            );
        }
        if (saved && detail.ID) {
            ctx.RealtimeInFlightTurns.set(roleKey, { id: detail.ID, open: false });
        }
        return created ? detail.ID : null;
    }

    private applyRealtimeTurnSpeakerAndMedia(
        ctx: AgentRunContext,
        detail: MJConversationDetailEntity,
        transcript: RealtimeTranscript,
        params: ExecuteAgentParams,
        atStart: boolean
    ): void {
        if (transcript.Role === 'user' && params.contextUser?.ID) {
            detail.UserID = params.contextUser.ID;
        }
        if (ctx.RealtimeRecording) {
            detail.MediaType = 'Audio';
            if (atStart) {
                detail.UtteranceStartMs = ctx.RealtimeRecording.NowOffsetMs();
            }
        }
    }

    public async ResolveRealtimeRecording(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<{ controller: RealtimeRecordingController; storageAccountId: string } | null> {
        try {
            const agent = params.agent as MJAIAgentEntityExtended;
            const runtime = (params.data?.recording ?? null) as { media?: string; consent?: boolean } | null;

            const rawMedia = runtime?.media ?? agent.RecordingDefault ?? 'None';
            const media: RealtimeRecordingMedia | 'None' =
                rawMedia === 'Audio' || rawMedia === 'AudioVideo' ? rawMedia : 'None';
            if (media === 'None') {
                return null;
            }

            if (runtime?.consent !== true) {
                ctx.Hooks.LogStatus(
                    '🔴 Realtime recording requested but consent was not granted — recording disabled.',
                    false,
                    params
                );
                return null;
            }

            const storageAccountId = params.contextUser
                ? await ResolveRecordingStorageAccountID(agent, params.contextUser, params.provider || ctx.ActiveProvider)
                : null;
            if (!storageAccountId) {
                ctx.Hooks.LogStatus(
                    '🔴 Realtime recording on but no resolvable storage account (RecordingStorageProviderID/AttachmentStorageProviderID) — recording disabled.',
                    false,
                    params
                );
                return null;
            }

            const controller = new RealtimeRecordingController({ Media: media });
            return { controller, storageAccountId };
        } catch (error) {
            ctx.Hooks.LogError(
                `Failed to resolve realtime recording (recording disabled): ${error instanceof Error ? error.message : String(error)}`,
                { agent: params.agent, category: 'RealtimeSession' }
            );
            return null;
        }
    }

    public async FinalizeRealtimeRecording(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        const controller = ctx.RealtimeRecording;
        if (!controller) {
            return;
        }
        ctx.RealtimeRecording = null;
        const storageAccountId = ctx.RealtimeRecordingAccountId;
        ctx.RealtimeRecordingAccountId = null;

        try {
            controller.Stop();
            const sessionID = params.agentSessionID;
            const contextUser = params.contextUser;
            if (!sessionID || !storageAccountId || !contextUser) {
                return;
            }
            const encoded = controller.EncodeWav();
            if (!encoded) {
                ctx.Hooks.LogStatus('🔇 Realtime session produced no audio to record.', true, params);
                return;
            }

            const md = params.provider || ctx.ActiveProvider;
            const peaks = controller.GetPeaks();
            const stored = await StoreRealtimeRecording({
                Audio: encoded.Buffer,
                MimeType: 'audio/wav',
                Media: controller.Media,
                StartedAt: controller.StartedAt ?? new Date(),
                StorageAccountID: storageAccountId,
                SessionID: sessionID,
                ContextUser: contextUser,
                Provider: md,
                Peaks: peaks.length > 0 ? peaks : undefined,
            });
            if (stored.FileID && !stored.ErrorMessage) {
                ctx.Hooks.LogStatus(
                    `🎬 Realtime recording stored (${Math.round(encoded.DurationMs / 1000)}s, file ${stored.FileID}).`,
                    true,
                    params
                );
            } else {
                ctx.Hooks.LogError(
                    `Failed to store realtime recording for session ${sessionID}: ${stored.ErrorMessage ?? 'no reason reported'}`,
                    { agent: params.agent, category: 'RealtimeSession' }
                );
            }
        } catch (error) {
            ctx.Hooks.LogError(
                `Failed to finalize realtime recording: ${error instanceof Error ? error.message : String(error)}`,
                { agent: params.agent, category: 'RealtimeSession' }
            );
        }
    }

    public async CheckpointRealtimeUsage(
        ctx: AgentRunContext,
        promptRun: MJAIPromptRunEntityExtended | null,
        usage: RealtimeUsage
    ): Promise<void> {
        if (!promptRun) {
            return;
        }
        promptRun.TokensPrompt = usage.InputTokens;
        promptRun.TokensCompletion = usage.OutputTokens;
        promptRun.TokensUsed = usage.InputTokens + usage.OutputTokens;
        if (usage.InputTokenDetails || usage.OutputTokenDetails) {
            promptRun.Result = JSON.stringify({
                realtimeUsageDetails: {
                    input: usage.InputTokenDetails ?? null,
                    output: usage.OutputTokenDetails ?? null,
                },
            });
        }
        if (!(await promptRun.Save({ SaveReturnMode: 'datestamps_only' }))) {
            ctx.Hooks.LogError(
                `Failed to checkpoint realtime usage: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                { category: 'RealtimeSession' }
            );
        }
    }
}
