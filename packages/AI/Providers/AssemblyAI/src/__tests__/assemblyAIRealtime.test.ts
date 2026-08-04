import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeSessionError,
    RealtimeToolCall,
    RealtimeToolDefinition,
    RealtimeTranscript,
    JSONObject,
} from '@memberjunction/ai';

import {
    AssemblyAIConnectArgs,
    AssemblyAIRealtime,
    AssemblyAIRealtimeSession,
    AssemblyAIRealtimeSocket,
    AssemblyAIServerEvent,
    ASSEMBLYAI_AGENT_WS_URL,
    ASSEMBLYAI_TOKEN_TTL_SECONDS,
} from '../assemblyAIRealtime';

/* ------------------------------------------------------------------ */
/*  Fake in-memory agent socket + token-mint surface                  */
/*                                                                    */
/*  Captures outbound frames / token mints and exposes the            */
/*  server-message callback so tests can drive AssemblyAI-shaped      */
/*  events with NO network.                                           */
/* ------------------------------------------------------------------ */

/** Parsed outbound frame shape (only the fields the tests inspect). */
interface ParsedFrame {
    type?: string;
    audio?: string;
    session?: {
        system_prompt?: string;
        greeting?: string;
        tools?: Array<{ type?: string; name?: string; description?: string; parameters?: JSONObject }>;
        output?: { voice?: string };
        input?: { turn_detection?: JSONObject; keyterms?: string[] };
    };
    session_id?: string;
    call_id?: string;
    result?: unknown;
    instructions?: string;
}

class FakeSocket implements AssemblyAIRealtimeSocket {
    public Sent: string[] = [];
    public Closed = false;

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.Closed = true;
    }
    public SentFrames(): ParsedFrame[] {
        return this.Sent.map((s) => JSON.parse(s) as ParsedFrame);
    }
}

/**
 * Test subclass that swaps the transport / token seams for in-memory fakes, capturing all
 * calls so assertions can inspect the connect URL and the wire frames.
 */
class TestAssemblyAIRealtime extends AssemblyAIRealtime {
    public Socket = new FakeSocket();
    public LastConnectArgs: AssemblyAIConnectArgs | null = null;
    public TokenMints: number[] = [];
    public MintedToken = 'temp-token-abc';

    protected override async connectAgentSocket(args: AssemblyAIConnectArgs): Promise<AssemblyAIRealtimeSocket> {
        this.LastConnectArgs = args;
        return this.Socket;
    }
    protected override async mintClientToken(expiresInSeconds: number): Promise<string> {
        this.TokenMints.push(expiresInSeconds);
        return this.MintedToken;
    }

    /** Drives an inbound AssemblyAI server event through the registered callback. */
    public Emit(event: AssemblyAIServerEvent): void {
        this.LastConnectArgs?.OnMessage(event);
    }
}

/** Builds the minimal session params; callers override per test. */
function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return {
        Model: 'voice-agent',
        SystemPrompt: 'You are the session voice.',
        ...overrides,
    };
}

const WEATHER_TOOL: RealtimeToolDefinition = {
    Name: 'get_weather',
    Description: 'Get the weather for a city',
    ParametersSchema: { type: 'object', properties: { city: { type: 'string' } } },
};

function readyEvent(): AssemblyAIServerEvent {
    return { type: 'session.ready', session_id: 'sess_1' };
}

/** Lets the in-flight StartSession continuation (microtasks) run. */
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Starts a session and completes the session.ready handshake. */
async function startSession(
    driver: TestAssemblyAIRealtime,
    params: Partial<RealtimeSessionParams> = {}
): Promise<IRealtimeSession> {
    const promise = driver.StartSession(makeParams(params));
    await flushAsync();
    driver.Emit(readyEvent());
    return promise;
}

/** Collects every emission from a session into arrays for assertions. */
function collect(session: IRealtimeSession): {
    outputs: ArrayBuffer[];
    transcripts: RealtimeTranscript[];
    toolCalls: RealtimeToolCall[];
    errors: RealtimeSessionError[];
    interruptions: number[];
} {
    const outputs: ArrayBuffer[] = [];
    const transcripts: RealtimeTranscript[] = [];
    const toolCalls: RealtimeToolCall[] = [];
    const errors: RealtimeSessionError[] = [];
    const interruptions: number[] = [];
    session.OnOutput((chunk) => outputs.push(chunk));
    session.OnTranscript((t) => transcripts.push(t));
    session.OnToolCall((c) => toolCalls.push(c));
    session.OnError((e) => errors.push(e));
    session.OnInterruption(() => interruptions.push(interruptions.length + 1));
    return { outputs, transcripts, toolCalls, errors, interruptions };
}

/* ------------------------------------------------------------------ */
/*  Session-object construction                                        */
/* ------------------------------------------------------------------ */

describe('AssemblyAIRealtime session-object construction', () => {
    it('builds the minimal session object: system_prompt only', () => {
        const session = AssemblyAIRealtime.BuildSessionObject(makeParams());
        expect(session).toEqual({ system_prompt: 'You are the session voice.' });
    });

    it('folds InitialContext into the system prompt under a "Prior context" heading', () => {
        const session = AssemblyAIRealtime.BuildSessionObject(
            makeParams({ InitialContext: 'The user likes brevity.' })
        );
        expect(session['system_prompt']).toBe(
            'You are the session voice.\n\n## Prior context\nThe user likes brevity.'
        );
    });

    it('ignores a whitespace-only InitialContext', () => {
        const session = AssemblyAIRealtime.BuildSessionObject(makeParams({ InitialContext: '   ' }));
        expect(session['system_prompt']).toBe('You are the session voice.');
    });

    it('maps Core tools to the provider function schema', () => {
        const session = AssemblyAIRealtime.BuildSessionObject(makeParams({ Tools: [WEATHER_TOOL] }));
        expect(session['tools']).toEqual([
            {
                type: 'function',
                name: 'get_weather',
                description: 'Get the weather for a city',
                parameters: { type: 'object', properties: { city: { type: 'string' } } },
            },
        ]);
    });

    it('passes recognized Config keys to their wire slots (voice, greeting, turn_detection, keyterms)', () => {
        const session = AssemblyAIRealtime.BuildSessionObject(
            makeParams({
                Config: {
                    voice: 'ivy',
                    greeting: 'Hello!',
                    turn_detection: { vad_threshold: 0.5, min_silence: 1400 },
                    keyterms: ['MemberJunction', 'CodeGen'],
                    unrelated: 'ignored',
                },
            })
        );
        expect(session['output']).toEqual({ voice: 'ivy' });
        expect(session['greeting']).toBe('Hello!');
        expect(session['input']).toEqual({
            turn_detection: { vad_threshold: 0.5, min_silence: 1400 },
            keyterms: ['MemberJunction', 'CodeGen'],
        });
        expect(session['unrelated']).toBeUndefined();
    });

    it('fingerprints tool sets order-insensitively', () => {
        const toolB: RealtimeToolDefinition = { Name: 'b_tool', Description: 'b', ParametersSchema: {} };
        expect(AssemblyAIRealtime.ToolSetFingerprint([WEATHER_TOOL, toolB])).toBe(
            AssemblyAIRealtime.ToolSetFingerprint([toolB, WEATHER_TOOL])
        );
        expect(AssemblyAIRealtime.ToolSetFingerprint([WEATHER_TOOL])).not.toBe(
            AssemblyAIRealtime.ToolSetFingerprint([toolB])
        );
    });
});

/* ------------------------------------------------------------------ */
/*  Client-direct minting                                              */
/* ------------------------------------------------------------------ */

describe('AssemblyAIRealtime client-direct (CreateClientSession)', () => {
    let driver: TestAssemblyAIRealtime;

    beforeEach(() => {
        driver = new TestAssemblyAIRealtime('fake-api-key');
    });

    it('advertises client-direct support', () => {
        expect(driver.SupportsClientDirect).toBe(true);
    });

    it('mints a well-formed config: provider, model, one-time token, TTL-scoped expiry', async () => {
        const before = Date.now();
        const cfg = await driver.CreateClientSession(makeParams());
        const after = Date.now();

        expect(driver.TokenMints).toEqual([ASSEMBLYAI_TOKEN_TTL_SECONDS]);
        expect(cfg.Provider).toBe('assemblyai');
        expect(cfg.Model).toBe('voice-agent');
        expect(cfg.EphemeralToken).toBe('temp-token-abc');
        const expires = new Date(cfg.ExpiresAt).getTime();
        expect(expires).toBeGreaterThanOrEqual(before + ASSEMBLYAI_TOKEN_TTL_SECONDS * 1000);
        expect(expires).toBeLessThanOrEqual(after + ASSEMBLYAI_TOKEN_TTL_SECONDS * 1000);
    });

    it('packs the pact SessionConfig: wire-shaped session object + Config passthrough', async () => {
        const cfg = await driver.CreateClientSession(
            makeParams({ Tools: [WEATHER_TOOL], Config: { voice: 'ivy', appHint: 'warm' } })
        );

        expect(cfg.SessionConfig).toEqual({
            session: {
                system_prompt: 'You are the session voice.',
                tools: [
                    {
                        type: 'function',
                        name: 'get_weather',
                        description: 'Get the weather for a city',
                        parameters: { type: 'object', properties: { city: { type: 'string' } } },
                    },
                ],
                output: { voice: 'ivy' },
            },
            config: { voice: 'ivy', appHint: 'warm' },
        });
    });
});

/* ------------------------------------------------------------------ */
/*  Server-bridged session                                             */
/* ------------------------------------------------------------------ */

describe('AssemblyAIRealtime server-bridged session (StartSession)', () => {
    let driver: TestAssemblyAIRealtime;

    beforeEach(() => {
        driver = new TestAssemblyAIRealtime('fake-api-key');
    });

    it('connects with the API key as the token query parameter', async () => {
        await startSession(driver);
        expect(driver.LastConnectArgs?.Url).toBe(`${ASSEMBLYAI_AGENT_WS_URL}?token=fake-api-key`);
    });

    it('sends session.update with the full session config before anything else', async () => {
        await startSession(driver, { Tools: [WEATHER_TOOL], Config: { voice: 'james' } });
        const first = driver.Socket.SentFrames()[0];
        expect(first.type).toBe('session.update');
        expect(first.session?.system_prompt).toBe('You are the session voice.');
        expect(first.session?.tools).toHaveLength(1);
        expect(first.session?.output).toEqual({ voice: 'james' });
    });

    it('resolves ONLY after session.ready confirms the session config is applied', async () => {
        let resolved = false;
        const promise = driver.StartSession(makeParams()).then((s) => {
            resolved = true;
            return s;
        });
        await flushAsync();
        expect(resolved).toBe(false); // socket open + session.update sent, but no ready yet

        driver.Emit(readyEvent());
        await promise;
        expect(resolved).toBe(true);
    });

    it('rejects StartSession when the transport dies before session.ready arrives', async () => {
        const promise = driver.StartSession(makeParams());
        await flushAsync();
        driver.LastConnectArgs?.OnClose(1011, 'server error');

        await expect(promise).rejects.toThrow('closed unexpectedly');
    });

    describe('event matrix', () => {
        let session: IRealtimeSession;

        beforeEach(async () => {
            session = await startSession(driver, { Tools: [WEATHER_TOOL] });
        });

        it('forwards reply.audio events as raw ArrayBuffers', () => {
            const { outputs } = collect(session);
            const bytes = new Uint8Array([1, 2, 3, 4]);
            driver.Emit({ type: 'reply.audio', data: Buffer.from(bytes).toString('base64') });

            expect(outputs).toHaveLength(1);
            expect(new Uint8Array(outputs[0])).toEqual(bytes);
        });

        it('emits transcript.user.delta as interim user deltas and transcript.user as FINAL', () => {
            const { transcripts } = collect(session);
            driver.Emit({ type: 'transcript.user.delta', text: 'what is' });
            driver.Emit({ type: 'transcript.user.delta', text: ' MJ?' });
            driver.Emit({ type: 'transcript.user', text: 'what is MJ?', item_id: 'item_1' });

            expect(transcripts).toEqual([
                { Role: 'user', Text: 'what is', IsFinal: false },
                { Role: 'user', Text: ' MJ?', IsFinal: false },
                { Role: 'user', Text: 'what is MJ?', IsFinal: true },
            ]);
        });

        it('emits transcript.agent as a FINAL assistant transcript (agent turns have no deltas)', () => {
            const { transcripts } = collect(session);
            driver.Emit({ type: 'transcript.agent', text: 'MJ is a platform.', reply_id: 'r1', item_id: 'i1', interrupted: false });
            expect(transcripts).toEqual([{ Role: 'assistant', Text: 'MJ is a platform.', IsFinal: true }]);
        });

        it('emits an interrupted transcript.agent as the authoritative truncated turn', () => {
            const { transcripts } = collect(session);
            driver.Emit({ type: 'transcript.agent', text: 'The full answer is', reply_id: 'r1', interrupted: true });
            expect(transcripts).toEqual([{ Role: 'assistant', Text: 'The full answer is', IsFinal: true }]);
        });

        it('surfaces tool.call with the parsed arguments re-stringified', () => {
            const { toolCalls } = collect(session);
            driver.Emit({ type: 'tool.call', call_id: 'c_1', name: 'get_weather', arguments: { city: 'NYC' } });
            expect(toolCalls).toEqual([{ CallID: 'c_1', ToolName: 'get_weather', Arguments: '{"city":"NYC"}' }]);
        });

        it("surfaces reply.done status 'interrupted' as a true barge-in", () => {
            const { interruptions } = collect(session);
            driver.Emit({ type: 'reply.started', reply_id: 'r1' });
            driver.Emit({ type: 'reply.done', status: 'interrupted' });
            expect(interruptions).toHaveLength(1);
        });

        it('does NOT surface a plain reply.done or raw input.speech.started as an interruption', () => {
            const { interruptions } = collect(session);
            driver.Emit({ type: 'reply.started', reply_id: 'r1' });
            driver.Emit({ type: 'reply.done' });
            driver.Emit({ type: 'input.speech.started' });
            driver.Emit({ type: 'input.speech.stopped' });
            expect(interruptions).toHaveLength(0);
        });

        it('surfaces session.error frames as NON-fatal errors with the provider code', () => {
            const { errors } = collect(session);
            driver.Emit({ type: 'session.error', code: 'invalid_param', message: 'bad turn_detection', param: 'vad_threshold' });
            expect(errors).toEqual([{ Message: 'bad turn_detection', Code: 'invalid_param', Fatal: false }]);
        });

        it('ignores session.updated, speech telemetry, and unknown frame types', () => {
            const { transcripts, errors } = collect(session);
            const framesBefore = driver.Socket.Sent.length;
            driver.Emit({ type: 'session.updated', session: {} });
            driver.Emit({ type: 'input.speech.started' });
            driver.Emit({ type: 'input.speech.stopped' });
            driver.Emit({ type: 'sparkly_future_event' });
            expect(transcripts).toEqual([]);
            expect(errors).toEqual([]);
            expect(driver.Socket.Sent.length).toBe(framesBefore);
        });
    });

    describe('outbound actions', () => {
        let session: IRealtimeSession;

        beforeEach(async () => {
            session = await startSession(driver, { Tools: [WEATHER_TOOL] });
        });

        it('streams client audio as base64 input.audio frames', () => {
            const bytes = new Uint8Array([9, 8, 7]);
            session.SendInput(bytes.buffer);
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'input.audio',
                audio: Buffer.from(bytes).toString('base64'),
            });
        });

        it('completes the tool round-trip: tool.call → tool.result with the JSON-string result', async () => {
            driver.Emit({ type: 'tool.call', call_id: 'c_1', name: 'get_weather', arguments: { city: 'NYC' } });

            await session.SendToolResult('c_1', JSON.stringify({ tempF: 72 }));

            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'tool.result',
                call_id: 'c_1',
                result: '{"tempF":72}', // the wire slot wants a JSON STRING — passed through verbatim
            });
        });

        it('sends the tool result IMMEDIATELY even mid-reply (the provider owns the continuation)', async () => {
            driver.Emit({ type: 'reply.started', reply_id: 'r1' });
            await session.SendToolResult('c_external', '{"ok":true}');
            expect(driver.Socket.SentFrames().at(-1)?.type).toBe('tool.result');
        });

        it('appends context notes to the system prompt via session.update (non-interrupting emulation)', () => {
            driver.Emit({ type: 'reply.started', reply_id: 'r1' }); // response in flight
            session.SendContextNote?.('[delegated-agent progress] gathering data');
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'session.update',
                session: {
                    system_prompt:
                        'You are the session voice.\n\n## Background updates\n- [delegated-agent progress] gathering data',
                },
            });
        });

        it('accumulates successive context notes on the base prompt', () => {
            session.SendContextNote?.('note one');
            session.SendContextNote?.('note two');
            expect(driver.Socket.SentFrames().at(-1)?.session?.system_prompt).toBe(
                'You are the session voice.\n\n## Background updates\n- note one\n- note two'
            );
        });

        it('sends RequestSpokenUpdate as a NATIVE reply.create when idle', () => {
            session.RequestSpokenUpdate?.('Say one short progress sentence.');
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'reply.create',
                instructions: 'Say one short progress sentence.',
            });
        });

        it('QUEUES a spoken update behind an in-flight reply and flushes on reply.done', () => {
            driver.Emit({ type: 'reply.started', reply_id: 'r1' });
            const framesBefore = driver.Socket.Sent.length;

            session.RequestSpokenUpdate?.('working on it');
            expect(driver.Socket.Sent.length).toBe(framesBefore); // deferred — never collides

            driver.Emit({ type: 'reply.done' });
            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'reply.create', instructions: 'working on it' });
        });

        it('releases the busy flag on a tool.call frame WITHOUT draining queued narration (deadlock guard)', async () => {
            driver.Emit({ type: 'reply.started', reply_id: 'r1' });
            session.RequestSpokenUpdate?.('narrate later'); // queued behind the reply

            driver.Emit({ type: 'tool.call', call_id: 'c1', name: 'get_weather', arguments: {} });
            // the queued narration must NOT trigger a reply between the tool call and its result
            expect(driver.Socket.SentFrames().filter((f) => f.type === 'reply.create')).toHaveLength(0);

            // the tool result is never queued — the provider asked for it and owns the continuation
            await session.SendToolResult('c1', '{"ok":true}');
            expect(driver.Socket.SentFrames().at(-1)?.type).toBe('tool.result');

            // the narration drains at the next real reply boundary
            driver.Emit({ type: 'reply.done' });
            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'reply.create', instructions: 'narrate later' });
        });
    });

    describe('RegisterTools (mutable mid-session on this provider)', () => {
        it('no-ops silently for a set identical (order-insensitively) to the connect-time set', async () => {
            const toolB: RealtimeToolDefinition = { Name: 'b_tool', Description: 'b', ParametersSchema: {} };
            const session = await startSession(driver, { Tools: [WEATHER_TOOL, toolB] });
            const framesBefore = driver.Socket.Sent.length;

            await session.RegisterTools([toolB, WEATHER_TOOL]);
            expect(driver.Socket.Sent.length).toBe(framesBefore);
        });

        it('re-declares a DIFFERENT post-start set natively via session.update', async () => {
            const session = await startSession(driver, { Tools: [WEATHER_TOOL] });

            const toolB: RealtimeToolDefinition = { Name: 'b_tool', Description: 'b', ParametersSchema: {} };
            await session.RegisterTools([toolB]);

            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'session.update',
                session: { tools: [{ type: 'function', name: 'b_tool', description: 'b', parameters: {} }] },
            });

            // and the NEW set is now the no-op baseline
            const framesAfter = driver.Socket.Sent.length;
            await session.RegisterTools([toolB]);
            expect(driver.Socket.Sent.length).toBe(framesAfter);
        });
    });

    describe('error fatality and close semantics', () => {
        it('surfaces a websocket error as a FATAL session error', async () => {
            const session = await startSession(driver);
            const { errors } = collect(session);

            driver.LastConnectArgs?.OnError('socket exploded');

            expect(errors).toEqual([{ Message: 'socket exploded', Fatal: true }]);
        });

        it('surfaces an UNEXPECTED close as a FATAL error with the close detail', async () => {
            const session = await startSession(driver);
            const { errors } = collect(session);

            driver.LastConnectArgs?.OnClose(4001, 'token expired');

            expect(errors).toEqual([
                { Message: 'AssemblyAI agent session closed unexpectedly (code 4001 — token expired)', Fatal: true },
            ]);
        });

        it('surfaces an unsolicited session.ended as a FATAL error', async () => {
            const session = await startSession(driver);
            const { errors } = collect(session);

            driver.Emit({ type: 'session.ended', session_duration_seconds: 12 });

            expect(errors).toEqual([{ Message: 'AssemblyAI agent session ended by the provider', Fatal: true }]);
        });

        it('Close() sends session.end BEFORE closing the socket (avoids the billable resume hold)', async () => {
            const session = await startSession(driver);
            await session.Close();

            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'session.end' });
            expect(driver.Socket.Closed).toBe(true);
        });

        it('stays silent when session.ended / close follow a consumer Close()', async () => {
            const session = await startSession(driver);
            const { errors } = collect(session);

            await session.Close();
            driver.LastConnectArgs?.OnMessage({ type: 'session.ended', session_duration_seconds: 12 });
            driver.LastConnectArgs?.OnClose(1000, 'bye');

            expect(errors).toEqual([]);
        });
    });
});

/* ------------------------------------------------------------------ */
/*  Token-mint REST seam                                               */
/* ------------------------------------------------------------------ */

describe('AssemblyAIRealtime token mint (production seam)', () => {
    /** Exposes the protected seam for direct testing against a stubbed global fetch. */
    class SeamProbe extends AssemblyAIRealtime {
        public Mint(seconds: number): Promise<string> {
            return this.mintClientToken(seconds);
        }
    }

    it('GETs the token endpoint with a Bearer key and returns the minted token', async () => {
        const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> = [];
        const fetchStub = vi.fn(async (url: string, init: { method: string; headers: Record<string, string> }) => {
            calls.push({ url, init });
            return { ok: true, status: 200, json: async () => ({ token: 'minted-xyz' }) };
        });
        vi.stubGlobal('fetch', fetchStub);
        try {
            const token = await new SeamProbe('fake-api-key').Mint(300);
            expect(token).toBe('minted-xyz');
            expect(calls).toHaveLength(1);
            expect(calls[0].url).toBe('https://agents.assemblyai.com/v1/token?expires_in_seconds=300');
            expect(calls[0].init.method).toBe('GET');
            expect(calls[0].init.headers).toEqual({ Authorization: 'Bearer fake-api-key' });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('throws on a non-OK response and on a token-less body', async () => {
        vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, json: async () => ({}) }));
        try {
            await expect(new SeamProbe('bad-key').Mint(300)).rejects.toThrow('HTTP 401');
        } finally {
            vi.unstubAllGlobals();
        }

        vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({}) }));
        try {
            await expect(new SeamProbe('fake-api-key').Mint(300)).rejects.toThrow('no token');
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

/* ------------------------------------------------------------------ */
/*  Session guard rails                                                */
/* ------------------------------------------------------------------ */

describe('AssemblyAIRealtimeSession guard rails', () => {
    it('throws on sends when no socket was ever attached', () => {
        const session = new AssemblyAIRealtimeSession({ system_prompt: 'p' });
        expect(() => session.SendInput(new Uint8Array([1]).buffer)).toThrow('not open');
    });
});
