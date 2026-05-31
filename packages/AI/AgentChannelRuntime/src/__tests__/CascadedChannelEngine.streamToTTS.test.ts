/**
 * Tests for the `StreamToTTS` path in `CascadedChannelEngine`
 * (`streamAgentTurnToTTS`): the agent's user-facing text is pumped to TTS
 * token-by-token *as it streams*, via the normalized `AgentEventStream`
 * substrate, instead of synthesizing the final message after the run.
 *
 * We subclass the engine and override `runAgent` to drive a supplied
 * `AgentEventStream` with canned `TextDelta`s (no DB, no AgentRunner), and feed
 * a fake streaming-TTS provider that records the text it received and emits one
 * frame per chunk. That lets us assert, without any I/O:
 *   - streamed deltas reach TTS in order (concurrent pump works);
 *   - when the model streams nothing, we fall back to the final message;
 *   - a mid-stream failure still flushes the partial and rejects cleanly.
 */
import { describe, it, expect } from 'vitest';
import type { AudioFrame } from '@memberjunction/ai';
import { AgentEventStream } from '@memberjunction/ai-core-plus';
import { CascadedChannelEngine } from '../engines/CascadedChannelEngine';
import type { ChannelRunContext } from '../BaseChannelEngine';

interface Captured {
    text: string;
    frames: number;
}

/** Fake streaming TTS: consumes the TextStream, records it, yields a frame per chunk. */
function makeTtsProviders(captured: Captured): unknown {
    return {
        Tts: {
            SynthesizeStream(opts: { TextStream: AsyncIterable<string> }): AsyncIterable<AudioFrame> {
                return (async function* () {
                    for await (const chunk of opts.TextStream) {
                        captured.text += chunk;
                        captured.frames += 1;
                        yield {
                            data: new Uint8Array([Math.min(chunk.length, 255)]),
                            sampleRateHz: 24000,
                            channelCount: 1,
                            mediaType: 'audio/pcm',
                        } as AudioFrame;
                    }
                })();
            },
        },
    };
}

function makeCtx(sentFrames: AudioFrame[]): ChannelRunContext {
    return {
        Agent: {} as never,
        AgentMetadata: {} as never,
        ChannelMetadata: {} as never,
        ChannelConfig: {} as never,
        Transport: {
            SendAudioFrame: (f: AudioFrame) => sentFrames.push(f),
        } as never,
        Interrupt: {} as never,
        ContextUser: {} as never,
        AgentRun: {} as never,
    };
}

/** Engine subclass that drives the event stream itself instead of a real agent. */
class StreamTestEngine extends CascadedChannelEngine {
    public Deltas: string[] = [];
    public FailMode = false;
    public FinalMessage = '';

    protected async resolveProviders(): Promise<never> {
        return {} as never;
    }

    protected async runAgent(
        _ctx: ChannelRunContext,
        _userText: string,
        _signal: AbortSignal,
        eventStream?: AgentEventStream
    ): Promise<{ result: { payload: unknown; agentRun?: { Message?: string | null } }; agentResponseDetailId: string | undefined }> {
        eventStream?.EmitTurnStart();
        for (const d of this.Deltas) {
            eventStream?.EmitTextDelta(d);
        }
        if (this.FailMode) {
            eventStream?.Fail('Error', 'boom');
            throw new Error('boom');
        }
        eventStream?.Complete('Stop');
        return {
            result: { payload: {}, agentRun: { Message: this.FinalMessage } },
            agentResponseDetailId: 'detail-1',
        };
    }

    /** Expose the protected concurrent path for direct testing. */
    public runStream(ctx: ChannelRunContext, providers: unknown, signal: AbortSignal) {
        return this.streamAgentTurnToTTS(ctx, providers as never, 'hello', signal);
    }
}

describe('CascadedChannelEngine — StreamToTTS path', () => {
    it('streams TextDeltas to TTS in order, concatenated', async () => {
        const engine = new StreamTestEngine();
        engine.Deltas = ['Hel', 'lo ', 'there'];
        engine.FinalMessage = 'Hello there'; // should NOT be re-spoken (streamed already)

        const captured: Captured = { text: '', frames: 0 };
        const sent: AudioFrame[] = [];
        await engine.runStream(makeCtx(sent), makeTtsProviders(captured), new AbortController().signal);

        expect(captured.text).toBe('Hello there');
        expect(captured.frames).toBe(3); // one frame per streamed delta — no extra fallback synth
        expect(sent.length).toBe(3);
    });

    it('falls back to the final message when nothing streamed', async () => {
        const engine = new StreamTestEngine();
        engine.Deltas = []; // model produced no user-visible tokens
        engine.FinalMessage = 'the final answer';

        const captured: Captured = { text: '', frames: 0 };
        const sent: AudioFrame[] = [];
        await engine.runStream(makeCtx(sent), makeTtsProviders(captured), new AbortController().signal);

        expect(captured.text).toBe('the final answer');
        expect(sent.length).toBeGreaterThan(0);
    });

    it('flushes the partial and rejects on mid-stream failure', async () => {
        const engine = new StreamTestEngine();
        engine.Deltas = ['partial'];
        engine.FailMode = true;

        const captured: Captured = { text: '', frames: 0 };
        const sent: AudioFrame[] = [];
        await expect(
            engine.runStream(makeCtx(sent), makeTtsProviders(captured), new AbortController().signal)
        ).rejects.toThrow('boom');

        // the token streamed before the failure still reached TTS
        expect(captured.text).toBe('partial');
    });
});
