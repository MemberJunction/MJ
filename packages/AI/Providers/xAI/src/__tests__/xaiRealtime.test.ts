import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @memberjunction/global so @RegisterClass is a no-op decorator.
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

// Mock @memberjunction/ai — provide BaseModel/BaseRealtimeModel base classes only. The realtime
// type aliases (RealtimeSessionParams, etc.) are compile-time interfaces and need no runtime mock.
vi.mock('@memberjunction/ai', () => {
    class BaseModel {
        protected _apiKey: string;
        constructor(apiKey: string) {
            this._apiKey = apiKey;
        }
    }
    // Mirror the real BaseRealtimeModel's default client-direct surface so the driver — which does
    // NOT override either member (Grok Voice is server-bridged only) — inherits the correct behavior:
    // SupportsClientDirect defaults to false and CreateClientSession throws unless overridden.
    class BaseRealtimeModel extends BaseModel {
        public get SupportsClientDirect(): boolean {
            return false;
        }
        public async CreateClientSession(): Promise<never> {
            throw new Error(`${this.constructor.name} does not support client-direct realtime sessions`);
        }
    }
    return { BaseModel, BaseRealtimeModel };
});

// Mock the SDK WebSocket so importing the driver never touches the network. The driver's
// createConnection() is overridden in tests, so this constructor is never actually invoked.
vi.mock('openai/realtime/websocket', () => ({
    OpenAIRealtimeWebSocket: vi.fn(),
}));

// Capture the OpenAI constructor options so we can assert the xAI base URL redirection.
const openAICtor = vi.fn();
vi.mock('openai', () => ({
    OpenAI: vi.fn().mockImplementation(function (this: Record<string, unknown>, opts: Record<string, unknown>) {
        openAICtor(opts);
        return this;
    }),
}));

import { xAIRealtime, xAIRealtimeSession, IxAIRealtimeConnection } from '../models/xaiRealtime';
import type { OpenAIRealtimeError } from 'openai/realtime/index';
import type { RealtimeServerEvent, RealtimeClientEvent } from 'openai/resources/realtime/realtime';
import type { ClientSecretCreateParams, ClientSecretCreateResponse } from 'openai/resources/realtime/client-secrets';

/**
 * In-memory fake connection: records every outbound `send`, lets tests fire server events to all
 * `'event'` listeners (and SDK-level errors to `'error'` listeners), exposes a fake raw socket
 * whose `'close'` listeners tests can fire, and tracks open/closed state. No network, fully
 * deterministic.
 */
class FakeConnection implements IxAIRealtimeConnection {
    public Sent: RealtimeClientEvent[] = [];
    public Closed = false;
    private listeners: Array<(event: RealtimeServerEvent) => void> = [];
    private errorListeners: Array<(error: OpenAIRealtimeError) => void> = [];
    private socketCloseListeners: Array<() => void> = [];

    /** Fake raw-socket surface (the driver only uses addEventListener('close', ...)). */
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
    /** Test helper: dispatch a server event to all registered listeners. */
    public Fire(event: RealtimeServerEvent): void {
        for (const l of this.listeners) {
            l(event);
        }
    }
    /** Test helper: dispatch an SDK-level error to all registered error listeners. */
    public FireError(error: OpenAIRealtimeError): void {
        for (const l of this.errorListeners) {
            l(error);
        }
    }
    /** Test helper: fire the raw socket's close listeners. */
    public FireSocketClose(): void {
        for (const l of this.socketCloseListeners) {
            l();
        }
    }
    public get ListenerCount(): number {
        return this.listeners.length;
    }
    public get ErrorListenerCount(): number {
        return this.errorListeners.length;
    }
}

/** Builds a minimal OpenAIRealtimeError-shaped object (the class is just Error + two fields). */
function makeSdkError(message: string, providerError?: { code?: string | null }): OpenAIRealtimeError {
    const err = new Error(message) as OpenAIRealtimeError;
    if (providerError) {
        err.error = { message, type: 'invalid_request_error', code: providerError.code };
    }
    return err;
}

/** Driver subclass that injects the fake connection through the createConnection seam. */
class TestablexAIRealtime extends xAIRealtime {
    public Fake = new FakeConnection();
    protected override createConnection(): IxAIRealtimeConnection {
        return this.Fake;
    }
}

/** Driver subclass that captures the mint request + returns a fake ephemeral secret (no network). */
class ClientDirectTestablexAI extends xAIRealtime {
    public MintBody: ClientSecretCreateParams | null = null;
    protected override async mintClientSecret(body: ClientSecretCreateParams): Promise<ClientSecretCreateResponse> {
        this.MintBody = body;
        return {
            value: 'ephem-xai-123',
            expires_at: 1893456000,
            session: { type: 'realtime' } as ClientSecretCreateResponse['session'],
        };
    }
}

describe('xAIRealtime construction', () => {
    beforeEach(() => {
        openAICtor.mockClear();
    });

    it('points the OpenAI SDK client at the xAI base URL so the realtime socket resolves to api.x.ai', () => {
        new TestablexAIRealtime('xai-key');
        expect(openAICtor).toHaveBeenCalledWith({ apiKey: 'xai-key', baseURL: 'https://api.x.ai/v1' });
    });

    it('advertises client-direct support (Grok Voice supports browser-direct WebSocket sessions)', () => {
        expect(new TestablexAIRealtime('k').SupportsClientDirect).toBe(true);
    });

    it('CreateClientSession mints a well-formed config (Provider xai, token, model, instructions, tools)', async () => {
        const driver = new ClientDirectTestablexAI('k');
        const cfg = await driver.CreateClientSession({
            Model: 'grok-voice',
            SystemPrompt: 'be the voice',
            Tools: [{ Name: 'invoke-target-agent', Description: 'run target', ParametersSchema: { type: 'object' } }],
        });
        expect(cfg.Provider).toBe('xai');
        expect(cfg.Model).toBe('grok-voice');
        expect(cfg.EphemeralToken).toBe('ephem-xai-123');
        expect(cfg.ExpiresAt).toBe(new Date(1893456000 * 1000).toISOString());
        const sc = cfg.SessionConfig as Record<string, unknown>;
        expect(sc.type).toBe('realtime');
        expect(sc.model).toBe('grok-voice');
        expect(sc.instructions).toBe('be the voice');
        expect(Array.isArray(sc.tools)).toBe(true);
        // User input transcription opted in so both sides of the conversation are captured.
        expect((sc.audio as Record<string, unknown>).input).toBeDefined();
        // The mint request carried the same server-controlled session config.
        expect((driver.MintBody?.session as Record<string, unknown> | undefined)?.instructions).toBe('be the voice');
    });

    it('CreateClientSession omits tools when none are provided', async () => {
        const cfg = await new ClientDirectTestablexAI('k').CreateClientSession({ Model: 'grok-voice', SystemPrompt: 'hi' });
        expect((cfg.SessionConfig as Record<string, unknown>).tools).toBeUndefined();
    });
});

describe('xAIRealtime', () => {
    let driver: TestablexAIRealtime;

    beforeEach(() => {
        openAICtor.mockClear();
        driver = new TestablexAIRealtime('test-key');
    });

    describe('StartSession config', () => {
        it('sends session.update with instructions on start', async () => {
            await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'be helpful' });
            const update = driver.Fake.Sent.find((e) => e.type === 'session.update');
            expect(update).toBeDefined();
            if (update?.type === 'session.update' && update.session.type === 'realtime') {
                expect(update.session.instructions).toBe('be helpful');
            } else {
                throw new Error('expected realtime session.update');
            }
        });

        it('maps Tools into native function tools at start', async () => {
            await driver.StartSession({
                Model: 'grok-voice',
                SystemPrompt: 'sys',
                Tools: [{ Name: 'GetWeather', Description: 'weather', ParametersSchema: { type: 'object' } }],
            });
            const update = driver.Fake.Sent.find((e) => e.type === 'session.update');
            if (update?.type === 'session.update' && update.session.type === 'realtime') {
                const tools = update.session.tools ?? [];
                expect(tools).toHaveLength(1);
                expect(tools[0]).toMatchObject({
                    type: 'function',
                    name: 'GetWeather',
                    description: 'weather',
                    parameters: { type: 'object' },
                });
            } else {
                throw new Error('expected realtime session.update with tools');
            }
        });

        it('seeds InitialContext as a user text message', async () => {
            await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys', InitialContext: 'prior chat' });
            const create = driver.Fake.Sent.find((e) => e.type === 'conversation.item.create');
            expect(create).toBeDefined();
            if (create?.type === 'conversation.item.create' && create.item.type === 'message') {
                expect(create.item.role).toBe('user');
                expect(create.item.content[0]).toMatchObject({ type: 'input_text', text: 'prior chat' });
            } else {
                throw new Error('expected conversation.item.create user message');
            }
        });

        it('opts into USER input transcription on the start session.update (both-role transcript parity)', async () => {
            await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' });
            const update = driver.Fake.Sent.find((e) => e.type === 'session.update');
            if (update?.type === 'session.update' && update.session.type === 'realtime') {
                expect(update.session.audio).toEqual({ input: { transcription: { model: 'whisper-1' } } });
            } else {
                throw new Error('expected realtime session.update');
            }
        });

        it('lets the Config bag override the default audio/input-transcription block', async () => {
            await driver.StartSession({
                Model: 'grok-voice',
                SystemPrompt: 'sys',
                Config: { audio: { input: { transcription: { model: 'grok-transcribe' } } } },
            });
            const update = driver.Fake.Sent.find((e) => e.type === 'session.update');
            if (update?.type === 'session.update' && update.session.type === 'realtime') {
                expect(update.session.audio).toEqual({ input: { transcription: { model: 'grok-transcribe' } } });
            } else {
                throw new Error('expected realtime session.update');
            }
        });

        it('merges Config bag into the session.update', async () => {
            await driver.StartSession({
                Model: 'grok-voice',
                SystemPrompt: 'sys',
                Config: { output_modalities: ['audio'] },
            });
            const update = driver.Fake.Sent.find((e) => e.type === 'session.update');
            if (update?.type === 'session.update' && update.session.type === 'realtime') {
                expect(update.session.output_modalities).toEqual(['audio']);
            } else {
                throw new Error('expected realtime session.update');
            }
        });
    });

    describe('outbound operations', () => {
        it('SendInput appends base64 PCM16 audio', async () => {
            const session = await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' });
            const bytes = new Uint8Array([1, 2, 3, 4]);
            session.SendInput(bytes.buffer);
            const append = driver.Fake.Sent.find((e) => e.type === 'input_audio_buffer.append');
            expect(append).toBeDefined();
            if (append?.type === 'input_audio_buffer.append') {
                expect(append.audio).toBe(Buffer.from(bytes).toString('base64'));
            }
        });

        it('RegisterTools sends a session.update with mapped tools', async () => {
            const session = await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' });
            driver.Fake.Sent = [];
            await session.RegisterTools([
                { Name: 'Lookup', Description: 'desc', ParametersSchema: { type: 'object', properties: {} } },
            ]);
            const update = driver.Fake.Sent.find((e) => e.type === 'session.update');
            if (update?.type === 'session.update' && update.session.type === 'realtime') {
                expect(update.session.tools?.[0]).toMatchObject({ type: 'function', name: 'Lookup' });
            } else {
                throw new Error('expected realtime session.update');
            }
        });

        it('RegisterTools with the SAME set supplied at connect time re-declares identical schemas (idempotent)', async () => {
            const tools = [{ Name: 'Lookup', Description: 'desc', ParametersSchema: { type: 'object' } }];
            const session = await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys', Tools: tools });
            const startUpdate = driver.Fake.Sent.find((e) => e.type === 'session.update');
            driver.Fake.Sent = [];
            await session.RegisterTools(tools);
            const reUpdate = driver.Fake.Sent.find((e) => e.type === 'session.update');
            // Same schema re-declared — a no-op-equivalent for the conversation (driver obligation: idempotency).
            if (
                startUpdate?.type === 'session.update' &&
                startUpdate.session.type === 'realtime' &&
                reUpdate?.type === 'session.update' &&
                reUpdate.session.type === 'realtime'
            ) {
                expect(reUpdate.session.tools).toEqual(startUpdate.session.tools);
            } else {
                throw new Error('expected realtime session.update on both registrations');
            }
        });

        it('SendToolResult sends function_call_output then response.create (tool result is always voiced)', async () => {
            const session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
            driver.Fake.Sent = [];
            await session.SendToolResult('call_1', '{"temp":72}');
            const out = driver.Fake.Sent[0];
            const respond = driver.Fake.Sent[1];
            expect(out.type).toBe('conversation.item.create');
            if (out.type === 'conversation.item.create' && out.item.type === 'function_call_output') {
                expect(out.item.call_id).toBe('call_1');
                expect(out.item.output).toBe('{"temp":72}');
            } else {
                throw new Error('expected function_call_output item');
            }
            expect(respond.type).toBe('response.create');
        });

        it('SendContextNote injects a system-role input_text item without a response.create', async () => {
            const session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
            driver.Fake.Sent = [];
            session.SendContextNote('[progress] delegated run gathering data');
            expect(driver.Fake.Sent).toHaveLength(1);
            const create = driver.Fake.Sent[0];
            expect(create.type).toBe('conversation.item.create');
            if (create.type === 'conversation.item.create' && create.item.type === 'message' && create.item.role === 'system') {
                expect(create.item.content[0]).toMatchObject({ type: 'input_text', text: '[progress] delegated run gathering data' });
            } else {
                throw new Error('expected conversation.item.create system message');
            }
            // No reply is forced — context notes never trigger generation.
            expect(driver.Fake.Sent.some((e) => e.type === 'response.create')).toBe(false);
        });

        it('RequestSpokenUpdate sends response.create with per-response instructions when idle', async () => {
            const session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
            driver.Fake.Sent = [];
            session.RequestSpokenUpdate('Briefly say the report agent is drafting.');
            expect(driver.Fake.Sent).toHaveLength(1);
            const respond = driver.Fake.Sent[0];
            expect(respond.type).toBe('response.create');
            if (respond.type === 'response.create') {
                expect(respond.response?.instructions).toBe('Briefly say the report agent is drafting.');
            }
        });

        it('RequestSpokenUpdate is SKIPPED while a response is active and resumes after response.done', async () => {
            const session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
            driver.Fake.Fire({ type: 'response.created', event_id: 'e', response: {} } as RealtimeServerEvent);
            driver.Fake.Sent = [];
            session.RequestSpokenUpdate('update 1');
            expect(driver.Fake.Sent).toHaveLength(0); // dropped — interim updates are disposable
            driver.Fake.Fire({ type: 'response.done', event_id: 'e', response: {} } as RealtimeServerEvent);
            session.RequestSpokenUpdate('update 2');
            expect(driver.Fake.Sent).toHaveLength(1);
            expect(driver.Fake.Sent[0].type).toBe('response.create');
        });

        it('RequestSpokenUpdate sets the active flag eagerly so back-to-back updates collapse to one', async () => {
            const session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
            driver.Fake.Sent = [];
            session.RequestSpokenUpdate('first');
            session.RequestSpokenUpdate('second'); // before any response.created echo arrives
            const responds = driver.Fake.Sent.filter((e) => e.type === 'response.create');
            expect(responds).toHaveLength(1);
        });

        it('SendToolResult marks a response active so a trailing spoken update is skipped (deadlock/collision guard)', async () => {
            const session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
            await session.SendToolResult('call_1', '{"ok":true}');
            driver.Fake.Sent = [];
            session.RequestSpokenUpdate('narrate'); // tool result already triggered a response
            expect(driver.Fake.Sent).toHaveLength(0);
        });
    });

    describe('inbound event translation', () => {
        let session: xAIRealtimeSession;

        beforeEach(async () => {
            session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
        });

        it('translates an audio delta to OnOutput with decoded bytes', () => {
            const received: ArrayBuffer[] = [];
            session.OnOutput((c) => received.push(c));
            const audio = Buffer.from(new Uint8Array([9, 8, 7])).toString('base64');
            driver.Fake.Fire({
                type: 'response.output_audio.delta',
                delta: audio,
                content_index: 0,
                event_id: 'e1',
                item_id: 'i1',
                output_index: 0,
                response_id: 'r1',
            } as RealtimeServerEvent);
            expect(received).toHaveLength(1);
            expect(Array.from(new Uint8Array(received[0]))).toEqual([9, 8, 7]);
        });

        it('translates assistant transcript delta (partial) and done (final)', () => {
            const transcripts: Array<{ Role: string; Text: string; IsFinal: boolean }> = [];
            session.OnTranscript((t) => transcripts.push(t));
            driver.Fake.Fire({
                type: 'response.output_audio_transcript.delta',
                delta: 'Hel',
                content_index: 0,
                event_id: 'e',
                item_id: 'i',
                output_index: 0,
                response_id: 'r',
            } as RealtimeServerEvent);
            driver.Fake.Fire({
                type: 'response.output_audio_transcript.done',
                transcript: 'Hello',
                content_index: 0,
                event_id: 'e',
                item_id: 'i',
                output_index: 0,
                response_id: 'r',
            } as RealtimeServerEvent);
            expect(transcripts).toEqual([
                { Role: 'assistant', Text: 'Hel', IsFinal: false },
                { Role: 'assistant', Text: 'Hello', IsFinal: true },
            ]);
        });

        it('translates user (input) transcription delta and completed', () => {
            const transcripts: Array<{ Role: string; Text: string; IsFinal: boolean }> = [];
            session.OnTranscript((t) => transcripts.push(t));
            driver.Fake.Fire({
                type: 'conversation.item.input_audio_transcription.delta',
                delta: 'wha',
                event_id: 'e',
                item_id: 'i',
            } as RealtimeServerEvent);
            driver.Fake.Fire({
                type: 'conversation.item.input_audio_transcription.completed',
                transcript: 'what is the weather',
                content_index: 0,
                event_id: 'e',
                item_id: 'i',
                usage: { type: 'tokens', input_tokens: 1, output_tokens: 1, total_tokens: 2 },
            } as RealtimeServerEvent);
            expect(transcripts).toEqual([
                { Role: 'user', Text: 'wha', IsFinal: false },
                { Role: 'user', Text: 'what is the weather', IsFinal: true },
            ]);
        });

        it('translates a function call to OnToolCall', () => {
            const calls: Array<{ CallID: string; ToolName: string; Arguments: string }> = [];
            session.OnToolCall((c) => calls.push(c));
            driver.Fake.Fire({
                type: 'response.function_call_arguments.done',
                call_id: 'call_42',
                name: 'GetWeather',
                arguments: '{"city":"NYC"}',
                event_id: 'e',
                item_id: 'i',
                output_index: 0,
                response_id: 'r',
            } as RealtimeServerEvent);
            expect(calls).toEqual([{ CallID: 'call_42', ToolName: 'GetWeather', Arguments: '{"city":"NYC"}' }]);
        });

        it('completes the full tool-call loop: call in, result out, model continues', () => {
            const calls: Array<{ CallID: string; ToolName: string; Arguments: string }> = [];
            session.OnToolCall((c) => calls.push(c));
            driver.Fake.Fire({
                type: 'response.function_call_arguments.done',
                call_id: 'call_loop',
                name: 'invoke-target-agent',
                arguments: '{"q":"sales"}',
                event_id: 'e',
                item_id: 'i',
                output_index: 0,
                response_id: 'r',
            } as RealtimeServerEvent);
            expect(calls).toHaveLength(1);
            driver.Fake.Sent = [];
            void session.SendToolResult(calls[0].CallID, '{"answer":"42"}');
            const out = driver.Fake.Sent[0];
            const respond = driver.Fake.Sent[1];
            if (out.type === 'conversation.item.create' && out.item.type === 'function_call_output') {
                expect(out.item.call_id).toBe('call_loop');
            } else {
                throw new Error('expected function_call_output item');
            }
            expect(respond.type).toBe('response.create');
        });

        it('fires OnInterruption on speech_started ONLY while a response is active (true barge-in)', () => {
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fake.Fire({ type: 'response.created', event_id: 'e', response: {} } as RealtimeServerEvent);
            driver.Fake.Fire({
                type: 'input_audio_buffer.speech_started',
                audio_start_ms: 100,
                event_id: 'e',
                item_id: 'i',
            } as RealtimeServerEvent);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('does NOT fire OnInterruption on speech_started while the model is idle', () => {
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fake.Fire({
                type: 'input_audio_buffer.speech_started',
                audio_start_ms: 100,
                event_id: 'e',
                item_id: 'i',
            } as RealtimeServerEvent);
            expect(fn).not.toHaveBeenCalled();
        });

        it('does NOT fire OnInterruption for speech after the response completed (response.done clears)', () => {
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fake.Fire({ type: 'response.created', event_id: 'e', response: {} } as RealtimeServerEvent);
            driver.Fake.Fire({ type: 'response.done', event_id: 'e', response: {} } as RealtimeServerEvent);
            driver.Fake.Fire({
                type: 'input_audio_buffer.speech_started',
                audio_start_ms: 100,
                event_id: 'e',
                item_id: 'i',
            } as RealtimeServerEvent);
            expect(fn).not.toHaveBeenCalled();
        });

        it('translates response.done usage to OnUsage', () => {
            const usages: Array<{ InputTokens: number; OutputTokens: number }> = [];
            session.OnUsage((u) => usages.push(u));
            driver.Fake.Fire({
                type: 'response.done',
                event_id: 'e',
                response: { usage: { input_tokens: 11, output_tokens: 5 } },
            } as RealtimeServerEvent);
            expect(usages).toEqual([{ InputTokens: 11, OutputTokens: 5 }]);
        });

        it('ignores unhandled event types without throwing', () => {
            expect(() => driver.Fake.Fire({ type: 'session.created', event_id: 'e' } as RealtimeServerEvent)).not.toThrow();
        });
    });

    describe('errors and unexpected close (OnError / OnClose)', () => {
        let session: xAIRealtimeSession;

        beforeEach(async () => {
            session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
        });

        it('classifies a transport-level SDK error (no provider payload) as Fatal (e.g. credential expiry)', () => {
            const errors: Array<{ Message: string; Code?: string; Fatal: boolean }> = [];
            session.OnError((e) => errors.push(e));
            driver.Fake.FireError(makeSdkError('could not send data'));
            expect(errors).toEqual([{ Message: 'could not send data', Code: undefined, Fatal: true }]);
        });

        it('classifies a provider error frame (payload present) as non-fatal with its code', () => {
            const errors: Array<{ Message: string; Code?: string; Fatal: boolean }> = [];
            session.OnError((e) => errors.push(e));
            driver.Fake.FireError(makeSdkError('bad request', { code: 'invalid_value' }));
            expect(errors).toEqual([{ Message: 'bad request', Code: 'invalid_value', Fatal: false }]);
        });

        it('surfaces an UNEXPECTED socket close as a fatal error followed by OnClose', () => {
            const errors: Array<{ Message: string; Fatal: boolean }> = [];
            const closed = vi.fn();
            session.OnError((e) => errors.push({ Message: e.Message, Fatal: e.Fatal }));
            session.OnClose(closed);
            driver.Fake.FireSocketClose();
            expect(errors).toEqual([{ Message: 'xAI Grok Voice realtime connection closed unexpectedly', Fatal: true }]);
            expect(closed).toHaveBeenCalledTimes(1);
        });

        it('stays silent when the socket closes AFTER a consumer-initiated Close()', async () => {
            const onError = vi.fn();
            const onClose = vi.fn();
            session.OnError(onError);
            session.OnClose(onClose);
            await session.Close();
            driver.Fake.FireSocketClose(); // the socket closing is the expected consequence
            expect(onError).not.toHaveBeenCalled();
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe('lifecycle', () => {
        it('Close removes the event + error listeners and closes the connection', async () => {
            const session = await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' });
            expect(driver.Fake.ListenerCount).toBe(1);
            expect(driver.Fake.ErrorListenerCount).toBe(1);
            await session.Close();
            expect(driver.Fake.ListenerCount).toBe(0);
            expect(driver.Fake.ErrorListenerCount).toBe(0);
            expect(driver.Fake.Closed).toBe(true);
        });

        it('does not dispatch events after Close', async () => {
            const session = (await driver.StartSession({ Model: 'grok-voice', SystemPrompt: 'sys' })) as xAIRealtimeSession;
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fake.Fire({ type: 'response.created', event_id: 'e', response: {} } as RealtimeServerEvent);
            await session.Close();
            driver.Fake.Fire({
                type: 'input_audio_buffer.speech_started',
                audio_start_ms: 1,
                event_id: 'e',
                item_id: 'i',
            } as RealtimeServerEvent);
            expect(fn).not.toHaveBeenCalled();
        });
    });
});
