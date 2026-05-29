import {
    AfterViewChecked,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
    ViewChild,
    ViewEncapsulation,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Subscription } from 'rxjs';

import { VoiceWidgetService } from './voice-widget.service';
import {
    VoiceActionableCommand,
    VoiceAudioFrame,
    VoiceChannelName,
    VoiceTranscriptEntry,
    VoiceTranscriptEvent,
    VoiceWidgetStatus,
} from './voice-widget.types';

// ---------------------------------------------------------------------------
// Minimal SpeechRecognition type shim.
//
// The Web Speech API is not part of TypeScript's default DOM lib at TS 5.x.
// We declare just enough of the surface we touch to stay `any`-free.
// ---------------------------------------------------------------------------
interface SpeechRecognitionAlternativeLike {
    transcript: string;
}
interface SpeechRecognitionResultLike {
    isFinal: boolean;
    0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
    resultIndex: number;
    results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
    error: string;
}
interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onstart: (() => void) | null;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
interface WindowWithSpeechRecognition extends Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
}

/**
 * `<mj-voice-widget>` — provider-agnostic UI for talking to an MJ AI Agent
 * over the text-in / voice-out channel path. The user types OR speaks (via
 * the browser's Web Speech API), the agent's reply streams back as PCM audio.
 *
 * Wire shape (in/out):
 *   Inputs:
 *     - `AgentID`        — UUID of the MJ AI Agent to drive.
 *     - `ChannelName`    — `'voice-cascaded'` (default) or `'voice-realtime'`.
 *                          For the text-in/voice-out demo, `'voice-cascaded'`
 *                          + no `RoomName` is the canonical pair.
 *     - `AutoStart`      — kick off `Start()` on `ngOnInit` (rare; usually the
 *                          user clicks Start so the AudioContext can resume
 *                          under a gesture).
 *   Outputs:
 *     - `SessionStarted` / `SessionEnded` / `ErrorOccurred`.
 *
 * Generic-package constraints (see `packages/Angular/Generic/CLAUDE.md`):
 *   - No `Router` / `ActivatedRoute` imports.
 *   - Audio playback lives in this component so callers don't need to wire it.
 *   - Standalone, `@if`/`@for` syntax, `inject()` DI, design tokens.
 *
 * Microphone (Web Speech API):
 *   - Chrome / Edge expose `window.webkitSpeechRecognition` (Google STT under
 *     the hood, free, no signup). Firefox/Safari do not — we surface a
 *     "requires Chrome or Edge" warning when `MicSupported` is false.
 *   - Final transcripts are submitted via the same `SubmitChannelTextTurn`
 *     mutation as typed input — the server can't tell the difference.
 *   - The mic auto-pauses while the agent is speaking (echo + self-transcribe
 *     prevention) and auto-resumes when playback drains, but only if the user
 *     had it on (`wantsMicOn`).
 */
@Component({
    selector: 'mj-voice-widget',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective],
    templateUrl: './voice-widget.component.html',
    styleUrls: ['./voice-widget.component.scss'],
    encapsulation: ViewEncapsulation.Emulated,
})
export class VoiceWidgetComponent implements OnInit, OnDestroy, AfterViewChecked {
    /** Scroll container — auto-scrolled to bottom on new messages. */
    @ViewChild('transcriptEl', { static: false })
    private transcriptEl?: ElementRef<HTMLElement>;
    /** Track length of last-rendered transcript to detect new entries cheaply. */
    private lastRenderedTranscriptLength = 0;
    /** UUID of the agent to talk to. Required. */
    @Input() public AgentID!: string;

    /** Channel name registered in `MJ: AI Agent Channels`. Defaults to the demo path. */
    @Input() public ChannelName: VoiceChannelName = 'voice-cascaded';

    /**
     * Optional Conversation ID — pin this voice session to an existing chat.
     * Per-turn ConversationDetail rows get written to it so the conversation
     * keeps continuity across voice + text surfaces.
     *
     * If omitted, the server auto-creates a fresh conversation for the voice
     * session (named "Voice with <agent>"). Safe to leave undefined for
     * standalone voice; pass in a Conversation.ID to join an open chat tab.
     */
    @Input() public ConversationID: string | null = null;

    /**
     * If true, attempt to start the session in `ngOnInit`. Mostly useful in
     * tests — for real users, clicking Start lets the browser unlock the
     * AudioContext under a user gesture (autoplay policy).
     */
    @Input() public AutoStart = false;

    @Output() public readonly SessionStarted = new EventEmitter<{ SessionID: string }>();
    @Output() public readonly SessionEnded = new EventEmitter<{ SessionID: string; Reason?: string }>();
    @Output() public readonly ErrorOccurred = new EventEmitter<{ Error: string }>();
    /**
     * Emitted when the user clicks an actionable-command chip. Host apps
     * (e.g. Explorer) decide how to execute — typically a route/navigation,
     * a record open, or running an action. The widget itself is generic and
     * doesn't know what the commands mean.
     */
    @Output() public readonly ActionableCommandClicked = new EventEmitter<VoiceActionableCommand>();

    public Status: VoiceWidgetStatus = 'idle';
    public Transcript: VoiceTranscriptEntry[] = [];
    public CurrentInput = '';
    public AudioChunkCount = 0;
    public SessionID: string | null = null;
    public LastError: string | null = null;
    /**
     * Latest actionable commands from the most recent `agent-response`
     * transcript event. Cleared when the user submits a new turn (so chips
     * don't outlive their context).
     */
    public ActionableCommands: VoiceActionableCommand[] = [];
    /**
     * True while a user turn is in flight (between submit and agent-response /
     * error). Drives the typing-dots indicator at the bottom of the transcript.
     */
    public IsAgentThinking = false;

    // -- Microphone state ------------------------------------------------------
    /** True while the underlying SpeechRecognition is actively listening. */
    public IsMicEnabled = false;
    /** Partial transcript shown to the user as they speak. */
    public InterimTranscript = '';
    /** False on browsers without Web Speech API (Firefox, Safari w/o flag). */
    public MicSupported = false;
    /** Last error from the recognizer, displayed in the status area. */
    public MicError: string | null = null;
    /** True while the agent's audio is playing back — mic auto-pauses. */
    public AgentSpeaking = false;

    private readonly voiceService = inject(VoiceWidgetService);
    private readonly cdr = inject(ChangeDetectorRef);
    /**
     * Shared MJ client-tool dispatcher. Reused as-is from Skip / Explorer
     * chat — the voice channel is just another transport on top of the same
     * SessionID-keyed PubSub topic. The consuming app (Explorer) registers
     * the actual tool handlers (navigateToRecord, showResource, etc.); we
     * just attach a session ID so the subscription starts and stops with
     * the voice call.
     */
    private readonly agentClient = inject(AgentClientService);

    private audioSubscription: Subscription | null = null;
    private transcriptSubscription: Subscription | null = null;
    /** Bound `beforeunload`/`pagehide` listener — removed in ngOnDestroy. */
    private beforeUnloadHandler: (() => void) | null = null;
    /**
     * Buffer of streamed assistant-text chunks for the in-progress turn.
     * Reset on each user submission. Appended to the transcript on
     * agent-response finalization.
     */
    private assistantBuffer = '';
    private audioCtx: AudioContext | null = null;
    /** Next scheduled start time for the audio graph — drives gapless playback. */
    private nextStartTime = 0;
    /**
     * Tracks whether we've seen an audio chunk since the last user turn.
     * Used to add a single "agent speaking" entry per agent reply rather than
     * one per PCM frame.
     */
    private agentTurnInProgress = false;

    // -- Microphone internals --------------------------------------------------
    private recognition: SpeechRecognitionLike | null = null;
    /**
     * User-toggled intent. Distinct from `IsMicEnabled` (the actual recognizer
     * state). We honor `wantsMicOn` when deciding whether to auto-restart in
     * `onend` or after the agent finishes speaking.
     */
    private wantsMicOn = false;
    /** Snapshot taken when agent starts speaking so we can restore mic state after. */
    private wasMicEnabledBeforeAgentSpoke = false;
    /**
     * Polling interval that checks whether the agent's scheduled audio has
     * drained. Cheaper than wiring `source.onended` on every PCM frame —
     * playback is gapless, so only the *final* drain matters and we can detect
     * it by comparing `audioCtx.currentTime` to `nextStartTime`.
     */
    private agentSpeakingTimer: ReturnType<typeof setInterval> | null = null;

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    public async ngOnInit(): Promise<void> {
        this.initializeMic();
        // beforeunload — ensure orphaned `Running` AgentRun rows finalize on
        // tab close. Angular's ngOnDestroy doesn't reliably fire when the
        // browser is closed; `navigator.sendBeacon` is the standard escape
        // hatch. It POSTs synchronously inside the unload handler.
        this.beforeUnloadHandler = () => this.sendEndBeacon();
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        window.addEventListener('pagehide', this.beforeUnloadHandler);
        if (this.AutoStart && this.AgentID) {
            await this.Start();
        }
    }

    /**
     * Auto-scroll the transcript to bottom when new entries arrive. We track
     * length rather than diff content because the upsert-in-place flow
     * mutates the last entry; we want a scroll on both new entries AND
     * in-place streaming appends (so users see the message growing).
     */
    public ngAfterViewChecked(): void {
        const el = this.transcriptEl?.nativeElement;
        if (!el) return;
        // Heuristic: if the user is near the bottom already, follow.
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (isNearBottom || this.Transcript.length !== this.lastRenderedTranscriptLength) {
            el.scrollTop = el.scrollHeight;
        }
        this.lastRenderedTranscriptLength = this.Transcript.length;
    }

    public async ngOnDestroy(): Promise<void> {
        this.stopAgentSpeakingTimer();
        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
            window.removeEventListener('pagehide', this.beforeUnloadHandler);
            this.beforeUnloadHandler = null;
        }
        if (this.recognition) {
            this.wantsMicOn = false;
            try { this.recognition.abort(); } catch { /* ignore — abort on a non-started recognizer throws */ }
            this.recognition = null;
        }
        await this.teardown('cancelled');
    }

    /**
     * Fire-and-forget end-of-session signal on tab close. Uses
     * `navigator.sendBeacon` because regular fetch() inside `beforeunload`
     * is unreliable — browsers cancel pending requests. The beacon survives
     * tab close.
     *
     * Reads the GraphQL URL from the active `GraphQLDataProvider` so we
     * hit the same endpoint the rest of the app uses. If the provider
     * isn't configured (shouldn't happen — the widget is started after
     * Explorer boots), we silently skip; the server-side run timeout is
     * the backstop in that case.
     */
    private sendEndBeacon(): void {
        if (!this.SessionID) return;
        try {
            const url = GraphQLDataProvider.Instance.ConfigData?.URL;
            if (!url) return;
            const body = JSON.stringify({
                query: `mutation E($input: EndChannelSessionInput!) {
                    EndChannelSession(input: $input) { OK }
                }`,
                variables: {
                    input: { SessionID: this.SessionID, Reason: 'user-disconnect' },
                },
            });
            navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        } catch {
            // best-effort — nothing more we can do during unload
        }
    }

    // ---------------------------------------------------------------------
    // Public API (template-bound + programmatic)
    // ---------------------------------------------------------------------

    /**
     * Start the session. **Must be called from a user gesture** the first time
     * so the browser allows `AudioContext.resume()`. Subsequent restarts after
     * `End()` work fine since the context is already running.
     */
    public async Start(): Promise<void> {
        if (this.Status === 'connecting' || this.Status === 'active') {
            return;
        }
        if (!this.AgentID) {
            this.failWith('AgentID is required before starting a voice session.');
            return;
        }
        this.Status = 'connecting';
        this.LastError = null;

        try {
            await this.ensureAudioContext();

            const result = await this.voiceService.StartSession(
                this.AgentID,
                this.ChannelName,
                this.ConversationID
            );
            this.SessionID = result.SessionID;

            // Start the shared MJ client-tool subscription keyed on this
            // session's ID. Server-side `ClientToolRequestManager.RequestClientTool`
            // publishes with this exact SessionID, so the listener picks up
            // tool calls emitted by any of the agent's prompt steps.
            this.agentClient.StartSession(result.SessionID);

            this.audioSubscription = this.voiceService.SubscribeToAudio(result.SessionID).subscribe({
                next: (frame) => this.onAudioFrame(frame),
                error: (err) => this.failWith(this.formatError(err)),
                complete: () => {
                    // Stream completed naturally — usually means the session ended
                    // on the server side. Mark ourselves ended unless we already are.
                    if (this.Status === 'active') {
                        this.Status = 'ended';
                        this.cdr.markForCheck();
                    }
                },
            });

            // Transcript events arrive on a sibling subscription and drive
            // the running transcript pane + actionable-command chips. An
            // error here is non-fatal — audio still works without transcripts.
            this.transcriptSubscription = this.voiceService
                .SubscribeToTranscript(result.SessionID)
                .subscribe({
                    next: (event) => this.onTranscriptEvent(event),
                    error: (err) =>
                        console.warn('[VoiceWidget] transcript subscription error:', err),
                });

            this.Status = 'active';
            this.SessionStarted.emit({ SessionID: result.SessionID });
            this.cdr.markForCheck();
        } catch (err) {
            this.failWith(this.formatError(err));
        }
    }

    /**
     * Submit the current text input as a user turn. Auto-starts the session if
     * one isn't active yet (matches the voice-demo.html UX — typing implies
     * "go").
     */
    public async Send(): Promise<void> {
        const text = this.CurrentInput.trim();
        if (!text) return;
        this.CurrentInput = '';
        await this.submitUserText(text);
    }

    /**
     * End the session cleanly. Idempotent.
     */
    public async End(): Promise<void> {
        const sessionId = this.SessionID;
        // Stop the mic when the session ends — there's nothing to send to.
        if (this.recognition) {
            this.wantsMicOn = false;
            try { this.recognition.stop(); } catch { /* ignore */ }
        }
        await this.teardown('user-disconnect');
        if (sessionId) {
            this.SessionEnded.emit({ SessionID: sessionId, Reason: 'user-disconnect' });
        }
    }

    /** Handle Enter in the text input (Shift+Enter for newline). */
    public OnInputKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void this.Send();
        }
    }

    /**
     * Grow / shrink the composer textarea to fit content. Matches the
     * "type as much as you want" UX of modern chat composers. Bounded by
     * the SCSS `max-height: 200px` rule, after which the textarea scrolls.
     */
    public OnInputAutoResize(event: Event): void {
        const el = event.target as HTMLTextAreaElement | null;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }

    // ---------------------------------------------------------------------
    // Public API — microphone
    // ---------------------------------------------------------------------

    /** Toggle the microphone on or off (template-bound). */
    public ToggleMic(): void {
        if (this.IsMicEnabled || this.wantsMicOn) {
            this.StopMic();
        } else {
            void this.StartMic();
        }
    }

    /**
     * Turn on the mic. The click handler call is what unlocks the AudioContext
     * in Safari/Chrome's autoplay policy (mic gesture also doubles as audio
     * unlock — we resume the context here too).
     */
    public async StartMic(): Promise<void> {
        if (!this.MicSupported || !this.recognition) return;
        await this.ensureAudioContext();
        this.wantsMicOn = true;
        this.MicError = null;
        try {
            this.recognition.start();
        } catch (err) {
            // "InvalidStateError: recognition has already started" is benign —
            // we tolerate it. Anything else gets surfaced.
            const msg = this.formatError(err);
            if (!/already started|InvalidStateError/i.test(msg)) {
                this.MicError = msg;
            }
        }
        this.cdr.markForCheck();
    }

    /** Turn off the mic. */
    public StopMic(): void {
        this.wantsMicOn = false;
        if (this.recognition) {
            try { this.recognition.stop(); } catch { /* ignore — stopping a non-started recognizer throws */ }
        }
        this.cdr.markForCheck();
    }

    // ---------------------------------------------------------------------
    // Internals — microphone (Web Speech API)
    // ---------------------------------------------------------------------

    private initializeMic(): void {
        const w = window as WindowWithSpeechRecognition;
        const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
        if (!Ctor) {
            this.MicSupported = false;
            return;
        }
        this.MicSupported = true;
        this.recognition = new Ctor();
        this.recognition.lang = 'en-US';
        this.recognition.continuous = false;     // one utterance per turn; we restart for each
        this.recognition.interimResults = true;  // show transcription as user speaks
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            this.IsMicEnabled = true;
            this.MicError = null;
            this.InterimTranscript = '';
            this.cdr.markForCheck();
        };

        this.recognition.onresult = (event) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    final += result[0].transcript;
                } else {
                    interim += result[0].transcript;
                }
            }
            this.InterimTranscript = interim;
            const trimmed = final.trim();
            if (trimmed) {
                this.InterimTranscript = '';
                void this.submitUserText(trimmed);
            }
            this.cdr.markForCheck();
        };

        this.recognition.onerror = (event) => {
            // 'no-speech' and 'aborted' are routine — don't surface as errors.
            if (event.error === 'no-speech' || event.error === 'aborted') {
                return;
            }
            this.MicError = event.error || 'mic error';
            this.IsMicEnabled = false;
            this.cdr.markForCheck();
        };

        this.recognition.onend = () => {
            this.IsMicEnabled = false;
            this.InterimTranscript = '';
            this.cdr.markForCheck();
            // Auto-restart if the user still wants the mic on and the agent
            // isn't currently speaking. Continuous-listening UX — one utterance
            // ends, immediately listen for the next.
            if (this.wantsMicOn && !this.AgentSpeaking && this.SessionID && this.recognition) {
                setTimeout(() => {
                    if (this.wantsMicOn && !this.AgentSpeaking && this.recognition) {
                        try { this.recognition.start(); } catch { /* benign races */ }
                    }
                }, 100);
            }
        };
    }

    /**
     * Shared path for both the Send button and the mic's final-transcript
     * handler. Auto-starts the session, appends the user turn to the transcript,
     * and submits via GraphQL.
     */
    private async submitUserText(text: string): Promise<void> {
        if (this.Status !== 'active' || !this.SessionID) {
            // Auto-start (typing/talking is a user gesture, so AudioContext.resume() will succeed).
            await this.Start();
            if (!this.SessionID) return; // Start failed; error already surfaced.
        }

        // Clear the chips and assistant buffer for the new turn — chips are
        // tied to the most recent agent response, not historic.
        this.ActionableCommands = [];
        this.assistantBuffer = '';
        // Note: we deliberately do NOT appendTranscript('user', text) here.
        // The server now publishes a `user` transcript event for every turn
        // (including text-input), and the widget renders that. Appending
        // locally as well would produce a double entry.
        this.agentTurnInProgress = false;

        try {
            const submitResult = await this.voiceService.SubmitTextTurn(this.SessionID!, text);
            if (!submitResult.OK) {
                const msg = submitResult.ErrorMessage ?? 'SubmitChannelTextTurn returned OK=false';
                this.appendTranscript('system', msg);
                this.LastError = msg;
                this.cdr.markForCheck();
            }
        } catch (err) {
            this.failWith(this.formatError(err));
        }
    }

    // ---------------------------------------------------------------------
    // Internals — audio playback
    // ---------------------------------------------------------------------

    /**
     * Create the AudioContext on first use (lazily) and resume it. This MUST
     * be called from a user gesture handler the first time, hence the call
     * site in `Start()` / `Send()` / `StartMic()` (all initiated by clicks/keystrokes).
     */
    private async ensureAudioContext(): Promise<void> {
        if (!this.audioCtx) {
            this.audioCtx = new AudioContext();
        }
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
    }

    /**
     * Decode one PCM frame and schedule it for gapless playback. Algorithm
     * mirrors `voice-demo.html`'s `playPCMFrame`:
     *
     *   1. base64 → bytes → Int16Array
     *   2. Int16 → Float32 (normalize by 32768)
     *   3. Demux channels if `ChannelCount > 1`
     *   4. Schedule at `max(currentTime, nextStartTime)` and advance the cursor
     *
     * Non-PCM media types fall through with a console warning — supporting
     * compressed formats (mp3/opus) would mean `audioCtx.decodeAudioData`,
     * which is async-per-frame and would break the gapless scheduling. The
     * server currently only emits `audio/pcm` for ElevenLabs cascaded TTS, so
     * this is fine for the demo.
     */
    /**
     * Render a transcript event from the server. User finals append a new
     * row. Assistant-text deltas append into the in-progress assistant row
     * (created on the first delta of each turn). The terminal `agent-response`
     * event populates the chip row and flushes the assembled text in case
     * the streaming path was empty.
     */
    private onTranscriptEvent(event: VoiceTranscriptEvent): void {
        switch (event.Kind) {
            case 'user':
                if (event.Text) {
                    this.appendTranscript('user', event.Text);
                    // A user turn just started — agent will now think.
                    this.IsAgentThinking = true;
                }
                break;
            case 'assistant-text':
                // Intentionally not rendered to the transcript. Multi-step
                // loop agents emit a `message` field per step; piping every
                // delta into the bubble produces concatenated nonsense like
                // "Hello!I'm doing well…". The `agent-response` event below
                // carries the canonical final message — that's what we
                // display. We could surface intermediate planner output as
                // a separate ephemeral "thinking" bubble later, but the
                // typing-dots indicator is enough liveness for now.
                break;
            case 'agent-response':
                this.IsAgentThinking = false;
                if (event.Text) {
                    this.appendTranscript('agent', event.Text);
                }
                if (event.ActionableCommands && event.ActionableCommands.length > 0) {
                    this.ActionableCommands = event.ActionableCommands;
                }
                this.assistantBuffer = '';
                break;
            case 'error':
                this.IsAgentThinking = false;
                if (event.Text) {
                    this.appendTranscript('system', `Error: ${event.Text}`);
                }
                break;
        }
        this.cdr.markForCheck();
    }

    /**
     * Replace-in-place if the last entry is the in-progress agent row,
     * otherwise append a new agent row. This is what gives the running
     * "type-in-place" effect as the message-field tokens stream.
     */
    private upsertAssistantTranscript(text: string): void {
        const last = this.Transcript[this.Transcript.length - 1];
        if (last && last.Role === 'agent') {
            // Replace the last entry — Angular sees a new array via slice
            // because the entry object is the same reference but the parent
            // array gets a fresh shell.
            const next = this.Transcript.slice(0, -1);
            next.push({ Role: 'agent', Text: text, Timestamp: last.Timestamp });
            this.Transcript = next;
        } else {
            this.Transcript = [
                ...this.Transcript,
                { Role: 'agent', Text: text, Timestamp: new Date() },
            ];
        }
    }

    /** Handle a chip click; emit upward to the host app. */
    public OnActionableCommandClick(cmd: VoiceActionableCommand): void {
        this.ActionableCommandClicked.emit(cmd);
    }

    private onAudioFrame(frame: VoiceAudioFrame): void {
        if (frame.MediaType !== 'audio/pcm') {
            console.warn(
                `[VoiceWidget] Unsupported media type '${frame.MediaType}' — only audio/pcm is rendered by the gapless scheduler. Frame dropped.`
            );
            return;
        }
        if (!this.audioCtx) {
            // Should not happen — ensureAudioContext() runs before Subscribe.
            return;
        }

        this.AudioChunkCount += 1;
        // Note: we no longer append a '🔊 speaking…' placeholder here. The
        // transcript subscription now delivers the actual assistant text in
        // real time via `onTranscriptEvent`, which is far better UX. We still
        // track `agentTurnInProgress` so other code (e.g. mic-suppression
        // heuristics) can read it.
        this.agentTurnInProgress = true;

        const audioBuffer = this.decodePCMFrame(frame, this.audioCtx);
        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioCtx.destination);
        const startAt = Math.max(this.audioCtx.currentTime, this.nextStartTime);
        source.start(startAt);
        this.nextStartTime = startAt + audioBuffer.duration;

        // Mark the agent as speaking so the mic auto-pauses. If this is the
        // first frame of the turn, snapshot the user's mic intent so we can
        // restore it later, then stop the recognizer.
        if (!this.AgentSpeaking) {
            this.wasMicEnabledBeforeAgentSpoke = this.wantsMicOn;
            if (this.IsMicEnabled || this.wantsMicOn) {
                // Suppress auto-restart in `onend` while the agent is talking.
                this.wantsMicOn = false;
                if (this.recognition) {
                    try { this.recognition.stop(); } catch { /* ignore */ }
                }
            }
            this.AgentSpeaking = true;
            this.startAgentSpeakingTimer();
            this.cdr.markForCheck();
        }
    }

    /**
     * "Agent finished speaking" detection.
     *
     * Mechanism: poll every 100ms — when `audioCtx.currentTime >= nextStartTime`
     * the gapless playback queue has drained. We chose polling over
     * `source.onended` because playback is gapless (many sources chained head
     * to tail); attaching onended to every frame would mean firing the
     * transition handler dozens of times per turn and threading state about
     * "which source was the last one." A single 100ms timer is simpler and
     * the latency on resuming the mic is imperceptible.
     */
    private startAgentSpeakingTimer(): void {
        this.stopAgentSpeakingTimer();
        this.agentSpeakingTimer = setInterval(() => {
            if (!this.audioCtx) return;
            if (this.audioCtx.currentTime >= this.nextStartTime - 0.01) {
                this.stopAgentSpeakingTimer();
                this.AgentSpeaking = false;
                // Restore mic if the user had it on before the agent started speaking.
                if (this.wasMicEnabledBeforeAgentSpoke && this.SessionID && this.recognition) {
                    this.wantsMicOn = true;
                    try { this.recognition.start(); } catch { /* recognizer may already be re-armed */ }
                }
                this.wasMicEnabledBeforeAgentSpoke = false;
                this.cdr.markForCheck();
            }
        }, 100);
    }

    private stopAgentSpeakingTimer(): void {
        if (this.agentSpeakingTimer) {
            clearInterval(this.agentSpeakingTimer);
            this.agentSpeakingTimer = null;
        }
    }

    /**
     * Pure decode: base64 PCM → AudioBuffer. Extracted so it's easy to unit
     * test (no AudioContext side effects beyond `createBuffer`).
     */
    private decodePCMFrame(frame: VoiceAudioFrame, ctx: AudioContext): AudioBuffer {
        const bytes = this.base64ToBytes(frame.DataBase64);
        const int16 = new Int16Array(
            bytes.buffer,
            bytes.byteOffset,
            Math.floor(bytes.byteLength / 2)
        );
        const totalFloat = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            totalFloat[i] = int16[i] / 32768;
        }
        const framesPerChannel = totalFloat.length / frame.ChannelCount;
        const audioBuffer = ctx.createBuffer(frame.ChannelCount, framesPerChannel, frame.SampleRateHz);
        if (frame.ChannelCount === 1) {
            audioBuffer.copyToChannel(totalFloat, 0);
        } else {
            for (let ch = 0; ch < frame.ChannelCount; ch++) {
                const channelData = new Float32Array(framesPerChannel);
                for (let i = 0; i < framesPerChannel; i++) {
                    channelData[i] = totalFloat[i * frame.ChannelCount + ch];
                }
                audioBuffer.copyToChannel(channelData, ch);
            }
        }
        return audioBuffer;
    }

    private base64ToBytes(base64: string): Uint8Array {
        const binary = atob(base64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            out[i] = binary.charCodeAt(i);
        }
        return out;
    }

    // ---------------------------------------------------------------------
    // Internals — teardown + error handling
    // ---------------------------------------------------------------------

    private async teardown(reason: string): Promise<void> {
        this.stopAgentSpeakingTimer();
        if (this.audioSubscription) {
            this.audioSubscription.unsubscribe();
            this.audioSubscription = null;
        }
        if (this.transcriptSubscription) {
            this.transcriptSubscription.unsubscribe();
            this.transcriptSubscription = null;
        }
        // Stop the client-tool subscription before clearing SessionID so the
        // unsubscribe still has the active session in hand.
        try {
            this.agentClient.StopSession();
        } catch {
            // Best-effort — AgentClientService.StopSession is no-op if no session.
        }
        const sessionId = this.SessionID;
        this.SessionID = null;

        if (sessionId) {
            try {
                await this.voiceService.EndSession(sessionId, reason);
            } catch (err) {
                // Swallow — teardown is best-effort, the session expires on the
                // server eventually. Log so dev can see it in the console.
                console.warn('[VoiceWidget] EndSession threw during teardown:', err);
            }
        }

        // We intentionally do NOT close the AudioContext here — keeping it
        // alive across End/Start cycles avoids needing a second user gesture.
        this.nextStartTime = 0;
        this.AudioChunkCount = 0;
        this.agentTurnInProgress = false;
        this.AgentSpeaking = false;
        if (this.Status !== 'error') {
            this.Status = 'ended';
        }
        this.cdr.markForCheck();
    }

    private failWith(message: string): void {
        this.LastError = message;
        this.Status = 'error';
        this.appendTranscript('system', message);
        this.ErrorOccurred.emit({ Error: message });
        this.cdr.markForCheck();
    }

    private appendTranscript(role: 'user' | 'agent' | 'system', text: string): void {
        this.Transcript = [...this.Transcript, { Role: role, Text: text, Timestamp: new Date() }];
    }

    private formatError(err: unknown): string {
        if (err instanceof Error) return err.message;
        if (typeof err === 'string') return err;
        try {
            return JSON.stringify(err);
        } catch {
            return String(err);
        }
    }

    // ---------------------------------------------------------------------
    // Template helpers
    // ---------------------------------------------------------------------

    public get StatusLabel(): string {
        switch (this.Status) {
            case 'idle':
                return 'Idle';
            case 'connecting':
                return 'Connecting…';
            case 'active':
                return 'Active';
            case 'error':
                return 'Error';
            case 'ended':
                return 'Ended';
            default:
                return this.Status;
        }
    }

    public TrackByIndex(index: number): number {
        return index;
    }
}

/**
 * Tree-shake-prevention symbol. Imported once from MJExplorer's
 * `voice-demo-resource.component.ts` so the bundler keeps this class in the
 * final bundle even though it's only resolved dynamically via `@RegisterClass`
 * (well — the wrapper resource is the registered class; this widget is a
 * direct dependency of that wrapper). Mirrors the pattern in other Generic
 * packages.
 */
export function LoadVoiceWidget(): void {
    // Intentional no-op.
}
