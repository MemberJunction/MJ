import { randomUUID } from 'node:crypto';
import {
    REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE,
    RealtimeDiagLog,
    type IRealtimeInProcessUpstream,
    type JSONObject,
    type JSONValue,
    type RealtimeInProcessPeer,
    type RealtimeToolDefinition,
} from '@memberjunction/ai';
import type { LLMEvent, LLMRequest } from './assemblyAILLMGateway';
import type { AssemblyAISTTHandlers, AssemblyAITurn, IAssemblyAISTT } from './assemblyAIStreamingSTT';
import type { AssemblyAITTSHandlers, IAssemblyAITTS } from './assemblyAIStreamingTTS';
import { VoiceConversation } from './voiceConversation';
import { VoiceReply } from './voiceReply';
import { IsBackchannel } from './voiceText';

export interface VoicePipelineConfig {
    Instructions: string;
    Tools: RealtimeToolDefinition[];
    LLMModel: string;
    /** Rate of the PCM16 mono audio in both directions. */
    SampleRate: number;
    /** Whether a finished user turn gets a reply by itself. Off in a meeting, where the host decides who speaks. */
    AutoRespond: boolean;
    /** Whether the peer may change the prompt, tools and turn mode. Only for a peer on the server. */
    AcceptSessionUpdates: boolean;
    /** Said first, without the LLM. */
    FirstMessage?: string;
    /** Ends the call after this long. */
    MaxSessionSeconds?: number;
    /** Ends this connection after this long; the peer may continue the call on a new one. */
    MaxConnectionSeconds?: number;
    /** Called once the agent can hear and speak. */
    OnReady?: () => void;
}

/** The three services, as the pipeline opens them. An open rejects with nothing left open. */
export interface VoicePipelineProviders {
    OpenSTT(handlers: AssemblyAISTTHandlers, signal: AbortSignal): Promise<IAssemblyAISTT>;
    OpenTTS(handlers: AssemblyAITTSHandlers, signal: AbortSignal): Promise<IAssemblyAITTS>;
    StreamLLM(request: LLMRequest, signal: AbortSignal): AsyncIterable<LLMEvent>;
}

/** What the agent should say next: what the LLM writes (under a one-off instruction), or fixed words. */
interface ReplyRequest {
    Instruction?: string;
    FixedText?: string;
}

type ReplyStatus = 'completed' | 'cancelled' | 'failed';

/** Spoken replies are short; the cap also limits what the gateway reserves of the account's allowance. */
const MAX_OUTPUT_TOKENS = 2048;

/** A user turn the speech model says nothing about for this long is given up, in ms. Partials come about every second. */
const USER_TURN_SILENCE_MS = 15_000;

/** Replies the host may ask for in a minute. Each is a billed LLM request. */
const MAX_REPLY_REQUESTS_PER_MINUTE = 60;

/** A reply that makes no progress for this long is failed, in ms. Longer than the LLM's two tries together. */
const REPLY_STALL_MS = 30_000;

const FAILURE_APOLOGY = "Sorry, I'm having trouble answering right now.";

const CLOSE_GOING_AWAY = 1001;
const CLOSE_INTERNAL = 1011;
const BYTES_PER_SAMPLE = 2;

/**
 * A voice agent made of AssemblyAI's separate services (speech to text, an LLM, text to speech), as one realtime
 * upstream that speaks the OpenAI Realtime protocol. So MJ's shared OpenAI-protocol session and browser client drive it
 * unchanged.
 *
 * It owns the conversation loop: when a user turn has ended, what the agent says and when, whether speech is an
 * interruption, and what the listener had heard by then. At most one reply exists at a time; a request that comes while
 * one does, or while the user is speaking, waits.
 *
 * STT and TTS sessions bill while open: {@link Closed} ends both on every path.
 */
export class AssemblyAIVoicePipeline implements IRealtimeInProcessUpstream {
    private readonly conversation = new VoiceConversation();
    private readonly ending = new AbortController();
    private instructions: string;
    private tools: RealtimeToolDefinition[];
    private autoRespond: boolean;

    private stt: IAssemblyAISTT | null = null;
    private tts: IAssemblyAITTS | null = null;
    /** The voice connection whose events count: an older one may still report its loss. */
    private voiceEpoch = 0;
    private voiceOpening: Promise<void> | null = null;
    private readonly limitTimers: Array<ReturnType<typeof setTimeout>> = [];

    /** The user turn in progress. `Announced` once it has the floor: speech over a reply might be a listening sound. */
    private userTurn: { ItemID: string; Announced: boolean } | null = null;
    private userTurnTimer: ReturnType<typeof setTimeout> | null = null;
    private turnEndedMs = 0;

    private reply: VoiceReply | null = null;
    private waitingRequest: ReplyRequest | null = null;
    /** Host requests the next reply answers; the host expects a response for each. */
    private waitingCount = 0;
    /** A tool result came that no reply has been written from. */
    private resultUnanswered = false;
    private requestTimes: number[] = [];
    private stallTimer: ReturnType<typeof setTimeout> | null = null;
    private playedTimer: ReturnType<typeof setTimeout> | null = null;
    private nextSegmentID = 1;
    private firstMessagePending: boolean;

    constructor(
        private readonly peer: RealtimeInProcessPeer,
        private readonly config: VoicePipelineConfig,
        private readonly providers: VoicePipelineProviders
    ) {
        this.instructions = config.Instructions;
        this.tools = config.Tools;
        this.autoRespond = config.AutoRespond;
        this.firstMessagePending = Boolean(config.FirstMessage?.trim());
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────────────────────────

    /** Opens the services. The peer gets `session.created` once the agent can hear and speak, or the call ends. */
    public Start(): void {
        this.closeAfter(this.config.MaxSessionSeconds, REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE, 'Call time limit reached');
        this.closeAfter(this.config.MaxConnectionSeconds, CLOSE_GOING_AWAY, 'Connection time limit reached');
        void this.openServices();
    }

    private closeAfter(seconds: number | undefined, code: number, reason: string): void {
        if (seconds !== undefined) {
            this.limitTimers.push(setTimeout(() => this.peer.Close(code, reason), seconds * 1000));
        }
    }

    /** The peer is gone: ends everything that costs money. Idempotent. */
    public Closed(): void {
        if (this.ending.signal.aborted) {
            return;
        }
        this.ending.abort();
        this.clearReplyTimers();
        this.clearUserTurnTimer();
        this.limitTimers.splice(0).forEach((timer) => clearTimeout(timer));
        this.reply?.Abort.abort();
        this.reply = null;
        this.waitingRequest = null;
        this.closeService(this.stt);
        this.closeService(this.tts);
        this.stt = null;
        this.tts = null;
    }

    private get isClosed(): boolean {
        return this.ending.signal.aborted;
    }

    private async openServices(): Promise<void> {
        const [stt, tts] = await Promise.allSettled([
            this.providers.OpenSTT(this.sttHandlers(), this.ending.signal),
            this.providers.OpenTTS(this.ttsHandlers(), this.ending.signal),
        ]);
        const failure = [stt, tts].find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (failure || this.isClosed) {
            this.closeService(stt.status === 'fulfilled' ? stt.value : null);
            this.closeService(tts.status === 'fulfilled' ? tts.value : null);
            if (failure && !this.isClosed) {
                this.endCall('could not open', errorText(failure.reason));
            }
            return;
        }
        this.stt = stt.status === 'fulfilled' ? stt.value : null;
        this.tts = tts.status === 'fulfilled' ? tts.value : null;
        this.send({ type: 'session.created', session: { type: 'realtime' } });
        this.config.OnReady?.();
    }

    /** Reports a failure that ends the call. The browser may reconnect, with the conversation so far. */
    private endCall(what: string, detail: string): void {
        this.reportError(`AssemblyAI voice ${what}`, detail, 'connection_lost');
        this.peer.Close(CLOSE_INTERNAL, `AssemblyAI voice ${what}`);
    }

    private closeService(service: { Close(): Promise<void> } | null): void {
        service?.Close().catch((err: unknown) => console.warn(`[AssemblyAIVoice] closing a service failed: ${errorText(err)}`));
    }

    // ── Frames from the peer ────────────────────────────────────────────────────────────────────

    public Receive(frame: string): void {
        const event = parseObject(frame);
        if (!event || this.isClosed) {
            return;
        }
        switch (event['type']) {
            case 'input_audio_buffer.append':
                this.onAudioFrame(event['audio']);
                break;
            case 'conversation.item.create':
                this.onItem(asObject(event['item']));
                break;
            case 'response.create':
                this.onReplyRequested(asText(asObject(event['response'])?.['instructions']));
                break;
            case 'response.cancel':
                this.stopReply();
                this.startWaitingReply();
                break;
            case 'session.update':
                this.onSessionUpdate(asObject(event['session']));
                break;
            default:
                break; // the protocol has events this pipeline has no use for (buffer commits, playback clears)
        }
    }

    private onAudioFrame(audio: JSONValue | undefined): void {
        if (typeof audio !== 'string') {
            return;
        }
        this.stt?.SendAudio(Buffer.from(audio, 'base64'));
        if (this.firstMessagePending && this.stt) {
            // The browser builds its playback before its microphone, so the first audio means it can be heard.
            this.firstMessagePending = false;
            this.requestReply({ FixedText: this.config.FirstMessage });
        }
    }

    private onItem(item: JSONObject | null): void {
        if (item?.['type'] === 'function_call_output') {
            const callID = asText(item['call_id']);
            if (callID) {
                this.conversation.AddToolResult(callID, asText(item['output']) ?? '');
                this.resultUnanswered = true;
            }
            return;
        }
        if (item?.['type'] !== 'message') {
            return;
        }
        const text = contentText(item['content']);
        switch (item['role']) {
            case 'user':
                this.conversation.AddUser(text);
                break;
            case 'assistant':
                this.conversation.AddAssistant(text);
                break;
            default:
                this.conversation.AddNote(text);
        }
    }

    private onSessionUpdate(session: JSONObject | null): void {
        if (!this.config.AcceptSessionUpdates || !session) {
            return; // a browser's prompt, tools and turn mode were fixed on the server
        }
        this.instructions = asText(session['instructions']) ?? this.instructions;
        const tools = session['tools'];
        if (Array.isArray(tools)) {
            this.tools = tools.flatMap(toToolDefinition);
        }
        const turnDetection = asObject(asObject(asObject(session['audio'])?.['input'])?.['turn_detection']);
        const createResponse = turnDetection?.['create_response'];
        if (typeof createResponse === 'boolean') {
            this.autoRespond = createResponse;
        }
        this.send({ type: 'session.updated', session: { type: 'realtime' } });
    }

    // ── The user's turn ─────────────────────────────────────────────────────────────────────────

    private sttHandlers(): AssemblyAISTTHandlers {
        return {
            OnSpeechStarted: () => this.onSpeech(''),
            OnTurn: (turn) => this.onTurn(turn),
            OnLost: (message) => {
                if (!this.isClosed) {
                    this.endCall('lost its microphone connection', message);
                }
            },
        };
    }

    private onTurn(turn: AssemblyAITurn): void {
        if (this.isClosed) {
            return;
        }
        this.onSpeech(turn.Transcript);
        if (turn.EndOfTurn) {
            this.onTurnEnded(turn.Transcript.trim());
        }
    }

    /**
     * Speech was heard. It takes the floor once it has words; while a reply is in progress, only once they show it is
     * more than a listening sound ("mm-hm").
     */
    private onSpeech(transcript: string): void {
        if (this.isClosed) {
            return;
        }
        this.userTurn ??= { ItemID: newID('item'), Announced: false };
        this.restartUserTurnTimer();
        if (this.userTurn.Announced || transcript.trim().length === 0 || (this.reply && IsBackchannel(transcript))) {
            return;
        }
        this.userTurn.Announced = true;
        // Announced first: the client tells an interruption by a reply still being active.
        this.send({ type: 'input_audio_buffer.speech_started', item_id: this.userTurn.ItemID });
        if (this.reply) {
            this.stopReply();
        }
    }

    /** The turn is over if the speech model goes quiet about it: audio may have stopped arriving. */
    private restartUserTurnTimer(): void {
        this.clearUserTurnTimer();
        this.userTurnTimer = setTimeout(() => {
            console.warn(`[AssemblyAIVoice] no end of the user's turn for ${USER_TURN_SILENCE_MS} ms; giving it up`);
            this.onTurnEnded('');
        }, USER_TURN_SILENCE_MS);
    }

    private clearUserTurnTimer(): void {
        if (this.userTurnTimer) {
            clearTimeout(this.userTurnTimer);
            this.userTurnTimer = null;
        }
    }

    private onTurnEnded(transcript: string): void {
        this.clearUserTurnTimer();
        const turn = this.userTurn;
        this.userTurn = null;
        if (!turn?.Announced) {
            return; // a listening sound over a reply: nobody took the floor
        }
        this.send({ type: 'input_audio_buffer.speech_stopped', item_id: turn.ItemID });
        this.send({ type: 'input_audio_buffer.committed', item_id: turn.ItemID });
        if (transcript.length === 0) {
            this.send({ type: 'conversation.item.input_audio_transcription.failed', item_id: turn.ItemID });
            if (this.resultUnanswered) {
                // The client drops its request for a result when the user speaks: their turn was to be answered instead.
                this.waitingRequest = {};
            }
            this.startWaitingReply();
            return;
        }
        this.turnEndedMs = Date.now();
        this.send({ type: 'conversation.item.input_audio_transcription.completed', item_id: turn.ItemID, content_index: 0, transcript });
        this.conversation.AddUser(transcript);
        if (this.autoRespond) {
            this.startReply({}); // it also answers whatever was waiting: that is in the conversation
        } else {
            this.startWaitingReply();
        }
    }

    // ── The agent's reply ───────────────────────────────────────────────────────────────────────

    /** The host asked for a reply. It expects one response (or error) for each request. */
    private onReplyRequested(instruction: string | undefined): void {
        const now = Date.now();
        this.requestTimes = this.requestTimes.filter((time) => now - time < 60_000);
        if (this.requestTimes.length >= MAX_REPLY_REQUESTS_PER_MINUTE) {
            this.reportError('AssemblyAI voice was asked for too many replies', `more than ${MAX_REPLY_REQUESTS_PER_MINUTE} a minute`, 'rate_limited');
            return;
        }
        this.requestTimes.push(now);
        this.waitingCount++;
        this.requestReply({ Instruction: instruction });
    }

    /** Starts a reply, or keeps the request until the reply or the user's turn in progress is over. */
    private requestReply(request: ReplyRequest): void {
        if (!this.reply && !this.userTurn?.Announced) {
            this.startReply(request);
            return;
        }
        // One reply answers all that is waiting. A plain request (a tool result to voice) wins over a spoken update.
        const isPlain = (r: ReplyRequest): boolean => !r.Instruction && !r.FixedText;
        this.waitingRequest = this.waitingRequest && isPlain(this.waitingRequest) ? this.waitingRequest : request;
    }

    private startWaitingReply(): void {
        if (this.waitingRequest && !this.reply && !this.userTurn?.Announced) {
            this.startReply(this.waitingRequest);
        }
    }

    private startReply(request: ReplyRequest): void {
        this.stopReply();
        this.answerMergedRequests();
        this.waitingRequest = null;
        const bytesPerMs = (this.config.SampleRate * BYTES_PER_SAMPLE) / 1000;
        const reply: VoiceReply = new VoiceReply(newID('resp'), newID('item'), bytesPerMs, {
            Speak: (text) => {
                const id = this.nextSegmentID++;
                this.tts?.Speak(text, id);
                return id;
            },
            OnPieceStarted: (delta) => this.send({ type: 'response.output_audio_transcript.delta', response_id: reply.ID, item_id: reply.ItemID, delta }),
        });
        this.reply = reply;
        this.send({ type: 'response.created', response: { id: reply.ID, status: 'in_progress' } });
        void this.runReply(reply, request);
    }

    /** One reply answers all waiting requests; the others get an empty response of their own. */
    private answerMergedRequests(): void {
        for (; this.waitingCount > 1; this.waitingCount--) {
            const id = newID('resp');
            this.send({ type: 'response.created', response: { id, status: 'in_progress' } });
            this.send({ type: 'response.done', response: { id, status: 'cancelled' } });
        }
        this.waitingCount = 0;
    }

    private async runReply(reply: VoiceReply, request: ReplyRequest): Promise<void> {
        this.noteProgress(reply);
        try {
            await this.ensureVoice();
            if (this.reply !== reply) {
                return;
            }
            this.conversation.BeginReply();
            if (request.FixedText) {
                reply.AddText(request.FixedText);
            } else {
                await this.writeReply(reply, request.Instruction);
            }
            if (this.reply !== reply) {
                return;
            }
            reply.FinishText();
        } catch (err) {
            if (this.reply !== reply) {
                return;
            }
            this.failReply(reply, 'could not answer', errorText(err));
        }
        this.finishWhenPlayed(reply);
    }

    /** Streams the LLM's words, and its tool calls, into the reply. */
    private async writeReply(reply: VoiceReply, instruction: string | undefined): Promise<void> {
        if (!instruction) {
            this.resultUnanswered = false; // a reply under an instruction may say something else
        }
        const request: LLMRequest = {
            Model: this.config.LLMModel,
            Messages: this.conversation.Messages(this.instructions, instruction),
            Tools: this.tools,
            MaxOutputTokens: MAX_OUTPUT_TOKENS,
        };
        for await (const event of this.providers.StreamLLM(request, reply.Abort.signal)) {
            if (this.reply !== reply) {
                return;
            }
            this.noteProgress(reply);
            switch (event.Kind) {
                case 'text':
                    reply.AddText(event.Text);
                    break;
                case 'toolCalls':
                    reply.ToolCalls.push(...event.Calls);
                    break;
                case 'usage':
                    reply.Usage = { InputTokens: event.InputTokens, OutputTokens: event.OutputTokens };
                    break;
            }
        }
    }

    /**
     * Asks the host to run the reply's tool calls. After the last audio has been sent, so the client's "speaking" does
     * not replace the host's busy indicator; before it has played, so the tool runs meanwhile.
     */
    private handOverToolCalls(reply: VoiceReply): void {
        const calls = reply.ToolCalls;
        reply.ToolCalls = [];
        if (calls.length === 0) {
            return;
        }
        // Recorded now, not when the words have played: the result may come back before that.
        this.conversation.AddToolCalls(reply.FullText, calls);
        reply.RecordedWithToolCalls = true;
        for (const call of calls) {
            this.send({
                type: 'response.function_call_arguments.done',
                response_id: reply.ID,
                item_id: newID('item'),
                call_id: call.CallID,
                name: call.Name,
                arguments: call.Arguments,
            });
        }
    }

    /** Opens the voice again when an earlier connection was lost. Replies that need it meanwhile share the attempt. */
    private ensureVoice(): Promise<void> {
        if (this.tts?.IsOpen) {
            return Promise.resolve();
        }
        this.voiceOpening ??= this.openVoice().finally(() => (this.voiceOpening = null));
        return this.voiceOpening;
    }

    private async openVoice(): Promise<void> {
        const tts = await this.providers.OpenTTS(this.ttsHandlers(), this.ending.signal);
        if (this.isClosed) {
            this.closeService(tts);
            return;
        }
        this.tts = tts;
    }

    /** Handlers for the next voice connection. Events of the ones before it no longer count. */
    private ttsHandlers(): AssemblyAITTSHandlers {
        const epoch = ++this.voiceEpoch;
        const ifCurrent = (act: () => void): void => {
            if (epoch === this.voiceEpoch && !this.isClosed) {
                act();
            }
        };
        return {
            OnAudio: (base64, segmentID) => ifCurrent(() => this.onReplyAudio(base64, segmentID)),
            OnSegmentDone: (segmentID) =>
                ifCurrent(() => {
                    this.reply?.FinishSegment(segmentID);
                    this.progressAndFinish();
                }),
            OnLost: (message) => ifCurrent(() => this.onVoiceLost(message)),
        };
    }

    /** Gives up on a voice connection that stopped answering, so the next reply opens another. */
    private dropVoice(): void {
        this.voiceEpoch++;
        this.closeService(this.tts);
        this.tts = null;
    }

    private onReplyAudio(base64: string, segmentID: number): void {
        const reply = this.reply;
        if (!reply) {
            return;
        }
        const isFirst = reply.PlayEndMs === 0;
        if (!reply.AddAudio(segmentID, Buffer.byteLength(base64, 'base64'), Date.now())) {
            return;
        }
        if (isFirst && this.turnEndedMs > 0) {
            RealtimeDiagLog(`[AssemblyAIVoice] first audio ${Date.now() - this.turnEndedMs} ms after the last user turn ended`);
        }
        this.send({ type: 'response.output_audio.delta', response_id: reply.ID, item_id: reply.ItemID, output_index: 0, content_index: 0, delta: base64 });
        this.noteProgress(reply);
    }

    private onVoiceLost(message: string): void {
        console.warn(`[AssemblyAIVoice] ${message}`);
        const reply = this.reply;
        if (reply) {
            reply.Abort.abort();
            reply.AbandonUnspoken();
            this.markFailed(reply, 'lost its voice connection', message);
            this.finishWhenPlayed(reply);
        }
    }

    private progressAndFinish(): void {
        if (this.reply) {
            this.noteProgress(this.reply);
            this.finishWhenPlayed(this.reply);
        }
    }

    /** Ends the reply once its last audio has played; a no-op while there is more to come. */
    private finishWhenPlayed(reply: VoiceReply): void {
        if (this.reply !== reply || !reply.IsComplete) {
            return;
        }
        this.handOverToolCalls(reply);
        this.clearReplyTimers();
        const remainingMs = reply.PlayEndMs - Date.now();
        if (remainingMs <= 0) {
            this.completeReply(reply);
            return;
        }
        this.playedTimer = setTimeout(() => this.completeReply(reply), remainingMs);
    }

    private completeReply(reply: VoiceReply): void {
        // Not "now": a timer may fire up to a millisecond early, which would cost the last word.
        this.endReply(reply, reply.FailureMessage ? 'failed' : 'completed', reply.HeardBy(Math.max(Date.now(), reply.PlayEndMs)));
        this.startWaitingReply();
    }

    /** Stops the reply in progress: the user took the floor, the host cancelled it, or another replaces it. */
    private stopReply(): void {
        const reply = this.reply;
        if (!reply) {
            return;
        }
        reply.Abort.abort();
        this.tts?.Cancel();
        this.endReply(reply, 'cancelled', reply.HeardBy(Date.now()));
    }

    private endReply(reply: VoiceReply, status: ReplyStatus, heard: string): void {
        this.reply = null;
        this.clearReplyTimers();
        if (heard.length > 0) {
            this.send({ type: 'response.output_audio_transcript.done', response_id: reply.ID, item_id: reply.ItemID, transcript: heard });
            if (reply.KeepInHistory && !reply.RecordedWithToolCalls) {
                this.conversation.AddReply(heard.length < reply.FullText.length ? `${heard}…` : heard);
                this.stt?.UpdateAgentContext(heard);
            }
        }
        this.send({
            type: 'response.done',
            response: {
                id: reply.ID,
                status,
                ...(reply.Usage ? { usage: { input_tokens: reply.Usage.InputTokens, output_tokens: reply.Usage.OutputTokens } } : {}),
            },
        });
    }

    /** The reply failed before or while it was written. Says so, unless some of it has been spoken already. */
    private failReply(reply: VoiceReply, what: string, detail: string): void {
        this.markFailed(reply, what, detail);
        reply.DiscardUnfinishedText();
        if (!reply.HasSpeech && this.tts?.IsOpen) {
            reply.KeepInHistory = false;
            reply.AddText(FAILURE_APOLOGY);
        }
        reply.FinishText();
    }

    private markFailed(reply: VoiceReply, what: string, detail: string): void {
        if (!reply.FailureMessage) {
            reply.FailureMessage = detail;
            this.reportError(`AssemblyAI voice ${what}`, detail, 'reply_failed');
        }
    }

    /** Restarts the stall deadline: something arrived for the reply. */
    private noteProgress(reply: VoiceReply): void {
        if (this.stallTimer) {
            clearTimeout(this.stallTimer);
        }
        this.stallTimer = setTimeout(() => this.onStall(reply), REPLY_STALL_MS);
    }

    private onStall(reply: VoiceReply): void {
        if (this.reply !== reply) {
            return;
        }
        reply.Abort.abort();
        this.dropVoice();
        this.markFailed(reply, 'stopped answering', `no progress for ${REPLY_STALL_MS} ms`);
        reply.AbandonUnspoken();
        this.finishWhenPlayed(reply);
    }

    private clearReplyTimers(): void {
        for (const timer of [this.stallTimer, this.playedTimer]) {
            if (timer) {
                clearTimeout(timer);
            }
        }
        this.stallTimer = null;
        this.playedTimer = null;
    }

    // ── To the peer ─────────────────────────────────────────────────────────────────────────────

    private send(event: JSONObject): void {
        if (!this.isClosed) {
            this.peer.Send(JSON.stringify(event));
        }
    }

    /** Logs the detail, and tells the peer what happened without it: provider text does not belong in a browser. */
    private reportError(message: string, detail: string, code: string): void {
        console.warn(`[AssemblyAIVoice] ${message}: ${detail}`);
        this.send({ type: 'error', error: { type: 'server_error', code, message } });
    }
}

function newID(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function parseObject(text: string): JSONObject | null {
    try {
        return asObject(JSON.parse(text) as JSONValue);
    } catch {
        return null; // not JSON: nothing to act on, and a bad frame must not end the call
    }
}

function asObject(value: JSONValue | undefined): JSONObject | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

function asText(value: JSONValue | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/** The text parts of a message item, joined. */
function contentText(content: JSONValue | undefined): string {
    if (!Array.isArray(content)) {
        return '';
    }
    return content
        .map((part) => asText(asObject(part)?.['text']) ?? '')
        .filter((text) => text.length > 0)
        .join('\n');
}

function toToolDefinition(value: JSONValue): RealtimeToolDefinition[] {
    const tool = asObject(value);
    const name = asText(tool?.['name']);
    if (tool?.['type'] !== 'function' || !name) {
        return [];
    }
    return [{ Name: name, Description: asText(tool['description']) ?? '', ParametersSchema: asObject(tool['parameters']) ?? {} }];
}
