import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import {
    ElevenRealtimeClient,
    ELEVEN_REALTIME_WS_URL,
    ELEVEN_REALTIME_SUBPROTOCOL,
    ELEVEN_REALTIME_CLIENT_SECRET_SUBPROTOCOL_PREFIX,
    ELEVEN_REALTIME_PCM_SAMPLE_RATE,
} from '../drivers/elevenRealtimeClient';
import { IOpenAIProtocolClientSocket, OpenAIProtocolServerEvent } from '../generic/openAIProtocolClient';
import { collect, FakeMediaStream, FakeMicCapture, FakeTrack } from './helpers/realtime-fakes';

// ── Fakes (no network, no Web Audio) ───────────────────────────────────────────

/** Parsed outbound frame shape (only the fields the tests inspect). */
interface ParsedFrame {
    type?: string;
    audio?: string;
    session?: JSONObject;
}

/** Fake realtime socket: records sent frames; lets tests fire open/close/server events. */
class FakeSocket implements IOpenAIProtocolClientSocket {
    public onopen: (() => void) | null = null;
    public onmessage: ((data: string) => void) | null = null;
    public onerror: ((message: string) => void) | null = null;
    public onclose: (() => void) | null = null;
    public Sent: string[] = [];

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void { /* nothing to release */ }
    public Open(): void {
        this.onopen?.();
    }
    public EmitServer(event: OpenAIProtocolServerEvent | JSONObject): void {
        this.onmessage?.(JSON.stringify(event));
    }
    public SentFrames(): ParsedFrame[] {
        return this.Sent.map((s) => JSON.parse(s) as ParsedFrame);
    }
}

/** Fake playout engine standing in for the Web Audio playback clock. */
class FakePlayback implements IRealtimePcmPlayback {
    public Enqueued: ArrayBuffer[] = [];
    public IsPlaying = false;
    public GetOutputStream(): MediaStream | null {
        return null;
    }
    public Enqueue(pcm16: ArrayBuffer): void {
        this.Enqueued.push(pcm16);
        this.IsPlaying = true;
    }
    public Flush(): void {
        this.IsPlaying = false;
    }
    public Close(): void {
        this.IsPlaying = false;
    }
}

/** Harness overriding the creation seams so Connect runs with NO network / audio. */
class TestElevenClient extends ElevenRealtimeClient {
    public Fake = new FakeSocket();
    public Playback = new FakePlayback();
    public Capture = new FakeMicCapture();
    public LastUrl: string | null = null;
    public LastProtocols: string[] | null = null;
    public PlaybackRate: number | null = null;
    public CaptureRate: number | null = null;

    protected override createSocket(url: string, protocols: string[]): IOpenAIProtocolClientSocket {
        this.LastUrl = url;
        this.LastProtocols = protocols;
        return this.Fake;
    }
    protected override async createMicCapture(_micStream: MediaStream, sampleRate: number): Promise<IPcmMicCapture> {
        this.CaptureRate = sampleRate;
        return this.Capture;
    }
    protected override createPlayback(sampleRate: number): IRealtimePcmPlayback {
        this.PlaybackRate = sampleRate;
        return this.Playback;
    }
}

function makeConfig(sessionConfig?: JSONObject): ClientRealtimeSessionConfig {
    return {
        Provider: 'eleven-realtime',
        Model: 'eleven_realtime_v1_max',
        EphemeralToken: 'ek_temp_abc',
        ExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        SessionConfig: sessionConfig ?? { type: 'realtime', instructions: 'be the session voice' },
    };
}

/** Lets the in-flight Connect continuation (microtasks) run. */
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Connects: open the socket, then deliver session.created (this provider waits for it). */
async function connect(client: TestElevenClient, sessionConfig?: JSONObject): Promise<void> {
    const promise = client.Connect(makeConfig(sessionConfig), new FakeMediaStream([new FakeTrack()]));
    client.Fake.Open();
    await flushAsync();
    client.Fake.EmitServer({ type: 'session.created', session: {} });
    await promise;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ElevenRealtimeClient', () => {
    let client: TestElevenClient;

    beforeEach(() => {
        client = new TestElevenClient();
    });

    it("resolves via the ClassFactory under the provider key 'eleven-realtime'", () => {
        const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'eleven-realtime');
        expect(resolved).toBeInstanceOf(ElevenRealtimeClient);
    });

    it('opens the model-on-URL endpoint with the OpenAI-SDK subprotocol pair carrying the client secret', async () => {
        await connect(client);
        expect(client.LastUrl).toBe(`${ELEVEN_REALTIME_WS_URL}?model=eleven_realtime_v1_max`);
        expect(client.LastProtocols).toEqual([ELEVEN_REALTIME_SUBPROTOCOL, `${ELEVEN_REALTIME_CLIENT_SECRET_SUBPROTOCOL_PREFIX}ek_temp_abc`]);
        expect(ELEVEN_REALTIME_WS_URL).toBe('wss://api.elevenlabs.io/v1/convai/realtime');
    });

    it('waits for session.created before applying the session config', async () => {
        const { states } = collect(client);
        const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
        client.Fake.Open();
        await flushAsync();
        expect(client.Fake.Sent).toHaveLength(0);

        client.Fake.EmitServer({ type: 'session.created', session: {} });
        await promise;
        expect(client.Fake.SentFrames()[0]).toEqual({
            type: 'session.update',
            session: { type: 'realtime', instructions: 'be the session voice' },
        });
        expect(states).toEqual(['connecting', 'connected', 'listening']);
    });

    it('builds the audio plane at 24 kHz in both directions', async () => {
        await connect(client);
        expect(client.PlaybackRate).toBe(ELEVEN_REALTIME_PCM_SAMPLE_RATE);
        expect(client.CaptureRate).toBe(ELEVEN_REALTIME_PCM_SAMPLE_RATE);
    });

    it('rejects Connect when the socket closes before session.created', async () => {
        const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
        client.Fake.Open();
        await flushAsync();
        client.Fake.onclose?.();
        await expect(promise).rejects.toThrow('closed during connect');
    });

    it('brands an unexpected close after connect as a fatal Eleven Realtime error', async () => {
        const { errors } = collect(client);
        await connect(client);
        client.Fake.onclose?.();
        expect(errors.at(-1)).toEqual({ Message: 'Eleven Realtime connection closed unexpectedly', Fatal: true });
    });
});
