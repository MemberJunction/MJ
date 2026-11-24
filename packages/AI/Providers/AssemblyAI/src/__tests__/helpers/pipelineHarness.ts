import { vi } from 'vitest';
import type { RealtimeInProcessPeer } from '@memberjunction/ai';
import { AssemblyAIVoicePipeline, type VoicePipelineConfig, type VoicePipelineProviders } from '../../voice/assemblyAIVoicePipeline';
import type { AssemblyAISTTHandlers, IAssemblyAISTT } from '../../voice/assemblyAIStreamingSTT';
import type { AssemblyAITTSHandlers, IAssemblyAITTS } from '../../voice/assemblyAIStreamingTTS';
import type { LLMEvent, LLMRequest } from '../../voice/assemblyAILLMGateway';

export type Frame = Record<string, unknown> & { type: string };

export class FakeSTT implements IAssemblyAISTT {
    public Audio = 0;
    public Contexts: string[] = [];
    public CloseCalls = 0;
    constructor(public readonly Handlers: AssemblyAISTTHandlers) {}
    public SendAudio(pcm: Uint8Array): void {
        this.Audio += pcm.byteLength;
    }
    public UpdateAgentContext(reply: string): void {
        this.Contexts.push(reply);
    }
    public async Close(): Promise<void> {
        this.CloseCalls++;
    }
    /** The user says something: speech starts, a partial, then the finished turn. */
    public Say(text: string): void {
        this.Handlers.OnSpeechStarted();
        this.Handlers.OnTurn({ Transcript: text, EndOfTurn: false });
        this.Handlers.OnTurn({ Transcript: text, EndOfTurn: true });
    }
    public StartSaying(text: string): void {
        this.Handlers.OnSpeechStarted();
        this.Handlers.OnTurn({ Transcript: text, EndOfTurn: false });
    }
    public Finish(text: string): void {
        this.Handlers.OnTurn({ Transcript: text, EndOfTurn: true });
    }
}

export class FakeTTS implements IAssemblyAITTS {
    public IsOpen = true;
    public Spoken: Array<{ Text: string; ID: number }> = [];
    public Cancels = 0;
    public CloseCalls = 0;
    constructor(public readonly Handlers: AssemblyAITTSHandlers) {}
    public Speak(text: string, segmentID: number): void {
        this.Spoken.push({ Text: text, ID: segmentID });
    }
    public Cancel(): void {
        this.Cancels++;
    }
    public async Close(): Promise<void> {
        this.CloseCalls++;
        this.IsOpen = false;
    }
    public Lose(message = 'TTS lost'): void {
        this.IsOpen = false;
        this.Handlers.OnLost(message);
    }
    /** Delivers `ms` of audio for the nth piece spoken, and finishes it. */
    public Deliver(index: number, ms: number, done = true): void {
        const { ID } = this.Spoken[index];
        this.Handlers.OnAudio(Buffer.alloc((24000 * 2 * ms) / 1000).toString('base64'), ID);
        if (done) this.Handlers.OnSegmentDone(ID);
    }
}

/** One LLM request the test answers step by step. */
export class FakeLLMCall {
    private queue: LLMEvent[] = [];
    private wake: (() => void) | null = null;
    private finished = false;
    private failure: Error | null = null;
    public Aborted = false;
    constructor(public readonly Request: LLMRequest, signal: AbortSignal) {
        signal.addEventListener('abort', () => {
            this.Aborted = true;
            this.wake?.();
        });
    }
    public Text(text: string): this {
        this.queue.push({ Kind: 'text', Text: text });
        this.wake?.();
        return this;
    }
    public Calls(...calls: Array<{ CallID: string; Name: string; Arguments: string }>): this {
        this.queue.push({ Kind: 'toolCalls', Calls: calls });
        this.wake?.();
        return this;
    }
    public Usage(input: number, output: number): this {
        this.queue.push({ Kind: 'usage', InputTokens: input, OutputTokens: output });
        this.wake?.();
        return this;
    }
    public End(): this {
        this.finished = true;
        this.wake?.();
        return this;
    }
    public Fail(message: string): void {
        this.failure = new Error(message);
        this.wake?.();
    }
    public async *Events(): AsyncGenerator<LLMEvent> {
        for (;;) {
            if (this.Aborted) return;
            const next = this.queue.shift();
            if (next) {
                yield next;
                continue;
            }
            if (this.failure) throw this.failure;
            if (this.finished) return;
            await new Promise<void>((resolve) => (this.wake = resolve));
        }
    }
}

export class Harness {
    public readonly Sent: Frame[] = [];
    public readonly PeerCloses: Array<{ Code?: number; Reason?: string }> = [];
    public STTs: FakeSTT[] = [];
    public TTSs: FakeTTS[] = [];
    public LLM: FakeLLMCall[] = [];
    public Pipeline: AssemblyAIVoicePipeline;
    public OpenSignals: AbortSignal[] = [];

    constructor(config: Partial<VoicePipelineConfig> = {}, providers: Partial<VoicePipelineProviders> = {}) {
        const peer: RealtimeInProcessPeer = {
            Send: (frame) => this.Sent.push(JSON.parse(frame) as Frame),
            Close: (Code, Reason) => {
                this.PeerCloses.push({ Code, Reason });
                this.Pipeline.Closed();
            },
        };
        this.Pipeline = new AssemblyAIVoicePipeline(
            peer,
            { Instructions: 'SYS', Tools: [], LLMModel: 'gemma-4-31b', SampleRate: 24000, AutoRespond: true, AcceptSessionUpdates: false, ...config },
            {
                OpenSTT: async (handlers, signal) => {
                    this.OpenSignals.push(signal);
                    const stt = new FakeSTT(handlers);
                    this.STTs.push(stt);
                    return stt;
                },
                OpenTTS: async (handlers, signal) => {
                    this.OpenSignals.push(signal);
                    const tts = new FakeTTS(handlers);
                    this.TTSs.push(tts);
                    return tts;
                },
                StreamLLM: (request, signal) => {
                    const call = new FakeLLMCall(request, signal);
                    this.LLM.push(call);
                    return call.Events();
                },
                ...providers,
            }
        );
    }
    public get STT(): FakeSTT {
        return this.STTs[this.STTs.length - 1];
    }
    public get TTS(): FakeTTS {
        return this.TTSs[this.TTSs.length - 1];
    }
    public get LastLLM(): FakeLLMCall {
        return this.LLM[this.LLM.length - 1];
    }
    public async Start(): Promise<this> {
        this.Pipeline.Start();
        await settle();
        return this;
    }
    public Receive(frame: Frame): void {
        this.Pipeline.Receive(JSON.stringify(frame));
    }
    public Types(): string[] {
        return this.Sent.map((f) => f.type);
    }
    public Of(type: string): Frame[] {
        return this.Sent.filter((f) => f.type === type);
    }
    /** Says `user`, and plays a whole reply of one sentence lasting `ms`. Leaves the reply finished. */
    public async Turn(user: string, reply: string, ms = 1000): Promise<void> {
        this.STT.Say(user);
        await settle();
        this.LastLLM.Text(reply).End();
        await settle();
        this.TTS.Deliver(this.TTS.Spoken.length - 1, ms);
        await settle(ms + 5);
    }
    /** The history sent with the latest LLM request, as `role: text`. */
    public History(): string[] {
        return this.LastLLM.Request.Messages.map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`);
    }
}

/** Lets pending promises run, then advances the fake clock. */
export async function settle(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
}
