/**
 * `CascadedChannelEngine` — STT → BaseAgent → TTS per-turn pipeline for the
 * `voice-cascaded` channel kind.
 *
 * Per-turn flow (see `plans/audio-agent-architecture.md` section 2.2):
 *
 * ```
 * transport.AudioFramesIn
 *   → VAD.DetectSpeech                  (per-frame energy/Silero gate)
 *   → TurnDetector.DetectTurns          (silence-based turn-end)
 *   → STT.TranscribeStream()            (one stream per turn)
 *   → BaseAgent.Execute(text, signal)   (cancelable)
 *   → TTS.SynthesizeStream(text)        (single-string async iterable today)
 *   → transport.SendAudioFrame()        (one frame at a time)
 * ```
 *
 * Phase 1(c)(v) scope: plumbing. The concrete provider implementations
 * (Deepgram STT, ElevenLabs TTS streaming, etc.) land in Phase 1(e). For now
 * any registered `BaseAudioGenerator` subclass that implements
 * `TranscribeStream` / `SynthesizeStream` will plug in.
 */
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { MJAIModelEntity } from '@memberjunction/core-entities';
import type {
    StreamingSTTOptions,
    StreamingTTSOptions,
    ChatMessage,
} from '@memberjunction/ai';
import { BaseAudioGenerator, GetAIAPIKey } from '@memberjunction/ai';
import { AudioFrameBus } from './AudioFrameBus';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentEventStream } from '@memberjunction/ai-core-plus';
import { AgentRunner, ClientToolRequestManager } from '@memberjunction/ai-agents';
import { BaseChannelEngine, ChannelRunContext, ChannelStopReason } from '../BaseChannelEngine';
import { VoiceCascadedConfig } from '../types/channel-config';
import { BaseVAD, VADEvent } from '../vad/BaseVAD';
import { BaseTurnDetector, TurnEvent } from '../turn-detector/BaseTurnDetector';
import { InterruptReason } from '../interrupt/InterruptChannel';
import { MessageFieldExtractor } from '../_internal/MessageFieldExtractor';

/**
 * Bundle of resolved per-session provider instances. Built once at the top of
 * `Run()` and threaded through the per-turn helpers.
 */
interface ResolvedProviders {
    /** STT/VAD/TurnDetector are lazy — only required when the audio-input pipeline starts.
     *  Text-input-only sessions (TextInputAudioOutputTransport) can run with these unset. */
    Stt?: BaseAudioGenerator;
    Tts: BaseAudioGenerator;
    Vad?: BaseVAD;
    TurnDetector?: BaseTurnDetector;
}

/**
 * Module-level round-robin counter for filler-phrase selection.
 * Survives engine instances on purpose — distributes phrases across sessions
 * in the same process so repeated callers don't always hear the same first
 * filler.
 */
let fillerCursor = 0;

@RegisterClass(BaseChannelEngine, 'CascadedChannelEngine')
export class CascadedChannelEngine extends BaseChannelEngine {
    /** AbortController for the currently in-flight `BaseAgent.Execute()` + TTS. */
    private currentResponseAbort: AbortController | null = null;
    /** Set to `true` once `Stop()` has been called. */
    private stopped = false;
    /** Disposer for the per-session interrupt subscription. */
    private interruptDisposer: (() => void) | null = null;

    public async Run(ctx: ChannelRunContext): Promise<void> {
        const cfg = narrowVoiceCascadedConfig(ctx);
        const providers = await this.resolveProviders(cfg, ctx.ContextUser);

        // Single-line, grep-friendly per-session log. The SessionID prefix
        // lets you `grep "[ChannelSession <id>]"` in MJAPI's log to recover
        // the whole timeline of one voice run.
        LogStatus(
            `[ChannelSession ${ctx.SessionID}] session-start agent='${ctx.AgentMetadata.Name}' channel='${ctx.ChannelMetadata.Name}' transport='${ctx.Transport.constructor.name}' tts='${providers.Tts.constructor.name}' stt='${providers.Stt?.constructor.name ?? '(none)'}' fillerMs=${cfg.FillerPolicy?.ThresholdMs ?? '(off)'}`
        );

        // Wire interrupt → abort in-flight response. Barge-in path: VAD raises
        // `speech-start`, we fire the interrupt, this listener cancels the
        // in-flight agent + TTS so the user isn't talking over assistant audio.
        this.interruptDisposer = ctx.Interrupt.On((reason) => this.onInterrupt(reason));

        // Subscribe ONCE to the transport's inbound audio. Transports (WebRTC,
        // WebSocket) back `AudioFramesIn` with a single-consumer queue, so if
        // both VAD and per-turn STT iterated it directly, frames would be split
        // between them and neither would work. The bus multicasts every frame
        // to all active subscribers without buffering history (new subscribers
        // see only frames pushed after they subscribed — correct for live voice).
        const audioBus = new AudioFrameBus();
        const busPumpDone = audioBus.PumpFrom(ctx.Transport.AudioFramesIn);

        // Two concurrent input pipelines converge at `runOneTurnFromTranscript`:
        //   1. Audio:  ControlEventsIn ──→ ignored (only listens for session-end)
        //              AudioFramesIn ──→ VAD → TurnDetector → STT → transcript
        //   2. Text:   ControlEventsIn ──→ { Kind: 'user-text', Text } → transcript
        // Both feed transcripts into the same agent + TTS path. Whichever loop
        // exits first (transport closed / session ended) tears the other down
        // via `audioBus.Close()` + the transport's ControlEventsIn ending.
        const audioPipelinePromise = this.runAudioPipelineLoop(ctx, providers, cfg, audioBus);
        const textPipelinePromise = this.runTextInputPipelineLoop(ctx, providers, cfg);

        try {
            await Promise.race([audioPipelinePromise, textPipelinePromise]);
        } finally {
            if (this.interruptDisposer) {
                this.interruptDisposer();
                this.interruptDisposer = null;
            }
            audioBus.Close();
            // Let the pump task settle so we don't orphan it across Run() calls.
            await busPumpDone.catch(() => {
                // pump errors are logged inside; nothing to do here
            });
            // Let the loser loop settle. ControlEventsIn ending (transport close)
            // will terminate the text loop; audioBus.Close() lets the audio loop
            // finish its iterator.
            await Promise.allSettled([audioPipelinePromise, textPipelinePromise]);
            LogStatus(
                `[ChannelSession ${ctx.SessionID}] session-end stopped=${this.stopped}`
            );
        }
    }

    /**
     * Drive the audio-input pipeline: VAD → TurnDetector → STT → transcript →
     * `runOneTurnFromTranscript`. Iterates `runTurnPipeline` until the audio bus
     * closes or the engine is stopped.
     */
    private async runAudioPipelineLoop(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        cfg: VoiceCascadedConfig,
        audioBus: AudioFrameBus
    ): Promise<void> {
        // Lazy-resolve STT/VAD/TurnDetector here so a missing key doesn't kill the
        // session — text-input-only callers (TextInputAudioOutputTransport) still work.
        const audioIn = await this.tryResolveAudioInProviders(cfg, ctx.ContextUser);
        if (!audioIn) return;
        providers.Stt = audioIn.Stt;
        providers.Vad = audioIn.Vad;
        providers.TurnDetector = audioIn.TurnDetector;

        const turnTranscripts = this.runTurnPipeline(ctx, providers, cfg, audioBus);
        for await (const transcript of turnTranscripts) {
            if (this.stopped) return;
            if (!transcript || transcript.trim() === '') continue;
            await this.runOneTurnFromTranscript(ctx, providers, cfg, transcript);
            ctx.Interrupt.Reset();
        }
    }

    /**
     * Drive the text-input pipeline: ControlEventsIn → `user-text` events →
     * `runOneTurnFromTranscript`. Unlike the audio path, this skips VAD / STT /
     * TurnDetector entirely — the upstream transport (e.g. a text-in/voice-out
     * transport, or Twilio ConvRelay) has already produced the user's text turn.
     * Exits on `session-end` or when the ControlEventsIn iterator ends.
     *
     * Non-text control events (`session-start`, `participant-joined`,
     * `participant-left`) are ignored here — they're transport bookkeeping, not
     * conversational input.
     */
    private async runTextInputPipelineLoop(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        cfg: VoiceCascadedConfig
    ): Promise<void> {
        try {
            for await (const event of ctx.Transport.ControlEventsIn) {
                if (this.stopped) return;
                if (event.Kind === 'session-end') return;
                if (event.Kind !== 'user-text') continue;
                const text = event.Text;
                if (!text || text.trim() === '') continue;
                await this.runOneTurnFromTranscript(ctx, providers, cfg, text);
                ctx.Interrupt.Reset();
            }
        } catch (err) {
            LogError(
                `CascadedChannelEngine: text-input pipeline failed: ${errorMessage(err)}`
            );
        }
    }

    public async Stop(_reason: ChannelStopReason): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;
        // Cancel any in-flight agent/TTS. The interrupt subscription handles
        // the actual flushing via `onInterrupt`.
        this.currentResponseAbort?.abort();
        // Don't close `ctx.Transport` here — `ChannelSession` owns that.
    }

    // ─── pipeline composition ────────────────────────────────────────────

    /**
     * Drives the VAD + turn-detector + STT chain and yields a final transcript
     * string per turn. Tee'd construction (VAD output is consumed by both the
     * turn detector and by the engine's speech-start watcher) is done with a
     * lightweight fan-out helper.
     */
    private async *runTurnPipeline(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        cfg: VoiceCascadedConfig,
        audioBus: AudioFrameBus
    ): AsyncIterable<string> {
        // VAD subscribes to the bus (NOT directly to the transport). Per-turn
        // STT will also subscribe to the bus, so both see every frame.
        // Non-null assertions safe — runAudioPipelineLoop assigned these via tryResolveAudioInProviders.
        const [vadForTurnDetector, vadForBargeIn] = teeAsyncIterable(
            providers.Vad!.DetectSpeech(audioBus.Subscribe())
        );

        // Barge-in watcher: any speech-start during an in-flight response fires
        // the interrupt. Doesn't yield anything itself — runs as a side task.
        if (cfg.BargeIn !== false) {
            void this.watchForBargeIn(vadForBargeIn, ctx);
        } else {
            // Drain the side channel so the tee buffer doesn't grow unbounded.
            void drainAsyncIterable(vadForBargeIn);
        }

        const turnEvents = providers.TurnDetector!.DetectTurns(vadForTurnDetector);

        for await (const turn of turnEvents) {
            if (this.stopped) return;
            if (turn.Kind !== 'turn-end') continue;

            const transcript = await this.captureTurnTranscript(ctx, providers, cfg, audioBus, turn);
            if (transcript != null) {
                yield transcript;
            }
        }
    }

    /**
     * For one turn (kicked off by a `turn-end` event), open an STT stream and
     * collect the final transcript text. The STT stream consumes raw audio
     * frames from the transport until either:
     *  - it emits an `IsFinal: true` event, OR
     *  - the engine is stopped.
     */
    private async captureTurnTranscript(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        cfg: VoiceCascadedConfig,
        audioBus: AudioFrameBus,
        _turn: TurnEvent
    ): Promise<string | null> {
        // Subscribe to the bus rather than the raw transport — this is the fix
        // for the multi-consumer bug. The STT provider will iterate this
        // subscription; closing it after the final transcript releases the slot.
        const sttSubscription = audioBus.Subscribe();
        const sttOpts: StreamingSTTOptions = {
            AudioStream: sttSubscription,
            Language: cfg.STT.LanguageCode,
            IncludePartials: cfg.STT.Partials !== false,
            ContextUser: ctx.ContextUser,
        };

        // Non-null assertion is safe — `runAudioPipelineLoop` validated and
        // assigned STT (with `TranscribeStream` already checked by tryResolveAudioInProviders).
        const events = providers.Stt!.TranscribeStream!(sttOpts);

        const finals: string[] = [];
        try {
            for await (const ev of events) {
                if (this.stopped) break;
                if (ev.IsFinal) {
                    finals.push(ev.Text);
                    break;
                }
            }
        } catch (err) {
            LogError(
                `CascadedChannelEngine: STT stream failed: ${errorMessage(err)}`
            );
            return null;
        } finally {
            // Release the bus slot so we don't leak subscribers across turns.
            sttSubscription.Unsubscribe();
        }

        if (finals.length === 0) return null;
        return finals.join(' ').trim();
    }

    /**
     * Run one full turn: BaseAgent.Execute → TTS.SynthesizeStream →
     * transport.SendAudioFrame, with cancellation + filler-phrase scheduling.
     *
     * **Token-level streaming**: when the agent's underlying LLM provider
     * supports streaming (OpenAI, Anthropic, etc.), we wire `onStreaming`
     * through `ExecuteAgentParams` → `AIPromptParams.onStreaming` →
     * `ChatParams.streamingCallbacks` so LLM tokens flow into a token queue
     * that drives `TTS.SynthesizeStream()` *concurrently* with agent
     * execution. Time-to-first-audio drops from
     *   (full LLM completion) + (TTS first chunk)
     * to roughly
     *   (LLM first token) + (TTS first chunk).
     *
     * **Fallback**: if `onStreaming` never fires (provider doesn't support
     * streaming, or this agent step doesn't go through a streaming LLM call —
     * e.g. multi-step planning where only intermediate prompts run, with no
     * final user-visible text), we synthesize the final extracted text the
     * old way (bulk SynthesizeStream over the whole response string via
     * `bridgeStreamingResponse` + `extractAssistantText`).
     *
     * **Barge-in**: when `abort.signal` fires, we close the token queue
     * (which terminates the TTS iteration) and BaseAgent.Execute sees the
     * cancellation token.
     *
     * **Convergence point**: both `runAudioPipelineLoop` (audio path, after STT
     * yields a final transcript) and `runTextInputPipelineLoop` (text-input
     * path, where the transport delivers `{ Kind: 'user-text', Text }`) call
     * into this helper. Everything below this line is input-modality-agnostic.
     */
    private async runOneTurnFromTranscript(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        cfg: VoiceCascadedConfig,
        userText: string
    ): Promise<void> {
        const turnStartMs = Date.now();
        const truncated = userText.length > 80 ? userText.slice(0, 80) + '…' : userText;
        LogStatus(`[ChannelSession ${ctx.SessionID}] turn-start text="${truncated}"`);

        // Emit user turn for the transcript display.
        ctx.OnTranscript?.({ Kind: 'user', Text: userText, IsFinal: true });

        const abort = new AbortController();
        this.currentResponseAbort = abort;

        // Schedule a filler phrase if the agent hasn't returned within the
        // configured threshold. See the comment in `setupFillerTimer` —
        // wiring true OnProgress-driven fillers (one per *tool* call) requires
        // BaseAgent to propagate progress events to here, which isn't fully
        // plumbed yet.
        const fillerTimer = this.setupFillerTimer(ctx, providers, cfg, abort.signal);

        // TTS strategy: NON-streaming. We deliberately do not pipe LLM
        // tokens through to TTS during execution. Why: MJ loop agents
        // produce multiple step envelopes per user turn (planner,
        // sub-agent, action, final). Speaking every step's `message`
        // makes the agent feel like it "keeps talking in a loop" even
        // when it's working correctly. Instead, we let the transcript
        // event stream feed the on-screen text (for liveness) and TTS
        // only the *final* assembled payload after Execute() returns.
        //
        // The trade-off: time-to-first-audio rises to (full LLM run
        // time) + (TTS first chunk). For a 3-step agent that's ~3-5s.
        // For a 1-step chat agent it's ~1s. Acceptable for the prototype;
        // the next optimisation is "detect terminal step (taskComplete /
        // nextStep.Chat) and stream from there only."
        // When `StreamToTTS` is on we speak the answer token-by-token DURING
        // execution; otherwise we synthesize the final assembled message after
        // `Execute()` returns. `spokenDuringRun` tracks which path ran so we
        // don't double-speak below.
        const streamToTTS = cfg.StreamToTTS === true;
        try {
            const executeStart = Date.now();
            LogStatus(
                `[ChannelSession ${ctx.SessionID}] execute-begin streamToTTS=${streamToTTS}`
            );
            const { result: agentResult, agentResponseDetailId } = streamToTTS
                ? await this.streamAgentTurnToTTS(ctx, providers, userText, abort.signal)
                : await this.runAgent(ctx, userText, abort.signal);
            const executeDuration = Date.now() - executeStart;
            const stepCount = (agentResult as { agentRun?: { TotalPromptIterations?: number } })
                .agentRun?.TotalPromptIterations ?? '?';
            LogStatus(
                `[ChannelSession ${ctx.SessionID}] execute-end success=true steps=${stepCount} durationMs=${executeDuration}`
            );

            clearTimeout(fillerTimer);

            if (abort.signal.aborted || this.stopped) {
                LogStatus(`[ChannelSession ${ctx.SessionID}] turn-aborted`);
                return;
            }

            // TTS the conversation-manager's status message (e.g. "I've
            // delegated to Research Agent"). This gives the user immediate
            // audible feedback before any long-running orchestration starts.
            // In the StreamToTTS path this text was already spoken
            // incrementally during the run, so skip it here.
            const initialText = agentResult.agentRun?.Message?.trim() ?? '';
            if (initialText.length > 0 && !streamToTTS) {
                await this.speakText(ctx, providers, initialText, abort.signal);
            }

            // taskGraph detection. Sage (and other conversation-manager
            // agents) emit `payload.taskGraph` to delegate to specialist
            // sub-agents. The chat surface handles this via the
            // `ExecuteTaskGraph` GraphQL mutation; for voice the resolver
            // wires `OnTaskGraph` to call `TaskOrchestrator` directly.
            //
            // Without `OnTaskGraph` wired, taskGraphs are skipped (the
            // user just hears the status message above). With it wired,
            // we run the graph synchronously and TTS the aggregated
            // final answer.
            const taskGraph = extractTaskGraph(agentResult.payload);
            if (taskGraph && ctx.OnTaskGraph && agentResponseDetailId) {
                LogStatus(
                    `[ChannelSession ${ctx.SessionID}] taskgraph-begin tasks=${
                        Array.isArray((taskGraph as { tasks?: unknown[] }).tasks)
                            ? (taskGraph as { tasks: unknown[] }).tasks.length
                            : '?'
                    }`
                );
                const tgStart = Date.now();
                try {
                    const tgResult = await ctx.OnTaskGraph({
                        TaskGraph: taskGraph,
                        ConversationDetailID: agentResponseDetailId,
                    });
                    LogStatus(
                        `[ChannelSession ${ctx.SessionID}] taskgraph-end durationMs=${Date.now() - tgStart}`
                    );
                    if (abort.signal.aborted || this.stopped) return;

                    const tgText = tgResult.Message?.trim() ?? '';
                    if (tgText.length > 0) {
                        await this.speakText(ctx, providers, tgText, abort.signal);
                        // Emit a second agent-response so the transcript
                        // shows the aggregated final answer (the chat
                        // pattern threads this under the manager message;
                        // for voice we just surface it as another agent
                        // turn).
                        ctx.OnTranscript?.({
                            Kind: 'agent-response',
                            Message: tgText,
                        });
                    }
                } catch (tgErr) {
                    LogError(
                        `[ChannelSession ${ctx.SessionID}] taskgraph-failed: ${errorMessage(tgErr)}`
                    );
                    ctx.OnTranscript?.({
                        Kind: 'error',
                        Message: `Workflow failed: ${errorMessage(tgErr)}`,
                    });
                }
            } else if (taskGraph && !ctx.OnTaskGraph) {
                LogStatus(
                    `[ChannelSession ${ctx.SessionID}] taskgraph-skipped reason='no OnTaskGraph handler wired'`
                );
            }

            if (initialText.length === 0 && !taskGraph) {
                LogStatus(
                    `[ChannelSession ${ctx.SessionID}] tts-skipped reason='no message in payload'`
                );
            }
            LogStatus(
                `[ChannelSession ${ctx.SessionID}] turn-complete totalMs=${Date.now() - turnStartMs}`
            );
        } catch (err) {
            clearTimeout(fillerTimer);
            if (abort.signal.aborted) {
                // Expected on barge-in / manual stop — log at status, not error.
                LogStatus(
                    `CascadedChannelEngine: turn cancelled: ${errorMessage(err)}`
                );
                return;
            }
            LogError(
                `[ChannelSession ${ctx.SessionID}] turn-failed: ${errorMessage(err)}`
            );
            ctx.OnTranscript?.({
                Kind: 'error',
                Message: errorMessage(err),
            });
            // Loop continues — one bad turn doesn't kill the session.
        } finally {
            if (this.currentResponseAbort === abort) {
                this.currentResponseAbort = null;
            }
        }
    }

    /**
     * Call `BaseAgent.Execute()` with the user's transcribed text as a single
     * chat message. The token stream from the underlying LLM is filtered
     * through `MessageFieldExtractor` so ONLY the characters inside the
     * `message` field of each step's LoopAgentResponse envelope reach the
     * TTS pump. Without this filter, the LLM's raw JSON tokens (`{`, key
     * names, `reasoning`, `nextStep` payload, etc.) would all be spoken —
     * the original "agent talks JSON at you" bug.
     *
     * Per-step semantics: `BaseAgent` forwards `onStreaming` to every
     * prompt it runs (planner, sub-agent, final response). Each prompt
     * step emits its own self-contained JSON envelope. We track the
     * incoming `stepEntityId` and reset the extractor on step boundaries
     * so the parser starts fresh for each envelope. The user hears the
     * `message` from every step in order — useful for voice progress
     * feedback during multi-step runs.
     */
    protected async runAgent(
        ctx: ChannelRunContext,
        userText: string,
        cancellationToken: AbortSignal,
        eventStream?: AgentEventStream
    ): Promise<{ result: AgentExecutionResultLike; agentResponseDetailId: string | undefined }> {
        // Voice rides on the conversation infrastructure rather than
        // bypassing it (see `plans/audio-agent-architecture.md`,
        // `ChannelRunContext.conversation`). Specifically:
        //
        // - Each user turn creates a User + AI `ConversationDetail` row,
        //   exactly like the MJ chat surface does. `AgentRunner.RunAgentInConversation`
        //   handles that for us, plus updates the AI detail's Message
        //   field with the canonical user-facing reply.
        //
        // - Conversation history is loaded from prior `ConversationDetail`
        //   rows on the same conversation (last 20 messages, oldest first).
        //   Without this, every voice turn starts fresh and Sage has no
        //   idea you just asked the prior question.
        //
        // - We read the assistant's spoken text from `agentRun.Message`
        //   (the same field the chat surface persists into the AI
        //   ConversationDetail). If empty, silence is intentional.
        //
        // - Sub-agents, actions, client tools, payload mutations,
        //   actionable commands — all of these flow through the existing
        //   chat pipeline. No special voice handling.
        if (!ctx.Conversation) {
            throw new Error(
                'CascadedChannelEngine: ctx.Conversation is required. ' +
                'ChannelSession should auto-create one on session start.'
            );
        }
        const conversationId = ctx.Conversation.ID;

        const history = await this.loadConversationHistory(
            conversationId,
            ctx.ContextUser
        );
        const messages: ChatMessage[] = [
            ...history,
            { role: 'user', content: userText },
        ];

        // Pull live client-tool definitions from the registry so the agent's
        // prompt is aware of what tools it can dispatch. Without this, the
        // LLM won't emit `nextStep.clientTools` because it doesn't know any
        // tools exist. Matches the pattern used by the chat surface (see
        // packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts).
        const clientTools = ClientToolRequestManager.Instance.GetSessionTools(
            ctx.SessionID
        );

        // The streaming JSON parser normalizes the loop agent's per-step JSON
        // envelope down to just the `message` value. It always drives the
        // transcript event stream (widget liveness). When `eventStream` is
        // provided (the `StreamToTTS` path), each extracted chunk is ALSO
        // emitted as a normalized `TextDelta` so the caller can pump it to TTS
        // concurrently with execution. The extractor lives here, behind the
        // typed `AgentStreamEvent` boundary — it is the conductor-path
        // normalizer, not the engine's streaming contract.
        const extractor = new MessageFieldExtractor('message');
        let lastStepEntityId: string | undefined;
        eventStream?.EmitTurnStart();

        // Channel context — surfaced to the prompt template via
        // `data.channelKind` and friends. The Loop Agent Type system
        // prompt branches on this to emit voice-output constraints
        // ("respond in 2-3 sentences, no code/markdown, structured
        // data goes in payload") so agents adapt their output natively
        // instead of relying on post-hoc summarization. See
        // `plans/audio-agent-architecture.md` §1.1 (`ChannelContext`)
        // and §4 (channel-aware abstractions).
        const channelContext = {
            channelKind: ctx.ChannelMetadata.Name,
            channelName: ctx.ChannelMetadata.Name,
            channelDescription: ctx.ChannelMetadata.Description || undefined,
            sessionId: ctx.SessionID,
            conversationId,
            agentRunId: ctx.AgentRun.ID,
            isVoice: isVoiceChannelKind(ctx.ChannelMetadata.Name),
        };

        const params: ExecuteAgentParams = {
            agent: ctx.AgentMetadata as MJAIAgentEntityExtended,
            conversationMessages: messages,
            contextUser: ctx.ContextUser,
            cancellationToken,
            sessionID: ctx.SessionID,
            data: {
                conversationId,
                clientTools: clientTools.length > 0 ? clientTools : undefined,
                // Hoist channel context to top-level too so prompts that
                // reference `data.channelKind` directly (the common case)
                // don't need to drill through `data.channelContext`.
                ...channelContext,
                channelContext,
            },
            onStreaming: (chunk) => {
                const stepId = (chunk as { stepEntityId?: string }).stepEntityId;
                if (stepId && stepId !== lastStepEntityId) {
                    lastStepEntityId = stepId;
                    extractor.Reset();
                }
                if (chunk.content && chunk.content.length > 0) {
                    const partial = extractor.Feed(chunk.content);
                    if (partial.length > 0) {
                        ctx.OnTranscript?.({
                            Kind: 'assistant-text',
                            Text: partial,
                            IsFinal: false,
                        });
                        eventStream?.EmitTextDelta(partial);
                    }
                }
            },
        };

        const runner = new AgentRunner();
        let conversationResult: Awaited<ReturnType<AgentRunner['RunAgentInConversation']>>;
        try {
            conversationResult = await runner.RunAgentInConversation(
                params,
                {
                    conversationId,
                    userMessage: userText,
                    conversationName: `Voice with ${ctx.AgentMetadata.Name}`,
                    createArtifacts: false,
                }
            );
        } catch (err) {
            // Errors-as-values on the event stream: a thrown run terminates the
            // stream as an `Error` event (so the TTS consumer stops cleanly)
            // rather than leaving it open. We still rethrow for `runAgent`'s
            // awaiters, which have their own try/catch.
            eventStream?.Fail(cancellationToken.aborted ? 'Aborted' : 'Error', errorMessage(err));
            throw err;
        }

        const result = conversationResult.agentResult;
        if (!result.success) {
            const msg = result.agentRun?.ErrorMessage ?? 'unknown agent failure';
            eventStream?.Fail('Error', msg);
            throw new Error(`Agent execution failed: ${msg}`);
        }

        // Fire the post-execution transcript event. The canonical spoken
        // text is `agentRun.Message` — that's what the chat surface displays
        // in the AI ConversationDetail bubble; voice should be identical.
        ctx.OnTranscript?.({
            Kind: 'agent-response',
            Message: result.agentRun?.Message || undefined,
            ActionableCommands: result.actionableCommands as unknown[] | undefined,
            ResponseForm: result.responseForm as unknown,
        });

        // Close the normalized stream. If the model never streamed any tokens
        // (non-streaming provider, or a step with no user-visible text), no
        // TextDelta was emitted and `Complete()` simply yields TurnEnd + Done
        // with an empty turn — the caller then falls back to synthesizing the
        // final assembled message.
        eventStream?.Complete('Stop');

        return {
            result: result as AgentExecutionResultLike,
            agentResponseDetailId: conversationResult.agentResponseDetailId,
        };
    }

    /**
     * `StreamToTTS` path: run the agent and pump its user-facing text to TTS
     * token-by-token *as it streams*, instead of synthesizing the whole final
     * message after `Execute()` returns. Three things run concurrently:
     *   1. `runAgent(..., eventStream)` — emits normalized `TextDelta` events.
     *   2. a consumer that forwards each `TextDelta` into a `TokenQueue`.
     *   3. `streamTokenQueueToTransport` — drives `TTS.SynthesizeStream()` off
     *      that queue and forwards audio frames to the transport.
     *
     * Time-to-first-audio drops from `(full LLM run) + (TTS first chunk)` to
     * roughly `(first token) + (TTS first chunk)`.
     *
     * Fallback: if the model never streamed any user-visible text (non-stream
     * provider, or a step with no `message`), the queue stays empty and we
     * synthesize the final assembled message the proven way.
     *
     * Single-step constraint applies (see `VoiceCascadedConfig.StreamToTTS`):
     * a multi-step agent would stream every step's `message`.
     */
    protected async streamAgentTurnToTTS(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        userText: string,
        signal: AbortSignal
    ): Promise<{ result: AgentExecutionResultLike; agentResponseDetailId: string | undefined }> {
        const eventStream = new AgentEventStream();
        const tokenQueue = new TokenQueue();

        // (1) kick off the agent — NOT awaited yet; it fills `eventStream`.
        const runPromise = this.runAgent(ctx, userText, signal, eventStream);

        // (2) forward TextDeltas into the token queue as they arrive.
        const consumePromise = (async () => {
            for await (const ev of eventStream) {
                if (signal.aborted || this.stopped) break;
                if (ev.Kind === 'TextDelta') {
                    tokenQueue.Push(ev.Delta);
                }
                // Error/Done are terminal; the loop ends when the stream closes.
                // The transcript `error` event is emitted by the run path.
            }
            tokenQueue.Close();
        })();

        // (3) pump the queue to TTS concurrently.
        const ttsPromise = this.streamTokenQueueToTransport(ctx, providers, tokenQueue, signal);

        let runResult: { result: AgentExecutionResultLike; agentResponseDetailId: string | undefined };
        try {
            runResult = await runPromise;
        } catch (err) {
            // Guarantee the consumer unwinds: terminate the event stream
            // (idempotent — `runAgent` normally already did). This lets the
            // consume loop drain any buffered deltas into the queue and close
            // it, so the TTS pump flushes the partial before we propagate.
            // Do NOT close the queue directly here — that would race the
            // consumer and drop the last buffered delta.
            eventStream.Fail(signal.aborted ? 'Aborted' : 'Error', errorMessage(err));
            await consumePromise.catch(() => undefined);
            await ttsPromise.catch(() => undefined);
            throw err;
        }

        await consumePromise;
        await ttsPromise;

        // Fallback: nothing streamed → speak the final assembled message.
        if (!tokenQueue.HasReceivedAnyContent && !signal.aborted && !this.stopped) {
            const finalText = runResult.result.agentRun?.Message?.trim() ?? '';
            if (finalText.length > 0) {
                await this.speakText(ctx, providers, finalText, signal);
            }
        }

        return runResult;
    }

    /**
     * Synthesize a chunk of text to audio and pump frames through the
     * transport. Wraps `bridgeStreamingResponse` with the standard
     * tts-begin/tts-end log lines for diagnostics. Used in two places:
     * (1) the conversation-manager's initial status message, and
     * (2) the taskGraph aggregated final answer.
     */
    private async speakText(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        text: string,
        signal: AbortSignal
    ): Promise<void> {
        const ttsStart = Date.now();
        LogStatus(
            `[ChannelSession ${ctx.SessionID}] tts-begin chars=${text.length}`
        );
        await this.bridgeStreamingResponse(ctx, providers, text, signal);
        LogStatus(
            `[ChannelSession ${ctx.SessionID}] tts-end durationMs=${Date.now() - ttsStart}`
        );
    }

    /**
     * Load the last N `ConversationDetail` rows for the given conversation
     * and convert them to `ChatMessage[]` (oldest first), so the agent
     * sees prior turns as context.
     *
     * Lightweight version of `RunAIAgentResolver.loadConversationHistoryWithAttachments`
     * — skips attachment/artifact resolution because the voice path doesn't
     * carry attachments today. If we need attachment-aware history later,
     * we can extract the resolver helper into a shared util.
     */
    private async loadConversationHistory(
        conversationId: string,
        contextUser: UserInfo
    ): Promise<ChatMessage[]> {
        const rv = new RunView();
        const result = await rv.RunView<{ Role: string; Message: string }>(
            {
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ConversationID='${conversationId}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 20,
                Fields: ['Role', 'Message'],
                ResultType: 'simple',
            },
            contextUser
        );
        if (!result.Success || !result.Results) return [];
        return result.Results
            .reverse()
            .filter((d) => d.Message && d.Message.trim().length > 0)
            .map((d) => ({
                role: d.Role === 'AI' ? 'assistant' : 'user',
                content: d.Message,
            } as ChatMessage));
    }

    /**
     * Drive `TTS.SynthesizeStream()` from a `TokenQueue` that the agent is
     * filling concurrently. The TTS provider receives an `AsyncIterable<string>`
     * and emits `AudioFrame`s as it goes — those frames are forwarded to the
     * transport. Honors `cancellationToken` and `this.stopped`.
     *
     * Returns a Promise that resolves once the queue is closed *and* the TTS
     * iterator has drained.
     */
    private async streamTokenQueueToTransport(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        tokenQueue: TokenQueue,
        cancellationToken: AbortSignal
    ): Promise<void> {
        const ttsOpts: StreamingTTSOptions = {
            TextStream: tokenQueue.Iterate(),
            VoiceProfile: ctx.VoiceProfile,
            ContextUser: ctx.ContextUser,
        };

        // Non-null assertion safe — resolveProviders validated SynthesizeStream.
        const audioStream = providers.Tts.SynthesizeStream!(ttsOpts);

        let frameCount = 0;
        try {
            for await (const frame of audioStream) {
                if (cancellationToken.aborted || this.stopped) return;
                ctx.Transport.SendAudioFrame(frame);
                frameCount++;
            }
        } catch (err) {
            if (!cancellationToken.aborted) {
                LogError(
                    `CascadedChannelEngine: streaming TTS pump failed: ${errorMessage(err)}`
                );
            }
        } finally {
            LogStatus(
                `[ChannelSession ${ctx.SessionID}] tts-stream-pump frames=${frameCount}`
            );
        }
    }

    /**
     * Take the assistant's final text and stream it through TTS to the
     * transport. Aborts cleanly when the cancellation token fires.
     */
    private async bridgeStreamingResponse(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        assistantText: string,
        cancellationToken: AbortSignal
    ): Promise<void> {
        const textStream = singleStringStream(assistantText);
        const ttsOpts: StreamingTTSOptions = {
            TextStream: textStream,
            VoiceProfile: ctx.VoiceProfile,
            ContextUser: ctx.ContextUser,
        };

        const audioStream = providers.Tts.SynthesizeStream!(ttsOpts);

        for await (const frame of audioStream) {
            if (cancellationToken.aborted || this.stopped) {
                // Bail without flushing — barge-in or stop.
                return;
            }
            ctx.Transport.SendAudioFrame(frame);
        }
    }

    /**
     * Watch the VAD stream for `speech-start` events while a response is in
     * flight and fire the interrupt when one arrives. Runs as a fire-and-forget
     * background task.
     */
    private async watchForBargeIn(
        vadEvents: AsyncIterable<VADEvent>,
        ctx: ChannelRunContext
    ): Promise<void> {
        try {
            for await (const ev of vadEvents) {
                if (this.stopped) return;
                if (ev.Kind !== 'speech-start') continue;
                if (this.currentResponseAbort && !this.currentResponseAbort.signal.aborted) {
                    ctx.Interrupt.Fire({ Kind: 'user-speech-start' });
                }
            }
        } catch (err) {
            LogError(
                `CascadedChannelEngine: barge-in watcher crashed: ${errorMessage(err)}`
            );
        }
    }

    /**
     * Wire the InterruptChannel to abort the in-flight response. Called for
     * every `Fire()` — `user-speech-start`, `user-text`, `caller-hangup`, `manual`.
     * All four reasons should cancel the in-flight assistant turn.
     */
    private onInterrupt(_reason: InterruptReason): void {
        this.currentResponseAbort?.abort();
    }

    /**
     * Start a one-shot timer that, after `ThresholdMs`, synthesizes a filler
     * phrase through TTS. Cleared when the agent returns.
     *
     * TODO Phase 1.5: this is a coarse timer-based filler. The plan calls for
     * fillers triggered per *tool call* that exceeds the budget — that requires
     * `BaseAgent.Execute()` to surface action progress to the caller (the
     * `OnProgress` hook on `RunActionParams` mentioned in Phase 1(b)(iv) needs
     * to bubble up through `ExecuteAgentParams.onProgress`). When that lands,
     * replace this with a per-action timer. For now, one filler per turn if the
     * agent itself is slow.
     */
    private setupFillerTimer(
        ctx: ChannelRunContext,
        providers: ResolvedProviders,
        cfg: VoiceCascadedConfig,
        cancellationToken: AbortSignal
    ): ReturnType<typeof setTimeout> | undefined {
        if (!cfg.FillerPolicy || cfg.FillerPolicy.Phrases.length === 0) {
            return undefined;
        }
        const policy = cfg.FillerPolicy;
        const thresholdMs = policy.ThresholdMs ?? cfg.LatencyBudgetMs ?? 1500;

        return setTimeout(() => {
            if (cancellationToken.aborted || this.stopped) return;
            const phrase = policy.Phrases[fillerCursor % policy.Phrases.length];
            fillerCursor = (fillerCursor + 1) % policy.Phrases.length;
            void this.bridgeStreamingResponse(ctx, providers, phrase, cancellationToken)
                .catch((err) => {
                    LogError(
                        `CascadedChannelEngine: filler phrase TTS failed: ${errorMessage(err)}`
                    );
                });
        }, thresholdMs);
    }

    // ─── provider resolution ─────────────────────────────────────────────

    private async resolveProviders(
        cfg: VoiceCascadedConfig,
        contextUser: UserInfo
    ): Promise<ResolvedProviders> {
        // TTS is required for both audio-in and text-in paths (agent responses always
        // go out as audio). Resolve eagerly and fail the session if it's unavailable.
        const tts = await this.resolveAudioProvider(cfg.TTS.AIModelID, 'TTS', contextUser);
        if (!tts.SynthesizeStream) {
            throw new Error(
                `CascadedChannelEngine: TTS provider (model ${cfg.TTS.AIModelID}) does not implement SynthesizeStream.`
            );
        }
        // STT / VAD / TurnDetector are resolved lazily by `tryResolveAudioInProviders`
        // when the audio-input pipeline actually starts. Text-input-only sessions
        // (TextInputAudioOutputTransport) skip the audio loop entirely and never
        // need an STT key.
        return { Tts: tts };
    }

    /**
     * Lazy-resolve the audio-input side providers (STT, VAD, TurnDetector). Called
     * from `runAudioPipelineLoop` after we know audio is actually flowing. Returns
     * `null` if resolution fails (e.g. Deepgram key missing) so the audio loop can
     * exit cleanly without killing a parallel text-input session.
     */
    private async tryResolveAudioInProviders(
        cfg: VoiceCascadedConfig,
        contextUser: UserInfo
    ): Promise<{ Stt: BaseAudioGenerator; Vad: BaseVAD; TurnDetector: BaseTurnDetector } | null> {
        try {
            const stt = await this.resolveAudioProvider(cfg.STT.AIModelID, 'STT', contextUser);
            if (!stt.TranscribeStream) {
                throw new Error(
                    `STT provider (model ${cfg.STT.AIModelID}) does not implement TranscribeStream.`
                );
            }
            const vad = MJGlobal.Instance.ClassFactory.CreateInstance<BaseVAD>(
                BaseVAD,
                cfg.VAD?.DriverClass ?? 'EnergyVAD'
            );
            if (!vad) {
                throw new Error(
                    `failed to instantiate VAD (DriverClass='${cfg.VAD?.DriverClass ?? 'EnergyVAD'}').`
                );
            }
            const turnDetector = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTurnDetector>(
                BaseTurnDetector,
                cfg.TurnDetector?.DriverClass ?? 'SilenceTurnDetector'
            );
            if (!turnDetector) {
                throw new Error(
                    `failed to instantiate turn detector (DriverClass='${cfg.TurnDetector?.DriverClass ?? 'SilenceTurnDetector'}').`
                );
            }
            return { Stt: stt, Vad: vad, TurnDetector: turnDetector };
        } catch (err) {
            LogStatus(
                `[CascadedChannelEngine] Audio-input providers unavailable, audio pipeline disabled: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    /**
     * Look up an `AIModel` row by ID and instantiate its `DriverClass` against
     * `BaseAudioGenerator`. We use `Metadata.GetEntityObject` + `.Load(id)`
     * rather than `AIEngine.Instance.Models.find(...)` because the channel
     * runtime is provider-pure (lives below the agent layer) and shouldn't
     * assume `AIEngine` has been bootstrapped on the current process — the
     * server might be hosting only voice channels with no preloaded model
     * cache. The trade-off is one extra DB round trip per session; acceptable
     * for voice sessions that already cost much more in audio I/O.
     */
    private async resolveAudioProvider(
        modelId: string,
        label: 'STT' | 'TTS',
        contextUser: UserInfo
    ): Promise<BaseAudioGenerator> {
        const md = new Metadata();
        const model = await md.GetEntityObject<MJAIModelEntity>('MJ: AI Models', contextUser);
        const loaded = await model.Load(modelId);
        if (!loaded) {
            throw new Error(
                `CascadedChannelEngine: ${label} AIModel not found for ID='${modelId}'.`
            );
        }
        if (!model.DriverClass) {
            throw new Error(
                `CascadedChannelEngine: ${label} AIModel '${model.Name}' has no DriverClass.`
            );
        }
        const apiKey = GetAIAPIKey(model.DriverClass);
        if (!apiKey) {
            throw new Error(
                `CascadedChannelEngine: no API key found for ${label} DriverClass='${model.DriverClass}'. Set env var AI_VENDOR_API_KEY__${model.DriverClass} or configure credentials in MJ.`
            );
        }
        const provider = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAudioGenerator>(
            BaseAudioGenerator,
            model.DriverClass,
            apiKey
        );
        if (!provider) {
            throw new Error(
                `CascadedChannelEngine: no BaseAudioGenerator registered for ${label} DriverClass='${model.DriverClass}'.`
            );
        }
        return provider;
    }
}

// ─── module-private helpers ──────────────────────────────────────────────

/**
 * Narrow `ChannelRunContext.ChannelConfig` to `VoiceCascadedConfig`. Throws if
 * the discriminator doesn't match — protects against `ChannelSession` wiring
 * an engine to the wrong channel.
 */
function narrowVoiceCascadedConfig(ctx: ChannelRunContext): VoiceCascadedConfig {
    const cfg = ctx.ChannelConfig;
    if (cfg.Kind !== 'voice-cascaded') {
        throw new Error(
            `CascadedChannelEngine requires Kind='voice-cascaded'; got Kind='${cfg.Kind}'.`
        );
    }
    return cfg;
}

/**
 * **Non-streaming fallback** path for extracting a plain-text assistant message
 * from BaseAgent's heterogeneous payload. The agent's payload shape varies by
 * agent type (chat vs flow vs loop); we fish out the most common cases and
 * fall back to JSON.stringify.
 *
 * This is only used when the LLM provider does not stream tokens (i.e. the
 * `onStreaming` callback on `ExecuteAgentParams` never fires). The primary
 * code path in `processOneTurn` consumes tokens directly via a `TokenQueue`
 * that feeds TTS concurrently with agent execution, so this heuristic is
 * never run when streaming is available.
 *
 * TODO once BaseAgent grows a typed "spoken response" channel (or once we
 * make all voice-enabled agents return a known shape) we can delete this
 * heuristic. Until then it remains the safety net.
 */
/**
 * Build and fire an `agent-response` transcript event from `BaseAgent`'s
 * return payload. Pulls the `message` and `actionableCommands` fields off
 * a `LoopAgentResponse` envelope (the shape MJ loop-agents return).
 *
 * If `payload` is a JSON string, parse it first. If it isn't a recognizable
 * shape, fire a minimal event with just the extracted text — never silently
 * fall through.
 */
function emitAgentResponseEvent(ctx: ChannelRunContext, payload: unknown): void {
    if (!ctx.OnTranscript) return;

    let obj: Record<string, unknown> | null = null;
    if (payload != null && typeof payload === 'object') {
        obj = payload as Record<string, unknown>;
    } else if (typeof payload === 'string') {
        const trimmed = payload.trim();
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object') {
                    obj = parsed as Record<string, unknown>;
                }
            } catch {
                // Not JSON — fall through. We'll emit a bare message event.
            }
        }
    }

    if (obj) {
        const message =
            typeof obj.message === 'string' && obj.message.trim() !== ''
                ? obj.message
                : undefined;
        const actionableCommands = Array.isArray(obj.actionableCommands)
            ? (obj.actionableCommands as unknown[])
            : undefined;
        const responseForm =
            obj.responseForm && typeof obj.responseForm === 'object'
                ? obj.responseForm
                : undefined;
        ctx.OnTranscript({
            Kind: 'agent-response',
            Message: message,
            ActionableCommands: actionableCommands,
            ResponseForm: responseForm,
        });
        return;
    }

    // Last-resort: extract whatever assistant text we can and fire a bare event.
    const text = extractAssistantText(payload);
    ctx.OnTranscript({
        Kind: 'agent-response',
        Message: text || undefined,
    });
}

/**
 * `true` for channel kinds where the agent's `message` field gets read
 * aloud via TTS. The Loop Agent Type system prompt branches on this to
 * emit voice-output constraints into its system prompt for that turn.
 *
 * Centralized here so the runtime + the prompt template + future
 * channels (phone, video) stay consistent.
 */
function isVoiceChannelKind(kind: string): boolean {
    return (
        kind === 'voice-cascaded' ||
        kind === 'voice-realtime' ||
        kind === 'phone' ||
        kind === 'video-realtime'
    );
}

/**
 * Pull `payload.taskGraph` out of an agent's result payload, handling the
 * common shapes:
 *  - `payload === { taskGraph: {...} }` — direct object
 *  - `payload === "{\"taskGraph\":...}"` — JSON-string-wrapped
 *  - `payload` is null/undefined or has no taskGraph — returns null
 *
 * Returns the inner taskGraph object (untyped) or null. Validation —
 * presence of `tasks` array, `workflowName`, etc. — is left to the
 * taskGraph handler / `TaskOrchestrator`.
 */
function extractTaskGraph(payload: unknown): unknown {
    if (payload == null) return null;
    let obj: Record<string, unknown> | null = null;
    if (typeof payload === 'object') {
        obj = payload as Record<string, unknown>;
    } else if (typeof payload === 'string') {
        const trimmed = payload.trim();
        if (!trimmed.startsWith('{')) return null;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') {
                obj = parsed as Record<string, unknown>;
            }
        } catch {
            return null;
        }
    }
    if (!obj) return null;
    const tg = obj.taskGraph;
    if (tg && typeof tg === 'object') {
        return tg;
    }
    return null;
}

function extractAssistantText(payload: unknown): string {
    if (payload == null) return '';
    if (typeof payload === 'string') {
        // Payload itself might be a JSON-string of a LoopAgentResponse. Try
        // parsing — if successful, recurse into the parsed object. Otherwise
        // treat as plain text.
        const trimmed = payload.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                return extractAssistantText(parsed);
            } catch {
                // Not JSON — fall through and speak as-is.
            }
        }
        return payload;
    }
    if (typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        // LoopAgentResponse.message is the canonical user-spoken field.
        // Check it first, then common alternates for non-loop agents.
        for (const key of ['message', 'text', 'content', 'response']) {
            const val = obj[key];
            if (typeof val === 'string' && val.trim() !== '') return val;
        }
        // No speakable field found. Returning '' is intentional — we never
        // want to TTS a raw JSON dump (that was the original bug). The
        // caller will simply produce no audio for this turn.
        return '';
    }
    return String(payload);
}

/**
 * Wrap a single string as an `AsyncIterable<string>` so we can drive the
 * existing `StreamingTTSOptions.TextStream` contract from a non-streaming
 * agent response.
 */
async function* singleStringStream(s: string): AsyncIterable<string> {
    yield s;
}

/**
 * Drain an async iterable to completion, ignoring values. Used to keep tee'd
 * iterators alive when one branch isn't actively consumed (so the producer
 * doesn't block on backpressure).
 */
async function drainAsyncIterable<T>(iter: AsyncIterable<T>): Promise<void> {
    try {
        for await (const _ of iter) {
            // discard
        }
    } catch {
        // ignore — drainer is a best-effort sink
    }
}

/**
 * Fan out a single async iterable into two independent iterables, both of
 * which see every value. Buffers per-consumer to handle differing read paces.
 *
 * Pure-ish: produces side effects (mutating the two buffers + the pending
 * resolvers) but no I/O. The producer task starts on first call.
 */
function teeAsyncIterable<T>(
    source: AsyncIterable<T>
): [AsyncIterable<T>, AsyncIterable<T>] {
    const buffers: Array<T[]> = [[], []];
    const pending: Array<((v: IteratorResult<T>) => void) | null> = [null, null];
    let done = false;

    async function producer(): Promise<void> {
        try {
            for await (const v of source) {
                for (let i = 0; i < 2; i++) {
                    const resolver = pending[i];
                    if (resolver) {
                        pending[i] = null;
                        resolver({ value: v, done: false });
                    } else {
                        buffers[i].push(v);
                    }
                }
            }
        } finally {
            done = true;
            for (let i = 0; i < 2; i++) {
                const resolver = pending[i];
                if (resolver) {
                    pending[i] = null;
                    resolver({ value: undefined as unknown as T, done: true });
                }
            }
        }
    }

    void producer();

    function makeBranch(idx: 0 | 1): AsyncIterable<T> {
        return {
            [Symbol.asyncIterator](): AsyncIterator<T> {
                return {
                    next(): Promise<IteratorResult<T>> {
                        const buf = buffers[idx];
                        if (buf.length > 0) {
                            return Promise.resolve({ value: buf.shift()!, done: false });
                        }
                        if (done) {
                            return Promise.resolve({
                                value: undefined as unknown as T,
                                done: true,
                            });
                        }
                        return new Promise<IteratorResult<T>>((resolve) => {
                            pending[idx] = resolve;
                        });
                    },
                };
            },
        };
    }

    return [makeBranch(0), makeBranch(1)];
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Structural shape of `BaseAgent.Execute()`'s return value that we actually
 * read here — narrows the dependency surface without importing the full
 * `AgentExecutionResult<P>` type (which is heavily generic and would force
 * us to pin generic parameters across the engine). Only `payload` is used
 * on the fallback path; `success`/`agentRun` are read on the failure path
 * (already checked by `runAgent` before the result is returned).
 */
interface AgentExecutionResultLike {
    payload: unknown;
    /**
     * Structural narrowing of `result.agentRun`. `Message` is the canonical
     * user-facing reply text — same field the chat surface persists into
     * the AI `ConversationDetail` and renders to the user. Voice reads this
     * for TTS.
     */
    agentRun?: {
        Message?: string | null;
        ErrorMessage?: string | null;
    };
}

/**
 * Minimal async string queue: producers call `Push` as tokens arrive, the
 * consumer drains via `Iterate()` (single-consumer `AsyncIterable<string>`).
 * Once `Close()` is called and the internal buffer is empty, the iterator
 * returns `{ done: true }`.
 *
 * Used to bridge `BaseAgent.Execute()`'s `onStreaming` callback (push-based)
 * into `TTS.SynthesizeStream()`'s `AsyncIterable<string>` input (pull-based)
 * so that TTS can begin synthesizing audio as soon as the first LLM token
 * arrives instead of waiting for the full agent response.
 *
 * Single-consumer: `Iterate()` should be called exactly once per queue. The
 * iterable's internal state (`waitingResolve`, buffer cursor) assumes one
 * consumer.
 */
class TokenQueue {
    private readonly buffer: string[] = [];
    private closed = false;
    private waitingResolve: ((value: IteratorResult<string>) => void) | null = null;
    private hasReceivedAnyContent = false;

    /**
     * `true` once any non-empty string has been pushed. Used by the caller to
     * decide whether to fall back to bulk synthesis (no streaming occurred).
     */
    public get HasReceivedAnyContent(): boolean {
        return this.hasReceivedAnyContent;
    }

    /**
     * Push a token (or any string chunk) into the queue. If a consumer is
     * currently awaiting a value, hand it directly; otherwise buffer it.
     * No-ops after `Close()`.
     */
    public Push(chunk: string): void {
        if (this.closed) return;
        if (chunk.length === 0) return;
        this.hasReceivedAnyContent = true;
        if (this.waitingResolve) {
            const resolve = this.waitingResolve;
            this.waitingResolve = null;
            resolve({ value: chunk, done: false });
        } else {
            this.buffer.push(chunk);
        }
    }

    /**
     * Mark the queue closed. Any consumer currently awaiting a value gets a
     * `{ done: true }`; subsequent `Iterate()` reads will drain the buffer
     * then return done.
     */
    public Close(): void {
        if (this.closed) return;
        this.closed = true;
        if (this.waitingResolve) {
            const resolve = this.waitingResolve;
            this.waitingResolve = null;
            resolve({ value: undefined as unknown as string, done: true });
        }
    }

    /**
     * Drain the queue as an `AsyncIterable<string>`. Single-consumer: do not
     * call more than once on the same queue.
     */
    public Iterate(): AsyncIterable<string> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterator<string> {
                return {
                    async next(): Promise<IteratorResult<string>> {
                        if (self.buffer.length > 0) {
                            const value = self.buffer.shift()!;
                            return { value, done: false };
                        }
                        if (self.closed) {
                            return { value: undefined as unknown as string, done: true };
                        }
                        return new Promise<IteratorResult<string>>((resolve) => {
                            self.waitingResolve = resolve;
                        });
                    },
                };
            },
        };
    }
}
