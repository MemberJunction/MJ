import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient, REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE, RealtimeClientError } from '../generic/baseRealtimeClient';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import { AssemblyAIVoiceRealtimeClient } from '../drivers/assemblyAIVoiceRealtimeClient';
import { FakeMediaStream, FakeMicCapture, FakeTrack } from './helpers/realtime-fakes';

/** Stands in for the platform WebSocket, so the driver's own socket wiring runs. */
class FakeWebSocket {
    public static Instances: FakeWebSocket[] = [];
    public onopen: (() => void) | null = null;
    public onmessage: ((event: { data: unknown }) => void) | null = null;
    public onerror: (() => void) | null = null;
    public onclose: ((event: { code: number }) => void) | null = null;
    public Sent: JSONObject[] = [];
    public Closed = false;
    constructor(public readonly Url: string) {
        FakeWebSocket.Instances.push(this);
    }
    public send(data: string): void {
        this.Sent.push(JSON.parse(data) as JSONObject);
    }
    public close(): void {
        this.Closed = true;
    }
    public Emit(event: JSONObject): void {
        this.onmessage?.({ data: JSON.stringify(event) });
    }
    public Types(): unknown[] {
        return this.Sent.map((f) => f['type']);
    }
}

class FakePlayback implements IRealtimePcmPlayback {
    public IsPlaying = false;
    public Enqueued = 0;
    public Flushes = 0;
    public GetOutputStream(): MediaStream | null {
        return null;
    }
    public Enqueue(): void {
        this.Enqueued++;
        this.IsPlaying = true;
    }
    public Flush(): void {
        this.Flushes++;
        this.IsPlaying = false;
    }
    public Close(): void {
        this.IsPlaying = false;
    }
}

class TestClient extends AssemblyAIVoiceRealtimeClient {
    public Playback = new FakePlayback();
    public Rates: number[] = [];
    public OnPcm: ((base64: string) => void) | null = null;
    protected override async createMicCapture(_mic: MediaStream, rate: number, onPcm: (base64: string) => void): Promise<IPcmMicCapture> {
        this.Rates.push(rate);
        this.OnPcm = onPcm;
        return new FakeMicCapture();
    }
    protected override createPlayback(rate: number): IRealtimePcmPlayback {
        this.Rates.push(rate);
        return this.Playback;
    }
}

const CONFIG: ClientRealtimeSessionConfig = {
    Provider: 'assemblyai-voice',
    Model: 'assemblyai-stt-3-7-realtime-agent',
    EphemeralToken: 'wss://api.example.com/realtime-proxy?ticket=abc',
    ExpiresAt: new Date(Date.now() + 300_000).toISOString(),
    SessionConfig: { sampleRate: 24000 },
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('AssemblyAIVoiceRealtimeClient', () => {
    let client: TestClient;
    let states: string[];
    let errors: RealtimeClientError[];

    beforeEach(() => {
        FakeWebSocket.Instances = [];
        vi.stubGlobal('WebSocket', FakeWebSocket);
        client = new TestClient();
        states = [];
        errors = [];
        client.OnStateChange((s) => states.push(s));
        client.OnError((e) => errors.push(e));
    });
    afterEach(async () => {
        await client.Disconnect();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const socket = (): FakeWebSocket => FakeWebSocket.Instances[FakeWebSocket.Instances.length - 1];
    async function connect(): Promise<void> {
        const connecting = client.Connect(CONFIG, new FakeMediaStream([new FakeTrack()]));
        socket().onopen?.();
        await flush();
        expect(states).not.toContain('listening');
        socket().Emit({ type: 'session.created' });
        await connecting;
    }

    it("resolves under the provider key 'assemblyai-voice'", () => {
        expect(MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'assemblyai-voice')).toBeInstanceOf(AssemblyAIVoiceRealtimeClient);
    });

    it('connects to the minted proxy URL, waits for the agent, and runs audio at the minted rate', async () => {
        await connect();
        expect(socket().Url).toBe(CONFIG.EphemeralToken);
        expect(client.Rates).toEqual([24000, 24000]);
        expect(states.at(-1)).toBe('listening');
    });

    it('sends no session config: the server decided it', async () => {
        await connect();
        expect(socket().Types()).toEqual([]);
        client.OnPcm?.('AAAA');
        expect(socket().Types()).toEqual(['input_audio_buffer.append']);
    });

    it('asks for a spoken update with the direction alone', async () => {
        await connect();
        client.RequestSpokenUpdate('Say it is running.');
        expect(socket().Sent.at(-1)).toEqual({ type: 'response.create', response: { instructions: 'Say it is running.' } });
    });

    it('holds a tool result until the reply in progress is done', async () => {
        await connect();
        socket().Emit({ type: 'response.created' });
        socket().Emit({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'find', arguments: '{}' });
        client.SendToolResult('c1', '{"v":1}');
        expect(socket().Types()).toEqual(['conversation.item.create']);
        socket().Emit({ type: 'response.done', response: {} });
        expect(socket().Types()).toEqual(['conversation.item.create', 'response.create']);
    });

    it('stops playback when the user interrupts', async () => {
        await connect();
        const interrupted = vi.fn();
        client.OnInterruption(interrupted);
        socket().Emit({ type: 'response.created' });
        socket().Emit({ type: 'response.output_audio.delta', delta: 'AAAA' });
        socket().Emit({ type: 'input_audio_buffer.speech_started', item_id: 'i' });
        expect(client.Playback.Flushes).toBe(1);
        expect(interrupted).toHaveBeenCalledTimes(1);
    });

    describe('hanging up while the agent speaks', () => {
        let finals: string[];
        beforeEach(async () => {
            finals = [];
            client.OnTranscript((t) => t.IsFinal && finals.push(`${t.Role}: ${t.Text}`));
            await connect();
            socket().Emit({ type: 'response.created' });
            socket().Emit({ type: 'response.output_audio_transcript.delta', delta: 'I am Sage.' });
            socket().Emit({ type: 'response.output_audio_transcript.delta', delta: ' How can I help?' });
        });

        it('keeps the words of the reply in progress', async () => {
            await client.Disconnect();
            expect(finals).toEqual(['Assistant: I am Sage. How can I help?']);
        });

        it('keeps them once', async () => {
            await client.Disconnect();
            await client.Disconnect();
            expect(finals).toHaveLength(1);
        });

        it('adds nothing to a reply that was already finished', async () => {
            socket().Emit({ type: 'response.output_audio_transcript.done', transcript: 'I am Sage.' });
            socket().Emit({ type: 'response.done', response: {} });
            await client.Disconnect();
            expect(finals).toEqual(['Assistant: I am Sage.']);
        });
    });

    it('ends the call with its own message at the time limit, without reconnecting', async () => {
        await connect();
        socket().onclose?.({ code: 4000 });
        await flush();
        expect(errors).toEqual([expect.objectContaining({ Fatal: true, Code: REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE, Message: expect.stringMatching(/time limit/i) })]);
        expect(states.at(-1)).toBe('error');
        expect(client.IsReconnecting).toBe(false);
    });

    it('recovers a dropped connection in a live call', async () => {
        await connect();
        socket().onclose?.({ code: 1011 });
        expect(client.IsReconnecting).toBe(true);
        expect(errors).toEqual([]);
    });

    it('a connection refused before the call is live is fatal', async () => {
        const connecting = client.Connect(CONFIG, new FakeMediaStream([new FakeTrack()]));
        const failed = expect(connecting).rejects.toThrow();
        socket().onclose?.({ code: 1011 });
        await failed;
        expect(errors[0]).toMatchObject({ Fatal: true });
    });
});
