import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @memberjunction/global so @RegisterClass is a no-op decorator.
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

// Mock @memberjunction/ai — provide BaseModel/BaseRealtimeModel base classes only. The realtime
// type aliases (RealtimeSessionParams, etc.) are compile-time interfaces and need no runtime mock.
vi.mock('@memberjunction/ai', () => {
    class BaseModel {
        private _apiKey: string;
        protected get apiKey(): string {
            return this._apiKey;
        }
        constructor(apiKey: string) {
            this._apiKey = apiKey;
        }
    }
    // Mirror the real BaseRealtimeModel's default client-direct surface so the driver — which does
    // NOT override either member (Inworld is server-bridged only) — inherits the correct behavior:
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

import {
    InworldRealtime,
    InworldRealtimeSession,
    INWORLD_REALTIME_WS_URL,
    INWORLD_DEFAULT_MODEL_ID,
    INWORLD_DEFAULT_VAD_EAGERNESS,
    type InworldRealtimeSocket,
    type InworldConnectArgs,
    type InworldServerEvent,
} from '../inworldRealtime';
import type { RealtimeToolDefinition } from '@memberjunction/ai';

/**
 * In-memory fake socket that mirrors the production {@link InworldRealtimeSocket} surface. It records
 * every JSON-serialized outbound frame (parsed back into objects for ergonomic assertions), tracks
 * the closed flag, and — together with the captured {@link InworldConnectArgs} callbacks — lets a test
 * fire inbound server events, transport errors, and closes deterministically. No network involved.
 */
class FakeSocket implements InworldRealtimeSocket {
    /** Every outbound frame, parsed from the JSON the session serialized. */
    public Sent: InworldServerEvent[] = [];
    /** Raw JSON strings exactly as passed to {@link send} (for byte-level assertions). */
    public SentRaw: string[] = [];
    /** Set once {@link close} is invoked. */
    public Closed = false;

    public send(data: string): void {
        this.SentRaw.push(data);
        this.Sent.push(JSON.parse(data) as InworldServerEvent);
    }
    public close(): void {
        this.Closed = true;
    }

    /** Finds the FIRST outbound frame with the given `type`, or undefined. */
    public Find(type: string): InworldServerEvent | undefined {
        return this.Sent.find((f) => f.type === type);
    }
    /** Returns ALL outbound frames with the given `type`. */
    public All(type: string): InworldServerEvent[] {
        return this.Sent.filter((f) => f.type === type);
    }
    /** Clears the recorded outbound frames (to isolate the next phase of a test). */
    public Reset(): void {
        this.Sent = [];
        this.SentRaw = [];
    }
}

/**
 * Driver subclass that injects the fake socket through the {@link InworldRealtime.connectRealtimeSocket}
 * seam — the driver's documented testing seam. It captures the {@link InworldConnectArgs} so a test can
 * drive the session's inbound translation (OnMessage), transport-error (OnError), and close (OnClose)
 * paths exactly as the real WebSocket would, and exposes the URL the driver built for auth assertions.
 */
class TestableInworldRealtime extends InworldRealtime {
    /** The fake socket handed back to the driver in place of a real WebSocket. */
    public Fake = new FakeSocket();
    /** The connect args (lifecycle callbacks + URL) captured from the last connect. */
    public CapturedArgs: InworldConnectArgs | null = null;

    protected override async connectRealtimeSocket(args: InworldConnectArgs): Promise<InworldRealtimeSocket> {
        this.CapturedArgs = args;
        return this.Fake;
    }

    /** Test helper: dispatch an inbound server event through the captured OnMessage callback. */
    public Fire(event: InworldServerEvent): void {
        this.CapturedArgs?.OnMessage(event);
    }
    /** Test helper: dispatch a transport-level error through the captured OnError callback. */
    public FireError(message: string): void {
        this.CapturedArgs?.OnError(message);
    }
    /** Test helper: dispatch a socket close through the captured OnClose callback. */
    public FireClose(code?: number, reason?: string): void {
        this.CapturedArgs?.OnClose(code, reason);
    }
}

/**
 * Starts a session and immediately fires the provider's session-ready frame so the awaited
 * {@link InworldRealtime.StartSession} resolves. Returns the live session plus the driver for
 * follow-on outbound/inbound assertions.
 *
 * @param driver The testable driver to start a session on.
 * @param params Session params (Model/SystemPrompt default to sensible values when omitted).
 */
async function startReadySession(
    driver: TestableInworldRealtime,
    params: Partial<{ Model: string; SystemPrompt: string; Tools: RealtimeToolDefinition[]; InitialContext: string; Config: Record<string, unknown> }> = {}
): Promise<InworldRealtimeSession> {
    const start = driver.StartSession({ Model: 'anthropic/claude-sonnet-4-6', SystemPrompt: 'sys', ...params });
    // The driver awaits WaitForReady() before resolving; the ready frame must arrive on the connect's
    // OnMessage seam, which is captured synchronously inside connectRealtimeSocket.
    await Promise.resolve();
    driver.Fire({ type: 'session.created' });
    return (await start) as InworldRealtimeSession;
}

describe('InworldRealtime construction', () => {
    it('does NOT advertise client-direct support (server-bridged path only)', () => {
        expect(new TestableInworldRealtime('inworld-key').SupportsClientDirect).toBe(false);
    });

    it('CreateClientSession throws because client-direct is unsupported', async () => {
        await expect(
            new TestableInworldRealtime('k').CreateClientSession({ Model: 'm', SystemPrompt: 'hi' })
        ).rejects.toThrow(/does not support client-direct/);
    });

    it('builds the connect URL against the Inworld WS endpoint with the API key as a token query param', () => {
        const driver = new TestableInworldRealtime('my key&=secret');
        // buildConnectUrl is protected; exercise it through a tiny accessor subclass to assert the seam.
        class Probe extends TestableInworldRealtime {
            public Url(): string {
                return this.buildConnectUrl();
            }
        }
        const probe = new Probe('my key&=secret');
        const url = probe.Url();
        expect(url.startsWith(`${INWORLD_REALTIME_WS_URL}?token=`)).toBe(true);
        expect(url).toBe(`${INWORLD_REALTIME_WS_URL}?token=${encodeURIComponent('my key&=secret')}`);
        // sanity: the driver under test constructed without throwing on a non-empty key
        expect(driver).toBeInstanceOf(InworldRealtime);
    });
});

describe('InworldRealtime static mappers', () => {
    it('MapToolToFunction maps a Core tool to the Inworld function-tool shape', () => {
        const tool: RealtimeToolDefinition = {
            Name: 'GetWeather',
            Description: 'weather',
            ParametersSchema: { type: 'object', properties: { city: { type: 'string' } } },
        };
        expect(InworldRealtime.MapToolToFunction(tool)).toEqual({
            type: 'function',
            name: 'GetWeather',
            description: 'weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
        });
    });

    it('ToolSetFingerprint is order-insensitive (same set in any order yields one fingerprint)', () => {
        const a: RealtimeToolDefinition = { Name: 'A', Description: 'a', ParametersSchema: { type: 'object' } };
        const b: RealtimeToolDefinition = { Name: 'B', Description: 'b', ParametersSchema: { type: 'object' } };
        expect(InworldRealtime.ToolSetFingerprint([a, b])).toBe(InworldRealtime.ToolSetFingerprint([b, a]));
    });

    it('ToolSetFingerprint differs when a tool schema changes', () => {
        const a: RealtimeToolDefinition = { Name: 'A', Description: 'a', ParametersSchema: { type: 'object' } };
        const a2: RealtimeToolDefinition = { Name: 'A', Description: 'a', ParametersSchema: { type: 'object', properties: {} } };
        expect(InworldRealtime.ToolSetFingerprint([a])).not.toBe(InworldRealtime.ToolSetFingerprint([a2]));
    });
});

describe('InworldRealtime', () => {
    let driver: TestableInworldRealtime;

    beforeEach(() => {
        driver = new TestableInworldRealtime('test-key');
    });

    describe('StartSession config (session.update)', () => {
        it('sends session.update as the first frame carrying instructions', async () => {
            await startReadySession(driver, { SystemPrompt: 'be helpful' });
            const update = driver.Fake.Find('session.update');
            expect(update).toBeDefined();
            const session = (update as { session?: Record<string, unknown> }).session;
            expect(session?.['instructions']).toBe('be helpful');
        });

        it('resolves the model id from params.Model', async () => {
            await startReadySession(driver, { Model: 'anthropic/claude-opus-4-1' });
            const update = driver.Fake.Find('session.update') as { session?: Record<string, unknown> };
            expect(update.session?.['model']).toBe('anthropic/claude-opus-4-1');
        });

        it('falls back to the default model id when params.Model is empty', async () => {
            await startReadySession(driver, { Model: '' });
            const update = driver.Fake.Find('session.update') as { session?: Record<string, unknown> };
            expect(update.session?.['model']).toBe(INWORLD_DEFAULT_MODEL_ID);
        });

        it('applies semantic-VAD turn detection with the default eagerness when none is supplied', async () => {
            await startReadySession(driver);
            const update = driver.Fake.Find('session.update') as { session?: Record<string, JSONLike> };
            expect(update.session?.['turn_detection']).toEqual({ type: 'semantic_vad', eagerness: INWORLD_DEFAULT_VAD_EAGERNESS });
        });

        it('honors an eagerness shorthand in Config', async () => {
            await startReadySession(driver, { Config: { eagerness: 'high' } });
            const update = driver.Fake.Find('session.update') as { session?: Record<string, JSONLike> };
            expect(update.session?.['turn_detection']).toEqual({ type: 'semantic_vad', eagerness: 'high' });
        });

        it('uses a full turn_detection Config object verbatim', async () => {
            await startReadySession(driver, { Config: { turn_detection: { type: 'server_vad', threshold: 0.6 } } });
            const update = driver.Fake.Find('session.update') as { session?: Record<string, JSONLike> };
            expect(update.session?.['turn_detection']).toEqual({ type: 'server_vad', threshold: 0.6 });
        });

        it('maps voice/stt/language shorthands into the audio block', async () => {
            await startReadySession(driver, { Config: { voice: 'Ashley', stt: 'inworld-stt-1', language: 'en-US' } });
            const update = driver.Fake.Find('session.update') as { session?: Record<string, JSONLike> };
            expect(update.session?.['audio']).toEqual({
                input: { model: 'inworld-stt-1', language: 'en-US' },
                output: { voice: 'Ashley' },
            });
        });

        it('does not include the consumed shorthand keys as raw session fields', async () => {
            await startReadySession(driver, { Config: { voice: 'Ashley', eagerness: 'low' } });
            const update = driver.Fake.Find('session.update') as { session?: Record<string, JSONLike> };
            expect(update.session?.['voice']).toBeUndefined();
            expect(update.session?.['eagerness']).toBeUndefined();
        });

        it('spreads unrecognized Config keys onto the session (raw override)', async () => {
            await startReadySession(driver, { Config: { output_modalities: ['audio'] } });
            const update = driver.Fake.Find('session.update') as { session?: Record<string, JSONLike> };
            expect(update.session?.['output_modalities']).toEqual(['audio']);
        });

        it('maps Tools into native function tools at start', async () => {
            await startReadySession(driver, {
                Tools: [{ Name: 'GetWeather', Description: 'weather', ParametersSchema: { type: 'object' } }],
            });
            const update = driver.Fake.Find('session.update') as { session?: { tools?: JSONLike[] } };
            const tools = update.session?.tools ?? [];
            expect(tools).toHaveLength(1);
            expect(tools[0]).toMatchObject({ type: 'function', name: 'GetWeather', description: 'weather', parameters: { type: 'object' } });
        });

        it('omits the tools slot entirely when no tools are declared', async () => {
            await startReadySession(driver);
            const update = driver.Fake.Find('session.update') as { session?: Record<string, JSONLike> };
            expect(update.session?.['tools']).toBeUndefined();
        });

        it('folds InitialContext into the instructions under a "Prior context" heading', async () => {
            await startReadySession(driver, { SystemPrompt: 'sys', InitialContext: 'prior chat' });
            const update = driver.Fake.Find('session.update') as { session?: Record<string, string> };
            expect(update.session?.['instructions']).toBe('sys\n\n## Prior context\nprior chat');
        });
    });

    describe('readiness gating', () => {
        it('does NOT resolve StartSession until the session-ready frame arrives', async () => {
            const start = driver.StartSession({ Model: 'm', SystemPrompt: 'sys' });
            await Promise.resolve();
            let resolved = false;
            void start.then(() => {
                resolved = true;
            });
            await Promise.resolve();
            expect(resolved).toBe(false); // still waiting on ready
            driver.Fire({ type: 'session.ready' });
            await start;
            expect(resolved).toBe(true);
        });

        it('rejects StartSession if the transport dies before ready', async () => {
            const start = driver.StartSession({ Model: 'm', SystemPrompt: 'sys' });
            await Promise.resolve();
            driver.FireError('socket died during handshake');
            await expect(start).rejects.toThrow(/socket died during handshake/);
        });

        it('rejects StartSession if the socket closes before ready', async () => {
            const start = driver.StartSession({ Model: 'm', SystemPrompt: 'sys' });
            await Promise.resolve();
            driver.FireClose(1006, 'abnormal');
            await expect(start).rejects.toThrow(/closed unexpectedly/);
        });

        it('treats session.ready (alternate discriminator) as ready too', async () => {
            const start = driver.StartSession({ Model: 'm', SystemPrompt: 'sys' });
            await Promise.resolve();
            driver.Fire({ type: 'session.ready' });
            await expect(start).resolves.toBeDefined();
        });
    });

    describe('outbound operations', () => {
        it('SendInput appends base64-encoded audio', async () => {
            const session = await startReadySession(driver);
            driver.Fake.Reset();
            const bytes = new Uint8Array([1, 2, 3, 4]);
            session.SendInput(bytes.buffer);
            const append = driver.Fake.Find('input_audio.append') as { audio?: string };
            expect(append).toBeDefined();
            expect(append.audio).toBe(Buffer.from(bytes).toString('base64'));
        });

        it('RegisterTools sends a mid-session session.update with mapped tools', async () => {
            const session = await startReadySession(driver);
            driver.Fake.Reset();
            await session.RegisterTools([{ Name: 'Lookup', Description: 'desc', ParametersSchema: { type: 'object', properties: {} } }]);
            const update = driver.Fake.Find('session.update') as { session?: { tools?: JSONLike[] } };
            expect(update.session?.tools?.[0]).toMatchObject({ type: 'function', name: 'Lookup' });
        });

        it('RegisterTools with the SAME set supplied at connect time is a silent no-op (idempotency)', async () => {
            const tools: RealtimeToolDefinition[] = [{ Name: 'Lookup', Description: 'desc', ParametersSchema: { type: 'object' } }];
            const session = await startReadySession(driver, { Tools: tools });
            driver.Fake.Reset();
            await session.RegisterTools(tools);
            // identical set — nothing re-sent
            expect(driver.Fake.All('session.update')).toHaveLength(0);
        });

        it('RegisterTools with a genuinely different set is applied to the live session', async () => {
            const session = await startReadySession(driver, {
                Tools: [{ Name: 'A', Description: 'a', ParametersSchema: { type: 'object' } }],
            });
            driver.Fake.Reset();
            await session.RegisterTools([{ Name: 'B', Description: 'b', ParametersSchema: { type: 'object' } }]);
            const update = driver.Fake.Find('session.update') as { session?: { tools?: Array<{ name?: string }> } };
            expect(update.session?.tools?.[0]?.name).toBe('B');
        });

        it('SendToolResult sends a tool.result frame correlated by call_id with the verbatim output', async () => {
            const session = await startReadySession(driver);
            driver.Fake.Reset();
            await session.SendToolResult('call_1', '{"temp":72}');
            const result = driver.Fake.Find('tool.result') as { call_id?: string; result?: string };
            expect(result).toBeDefined();
            expect(result.call_id).toBe('call_1');
            expect(result.result).toBe('{"temp":72}');
        });

        it('SendContextNote re-sends the instructions via session.update WITHOUT forcing a response', async () => {
            const session = await startReadySession(driver, { SystemPrompt: 'base' });
            driver.Fake.Reset();
            session.SendContextNote('[progress] delegated run gathering data');
            const update = driver.Fake.Find('session.update') as { session?: Record<string, string> };
            expect(update.session?.['instructions']).toContain('## Background updates');
            expect(update.session?.['instructions']).toContain('- [progress] delegated run gathering data');
            // context notes never trigger generation
            expect(driver.Fake.All('response.create')).toHaveLength(0);
        });

        it('SendContextNote accumulates notes across calls', async () => {
            const session = await startReadySession(driver, { SystemPrompt: 'base' });
            session.SendContextNote('first');
            driver.Fake.Reset();
            session.SendContextNote('second');
            const update = driver.Fake.Find('session.update') as { session?: Record<string, string> };
            expect(update.session?.['instructions']).toContain('- first');
            expect(update.session?.['instructions']).toContain('- second');
        });

        it('RequestSpokenUpdate sends response.create with per-response instructions when idle', async () => {
            const session = await startReadySession(driver);
            driver.Fake.Reset();
            session.RequestSpokenUpdate('Briefly say the report agent is drafting.');
            const respond = driver.Fake.Find('response.create') as { instructions?: string };
            expect(respond).toBeDefined();
            expect(respond.instructions).toBe('Briefly say the report agent is drafting.');
        });

        it('RequestSpokenUpdate QUEUES while a response is active and drains after response.done', async () => {
            const session = await startReadySession(driver);
            driver.Fire({ type: 'response.created' });
            driver.Fake.Reset();
            session.RequestSpokenUpdate('update 1');
            expect(driver.Fake.All('response.create')).toHaveLength(0); // queued behind the active response
            driver.Fire({ type: 'response.done' });
            // drained at the boundary
            expect(driver.Fake.All('response.create')).toHaveLength(1);
            const respond = driver.Fake.Find('response.create') as { instructions?: string };
            expect(respond.instructions).toBe('update 1');
        });

        it('RequestSpokenUpdate sets the active flag eagerly so back-to-back updates do not double-fire', async () => {
            const session = await startReadySession(driver);
            driver.Fake.Reset();
            session.RequestSpokenUpdate('first');
            session.RequestSpokenUpdate('second'); // second queues because the first marked a response active
            expect(driver.Fake.All('response.create')).toHaveLength(1);
        });

        it('SendToolResult marks a response active so a trailing spoken update queues (collision guard)', async () => {
            const session = await startReadySession(driver);
            await session.SendToolResult('call_1', '{"ok":true}');
            driver.Fake.Reset();
            session.RequestSpokenUpdate('narrate'); // the tool result already triggered a response
            expect(driver.Fake.All('response.create')).toHaveLength(0);
        });

        it('SendInput throws after the socket was released (Close)', async () => {
            const session = await startReadySession(driver);
            await session.Close();
            expect(() => session.SendInput(new Uint8Array([1]).buffer)).toThrow(/not open/);
        });
    });

    describe('inbound event translation', () => {
        let session: InworldRealtimeSession;

        beforeEach(async () => {
            session = await startReadySession(driver);
        });

        it('translates an output-audio delta to OnOutput with decoded bytes', () => {
            const received: ArrayBuffer[] = [];
            session.OnOutput((c) => received.push(c));
            const audio = Buffer.from(new Uint8Array([9, 8, 7])).toString('base64');
            driver.Fire({ type: 'output_audio.delta', audio });
            expect(received).toHaveLength(1);
            expect(Array.from(new Uint8Array(received[0]))).toEqual([9, 8, 7]);
        });

        it('ignores an output-audio frame with no audio payload', () => {
            const received: ArrayBuffer[] = [];
            session.OnOutput((c) => received.push(c));
            driver.Fire({ type: 'output_audio.delta' });
            expect(received).toHaveLength(0);
        });

        it('translates assistant transcript delta (partial) and done (final)', () => {
            const transcripts: Array<{ Role: string; Text: string; IsFinal: boolean }> = [];
            session.OnTranscript((t) => transcripts.push(t));
            driver.Fire({ type: 'output_audio_transcript.delta', text: 'Hel' });
            driver.Fire({ type: 'output_audio_transcript.done', text: 'Hello' });
            expect(transcripts).toEqual([
                { Role: 'assistant', Text: 'Hel', IsFinal: false },
                { Role: 'assistant', Text: 'Hello', IsFinal: true },
            ]);
        });

        it('translates user (input) transcription delta and completed (both-role fan-out)', () => {
            const transcripts: Array<{ Role: string; Text: string; IsFinal: boolean }> = [];
            session.OnTranscript((t) => transcripts.push(t));
            driver.Fire({ type: 'input_audio_transcription.delta', text: 'wha' });
            driver.Fire({ type: 'input_audio_transcription.completed', text: 'what is the weather' });
            expect(transcripts).toEqual([
                { Role: 'user', Text: 'wha', IsFinal: false },
                { Role: 'user', Text: 'what is the weather', IsFinal: true },
            ]);
        });

        it('drops empty / whitespace-only transcript text (no blank turns persisted)', () => {
            const transcripts: Array<{ Role: string; Text: string }> = [];
            session.OnTranscript((t) => transcripts.push(t));
            driver.Fire({ type: 'output_audio_transcript.delta', text: '   ' });
            driver.Fire({ type: 'input_audio_transcription.completed', text: '' });
            expect(transcripts).toHaveLength(0);
        });

        it('translates a tool.call to OnToolCall with a JSON-string arguments shape (string passthrough)', () => {
            const calls: Array<{ CallID: string; ToolName: string; Arguments: string }> = [];
            session.OnToolCall((c) => calls.push(c));
            driver.Fire({ type: 'tool.call', call_id: 'call_42', name: 'GetWeather', arguments: '{"city":"NYC"}' });
            expect(calls).toEqual([{ CallID: 'call_42', ToolName: 'GetWeather', Arguments: '{"city":"NYC"}' }]);
        });

        it('normalizes pre-parsed (object) tool-call arguments to a JSON string', () => {
            const calls: Array<{ Arguments: string }> = [];
            session.OnToolCall((c) => calls.push(c));
            driver.Fire({ type: 'tool.call', call_id: 'c', name: 'T', arguments: { city: 'NYC' } });
            expect(calls[0].Arguments).toBe('{"city":"NYC"}');
        });

        it('normalizes missing tool-call arguments to "{}"', () => {
            const calls: Array<{ Arguments: string }> = [];
            session.OnToolCall((c) => calls.push(c));
            driver.Fire({ type: 'tool.call', call_id: 'c', name: 'T' });
            expect(calls[0].Arguments).toBe('{}');
        });

        it('completes the full tool-call loop: call in, result out, model continues', () => {
            const calls: Array<{ CallID: string; ToolName: string; Arguments: string }> = [];
            session.OnToolCall((c) => calls.push(c));
            driver.Fire({ type: 'tool.call', call_id: 'call_loop', name: 'invoke-target-agent', arguments: '{"q":"sales"}' });
            expect(calls).toHaveLength(1);
            driver.Fake.Reset();
            void session.SendToolResult(calls[0].CallID, '{"answer":"42"}');
            const result = driver.Fake.Find('tool.result') as { call_id?: string; result?: string };
            expect(result.call_id).toBe('call_loop');
            expect(result.result).toBe('{"answer":"42"}');
        });

        it('a tool.call clears the busy flag WITHOUT draining a queued spoken update (deadlock guard)', () => {
            session.OnToolCall(() => undefined);
            // make a response active, then queue an update behind it
            driver.Fire({ type: 'response.created' });
            session.RequestSpokenUpdate('queued narration');
            driver.Fake.Reset();
            // a tool.call arrives — clears responseActive but must NOT drain the queue
            driver.Fire({ type: 'tool.call', call_id: 'c', name: 'T', arguments: '{}' });
            expect(driver.Fake.All('response.create')).toHaveLength(0);
            // the queue drains only at the next real response boundary
            driver.Fire({ type: 'response.done' });
            expect(driver.Fake.All('response.create')).toHaveLength(1);
        });

        it('fires OnInterruption on speech-started ONLY while a response is active (true barge-in)', () => {
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fire({ type: 'response.created' });
            driver.Fire({ type: 'input_audio.speech_started' });
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('does NOT fire OnInterruption on speech-started while the model is idle', () => {
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fire({ type: 'input_audio.speech_started' });
            expect(fn).not.toHaveBeenCalled();
        });

        it('does NOT fire OnInterruption for speech after the response completed (response.done clears)', () => {
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fire({ type: 'response.created' });
            driver.Fire({ type: 'response.done' });
            driver.Fire({ type: 'input_audio.speech_started' });
            expect(fn).not.toHaveBeenCalled();
        });

        it('fires OnInterruption on an explicit provider interruption frame and releases the floor', () => {
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fire({ type: 'response.created' });
            driver.Fire({ type: 'interrupted' });
            expect(fn).toHaveBeenCalledTimes(1);
            // floor released — a queued update can now run
            driver.Fake.Reset();
            session.RequestSpokenUpdate('after barge-in');
            expect(driver.Fake.All('response.create')).toHaveLength(1);
        });

        it('marks a response active when output audio arrives (proxy for "model output in flight")', () => {
            session.OnOutput(() => undefined);
            const audio = Buffer.from(new Uint8Array([1])).toString('base64');
            driver.Fire({ type: 'output_audio.delta', audio });
            // a subsequent speech-started is now a true barge-in
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fire({ type: 'input_audio.speech_started' });
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('translates a usage frame to OnUsage', () => {
            const usages: Array<{ InputTokens: number; OutputTokens: number }> = [];
            session.OnUsage((u) => usages.push(u));
            driver.Fire({ type: 'usage', input_tokens: 11, output_tokens: 5 });
            expect(usages).toEqual([{ InputTokens: 11, OutputTokens: 5 }]);
        });

        it('defaults missing usage counters to zero', () => {
            const usages: Array<{ InputTokens: number; OutputTokens: number }> = [];
            session.OnUsage((u) => usages.push(u));
            driver.Fire({ type: 'usage' });
            expect(usages).toEqual([{ InputTokens: 0, OutputTokens: 0 }]);
        });

        it('treats a mid-session session.updated as a no-op config-apply confirmation', () => {
            const fn = vi.fn();
            session.OnError(fn);
            expect(() => driver.Fire({ type: 'session.updated' })).not.toThrow();
            expect(fn).not.toHaveBeenCalled();
        });

        it('ignores unhandled event types without throwing', () => {
            expect(() => driver.Fire({ type: 'some.unknown.event' })).not.toThrow();
        });
    });

    describe('errors and unexpected close (OnError / OnClose)', () => {
        let session: InworldRealtimeSession;

        beforeEach(async () => {
            session = await startReadySession(driver);
        });

        it('classifies a provider error frame WITHOUT a fatal flag as recoverable (non-fatal) with its code', () => {
            const errors: Array<{ Message: string; Code?: string; Fatal: boolean }> = [];
            session.OnError((e) => errors.push(e));
            driver.Fire({ type: 'error', message: 'bad request', code: 'invalid_value' });
            expect(errors).toEqual([{ Message: 'bad request', Code: 'invalid_value', Fatal: false }]);
        });

        it('classifies a provider error frame WITH fatal:true as fatal (credential/transport death)', () => {
            const errors: Array<{ Message: string; Fatal: boolean }> = [];
            session.OnError((e) => errors.push({ Message: e.Message, Fatal: e.Fatal }));
            driver.Fire({ type: 'error', message: 'token expired', code: 'auth', fatal: true });
            expect(errors).toEqual([{ Message: 'token expired', Fatal: true }]);
        });

        it('surfaces a transport-level error as a FATAL session error', () => {
            const errors: Array<{ Message: string; Fatal: boolean }> = [];
            session.OnError((e) => errors.push({ Message: e.Message, Fatal: e.Fatal }));
            driver.FireError('inworld websocket error');
            expect(errors).toEqual([{ Message: 'inworld websocket error', Fatal: true }]);
        });

        it('surfaces an UNEXPECTED socket close as a fatal error followed by OnClose, with code/reason detail', () => {
            const errors: Array<{ Message: string; Fatal: boolean }> = [];
            const closed = vi.fn();
            session.OnError((e) => errors.push({ Message: e.Message, Fatal: e.Fatal }));
            session.OnClose(closed);
            driver.FireClose(1011, 'server error');
            expect(errors).toHaveLength(1);
            expect(errors[0].Fatal).toBe(true);
            expect(errors[0].Message).toContain('closed unexpectedly');
            expect(errors[0].Message).toContain('code 1011');
            expect(errors[0].Message).toContain('server error');
            expect(closed).toHaveBeenCalledTimes(1);
        });

        it('stays silent when the socket closes AFTER a consumer-initiated Close()', async () => {
            const onError = vi.fn();
            const onClose = vi.fn();
            session.OnError(onError);
            session.OnClose(onClose);
            await session.Close();
            driver.FireClose(1000, 'normal'); // the socket closing is the expected consequence
            expect(onError).not.toHaveBeenCalled();
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe('lifecycle', () => {
        it('Close sends a session.close frame, closes the socket, and drops handlers', async () => {
            const session = await startReadySession(driver);
            driver.Fake.Reset();
            await session.Close();
            expect(driver.Fake.Find('session.close')).toBeDefined();
            expect(driver.Fake.Closed).toBe(true);
        });

        it('does not dispatch events after Close (handlers cleared)', async () => {
            const session = await startReadySession(driver);
            const fn = vi.fn();
            session.OnInterruption(fn);
            driver.Fire({ type: 'response.created' });
            await session.Close();
            driver.Fire({ type: 'input_audio.speech_started' });
            expect(fn).not.toHaveBeenCalled();
        });

        it('Close is safe even if the socket send throws (socket already dead)', async () => {
            const session = await startReadySession(driver);
            // Replace the fake socket's send with a thrower to simulate a dead socket on teardown.
            driver.Fake.send = () => {
                throw new Error('socket gone');
            };
            await expect(session.Close()).resolves.toBeUndefined();
            expect(driver.Fake.Closed).toBe(true);
        });
    });
});

/** Loose JSON shape used only for ergonomic test assertions against built wire frames. */
type JSONLike = string | number | boolean | null | JSONLike[] | { [k: string]: JSONLike };
