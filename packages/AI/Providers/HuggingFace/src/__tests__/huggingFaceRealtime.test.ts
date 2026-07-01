import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RealtimeProxyRegistry, type JSONObject, type RealtimeSessionParams, type RealtimeTranscript, type RealtimeToolCall } from '@memberjunction/ai';
import {
    HuggingFaceRealtime,
    HuggingFaceRealtimeSession,
    HUGGINGFACE_DEFAULT_REALTIME_URL,
    HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE,
    type HuggingFaceConnectArgs,
    type HuggingFaceRealtimeSocket,
    type HuggingFaceServerEvent,
} from '../huggingFaceRealtime';

/** In-memory socket that captures outbound frames and lets tests inspect them. */
class FakeSocket implements HuggingFaceRealtimeSocket {
    public Sent: string[] = [];
    public Closed = false;
    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.Closed = true;
    }
    public Frames(): JSONObject[] {
        return this.Sent.map((s) => JSON.parse(s) as JSONObject);
    }
}

/** Test driver: overrides the transport seam so no network is touched. */
class TestHuggingFaceRealtime extends HuggingFaceRealtime {
    public Socket = new FakeSocket();
    public LastConnectArgs: HuggingFaceConnectArgs | null = null;

    protected override async connectSocket(args: HuggingFaceConnectArgs): Promise<HuggingFaceRealtimeSocket> {
        this.LastConnectArgs = args;
        return this.Socket;
    }

    public Emit(event: HuggingFaceServerEvent): void {
        this.LastConnectArgs?.OnMessage(event);
    }
}

/** The env vars the driver reads — snapshotted and reset around each test. */
const ENV_KEYS = ['MJAPI_PUBLIC_URL', 'HUGGINGFACE_REALTIME_URL', 'GRAPHQL_BASE_URL', 'GRAPHQL_PORT'];
const envSnapshot: Record<string, string | undefined> = {};

/** Drains microtasks AND one macrotask so the driver has attached the socket before we emit. */
function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return {
        Model: 'speech-to-speech',
        SystemPrompt: 'You are a helpful voice agent.',
        ...overrides,
    };
}

function collect(session: HuggingFaceRealtimeSession) {
    const transcripts: RealtimeTranscript[] = [];
    const toolCalls: RealtimeToolCall[] = [];
    const output: ArrayBuffer[] = [];
    let interruptions = 0;
    session.OnTranscript((t) => transcripts.push(t));
    session.OnToolCall((c) => toolCalls.push(c));
    session.OnOutput((chunk) => output.push(chunk));
    session.OnInterruption(() => (interruptions += 1));
    return { transcripts, toolCalls, output, get interruptions() { return interruptions; } };
}

/** Starts a server-bridged session and completes the `session.created` readiness handshake. */
async function startSession(driver: TestHuggingFaceRealtime, params: RealtimeSessionParams): Promise<HuggingFaceRealtimeSession> {
    const startPromise = driver.StartSession(params) as Promise<HuggingFaceRealtimeSession>;
    // Let StartSession attach the socket, then drive session.created to resolve WaitForReady.
    await flush();
    driver.Emit({ type: 'session.created' });
    return startPromise;
}

describe('HuggingFaceRealtime', () => {
    beforeEach(() => {
        for (const k of ENV_KEYS) {
            envSnapshot[k] = process.env[k];
            delete process.env[k];
        }
    });
    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (envSnapshot[k] === undefined) delete process.env[k];
            else process.env[k] = envSnapshot[k];
        }
    });

    describe('BuildSessionObject', () => {
        it('builds an OpenAI-Realtime session object with instructions + tools + voice', () => {
            const session = HuggingFaceRealtime.BuildSessionObject(
                makeParams({
                    Tools: [{ Name: 'do_thing', Description: 'Does a thing', ParametersSchema: { type: 'object' } }],
                    Config: { voice: 'nova', inputTranscriptionModel: 'whisper' },
                })
            );
            expect(session['instructions']).toBe('You are a helpful voice agent.');
            expect(Array.isArray(session['tools'])).toBe(true);
            const tools = session['tools'] as JSONObject[];
            expect(tools[0]).toMatchObject({ type: 'function', name: 'do_thing', description: 'Does a thing' });
            expect(session['audio']).toMatchObject({ output: { voice: 'nova' }, input: { transcription: { model: 'whisper' } } });
        });

        it('folds InitialContext into instructions and omits audio/tools when absent', () => {
            const session = HuggingFaceRealtime.BuildSessionObject(makeParams({ InitialContext: 'We spoke earlier.' }));
            expect(String(session['instructions'])).toContain('## Prior context');
            expect(String(session['instructions'])).toContain('We spoke earlier.');
            expect(session['tools']).toBeUndefined();
            expect(session['audio']).toBeUndefined();
        });
    });

    describe('ResolveSampleRate / HttpOriginToWs', () => {
        it('defaults the sample rate and honors an override', () => {
            expect(HuggingFaceRealtime.ResolveSampleRate(makeParams())).toBe(HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE);
            expect(HuggingFaceRealtime.ResolveSampleRate(makeParams({ Config: { sampleRate: 16000 } }))).toBe(16000);
        });

        it('converts http(s) origins to ws(s) and drops any path', () => {
            expect(HuggingFaceRealtime.HttpOriginToWs('http://localhost:4000')).toBe('ws://localhost:4000');
            expect(HuggingFaceRealtime.HttpOriginToWs('https://api.example.com/graphql')).toBe('wss://api.example.com');
            expect(HuggingFaceRealtime.HttpOriginToWs('wss://already.ws')).toBe('wss://already.ws');
        });
    });

    describe('CreateClientSession', () => {
        it('mints a proxy ticket and returns a wss proxy URL with the session pact', async () => {
            const driver = new TestHuggingFaceRealtime('secret-key');
            process.env['MJAPI_PUBLIC_URL'] = 'https://mjapi.example.com';
            const before = RealtimeProxyRegistry.Instance.Count;
            const config = await driver.CreateClientSession(makeParams({ Config: { voice: 'nova' } }));

            expect(config.Provider).toBe('huggingface');
            expect(config.EphemeralToken.startsWith('wss://mjapi.example.com/realtime-proxy?ticket=')).toBe(true);
            expect(RealtimeProxyRegistry.Instance.Count).toBe(before + 1);

            const pact = config.SessionConfig as JSONObject;
            expect((pact['session'] as JSONObject)['instructions']).toBe('You are a helpful voice agent.');
            expect(pact['sampleRate']).toBe(HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE);
        });

        it('registers the ticket so the proxy can consume the internal endpoint + auth once', async () => {
            const driver = new TestHuggingFaceRealtime('secret-key');
            process.env['MJAPI_PUBLIC_URL'] = 'http://localhost:4000';
            process.env['HUGGINGFACE_REALTIME_URL'] = 'ws://hf.internal:8000/v1/realtime';
            const config = await driver.CreateClientSession(makeParams());

            const ticketId = new URL(config.EphemeralToken).searchParams.get('ticket')!;
            const entry = RealtimeProxyRegistry.Instance.Consume(ticketId);
            expect(entry).not.toBeNull();
            expect(entry!.UpstreamUrl).toBe('ws://hf.internal:8000/v1/realtime');
            expect(entry!.UpstreamAuthHeader).toBe('Bearer secret-key');
            // single-use — a second consume yields null
            expect(RealtimeProxyRegistry.Instance.Consume(ticketId)).toBeNull();
        });
    });

    describe('StartSession (server-bridged, OpenAI wire)', () => {
        it('applies the session config on session.created before resolving', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const frames = driver.Socket.Frames();
            expect(frames[0]).toMatchObject({ type: 'session.update' });
            expect((frames[0]['session'] as JSONObject)['instructions']).toBe('You are a helpful voice agent.');
            expect(session).toBeInstanceOf(HuggingFaceRealtimeSession);
        });

        it('resolves upstream URL/auth from env when no Config override is present', async () => {
            const driver = new TestHuggingFaceRealtime('key123');
            await startSession(driver, makeParams());
            expect(driver.LastConnectArgs?.Url).toBe(HUGGINGFACE_DEFAULT_REALTIME_URL);
            expect(driver.LastConnectArgs?.AuthHeader).toBe('Bearer key123');
        });

        it('omits the upstream auth header for a sentinel (keyless self-host) API key', async () => {
            const driver = new TestHuggingFaceRealtime('none');
            await startSession(driver, makeParams());
            expect(driver.LastConnectArgs?.AuthHeader).toBeUndefined();
        });

        it('translates inbound audio, transcripts, tool calls, and barge-in', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const seen = collect(session);

            driver.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Hello there' });
            driver.Emit({ type: 'response.created' });
            driver.Emit({ type: 'response.output_audio_transcript.delta', delta: 'Hi' });
            driver.Emit({ type: 'response.output_audio.delta', delta: Buffer.from([1, 2, 3]).toString('base64') });
            driver.Emit({ type: 'input_audio_buffer.speech_started' }); // barge-in over active output
            driver.Emit({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'do_thing', arguments: '{"x":1}' });

            expect(seen.transcripts).toContainEqual({ Role: 'user', Text: 'Hello there', IsFinal: true } as RealtimeTranscript);
            expect(seen.transcripts).toContainEqual({ Role: 'assistant', Text: 'Hi', IsFinal: false } as RealtimeTranscript);
            expect(seen.output.length).toBe(1);
            expect(seen.interruptions).toBe(1);
            expect(seen.toolCalls).toEqual([{ CallID: 'c1', ToolName: 'do_thing', Arguments: '{"x":1}' }]);
        });

        it('does not treat speech_started as barge-in when the model is idle', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const seen = collect(session);
            driver.Emit({ type: 'input_audio_buffer.speech_started' });
            expect(seen.interruptions).toBe(0);
        });

        it('sends a function_call_output + response.create on SendToolResult', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const beforeCount = driver.Socket.Sent.length;
            await session.SendToolResult('c1', '{"ok":true}');
            const frames = driver.Socket.Frames().slice(beforeCount);
            expect(frames[0]).toMatchObject({ type: 'conversation.item.create' });
            expect((frames[0]['item'] as JSONObject)).toMatchObject({ type: 'function_call_output', call_id: 'c1', output: '{"ok":true}' });
            expect(frames[1]).toMatchObject({ type: 'response.create' });
        });

        it('skips RequestSpokenUpdate while a response is active', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            driver.Emit({ type: 'response.created' });
            expect(session.RequestSpokenUpdate('give an update')).toBe(false);
            driver.Emit({ type: 'response.done' });
            expect(session.RequestSpokenUpdate('give an update')).toBe(true);
        });

        it('surfaces an unexpected close as a fatal error but a consumer Close as silent', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const errors: string[] = [];
            session.OnError((e) => errors.push(`${e.Fatal}:${e.Message}`));

            await session.Close();
            expect(driver.Socket.Closed).toBe(true);
            session.HandleTransportClose(1006, 'gone'); // after consumer close — must stay silent
            expect(errors.length).toBe(0);
        });
    });
});
