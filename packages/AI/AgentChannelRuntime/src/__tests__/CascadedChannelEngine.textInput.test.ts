/**
 * Tests for the text-in / voice-out path in `CascadedChannelEngine`.
 *
 * The engine drives two concurrent input pipelines that converge at
 * `runOneTurnFromTranscript`:
 *   1. Audio: AudioFramesIn → VAD → TurnDetector → STT → transcript
 *   2. Text:  ControlEventsIn → `{ Kind: 'user-text', Text }` → transcript
 *
 * These tests use a controllable mock transport whose `ControlEventsIn` is a
 * push-driven async iterable, plus a subclassed engine that bypasses provider
 * resolution and spies on the convergence helper. Goal: verify that a
 * `user-text` ControlEvent dispatches into `runOneTurnFromTranscript` with the
 * right text, that `session-end` cleanly ends the pipeline, and that other
 * control events are ignored.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { AudioFrame } from '@memberjunction/ai';
import { CascadedChannelEngine } from '../engines/CascadedChannelEngine';
import { InterruptChannel } from '../interrupt/InterruptChannel';
import type { ChannelRunContext } from '../BaseChannelEngine';
import type { ITransportAdapter, ParticipantStream } from '../transports/ITransportAdapter';
import { TextInputAudioOutputTransport } from '../transports/TextInputAudioOutputTransport';
import type { ControlEvent } from '../frames/frame-bus';
import type { VoiceCascadedConfig } from '../types/channel-config';

/**
 * Push-driven mock transport. `ControlEventsIn` and `AudioFramesIn` are
 * single-consumer async iterables (matches the real transports' behavior).
 * Tests `Push*()` events; the engine consumes them.
 */
class MockTransport implements ITransportAdapter {
    private controlItems: ControlEvent[] = [];
    private controlWaiters: Array<(v: IteratorResult<ControlEvent>) => void> = [];
    private controlClosed = false;
    private audioItems: AudioFrame[] = [];
    private audioWaiters: Array<(v: IteratorResult<AudioFrame>) => void> = [];
    private audioClosed = false;

    public SentAudioFrames: AudioFrame[] = [];
    public SentControlEvents: ControlEvent[] = [];
    public Participants: ReadonlyArray<ParticipantStream> = [];

    public PushControlEvent(event: ControlEvent): void {
        if (this.controlClosed) return;
        const w = this.controlWaiters.shift();
        if (w) {
            w({ value: event, done: false });
        } else {
            this.controlItems.push(event);
        }
    }

    public CloseControlStream(): void {
        if (this.controlClosed) return;
        this.controlClosed = true;
        while (this.controlWaiters.length) {
            const w = this.controlWaiters.shift();
            if (w) w({ value: undefined as never, done: true });
        }
    }

    public CloseAudioStream(): void {
        if (this.audioClosed) return;
        this.audioClosed = true;
        while (this.audioWaiters.length) {
            const w = this.audioWaiters.shift();
            if (w) w({ value: undefined as never, done: true });
        }
    }

    public get ControlEventsIn(): AsyncIterable<ControlEvent> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterator<ControlEvent> {
                return {
                    next(): Promise<IteratorResult<ControlEvent>> {
                        if (self.controlItems.length > 0) {
                            return Promise.resolve({ value: self.controlItems.shift() as ControlEvent, done: false });
                        }
                        if (self.controlClosed) {
                            return Promise.resolve({ value: undefined as never, done: true });
                        }
                        return new Promise((resolve) => self.controlWaiters.push(resolve));
                    },
                };
            },
        };
    }

    public get AudioFramesIn(): AsyncIterable<AudioFrame> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterator<AudioFrame> {
                return {
                    next(): Promise<IteratorResult<AudioFrame>> {
                        if (self.audioItems.length > 0) {
                            return Promise.resolve({ value: self.audioItems.shift() as AudioFrame, done: false });
                        }
                        if (self.audioClosed) {
                            return Promise.resolve({ value: undefined as never, done: true });
                        }
                        return new Promise((resolve) => self.audioWaiters.push(resolve));
                    },
                };
            },
        };
    }

    public SendAudioFrame(frame: AudioFrame): void {
        this.SentAudioFrames.push(frame);
    }

    public SendControlEvent(event: ControlEvent): void {
        this.SentControlEvents.push(event);
    }

    public async Open(): Promise<void> {
        // no-op
    }

    public async Close(): Promise<void> {
        this.CloseControlStream();
        this.CloseAudioStream();
    }

    public OnParticipantJoin(_cb: (p: ParticipantStream) => void): void {
        // no-op
    }

    public OnParticipantLeave(_cb: (p: ParticipantStream) => void): void {
        // no-op
    }
}

/**
 * Test-only subclass that bypasses provider resolution (no DB, no
 * ClassFactory) and exposes a spy on the convergence helper.
 */
class TestCascadedChannelEngine extends CascadedChannelEngine {
    public TranscriptCalls: string[] = [];

    /** Override provider resolution — engine never actually invokes providers
     *  because `runOneTurnFromTranscript` is also overridden to record calls. */
    protected async resolveProviders(): Promise<never> {
        // We need to satisfy the type system. The base class calls this and
        // threads the result into helpers; in tests we override every helper
        // that consumes it, so the actual shape doesn't matter. But we must
        // return SOMETHING with the right structural shape so `processOneTurn`
        // doesn't crash if it accidentally runs. Cast through `unknown` since
        // we genuinely don't care about the inner types.
        return {
            Stt: { TranscribeStream: () => (async function* () {})() } as never,
            Tts: { SynthesizeStream: () => (async function* () {})() } as never,
            Vad: { DetectSpeech: () => (async function* () {})() } as never,
            TurnDetector: { DetectTurns: () => (async function* () {})() } as never,
        } as never;
    }

    /** Spy on the convergence helper — record incoming text, no real work. */
    protected async runOneTurnFromTranscript(
        _ctx: ChannelRunContext,
        _providers: unknown,
        _cfg: VoiceCascadedConfig,
        userText: string
    ): Promise<void> {
        this.TranscriptCalls.push(userText);
    }
}

/**
 * Build a minimum-viable `ChannelRunContext` for the engine. Only fields the
 * code paths under test touch are populated; the rest are stubs because the
 * test-only subclass short-circuits before they're used.
 */
function makeCtx(transport: MockTransport): ChannelRunContext {
    const cfg: VoiceCascadedConfig = {
        Kind: 'voice-cascaded',
        STT: { AIModelID: 'stub-stt' },
        TTS: { AIModelID: 'stub-tts' },
        VAD: { DriverClass: 'stub-vad' },
        TurnDetector: { DriverClass: 'stub-turn-detector' },
        BargeIn: false,
    };
    return {
        Agent: {} as never,
        AgentMetadata: {} as never,
        ChannelMetadata: {} as never,
        ChannelConfig: cfg,
        Transport: transport,
        Interrupt: new InterruptChannel(),
        ContextUser: {} as never,
        AgentRun: {} as never,
    };
}

describe('CascadedChannelEngine — text-input pipeline', () => {
    let engine: TestCascadedChannelEngine;
    let transport: MockTransport;
    let ctx: ChannelRunContext;

    beforeEach(() => {
        engine = new TestCascadedChannelEngine();
        transport = new MockTransport();
        ctx = makeCtx(transport);
    });

    it('dispatches a user-text ControlEvent to runOneTurnFromTranscript with the right text', async () => {
        const runPromise = engine.Run(ctx);

        transport.PushControlEvent({ Kind: 'user-text', Text: 'hello world' });
        // Give the loop a chance to consume.
        await new Promise((r) => setTimeout(r, 10));

        transport.PushControlEvent({ Kind: 'session-end', Reason: 'test-done' });
        // Close the audio side too so `audioBus.PumpFrom` (which awaits the
        // transport's AudioFramesIn iterator) can unblock during teardown.
        transport.CloseAudioStream();
        await runPromise;

        expect(engine.TranscriptCalls).toEqual(['hello world']);
    });

    it('dispatches multiple user-text events in order', async () => {
        const runPromise = engine.Run(ctx);

        transport.PushControlEvent({ Kind: 'user-text', Text: 'first turn' });
        transport.PushControlEvent({ Kind: 'user-text', Text: 'second turn' });
        transport.PushControlEvent({ Kind: 'user-text', Text: 'third turn' });
        await new Promise((r) => setTimeout(r, 10));

        transport.PushControlEvent({ Kind: 'session-end', Reason: 'test-done' });
        // Close the audio side too so `audioBus.PumpFrom` (which awaits the
        // transport's AudioFramesIn iterator) can unblock during teardown.
        transport.CloseAudioStream();
        await runPromise;

        expect(engine.TranscriptCalls).toEqual(['first turn', 'second turn', 'third turn']);
    });

    it('ignores non-text control events (session-start, participant-joined, participant-left)', async () => {
        const runPromise = engine.Run(ctx);

        transport.PushControlEvent({ Kind: 'session-start' });
        transport.PushControlEvent({ Kind: 'participant-joined', ParticipantID: 'p1' });
        transport.PushControlEvent({ Kind: 'user-text', Text: 'actual turn' });
        transport.PushControlEvent({ Kind: 'participant-left', ParticipantID: 'p1' });
        await new Promise((r) => setTimeout(r, 10));

        transport.PushControlEvent({ Kind: 'session-end', Reason: 'test-done' });
        // Close the audio side too so `audioBus.PumpFrom` (which awaits the
        // transport's AudioFramesIn iterator) can unblock during teardown.
        transport.CloseAudioStream();
        await runPromise;

        expect(engine.TranscriptCalls).toEqual(['actual turn']);
    });

    it('skips empty / whitespace-only user-text events', async () => {
        const runPromise = engine.Run(ctx);

        transport.PushControlEvent({ Kind: 'user-text', Text: '' });
        transport.PushControlEvent({ Kind: 'user-text', Text: '   ' });
        transport.PushControlEvent({ Kind: 'user-text', Text: 'real text' });
        await new Promise((r) => setTimeout(r, 10));

        transport.PushControlEvent({ Kind: 'session-end', Reason: 'test-done' });
        // Close the audio side too so `audioBus.PumpFrom` (which awaits the
        // transport's AudioFramesIn iterator) can unblock during teardown.
        transport.CloseAudioStream();
        await runPromise;

        expect(engine.TranscriptCalls).toEqual(['real text']);
    });

    it('exits cleanly when ControlEventsIn closes without a session-end event', async () => {
        const runPromise = engine.Run(ctx);

        transport.PushControlEvent({ Kind: 'user-text', Text: 'lone turn' });
        await new Promise((r) => setTimeout(r, 10));

        // Close the control stream — engine's text loop should end and Run() returns.
        transport.CloseControlStream();
        transport.CloseAudioStream();
        await runPromise;

        expect(engine.TranscriptCalls).toEqual(['lone turn']);
    });

    it('integrates with the real TextInputAudioOutputTransport', async () => {
        // Use the real text-in / audio-out transport (added by a parallel
        // agent) instead of the hand-rolled mock to verify the engine wires
        // up cleanly against the production interface.
        const realTransport = new TextInputAudioOutputTransport({
            SessionID: 'integration-session',
        });
        await realTransport.Open();
        const realCtx = makeCtx(realTransport as unknown as MockTransport);
        // Have to swap in the real transport on the context (makeCtx took the
        // MockTransport — but ChannelRunContext only sees ITransportAdapter).
        (realCtx as { Transport: ITransportAdapter }).Transport = realTransport;

        const runPromise = engine.Run(realCtx);

        realTransport.PushUserText('via the real transport');
        await new Promise((r) => setTimeout(r, 10));

        await realTransport.Close();
        await runPromise;

        // PushUserText surfaces as a `user-text` ControlEvent the engine routes
        // through `runOneTurnFromTranscript`. The transport also emits
        // session-start / participant-joined events first — we ignore those.
        expect(engine.TranscriptCalls).toEqual(['via the real transport']);
    });

    it('Stop() short-circuits any in-flight text loop', async () => {
        const runPromise = engine.Run(ctx);

        transport.PushControlEvent({ Kind: 'user-text', Text: 'before stop' });
        await new Promise((r) => setTimeout(r, 10));

        await engine.Stop('cancelled');
        transport.CloseControlStream();
        transport.CloseAudioStream();
        await runPromise;

        // First call landed before Stop; nothing after.
        expect(engine.TranscriptCalls).toEqual(['before stop']);
    });
});
