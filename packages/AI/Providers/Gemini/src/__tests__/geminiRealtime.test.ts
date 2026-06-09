import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Modality, type LiveServerMessage, type Blob as GeminiBlob, type FunctionResponse, type Content } from '@google/genai';
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
    public RealtimeInputs: Array<{ audio?: GeminiBlob; media?: GeminiBlob }> = [];
    public ClientContents: Array<{ turns?: Content[]; turnComplete?: boolean }> = [];
    public ToolResponses: Array<{ functionResponses: FunctionResponse[] | FunctionResponse }> = [];
    public Closed = false;

    /** The driver-supplied callback that translates inbound server messages. */
    public Emit: (message: LiveServerMessage) => void = () => {};

    public sendRealtimeInput(params: { audio?: GeminiBlob; media?: GeminiBlob }): void {
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

        it('RegisterTools resends mapped function declarations as client content', async () => {
            await session.RegisterTools([{
                Name: 'lookup', Description: 'Look something up', ParametersSchema: { type: 'object' },
            }]);
            // One entry for the tool registration (no InitialContext was set).
            expect(driver.Fake.ClientContents).toHaveLength(1);
            const turn = driver.Fake.ClientContents[0];
            expect(turn.turnComplete).toBe(false);
            const text = (turn.turns![0].parts![0] as { text: string }).text;
            const decl = JSON.parse(text);
            expect(decl).toMatchObject({ name: 'lookup', description: 'Look something up', parametersJsonSchema: { type: 'object' } });
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
