import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RealtimeProxyRegistry, type JSONObject, type RealtimeSessionParams, type RealtimeTranscript, type RealtimeToolCall } from '@memberjunction/ai';
import type { IOpenAIRealtimeConnection } from '@memberjunction/ai-openai';
import type { OpenAIRealtimeError } from 'openai/realtime/index';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime';
import {
    HuggingFaceRealtime,
    HuggingFaceRealtimeSession,
    HUGGINGFACE_DEFAULT_REALTIME_URL,
    HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE,
} from '../huggingFaceRealtime';

/**
 * In-memory fake of the raw-WS adapter seam ({@link IOpenAIRealtimeConnection}): captures outbound
 * frames, lets tests fire server events / socket close, and tracks closed state. No network.
 */
class FakeConnection implements IOpenAIRealtimeConnection {
    public Sent: RealtimeClientEvent[] = [];
    public Closed = false;
    private listeners: Array<(event: RealtimeServerEvent) => void> = [];
    private errorListeners: Array<(error: OpenAIRealtimeError) => void> = [];
    private socketCloseListeners: Array<() => void> = [];

    public socket = {
        addEventListener: (_type: 'close', listener: () => void): void => {
            this.socketCloseListeners.push(listener);
        },
    };

    public on(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    public on(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    public on(
        event: 'event' | 'error',
        listener: ((event: RealtimeServerEvent) => void) | ((error: OpenAIRealtimeError) => void)
    ): void {
        if (event === 'event') {
            this.listeners.push(listener as (event: RealtimeServerEvent) => void);
        } else {
            this.errorListeners.push(listener as (error: OpenAIRealtimeError) => void);
        }
    }
    public off(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    public off(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    public off(
        event: 'event' | 'error',
        listener: ((event: RealtimeServerEvent) => void) | ((error: OpenAIRealtimeError) => void)
    ): void {
        if (event === 'event') {
            this.listeners = this.listeners.filter((l) => l !== listener);
        } else {
            this.errorListeners = this.errorListeners.filter((l) => l !== listener);
        }
    }
    public send(event: RealtimeClientEvent): void {
        this.Sent.push(event);
    }
    public close(): void {
        this.Closed = true;
    }
    public Fire(event: RealtimeServerEvent): void {
        for (const l of [...this.listeners]) {
            l(event);
        }
    }
    public FireError(error: OpenAIRealtimeError): void {
        for (const l of [...this.errorListeners]) {
            l(error);
        }
    }
    public FireSocketClose(): void {
        for (const l of [...this.socketCloseListeners]) {
            l();
        }
    }
}

/** Test driver: overrides the raw-connection seam so no network is touched, and records the URL. */
class TestHuggingFaceRealtime extends HuggingFaceRealtime {
    public Fake = new FakeConnection();
    public LastUrl: string | null = null;

    protected override createRawConnection(url: string): IOpenAIRealtimeConnection {
        this.LastUrl = url;
        return this.Fake;
    }

    /** Public accessor for the protected auth-header resolution (proxy-ticket input). */
    public AuthHeader(): string | undefined {
        return this.resolveUpstreamAuthHeader();
    }

    public Emit(event: JSONObject): void {
        this.Fake.Fire(event as unknown as RealtimeServerEvent);
    }
}

/** The env vars the driver reads — snapshotted and reset around each test. */
const ENV_KEYS = ['MJAPI_PUBLIC_URL', 'HUGGINGFACE_REALTIME_URL', 'GRAPHQL_BASE_URL', 'GRAPHQL_PORT'];
const envSnapshot: Record<string, string | undefined> = {};

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

/**
 * Starts a server-bridged session and completes the readiness handshake: `applyInitialConfig`
 * registers its deferred-apply listener synchronously inside `StartSession`, so firing
 * `session.created` right after the call resolves the awaited `WaitForConfigApplied` gate.
 */
async function startSession(driver: TestHuggingFaceRealtime, params: RealtimeSessionParams): Promise<HuggingFaceRealtimeSession> {
    const startPromise = driver.StartSession(params) as Promise<HuggingFaceRealtimeSession>;
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

    describe('BuildSessionObject (client pact)', () => {
        it('builds an OpenAI-Realtime session object with instructions + tools + voice', () => {
            const session = HuggingFaceRealtime.BuildSessionObject(
                makeParams({
                    Tools: [{ Name: 'do_thing', Description: 'Does a thing', ParametersSchema: { type: 'object' } }],
                    Config: { voice: 'nova', inputTranscriptionModel: 'whisper' },
                })
            );
            // `type: 'realtime'` is REQUIRED — HF's /v1/realtime validates session.update against the GA
            // session shape and rejects an object without it (verified live vs speech-to-speech v0.2.10).
            expect(session['type']).toBe('realtime');
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

        it('the SERVER-BRIDGED session declares HF-native 16 kHz in/out (not the 24 kHz bridge default), honoring Config.sampleRate', async () => {
            // Without a declared rate the bridge falls back to 24 kHz and feeds it into HF's 16 kHz
            // pipeline — the documented "silent on the bridge" footgun. The session must report 16 kHz.
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            expect(session.InputSampleRate).toBe(16000);
            expect(session.OutputSampleRate).toBe(16000);
            // A deployment whose pipeline runs at a different rate can override it:
            const overridden = await startSession(new TestHuggingFaceRealtime(''), makeParams({ Config: { sampleRate: 24000 } }));
            expect(overridden.InputSampleRate).toBe(24000);
            expect(overridden.OutputSampleRate).toBe(24000);
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

    describe('StartSession (server-bridged over the shared OpenAI-protocol session)', () => {
        it('applies the session config on session.created BEFORE resolving (ready-after-config contract)', async () => {
            const driver = new TestHuggingFaceRealtime('');
            let resolved = false;
            const startPromise = driver.StartSession(makeParams()).then((s) => {
                resolved = true;
                return s;
            });
            // Nothing sent and not resolved until the endpoint confirms the session exists.
            await Promise.resolve();
            expect(resolved).toBe(false);
            expect(driver.Fake.Sent.length).toBe(0);
            driver.Emit({ type: 'session.created' });
            const session = await startPromise;
            expect(session).toBeInstanceOf(HuggingFaceRealtimeSession);
            const first = driver.Fake.Sent[0];
            expect(first.type).toBe('session.update');
            if (first.type === 'session.update' && first.session.type === 'realtime') {
                expect(first.session.instructions).toBe('You are a helpful voice agent.');
            } else {
                throw new Error('expected realtime session.update');
            }
        });

        it('folds InitialContext into the server-bridged instructions (no separate user item)', async () => {
            const driver = new TestHuggingFaceRealtime('');
            await startSession(driver, makeParams({ InitialContext: 'We spoke earlier.' }));
            const first = driver.Fake.Sent[0];
            if (first.type === 'session.update' && first.session.type === 'realtime') {
                expect(String(first.session.instructions)).toContain('## Prior context');
                expect(String(first.session.instructions)).toContain('We spoke earlier.');
            } else {
                throw new Error('expected realtime session.update');
            }
            // No conversation.item.create user seed — the compat protocol has no history channel.
            expect(driver.Fake.Sent.some((e) => e.type === 'conversation.item.create')).toBe(false);
        });

        it('sends NO transcription/turn-detection audio block by default (the cascade transcribes natively)', async () => {
            const driver = new TestHuggingFaceRealtime('');
            await startSession(driver, makeParams());
            const first = driver.Fake.Sent[0];
            if (first.type === 'session.update' && first.session.type === 'realtime') {
                expect((first.session as Record<string, unknown>).audio).toBeUndefined();
            } else {
                throw new Error('expected realtime session.update');
            }
        });

        it('scrubs MJ-side transport keys (endpoint/sampleRate/proxyBaseUrl) from the wire payload', async () => {
            const driver = new TestHuggingFaceRealtime('');
            await startSession(driver, makeParams({ Config: { endpoint: 'ws://custom:9000/v1/realtime', sampleRate: 24000, proxyBaseUrl: 'https://mj.example.com' } }));
            expect(driver.LastUrl).toBe('ws://custom:9000/v1/realtime');
            const first = driver.Fake.Sent[0];
            if (first.type === 'session.update' && first.session.type === 'realtime') {
                const session = first.session as Record<string, unknown>;
                expect(session.endpoint).toBeUndefined();
                expect(session.sampleRate).toBeUndefined();
                expect(session.proxyBaseUrl).toBeUndefined();
            } else {
                throw new Error('expected realtime session.update');
            }
        });

        it('re-registers a DIFFERENT tool set and no-ops an identical one (fingerprint idempotency)', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const tools = [{ Name: 'new_tool', Description: 'A new tool', ParametersSchema: { type: 'object' } }];
            const session = await startSession(driver, makeParams());
            const before = driver.Fake.Sent.length;
            await session.RegisterTools(tools);
            const frame = driver.Fake.Sent.slice(before)[0];
            expect(frame.type).toBe('session.update');
            if (frame.type === 'session.update' && frame.session.type === 'realtime') {
                expect((frame.session.tools as JSONObject[])[0]).toMatchObject({ type: 'function', name: 'new_tool' });
            } else {
                throw new Error('expected realtime session.update');
            }
            const after = driver.Fake.Sent.length;
            await session.RegisterTools([...tools]); // identical set — silent no-op
            expect(driver.Fake.Sent.length).toBe(after);
        });

        it('resolves the upstream URL from env when no Config override is present', async () => {
            const driver = new TestHuggingFaceRealtime('key123');
            await startSession(driver, makeParams());
            expect(driver.LastUrl).toBe(HUGGINGFACE_DEFAULT_REALTIME_URL);
            expect(driver.AuthHeader()).toBe('Bearer key123');
        });

        it('treats a sentinel (keyless self-host) API key as "no auth"', () => {
            expect(new TestHuggingFaceRealtime('none').AuthHeader()).toBeUndefined();
            expect(new TestHuggingFaceRealtime('SELF-HOSTED').AuthHeader()).toBeUndefined();
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

            expect(seen.transcripts).toContainEqual({ Role: 'user', Text: 'Hello there', IsFinal: true, ReplacesPrevious: false } as RealtimeTranscript);
            expect(seen.transcripts).toContainEqual({ Role: 'assistant', Text: 'Hi', IsFinal: false, ReplacesPrevious: false } as RealtimeTranscript);
            expect(seen.output.length).toBe(1);
            expect(seen.interruptions).toBe(1);
            expect(seen.toolCalls).toEqual([{ CallID: 'c1', ToolName: 'do_thing', Arguments: '{"x":1}' }]);
        });

        it('flags 2nd+ streamed user completeds ReplacesPrevious via the shared session; resets on speech_started', async () => {
            // HuggingFace inherits the shared OpenAIRealtimeSession streamed-transcription handling, so a
            // pipeline that streams growing user captions collapses to one persisted row and resets per turn.
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const seen = collect(session);
            driver.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'turn' });
            driver.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'turn on' });
            driver.Emit({ type: 'input_audio_buffer.speech_started' }); // new turn
            driver.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'off' });
            expect(seen.transcripts.filter((t) => t.Role === 'user').map((t) => t.ReplacesPrevious)).toEqual([false, true, false]);
        });

        it('accepts BETA event aliases from older speech-to-speech builds', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const seen = collect(session);
            driver.Emit({ type: 'response.audio.delta', delta: Buffer.from([9, 9]).toString('base64') });
            driver.Emit({ type: 'response.audio_transcript.delta', delta: 'partial' });
            driver.Emit({ type: 'response.audio_transcript.done', transcript: 'full sentence' });
            expect(seen.output.length).toBe(1);
            expect(seen.transcripts).toContainEqual({ Role: 'assistant', Text: 'partial', IsFinal: false, ReplacesPrevious: false } as RealtimeTranscript);
            expect(seen.transcripts).toContainEqual({ Role: 'assistant', Text: 'full sentence', IsFinal: true, ReplacesPrevious: false } as RealtimeTranscript);
        });

        it('audio delta marks a response active even without response.created (compat robustness)', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const seen = collect(session);
            // No response.created — only audio. speech_started must still gate as TRUE barge-in.
            driver.Emit({ type: 'response.output_audio.delta', delta: Buffer.from([1]).toString('base64') });
            driver.Emit({ type: 'input_audio_buffer.speech_started' });
            expect(seen.interruptions).toBe(1);
        });

        it('a tool call releases the busy flag so a spoken update cannot deadlock', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            driver.Emit({ type: 'response.created' });
            driver.Emit({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 't', arguments: '{}' });
            // Busy flag was released by the tool call — the spoken update goes out.
            expect(session.RequestSpokenUpdate('give an update')).toBe(true);
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
            const beforeCount = driver.Fake.Sent.length;
            await session.SendToolResult('c1', '{"ok":true}');
            const frames = driver.Fake.Sent.slice(beforeCount);
            expect(frames[0].type).toBe('conversation.item.create');
            if (frames[0].type === 'conversation.item.create') {
                expect(frames[0].item).toMatchObject({ type: 'function_call_output', call_id: 'c1', output: '{"ok":true}' });
            }
            expect(frames[1].type).toBe('response.create');
        });

        it('skips RequestSpokenUpdate while a response is active', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            driver.Emit({ type: 'response.created' });
            expect(session.RequestSpokenUpdate('give an update')).toBe(false);
            driver.Emit({ type: 'response.done', response: {} });
            expect(session.RequestSpokenUpdate('give an update')).toBe(true);
        });

        it('rejects StartSession when the transport dies before session.created', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const startPromise = driver.StartSession(makeParams());
            const transportError = new Error('connection refused') as OpenAIRealtimeError;
            driver.Fake.FireError(transportError); // no .error payload → fatal transport failure
            await expect(startPromise).rejects.toThrow('connection refused');
        });

        it('surfaces an unexpected close as fatal but a consumer Close as silent', async () => {
            const driver = new TestHuggingFaceRealtime('');
            const session = await startSession(driver, makeParams());
            const errors: string[] = [];
            session.OnError((e) => errors.push(`${e.Fatal}:${e.Message}`));

            await session.Close();
            expect(driver.Fake.Closed).toBe(true);
            driver.Fake.FireSocketClose(); // after consumer close — must stay silent
            expect(errors.length).toBe(0);
        });
    });
});

describe('HuggingFaceRealtime edge coverage (shared-driver surface)', () => {
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

    it('endpoint precedence: Config.endpoint > HUGGINGFACE_REALTIME_URL env > default', async () => {
        process.env['HUGGINGFACE_REALTIME_URL'] = 'ws://env-host:8000/v1/realtime';
        const envDriver = new TestHuggingFaceRealtime('');
        await startSession(envDriver, makeParams());
        expect(envDriver.LastUrl).toBe('ws://env-host:8000/v1/realtime');
        const cfgDriver = new TestHuggingFaceRealtime('');
        await startSession(cfgDriver, makeParams({ Config: { endpoint: 'ws://cfg-host:9000/v1/realtime' } }));
        expect(cfgDriver.LastUrl).toBe('ws://cfg-host:9000/v1/realtime');
    });

    it('client pact honors a sampleRate override end-to-end', async () => {
        const driver = new TestHuggingFaceRealtime('secret');
        process.env['MJAPI_PUBLIC_URL'] = 'https://mjapi.example.com';
        const cfg = await driver.CreateClientSession(makeParams({ Config: { sampleRate: 24000 } }));
        expect((cfg.SessionConfig as JSONObject)['sampleRate']).toBe(24000);
    });

    it('a duplicate session.created cannot double-apply the config', async () => {
        const driver = new TestHuggingFaceRealtime('');
        await startSession(driver, makeParams());
        const updates = driver.Fake.Sent.filter((e) => e.type === 'session.update').length;
        driver.Emit({ type: 'session.created' });
        expect(driver.Fake.Sent.filter((e) => e.type === 'session.update').length).toBe(updates);
    });

    it('surfaces a provider error FRAME as recoverable (session stays open)', async () => {
        const driver = new TestHuggingFaceRealtime('');
        const session = await startSession(driver, makeParams());
        const errors: Array<{ Fatal?: boolean; Code?: string }> = [];
        session.OnError((e) => errors.push(e));
        // Provider error frames arrive via the adapter's error channel WITH a payload.
        const providerError = new Error('bad tool schema') as Parameters<typeof driver.Fake.FireError>[0];
        providerError.error = { message: 'bad tool schema', type: 'invalid_request_error', code: 'invalid_tools' };
        driver.Fake.FireError(providerError);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ Fatal: false, Code: 'invalid_tools' });
    });

    it('honors a voice from the Config bag on the server-bridged path (supportsVoiceOutput on)', async () => {
        const driver = new TestHuggingFaceRealtime('');
        await startSession(driver, makeParams({ Config: { voice: 'nova' } }));
        const first = driver.Fake.Sent[0];
        if (first.type === 'session.update' && first.session.type === 'realtime') {
            const audio = first.session.audio as { output?: { voice?: string } } | undefined;
            expect(audio?.output?.voice).toBe('nova');
        } else {
            throw new Error('expected realtime session.update');
        }
    });

    it('the tool-set fingerprint is order-insensitive (reordered identical set is a no-op)', async () => {
        const driver = new TestHuggingFaceRealtime('');
        const a = { Name: 'alpha', Description: 'A', ParametersSchema: { type: 'object' } };
        const b = { Name: 'beta', Description: 'B', ParametersSchema: { type: 'object' } };
        const session = await startSession(driver, makeParams());
        await session.RegisterTools([a, b]);
        const after = driver.Fake.Sent.length;
        await session.RegisterTools([b, a]); // same set, different order
        expect(driver.Fake.Sent.length).toBe(after);
    });

    it('scrubs GA feature keys while gates are off (self-hosted stacks lag the GA surface)', async () => {
        const driver = new TestHuggingFaceRealtime('');
        await startSession(driver, makeParams({ Config: { effortLevel: 'high', parallelToolCalls: true, mcpTools: [{ type: 'mcp', server_label: 'kb' }] } }));
        const first = driver.Fake.Sent[0];
        if (first.type === 'session.update' && first.session.type === 'realtime') {
            const session = first.session as Record<string, unknown>;
            expect(session.reasoning).toBeUndefined();
            expect(session.parallel_tool_calls).toBeUndefined();
            expect(session.tools).toBeUndefined();
            expect(session.effortLevel).toBeUndefined();
            expect(session.mcpTools).toBeUndefined();
        } else {
            throw new Error('expected realtime session.update');
        }
    });

    it('proxy base falls back to GRAPHQL_BASE_URL + GRAPHQL_PORT when MJAPI_PUBLIC_URL is unset', async () => {
        const driver = new TestHuggingFaceRealtime('secret');
        process.env['GRAPHQL_BASE_URL'] = 'https://api.deployment.io';
        process.env['GRAPHQL_PORT'] = '8443';
        const cfg = await driver.CreateClientSession(makeParams());
        expect(cfg.EphemeralToken.startsWith('wss://api.deployment.io:8443/realtime-proxy?ticket=')).toBe(true);
    });
});

describe('QA hardening regressions (plan A-items, HF-specific)', () => {
    it('A1 end-to-end: a bodyless provider error frame is RECOVERABLE and does not kill startup', async () => {
        // Drive through the real adapter (not the fake connection) so the synthesized payload path runs.
        const { RawRealtimeWebSocketConnection } = await import('@memberjunction/ai-openai');
        class FakeWS {
            public static Last: FakeWS | null = null;
            public onopen: (() => void) | null = null;
            public onmessage: ((event: { data: unknown }) => void) | null = null;
            public onerror: (() => void) | null = null;
            public onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
            public Sent: string[] = [];
            constructor(public Url: string) { FakeWS.Last = this; }
            public send(d: string): void { this.Sent.push(d); }
            public close(): void { /* noop */ }
        }
        const conn = new RawRealtimeWebSocketConnection('ws://x/v1/realtime', FakeWS as unknown as new (u: string) => FakeWS);
        const ws = FakeWS.Last!;
        const session = new HuggingFaceRealtimeSession(conn);
        session.applyInitialConfig({ Model: 'speech-to-speech', SystemPrompt: 'sys' });
        const errors: Array<{ Fatal?: boolean }> = [];
        session.OnError((e) => errors.push(e));
        ws.onopen?.();
        // Bodyless error frame BEFORE session.created — must be recoverable, must NOT reject readiness.
        ws.onmessage?.({ data: JSON.stringify({ type: 'error' }) });
        expect(errors).toEqual([expect.objectContaining({ Fatal: false })]);
        ws.onmessage?.({ data: JSON.stringify({ type: 'session.created' }) });
        await expect(session.WaitForConfigApplied()).resolves.toBeUndefined();
    });

    it('A2: HF reports CanReconfigureTurnMode false and Reconfigure sends nothing', async () => {
        const driver = new TestHuggingFaceRealtime('');
        const session = await startSession(driver, makeParams());
        expect(session.Capabilities).toEqual({ CanReconfigureTurnMode: false });
        const before = driver.Fake.Sent.length;
        session.Reconfigure({ DisableAutoResponse: true });
        expect(driver.Fake.Sent.length).toBe(before);
    });

    it('A3: a Config bag `type` key cannot break the strict-endpoint session.update', async () => {
        const driver = new TestHuggingFaceRealtime('');
        await startSession(driver, makeParams({ Config: { type: 'not-realtime', instructions: 'pwned' } }));
        const first = driver.Fake.Sent[0];
        if (first.type === 'session.update' && first.session.type === 'realtime') {
            expect(first.session.type).toBe('realtime');
            expect(first.session.instructions).toBe('You are a helpful voice agent.');
        } else {
            throw new Error('expected realtime session.update');
        }
    });

    it('A5: HF suppresses empty transcript payloads again (old-driver parity)', async () => {
        const driver = new TestHuggingFaceRealtime('');
        const session = await startSession(driver, makeParams());
        const seen: Array<{ Text: string }> = [];
        session.OnTranscript((t) => seen.push(t));
        driver.Emit({ type: 'conversation.item.input_audio_transcription.delta' }); // undefined delta
        driver.Emit({ type: 'response.output_audio_transcript.done', transcript: '  ' });
        expect(seen).toHaveLength(0);
    });
});
