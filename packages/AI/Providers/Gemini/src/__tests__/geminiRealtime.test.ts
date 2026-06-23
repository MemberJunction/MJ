import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    Modality,
    type AuthToken,
    type CreateAuthTokenParameters,
    type LiveConnectConfig,
    type LiveServerMessage,
    type Blob as GeminiBlob,
    type FunctionResponse,
    type Content,
} from '@google/genai';
import type {
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
} from '@memberjunction/ai';

import { GeminiRealtime, type GeminiLiveSession, type GeminiConnectArgs } from '../geminiRealtime';

/* ------------------------------------------------------------------ */
/*  Fake in-memory Gemini Live session                                */
/*                                                                    */
/*  Captures outbound sends and exposes the server-message callback   */
/*  so tests can drive Gemini-shaped LiveServerMessages with NO       */
/*  network.                                                          */
/* ------------------------------------------------------------------ */
class FakeLiveSession implements GeminiLiveSession {
    public RealtimeInputs: Array<{ audio?: GeminiBlob; media?: GeminiBlob; text?: string }> = [];
    public ClientContents: Array<{ turns?: Content[]; turnComplete?: boolean }> = [];
    public ToolResponses: Array<{ functionResponses: FunctionResponse[] | FunctionResponse }> = [];
    public Closed = false;

    /** The driver-supplied callback that translates inbound server messages. */
    public Emit: (message: LiveServerMessage) => void = () => {};

    public sendRealtimeInput(params: { audio?: GeminiBlob; media?: GeminiBlob; text?: string }): void {
        this.RealtimeInputs.push(params);
    }
    public sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void {
        this.ClientContents.push(params);
    }
    public sendToolResponse(params: { functionResponses: FunctionResponse[] | FunctionResponse }): void {
        this.ToolResponses.push(params);
    }
    public close(): void {
        this.Closed = true;
    }
}

/**
 * Test subclass that swaps the network seam for a {@link FakeLiveSession}, capturing the connect
 * args so assertions can inspect the resolved {@link import('@google/genai').LiveConnectConfig}.
 */
class TestGeminiRealtime extends GeminiRealtime {
    public Fake = new FakeLiveSession();
    public LastConnectArgs: GeminiConnectArgs | null = null;

    protected override async connectLiveSession(args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        this.LastConnectArgs = args;
        this.Fake.Emit = args.OnMessage;
        return this.Fake;
    }
}

/** Builds the minimal session params; callers override per test. */
function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return {
        Model: 'gemini-live-2.5-flash-preview',
        SystemPrompt: 'You are a helpful voice assistant.',
        ...overrides,
    };
}

/**
 * Driver subclass that captures the mint request and returns a fake ephemeral auth token —
 * no network. Mirrors the OpenAI driver's `ClientDirectTestable` mint-seam pattern.
 */
class ClientDirectTestable extends GeminiRealtime {
    public MintParams: CreateAuthTokenParameters | null = null;

    protected override async mintAuthToken(params: CreateAuthTokenParameters): Promise<AuthToken> {
        this.MintParams = params;
        return { name: 'auth_tokens/fake-ephemeral-token' };
    }
}

describe('GeminiRealtime client-direct (CreateClientSession)', () => {
    it('advertises client-direct support', () => {
        expect(new ClientDirectTestable('k').SupportsClientDirect).toBe(true);
    });

    it('mints a well-formed config carrying provider, model, token, and expiry', async () => {
        const driver = new ClientDirectTestable('k');
        const before = Date.now();
        const cfg = await driver.CreateClientSession(makeParams());
        const after = Date.now();

        expect(cfg.Provider).toBe('gemini');
        expect(cfg.Model).toBe('gemini-live-2.5-flash-preview');
        expect(cfg.EphemeralToken).toBe('auth_tokens/fake-ephemeral-token');
        // Expiry is ~30 minutes out (token lifetime), expressed as ISO-8601.
        const expires = new Date(cfg.ExpiresAt).getTime();
        expect(expires).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
        expect(expires).toBeLessThanOrEqual(after + 30 * 60 * 1000);
    });

    it('locks the server-built connect config into the token via liveConnectConstraints', async () => {
        const driver = new ClientDirectTestable('k');
        await driver.CreateClientSession(makeParams({
            Tools: [{
                Name: 'get_weather',
                Description: 'Get the weather for a city',
                ParametersSchema: { type: 'object', properties: { city: { type: 'string' } } },
            }],
        }));

        const mintConfig = driver.MintParams?.config;
        expect(mintConfig).toBeDefined();
        expect(mintConfig?.uses).toBe(1);
        expect(mintConfig?.lockAdditionalFields).toEqual([]);
        expect(typeof mintConfig?.expireTime).toBe('string');
        expect(typeof mintConfig?.newSessionExpireTime).toBe('string');
        // The new-session window precedes the token expiry.
        expect(new Date(mintConfig!.newSessionExpireTime!).getTime())
            .toBeLessThan(new Date(mintConfig!.expireTime!).getTime());

        const constraints = mintConfig?.liveConnectConstraints;
        expect(constraints?.model).toBe('gemini-live-2.5-flash-preview');
        // Only the MASK-SAFE subset is locked into the token — systemInstruction / tools /
        // transcription keys 400 the mint ("field_mask is invalid for
        // BidiGenerateContentSetup"); they travel via SessionConfig instead.
        const locked = constraints?.config as LiveConnectConfig;
        expect(locked.responseModalities).toEqual([Modality.AUDIO]);
        expect(locked.systemInstruction).toBeUndefined();
        expect(locked.tools).toBeUndefined();
        expect(locked.inputAudioTranscription).toBeUndefined();
        expect(locked.outputAudioTranscription).toBeUndefined();
    });

    it('carries the same model + config in SessionConfig for the client to pass at connect', async () => {
        const driver = new ClientDirectTestable('k');
        const cfg = await driver.CreateClientSession(makeParams({
            Tools: [{ Name: 'lookup', Description: 'Look something up', ParametersSchema: { type: 'object' } }],
        }));

        const sc = cfg.SessionConfig as { model: string; config: Record<string, unknown> };
        expect(sc.model).toBe('gemini-live-2.5-flash-preview');
        expect(sc.config.systemInstruction).toBe('You are a helpful voice assistant.');
        expect(sc.config.responseModalities).toEqual(['AUDIO']);
        const tools = sc.config.tools as Array<{ functionDeclarations: Array<{ name: string }> }>;
        expect(tools[0].functionDeclarations[0].name).toBe('lookup');
        // The FULL config (incl. fields the token mask can't lock) rides SessionConfig;
        // the token constrains only the mask-safe subset of it.
        const lockedSubset = JSON.parse(JSON.stringify(driver.MintParams!.config!.liveConnectConstraints!.config));
        expect(sc.config).toMatchObject(lockedSubset);
        expect(sc.config.systemInstruction).toBeDefined();
        expect(sc.config.tools).toBeDefined();
    });

    it('throws when the mint returns no token name', async () => {
        class NoNameMint extends GeminiRealtime {
            protected override async mintAuthToken(): Promise<AuthToken> {
                return {};
            }
        }
        await expect(new NoNameMint('k').CreateClientSession(makeParams())).rejects.toThrow(/no token name/);
    });
});

describe('GeminiRealtime', () => {
    let driver: TestGeminiRealtime;

    beforeEach(() => {
        driver = new TestGeminiRealtime('fake-api-key');
    });

    describe('StartSession / connect config', () => {
        it('builds an audio-modality config with transcription + system instruction', async () => {
            await driver.StartSession(makeParams());
            const config = driver.LastConnectArgs!.Config;
            expect(driver.LastConnectArgs!.Model).toBe('gemini-live-2.5-flash-preview');
            expect(config.responseModalities).toEqual([Modality.AUDIO]);
            expect(config.inputAudioTranscription).toBeDefined();
            expect(config.outputAudioTranscription).toBeDefined();
            expect(config.systemInstruction).toBe('You are a helpful voice assistant.');
            expect(config.tools).toBeUndefined();
        });

        it('maps params.Tools to Gemini functionDeclarations at connect time', async () => {
            await driver.StartSession(makeParams({
                Tools: [{
                    Name: 'get_weather',
                    Description: 'Get the weather for a city',
                    ParametersSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
                }],
            }));
            const tools = driver.LastConnectArgs!.Config.tools;
            expect(tools).toHaveLength(1);
            const decls = (tools![0] as { functionDeclarations?: unknown[] }).functionDeclarations!;
            expect(decls).toHaveLength(1);
            expect(decls[0]).toMatchObject({
                name: 'get_weather',
                description: 'Get the weather for a city',
                parametersJsonSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
            });
        });

        it('merges the provider-specific Config bag over the defaults', async () => {
            await driver.StartSession(makeParams({ Config: { temperature: 0.3, maxOutputTokens: 256 } }));
            const config = driver.LastConnectArgs!.Config;
            expect(config.temperature).toBe(0.3);
            expect(config.maxOutputTokens).toBe(256);
            // Defaults still present
            expect(config.responseModalities).toEqual([Modality.AUDIO]);
        });

        it('seeds InitialContext as a non-complete client-content turn', async () => {
            await driver.StartSession(makeParams({ InitialContext: 'Prior conversation summary.' }));
            expect(driver.Fake.ClientContents).toHaveLength(1);
            const seeded = driver.Fake.ClientContents[0];
            expect(seeded.turnComplete).toBe(false);
            expect(seeded.turns![0]).toEqual({ role: 'user', parts: [{ text: 'Prior conversation summary.' }] });
        });

        it('does not seed when InitialContext is absent or blank', async () => {
            await driver.StartSession(makeParams({ InitialContext: '   ' }));
            expect(driver.Fake.ClientContents).toHaveLength(0);
        });
    });

    describe('inbound message translation', () => {
        let session: IRealtimeSession;

        beforeEach(async () => {
            session = await driver.StartSession(makeParams());
        });

        it('translates model audio parts to OnOutput ArrayBuffers', () => {
            const outputs: ArrayBuffer[] = [];
            session.OnOutput((chunk) => outputs.push(chunk));

            const audioBytes = new Uint8Array([1, 2, 3, 4]);
            const base64 = Buffer.from(audioBytes).toString('base64');
            driver.Fake.Emit({
                serverContent: { modelTurn: { role: 'model', parts: [{ inlineData: { data: base64, mimeType: 'audio/pcm;rate=24000' } }] } },
            } as LiveServerMessage);

            expect(outputs).toHaveLength(1);
            expect(new Uint8Array(outputs[0])).toEqual(audioBytes);
        });

        it('translates input transcription to a user RealtimeTranscript', () => {
            const transcripts: RealtimeTranscript[] = [];
            session.OnTranscript((t) => transcripts.push(t));

            driver.Fake.Emit({ serverContent: { inputTranscription: { text: 'what is the weather', finished: false } } } as LiveServerMessage);
            driver.Fake.Emit({ serverContent: { inputTranscription: { text: 'what is the weather today', finished: true } } } as LiveServerMessage);

            expect(transcripts).toEqual([
                { Role: 'user', Text: 'what is the weather', IsFinal: false },
                { Role: 'user', Text: 'what is the weather today', IsFinal: true },
            ]);
        });

        it('translates output transcription to an assistant RealtimeTranscript', () => {
            const transcripts: RealtimeTranscript[] = [];
            session.OnTranscript((t) => transcripts.push(t));

            driver.Fake.Emit({ serverContent: { outputTranscription: { text: 'It is sunny.', finished: true } } } as LiveServerMessage);

            expect(transcripts).toEqual([{ Role: 'assistant', Text: 'It is sunny.', IsFinal: true }]);
        });

        it('translates toolCall.functionCalls to RealtimeToolCalls with JSON-string args', () => {
            const calls: RealtimeToolCall[] = [];
            session.OnToolCall((c) => calls.push(c));

            driver.Fake.Emit({
                toolCall: { functionCalls: [{ id: 'call-1', name: 'get_weather', args: { city: 'Seattle' } }] },
            } as LiveServerMessage);

            expect(calls).toHaveLength(1);
            expect(calls[0]).toEqual({ CallID: 'call-1', ToolName: 'get_weather', Arguments: '{"city":"Seattle"}' });
        });

        it('translates usageMetadata to RealtimeUsage (prompt/response token counts)', () => {
            const usages: RealtimeUsage[] = [];
            session.OnUsage((u) => usages.push(u));

            driver.Fake.Emit({ usageMetadata: { promptTokenCount: 120, responseTokenCount: 45 } } as LiveServerMessage);

            expect(usages).toEqual([{ InputTokens: 120, OutputTokens: 45 }]);
        });

        it('fires OnInterruption when serverContent.interrupted is true', () => {
            const onInterrupt = vi.fn();
            session.OnInterruption(onInterrupt);

            driver.Fake.Emit({ serverContent: { interrupted: true } } as LiveServerMessage);

            expect(onInterrupt).toHaveBeenCalledTimes(1);
        });

        it('defaults missing transcript/usage fields safely', () => {
            const transcripts: RealtimeTranscript[] = [];
            const usages: RealtimeUsage[] = [];
            session.OnTranscript((t) => transcripts.push(t));
            session.OnUsage((u) => usages.push(u));

            driver.Fake.Emit({ serverContent: { inputTranscription: {} } } as LiveServerMessage);
            driver.Fake.Emit({ usageMetadata: {} } as LiveServerMessage);

            expect(transcripts).toEqual([{ Role: 'user', Text: '', IsFinal: false }]);
            expect(usages).toEqual([{ InputTokens: 0, OutputTokens: 0 }]);
        });
    });

    describe('outbound calls', () => {
        let session: IRealtimeSession;

        beforeEach(async () => {
            session = await driver.StartSession(makeParams());
        });

        it('SendInput streams audio as a base64 PCM blob', () => {
            const bytes = new Uint8Array([9, 8, 7]);
            session.SendInput(bytes.buffer);

            expect(driver.Fake.RealtimeInputs).toHaveLength(1);
            const sent = driver.Fake.RealtimeInputs[0].audio!;
            expect(sent.mimeType).toBe('audio/pcm;rate=16000');
            expect(sent.data).toBe(Buffer.from(bytes).toString('base64'));
        });

        it('RegisterTools with the connect-time set is a SILENT no-op (idempotency rule)', async () => {
            const tools = [
                { Name: 'lookup', Description: 'Look something up', ParametersSchema: { type: 'object' } },
                { Name: 'get_weather', Description: 'Get the weather', ParametersSchema: { type: 'object', properties: { city: { type: 'string' } } } },
            ];
            const freshDriver = new TestGeminiRealtime('fake-api-key');
            const toolSession = await freshDriver.StartSession(makeParams({ Tools: tools }));
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            // identical set — including in a DIFFERENT order (comparison is order-insensitive)
            await toolSession.RegisterTools([tools[1], tools[0]]);

            expect(freshDriver.Fake.ClientContents).toHaveLength(0); // never injected as content
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('RegisterTools with an EMPTY set on a tool-less session is also a silent no-op', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            await session.RegisterTools([]); // session was started without Tools
            expect(driver.Fake.ClientContents).toHaveLength(0);
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('RegisterTools with a DIFFERENT set warns and does NOTHING (tool set is connect-bound)', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await session.RegisterTools([{
                Name: 'lookup', Description: 'Look something up', ParametersSchema: { type: 'object' },
            }]);

            // Never degraded into the conversation as content, never sent any other way…
            expect(driver.Fake.ClientContents).toHaveLength(0);
            expect(driver.Fake.ToolResponses).toHaveLength(0);
            // …but the caller is told clearly why nothing happened.
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(String(warnSpy.mock.calls[0][0])).toMatch(/connect time/i);
            expect(String(warnSpy.mock.calls[0][0])).toMatch(/RealtimeSessionParams\.Tools/);
            warnSpy.mockRestore();
        });

        it('SendToolResult sends a matching functionResponse using the cached call name', async () => {
            // SendToolResult is now a first-class IRealtimeSession contract method carrying only
            // callID + JSON-string output. Gemini needs the function name, which it caches from the
            // originating tool call — so drive an inbound tool call first to populate the cache.
            driver.Fake.Emit({
                toolCall: { functionCalls: [{ id: 'call-1', name: 'get_weather', args: { city: 'NYC' } }] },
            } as LiveServerMessage);

            await session.SendToolResult('call-1', JSON.stringify({ tempF: 72 }));

            expect(driver.Fake.ToolResponses).toHaveLength(1);
            const responses = driver.Fake.ToolResponses[0].functionResponses as FunctionResponse[];
            expect(responses[0]).toEqual({ id: 'call-1', name: 'get_weather', response: { tempF: 72 } });
        });

        it('SendToolResult wraps non-JSON output as { result }', async () => {
            driver.Fake.Emit({
                toolCall: { functionCalls: [{ id: 'call-2', name: 'do_thing', args: {} }] },
            } as LiveServerMessage);

            await session.SendToolResult('call-2', 'plain text outcome');

            const responses = driver.Fake.ToolResponses[0].functionResponses as FunctionResponse[];
            expect(responses[0]).toEqual({ id: 'call-2', name: 'do_thing', response: { result: 'plain text outcome' } });
        });

        it('SendContextNote appends a user turn with turnComplete:false (no generation trigger)', () => {
            expect(session.SendContextNote).toBeDefined();
            session.SendContextNote?.('[progress] delegated run is gathering data');

            expect(driver.Fake.ClientContents).toHaveLength(1);
            const sent = driver.Fake.ClientContents[0];
            expect(sent.turnComplete).toBe(false);
            expect(sent.turns![0]).toEqual({ role: 'user', parts: [{ text: '[progress] delegated run is gathering data' }] });
        });

        it('RequestSpokenUpdate emulates per-response instructions as a realtime-text user turn', () => {
            expect(session.RequestSpokenUpdate).toBeDefined();
            session.RequestSpokenUpdate?.('Briefly say the report agent is drafting.');

            // realtime text, NOT clientContent: native-audio Live models only generate from
            // sendRealtimeInput mid-call (clientContent is history seeding).
            expect(driver.Fake.RealtimeInputs).toEqual([{ text: 'Briefly say the report agent is drafting.' }]);
            expect(driver.Fake.ClientContents).toHaveLength(0);
        });

        it('queues interim-update sends while a model turn is in flight and flushes on turnComplete', () => {
            // Model output marks a turn in flight (Gemini has no explicit "response started" frame).
            const base64 = Buffer.from(new Uint8Array([1])).toString('base64');
            driver.Fake.Emit({
                serverContent: { modelTurn: { role: 'model', parts: [{ inlineData: { data: base64, mimeType: 'audio/pcm;rate=24000' } }] } },
            } as LiveServerMessage);

            session.SendContextNote?.('note while busy');
            session.RequestSpokenUpdate?.('update while busy');
            expect(driver.Fake.ClientContents).toHaveLength(0); // deferred — mid-turn client content interrupts on Gemini
            expect(driver.Fake.RealtimeInputs).toHaveLength(0);

            driver.Fake.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);

            // Both flushed in order: the note (clientContent), then the update (realtime text).
            expect(driver.Fake.ClientContents).toHaveLength(1);
            expect(driver.Fake.ClientContents[0].turnComplete).toBe(false);
            expect((driver.Fake.ClientContents[0].turns![0].parts![0] as { text: string }).text).toBe('note while busy');
            expect(driver.Fake.RealtimeInputs).toEqual([{ text: 'update while busy' }]);
        });

        it('a flushed RequestSpokenUpdate starts a new turn, so later queued sends keep waiting', () => {
            const base64 = Buffer.from(new Uint8Array([1])).toString('base64');
            driver.Fake.Emit({
                serverContent: { modelTurn: { role: 'model', parts: [{ inlineData: { data: base64, mimeType: 'audio/pcm;rate=24000' } }] } },
            } as LiveServerMessage);

            session.RequestSpokenUpdate?.('first queued update');
            session.SendContextNote?.('note behind the update');

            driver.Fake.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);

            // The spoken update flushes and re-marks the turn active; the trailing note stays queued.
            expect(driver.Fake.RealtimeInputs).toEqual([{ text: 'first queued update' }]);
            expect(driver.Fake.ClientContents).toHaveLength(0);

            driver.Fake.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
            expect(driver.Fake.ClientContents).toHaveLength(1);
            expect(driver.Fake.ClientContents[0].turnComplete).toBe(false);
        });

        it('an interruption (barge-in) also releases the queue', () => {
            const base64 = Buffer.from(new Uint8Array([1])).toString('base64');
            driver.Fake.Emit({
                serverContent: { modelTurn: { role: 'model', parts: [{ inlineData: { data: base64, mimeType: 'audio/pcm;rate=24000' } }] } },
            } as LiveServerMessage);
            session.SendContextNote?.('note while busy');
            expect(driver.Fake.ClientContents).toHaveLength(0);

            driver.Fake.Emit({ serverContent: { interrupted: true } } as LiveServerMessage);
            expect(driver.Fake.ClientContents).toHaveLength(1);
            expect(driver.Fake.ClientContents[0].turnComplete).toBe(false);
        });

        it('a tool-call frame clears the busy flag so fresh sends go out immediately', () => {
            const base64 = Buffer.from(new Uint8Array([1])).toString('base64');
            driver.Fake.Emit({
                serverContent: { modelTurn: { role: 'model', parts: [{ inlineData: { data: base64, mimeType: 'audio/pcm;rate=24000' } }] } },
            } as LiveServerMessage);
            driver.Fake.Emit({
                toolCall: { functionCalls: [{ id: 'call-1', name: 'get_weather', args: {} }] },
            } as LiveServerMessage);

            // Model yielded the floor pending the tool result — a new context note is not deferred.
            session.SendContextNote?.('context while tool executes');
            expect(driver.Fake.ClientContents).toHaveLength(1);
        });

        it('Close closes the live session', async () => {
            await session.Close();
            expect(driver.Fake.Closed).toBe(true);
        });

        it('throws if SendInput is used after Close', async () => {
            await session.Close();
            expect(() => session.SendInput(new Uint8Array([1]).buffer)).toThrow(/not open/);
        });
    });
});
