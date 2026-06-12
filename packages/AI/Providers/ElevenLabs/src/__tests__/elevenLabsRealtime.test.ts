import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElevenLabs } from '@elevenlabs/elevenlabs-js';
import type {
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeSessionError,
    RealtimeToolCall,
    RealtimeToolDefinition,
    RealtimeTranscript,
} from '@memberjunction/ai';

import {
    ElevenLabsConnectArgs,
    ElevenLabsRealtime,
    ElevenLabsRealtimeSession,
    ElevenLabsRealtimeSocket,
    ElevenLabsServerEvent,
} from '../elevenLabsRealtime';

/* ------------------------------------------------------------------ */
/*  Fake in-memory conversation socket + REST surface                 */
/*                                                                    */
/*  Captures outbound frames / REST calls and exposes the             */
/*  server-message callback so tests can drive ElevenLabs-shaped      */
/*  events with NO network.                                           */
/* ------------------------------------------------------------------ */

/** Parsed outbound frame shape (only the fields the tests inspect). */
interface ParsedFrame {
    type?: string;
    user_audio_chunk?: string;
    text?: string;
    conversation_config_override?: { agent?: { prompt?: { prompt?: string } } };
    tool_call_id?: string;
    result?: unknown;
    is_error?: boolean;
    event_id?: number;
}

class FakeSocket implements ElevenLabsRealtimeSocket {
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

/** Builds a full agent detail the way the REST API would return it. */
function makeAgentDetail(opts: {
    agentId: string;
    name: string;
    tools?: RealtimeToolDefinition[];
    promptOverrideEnabled?: boolean;
}): ElevenLabs.GetAgentResponseModel {
    return {
        agentId: opts.agentId,
        name: opts.name,
        conversationConfig: {
            agent: {
                prompt: {
                    prompt: 'stored base prompt',
                    tools: (opts.tools ?? []).map((t) => ElevenLabsRealtime.MapToolToClientTool(t)),
                },
            },
        },
        platformSettings: {
            overrides: {
                conversationConfigOverride: {
                    agent: { prompt: { prompt: opts.promptOverrideEnabled ?? true } },
                },
            },
        },
        metadata: { createdAtUnixSecs: 0, updatedAtUnixSecs: 0 },
    } as ElevenLabs.GetAgentResponseModel;
}

/**
 * Test subclass that swaps every REST / transport seam for in-memory fakes, capturing all
 * calls so assertions can inspect the managed-agent ensure flow and the wire frames.
 */
class TestElevenLabsRealtime extends ElevenLabsRealtime {
    /** The remote agent inventory the fake REST surface serves. */
    public Agents: ElevenLabs.GetAgentResponseModel[] = [];
    public ListCalls: string[] = [];
    public GetCalls: string[] = [];
    public CreateBodies: ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost[] = [];
    public UpdateCalls: Array<{ agentId: string; body: ElevenLabs.conversationalAi.UpdateAgentRequest }> = [];
    public SignedUrlMints: string[] = [];
    public Socket = new FakeSocket();
    public LastConnectArgs: ElevenLabsConnectArgs | null = null;

    protected override async listAgents(search: string): Promise<ElevenLabs.AgentSummaryResponseModel[]> {
        this.ListCalls.push(search);
        return this.Agents.filter((a) => a.name.includes(search)).map(
            (a) => ({ agentId: a.agentId, name: a.name }) as ElevenLabs.AgentSummaryResponseModel
        );
    }
    protected override async getAgent(agentId: string): Promise<ElevenLabs.GetAgentResponseModel> {
        this.GetCalls.push(agentId);
        const agent = this.Agents.find((a) => a.agentId === agentId);
        if (!agent) {
            throw new Error(`fake REST: no agent ${agentId}`);
        }
        return agent;
    }
    protected override async createAgent(
        body: ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost
    ): Promise<string> {
        this.CreateBodies.push(body);
        return 'agent_created_001';
    }
    protected override async updateAgent(
        agentId: string,
        body: ElevenLabs.conversationalAi.UpdateAgentRequest
    ): Promise<void> {
        this.UpdateCalls.push({ agentId, body });
    }
    protected override async mintSignedUrl(agentId: string): Promise<string> {
        this.SignedUrlMints.push(agentId);
        return `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}&token=signed-token`;
    }
    protected override async connectConversation(args: ElevenLabsConnectArgs): Promise<ElevenLabsRealtimeSocket> {
        this.LastConnectArgs = args;
        return this.Socket;
    }

    /** Drives an inbound ElevenLabs server event through the registered callback. */
    public Emit(event: ElevenLabsServerEvent): void {
        this.LastConnectArgs?.OnMessage(event);
    }
}

/** Builds the minimal session params; callers override per test. */
function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return {
        Model: 'MJ Realtime Co-Agent',
        SystemPrompt: 'You are the session voice.',
        ...overrides,
    };
}

const WEATHER_TOOL: RealtimeToolDefinition = {
    Name: 'get_weather',
    Description: 'Get the weather for a city',
    ParametersSchema: { type: 'object', properties: { city: { type: 'string' } } },
};

function metadataEvent(): ElevenLabsServerEvent {
    return {
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: {
            conversation_id: 'conv_1',
            agent_output_audio_format: 'pcm_16000',
            user_input_audio_format: 'pcm_16000',
        },
    };
}

/** Lets the in-flight StartSession continuation (microtasks) run. */
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Starts a session and completes the initiation handshake. */
async function startSession(
    driver: TestElevenLabsRealtime,
    params: Partial<RealtimeSessionParams> = {}
): Promise<IRealtimeSession> {
    const promise = driver.StartSession(makeParams(params));
    await flushAsync();
    driver.Emit(metadataEvent());
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
/*  Managed-agent ensure flow                                          */
/* ------------------------------------------------------------------ */

describe('ElevenLabsRealtime managed-agent ensure flow', () => {
    let driver: TestElevenLabsRealtime;

    beforeEach(() => {
        driver = new TestElevenLabsRealtime('fake-api-key');
    });

    it('uses a verbatim agent_… Model as the agent id with NO management REST calls', async () => {
        const cfg = await driver.CreateClientSession(makeParams({ Model: 'agent_deployment_owned_42' }));

        expect(driver.ListCalls).toEqual([]);
        expect(driver.CreateBodies).toEqual([]);
        expect(driver.UpdateCalls).toEqual([]);
        expect(driver.SignedUrlMints).toEqual(['agent_deployment_owned_42']);
        expect(cfg.SessionConfig['agentId']).toBe('agent_deployment_owned_42');
    });

    it('creates a missing managed agent with the tool set and the prompt-override enablement', async () => {
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.ListCalls).toEqual(['MJ Realtime Co-Agent']);
        expect(driver.CreateBodies).toHaveLength(1);
        const body = driver.CreateBodies[0];
        expect(body.name).toBe('MJ Realtime Co-Agent');
        // the per-session system-prompt override is explicitly ENABLED
        expect(body.platformSettings?.overrides?.conversationConfigOverride?.agent?.prompt?.prompt).toBe(true);
        // the stored prompt is a placeholder, never a session prompt
        expect(body.conversationConfig.agent?.prompt?.prompt).toContain('placeholder');
        // tools ride as inline CLIENT tools that block on (and then speak) their results
        expect(body.conversationConfig.agent?.prompt?.tools).toEqual([
            {
                type: 'client',
                name: 'get_weather',
                description: 'Get the weather for a city',
                // typed nodes without a description get one synthesized (their schema model
                // requires a marker on every value-typed node, root object included)
                parameters: { type: 'object', description: 'An object value.', properties: { city: { type: 'string', description: 'A string value.' } } },
                expectsResponse: true,
                responseTimeoutSecs: 120,
            },
        ]);
        expect(driver.SignedUrlMints).toEqual(['agent_created_001']);
    });

    it('reuses an existing managed agent untouched when tools and override enablement match', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] }),
        ];

        const cfg = await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.CreateBodies).toEqual([]);
        expect(driver.UpdateCalls).toEqual([]);
        expect(cfg.SessionConfig['agentId']).toBe('agent_existing_7');
    });

    it('matches the tool fingerprint ORDER-INSENSITIVELY', async () => {
        const toolB: RealtimeToolDefinition = { Name: 'b_tool', Description: 'b', ParametersSchema: {} };
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL, toolB] }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [toolB, WEATHER_TOOL] }));
        expect(driver.UpdateCalls).toEqual([]);
    });

    it('PATCHes the managed agent when the tool set drifted', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [] }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.UpdateCalls).toHaveLength(1);
        expect(driver.UpdateCalls[0].agentId).toBe('agent_existing_7');
        expect(driver.UpdateCalls[0].body.conversationConfig?.agent?.prompt?.tools).toHaveLength(1);
    });

    it('PATCHes the managed agent when the prompt override is not enabled', async () => {
        driver.Agents = [
            makeAgentDetail({
                agentId: 'agent_existing_7',
                name: 'MJ Realtime Co-Agent',
                tools: [WEATHER_TOOL],
                promptOverrideEnabled: false,
            }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.UpdateCalls).toHaveLength(1);
        expect(
            driver.UpdateCalls[0].body.platformSettings?.overrides?.conversationConfigOverride?.agent?.prompt?.prompt
        ).toBe(true);
    });

    it('ignores exact-name-but-different agents and non-client tools when fingerprinting', async () => {
        const detail = makeAgentDetail({ agentId: 'agent_x', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] });
        // graft a deployment-side webhook tool next to the managed client tools
        detail.conversationConfig.agent?.prompt?.tools?.push({
            type: 'webhook',
        } as ElevenLabs.PromptAgentApiModelOutputToolsItem.Webhook);
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_other', name: 'MJ Realtime Co-Agent (staging)', tools: [] }),
            detail,
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.GetCalls).toEqual(['agent_x']); // exact-name match only
        expect(driver.UpdateCalls).toEqual([]); // webhook tool did not poison the fingerprint
    });

    it('caches the ensure result per name + tool fingerprint (no repeat REST round-trips)', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        expect(driver.ListCalls).toHaveLength(1);

        // a DIFFERENT tool set re-runs the ensure flow
        await driver.CreateClientSession(makeParams({ Tools: [] }));
        expect(driver.ListCalls).toHaveLength(2);
        expect(driver.UpdateCalls).toHaveLength(1);
    });
});

/* ------------------------------------------------------------------ */
/*  Client-direct minting                                              */
/* ------------------------------------------------------------------ */

describe('ElevenLabsRealtime client-direct (CreateClientSession)', () => {
    let driver: TestElevenLabsRealtime;

    beforeEach(() => {
        driver = new TestElevenLabsRealtime('fake-api-key');
    });

    it('advertises client-direct support', () => {
        expect(driver.SupportsClientDirect).toBe(true);
    });

    it('mints a well-formed config: provider, model, signed URL as the token, ~15-minute expiry', async () => {
        const before = Date.now();
        const cfg = await driver.CreateClientSession(makeParams());
        const after = Date.now();

        expect(cfg.Provider).toBe('elevenlabs');
        expect(cfg.Model).toBe('MJ Realtime Co-Agent');
        expect(cfg.EphemeralToken).toBe(
            'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_created_001&token=signed-token'
        );
        const expires = new Date(cfg.ExpiresAt).getTime();
        expect(expires).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
        expect(expires).toBeLessThanOrEqual(after + 15 * 60 * 1000);
    });

    it('packs the pact SessionConfig: agentId + wire-shaped prompt override + Config passthrough', async () => {
        const cfg = await driver.CreateClientSession(makeParams({ Config: { voiceHint: 'warm' } }));

        expect(cfg.SessionConfig).toEqual({
            agentId: 'agent_created_001',
            overrides: { agent: { prompt: { prompt: 'You are the session voice.' } } },
            config: { voiceHint: 'warm' },
        });
    });
});

/* ------------------------------------------------------------------ */
/*  Server-bridged session                                             */
/* ------------------------------------------------------------------ */

describe('ElevenLabsRealtime server-bridged session (StartSession)', () => {
    let driver: TestElevenLabsRealtime;

    beforeEach(() => {
        driver = new TestElevenLabsRealtime('fake-api-key');
    });

    it('sends the initiation frame with the per-session prompt override before anything else', async () => {
        await startSession(driver);
        expect(driver.Socket.SentFrames()[0]).toEqual({
            type: 'conversation_initiation_client_data',
            conversation_config_override: { agent: { prompt: { prompt: 'You are the session voice.' } } },
        });
    });

    it('resolves ONLY after the initiation metadata confirms the session config is applied', async () => {
        let resolved = false;
        const promise = driver.StartSession(makeParams()).then((s) => {
            resolved = true;
            return s;
        });
        await flushAsync();
        expect(resolved).toBe(false); // socket open + init sent, but no metadata yet

        driver.Emit(metadataEvent());
        await promise;
        expect(resolved).toBe(true);
    });

    it('rejects StartSession when the transport dies before the metadata arrives', async () => {
        const promise = driver.StartSession(makeParams());
        await flushAsync();
        driver.LastConnectArgs?.OnClose(1011, 'server error');

        await expect(promise).rejects.toThrow('closed unexpectedly');
    });

    it('injects InitialContext as a contextual_update once the metadata arrives', async () => {
        await startSession(driver, { InitialContext: 'Prior conversation: the user likes brevity.' });
        expect(driver.Socket.SentFrames().at(-1)).toEqual({
            type: 'contextual_update',
            text: 'Prior conversation: the user likes brevity.',
        });
    });

    describe('event matrix', () => {
        let session: IRealtimeSession;

        beforeEach(async () => {
            session = await startSession(driver, { Tools: [WEATHER_TOOL] });
        });

        it('forwards audio events as raw ArrayBuffers', () => {
            const { outputs } = collect(session);
            const bytes = new Uint8Array([1, 2, 3, 4]);
            driver.Emit({
                type: 'audio',
                audio_event: { audio_base_64: Buffer.from(bytes).toString('base64'), event_id: 1 },
            });

            expect(outputs).toHaveLength(1);
            expect(new Uint8Array(outputs[0])).toEqual(bytes);
        });

        it('emits user_transcript and agent_response as FINAL transcripts (no deltas on this provider)', () => {
            const { transcripts } = collect(session);
            driver.Emit({ type: 'user_transcript', user_transcription_event: { user_transcript: 'what is MJ?' } });
            driver.Emit({ type: 'agent_response', agent_response_event: { agent_response: 'MJ is a platform.' } });

            expect(transcripts).toEqual([
                { Role: 'user', Text: 'what is MJ?', IsFinal: true },
                { Role: 'assistant', Text: 'MJ is a platform.', IsFinal: true },
            ]);
        });

        it('re-finalizes the assistant turn from agent_response_correction (post-barge-in truncation)', () => {
            const { transcripts } = collect(session);
            driver.Emit({
                type: 'agent_response_correction',
                agent_response_correction_event: {
                    original_agent_response: 'long answer that was cut',
                    corrected_agent_response: 'long answer',
                },
            });
            expect(transcripts).toEqual([{ Role: 'assistant', Text: 'long answer', IsFinal: true }]);
        });

        it('surfaces client_tool_call with JSON-string arguments', () => {
            const { toolCalls } = collect(session);
            driver.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'get_weather', tool_call_id: 'call-1', parameters: { city: 'NYC' } },
            });
            expect(toolCalls).toEqual([{ CallID: 'call-1', ToolName: 'get_weather', Arguments: '{"city":"NYC"}' }]);
        });

        it('surfaces interruption (true barge-in) to the consumer', () => {
            const { interruptions } = collect(session);
            driver.Emit({ type: 'interruption', interruption_event: { event_id: 5 } });
            expect(interruptions).toHaveLength(1);
        });

        it("answers every ping with a pong echoing the ping's event_id", () => {
            driver.Emit({ type: 'ping', ping_event: { event_id: 42, ping_ms: 50 } });
            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'pong', event_id: 42 });
        });

        it('ignores vad_score and unknown frame types', () => {
            const { transcripts, errors } = collect(session);
            const framesBefore = driver.Socket.Sent.length;
            driver.Emit({ type: 'vad_score', vad_score_event: { vad_score: 0.93 } });
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

        it('streams client audio as bare-key user_audio_chunk frames', () => {
            const bytes = new Uint8Array([9, 8, 7]);
            session.SendInput(bytes.buffer);
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                user_audio_chunk: Buffer.from(bytes).toString('base64'),
            });
        });

        it('completes the tool round-trip: client_tool_call → client_tool_result with parsed JSON', async () => {
            driver.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'get_weather', tool_call_id: 'call-1', parameters: { city: 'NYC' } },
            });

            await session.SendToolResult('call-1', JSON.stringify({ tempF: 72 }));

            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'client_tool_result',
                tool_call_id: 'call-1',
                result: { tempF: 72 },
                is_error: false,
            });
        });

        it('passes non-JSON tool output through as a raw string', async () => {
            await session.SendToolResult('call-2', 'plain text outcome');
            expect(driver.Socket.SentFrames().at(-1)?.result).toBe('plain text outcome');
        });

        it('sends context notes as NATIVE contextual_update frames, immediately even mid-response', () => {
            driver.Emit({ type: 'audio', audio_event: { audio_base_64: 'AAAA', event_id: 1 } }); // response in flight
            session.SendContextNote?.('[delegated-agent progress] gathering data');
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'contextual_update',
                text: '[delegated-agent progress] gathering data',
            });
        });

        it('emulates RequestSpokenUpdate as a user_message when idle', () => {
            session.RequestSpokenUpdate?.('Say one short progress sentence.');
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'user_message',
                text: 'Say one short progress sentence.',
            });
        });

        it('QUEUES a spoken update behind an in-flight response and flushes on agent_response_complete', () => {
            driver.Emit({ type: 'audio', audio_event: { audio_base_64: 'AAAA', event_id: 1 } });
            const framesBefore = driver.Socket.Sent.length;

            session.RequestSpokenUpdate?.('working on it');
            expect(driver.Socket.Sent.length).toBe(framesBefore); // deferred — never barges in

            driver.Emit({ type: 'agent_response_complete' });
            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'user_message', text: 'working on it' });
        });

        it('releases the busy flag on a tool-call frame WITHOUT draining queued narration (deadlock guard)', async () => {
            driver.Emit({ type: 'audio', audio_event: { audio_base_64: 'AAAA', event_id: 1 } });
            session.RequestSpokenUpdate?.('narrate later'); // queued behind the response

            driver.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'get_weather', tool_call_id: 'c1', parameters: {} },
            });
            // the queued narration must NOT slip in between the tool call and its result
            expect(driver.Socket.SentFrames().filter((f) => f.type === 'user_message')).toHaveLength(0);

            // the tool result is never queued — the platform asked for it and blocks on it
            await session.SendToolResult('c1', '{"ok":true}');
            expect(driver.Socket.SentFrames().at(-1)?.type).toBe('client_tool_result');

            // the narration drains at the next real response boundary
            driver.Emit({ type: 'agent_response_complete' });
            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'user_message', text: 'narrate later' });
        });
    });

    describe('RegisterTools idempotency', () => {
        it('no-ops silently for a set identical (order-insensitively) to the connect-time set', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                const toolB: RealtimeToolDefinition = { Name: 'b_tool', Description: 'b', ParametersSchema: {} };
                const session = await startSession(driver, { Tools: [WEATHER_TOOL, toolB] });
                const framesBefore = driver.Socket.Sent.length;

                await session.RegisterTools([toolB, WEATHER_TOOL]);

                expect(warn).not.toHaveBeenCalled();
                expect(driver.Socket.Sent.length).toBe(framesBefore);
            } finally {
                warn.mockRestore();
            }
        });

        it('warns and does nothing for a DIFFERENT post-start set', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                const session = await startSession(driver, { Tools: [WEATHER_TOOL] });
                const framesBefore = driver.Socket.Sent.length;

                await session.RegisterTools([]);

                expect(warn).toHaveBeenCalledOnce();
                expect(driver.Socket.Sent.length).toBe(framesBefore);
            } finally {
                warn.mockRestore();
            }
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
                { Message: 'ElevenLabs conversation closed unexpectedly (code 4001 — token expired)', Fatal: true },
            ]);
        });

        it('stays silent when the close follows a consumer Close()', async () => {
            const session = await startSession(driver);
            const { errors } = collect(session);

            await session.Close();
            driver.LastConnectArgs?.OnClose(1000, 'bye');

            expect(errors).toEqual([]);
            expect(driver.Socket.Closed).toBe(true);
        });
    });
});

// ── Schema sanitization (ElevenLabs client-tool validator quirks) ──────────────
import { SanitizeToolParametersForElevenLabs } from '../elevenLabsRealtime';

describe('SanitizeToolParametersForElevenLabs', () => {
    const fontSizeSchema = {
        type: 'object',
        properties: {
            text: { type: 'string', description: 'The text.' },
            fontSize: { type: 'number', enum: [12, 14, 18, 24, 32], description: 'Optional size.' }
        },
        required: ['text']
    };

    it('strips numeric enums and appends the allowed values to the description', () => {
        const out = SanitizeToolParametersForElevenLabs(fontSizeSchema);
        const fontSize = (out['properties'] as Record<string, Record<string, unknown>>)['fontSize'];
        expect(fontSize['enum']).toBeUndefined();
        expect(fontSize['description']).toContain('Optional size.');
        expect(fontSize['description']).toContain('Allowed values: 12, 14, 18, 24, 32');
    });

    it('preserves STRING enums untouched', () => {
        const out = SanitizeToolParametersForElevenLabs({
            type: 'object',
            properties: { shape: { type: 'string', enum: ['rect', 'ellipse', 'diamond'] } }
        });
        const shape = (out['properties'] as Record<string, Record<string, unknown>>)['shape'];
        expect(shape['enum']).toEqual(['rect', 'ellipse', 'diamond']);
    });

    it('walks nested objects and array items', () => {
        const out = SanitizeToolParametersForElevenLabs({
            type: 'object',
            properties: {
                rows: { type: 'array', items: { type: 'object', properties: { size: { type: 'number', enum: [1, 2] } } } }
            }
        });
        const size = ((((out['properties'] as Record<string, Record<string, unknown>>)['rows']['items'] as Record<string, unknown>)['properties'] as Record<string, Record<string, unknown>>))['size'];
        expect(size['enum']).toBeUndefined();
        expect(size['description']).toContain('Allowed values: 1, 2');
    });

    it('never mutates the input and is idempotent', () => {
        const original = JSON.parse(JSON.stringify(fontSizeSchema));
        const once = SanitizeToolParametersForElevenLabs(fontSizeSchema);
        const twice = SanitizeToolParametersForElevenLabs(once);
        expect(fontSizeSchema).toEqual(original);
        expect(twice).toEqual(once);
    });

    it('MapToolToClientTool ships the SANITIZED schema to the agents API', () => {
        const mapped = ElevenLabsRealtime.MapToolToClientTool({
            Name: 'Whiteboard_AddText',
            Description: 'Add text',
            ParametersSchema: fontSizeSchema
        });
        const params = mapped.parameters as unknown as Record<string, Record<string, Record<string, unknown>>>;
        expect(params['properties']['fontSize']['enum']).toBeUndefined();
        expect(params['properties']['fontSize']['description']).toContain('Allowed values');
    });

    it('ToolSetFingerprint hashes the sanitized form (no PATCH-loop drift vs the remote)', () => {
        const raw = [{ Name: 'T', Description: 'd', ParametersSchema: fontSizeSchema }];
        const sanitized = [{ Name: 'T', Description: 'd', ParametersSchema: SanitizeToolParametersForElevenLabs(fontSizeSchema) }];
        expect(ElevenLabsRealtime.ToolSetFingerprint(raw)).toBe(ElevenLabsRealtime.ToolSetFingerprint(sanitized));
    });
});

describe('SanitizeToolParametersForElevenLabs — leaf descriptions', () => {
    it('synthesizes a description on typed nodes lacking one (the Highlight itemIds.items 422)', () => {
        const out = SanitizeToolParametersForElevenLabs({
            type: 'object',
            properties: {
                itemIds: { type: 'array', items: { type: 'string' }, description: 'IDs of items.' }
            }
        });
        const items = ((out['properties'] as Record<string, Record<string, unknown>>)['itemIds']['items']) as Record<string, unknown>;
        expect(items['description']).toBe('A string value.');
        // the parent already had one — untouched
        expect((out['properties'] as Record<string, Record<string, unknown>>)['itemIds']['description']).toBe('IDs of items.');
    });

    it('leaves nodes with any accepted marker untouched', () => {
        const out = SanitizeToolParametersForElevenLabs({
            type: 'object',
            properties: {
                a: { type: 'string', description: 'has one' },
                b: { type: 'number', constant_value: 5 }
            }
        });
        const props = out['properties'] as Record<string, Record<string, unknown>>;
        expect(props['a']['description']).toBe('has one');
        expect(props['b']['description']).toBeUndefined();
    });
});
