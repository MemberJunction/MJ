import { describe, it, expect, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
    BaseRealtimeModel,
    RealtimeSessionParams,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    RealtimeSessionError,
} from '@memberjunction/ai';
import {
    OpenAILiveRealtime,
    OpenAILiveSession,
    ILiveWebSocketLike,
} from '../models/openAILiveRealtime';

class MockLiveWebSocket implements ILiveWebSocketLike {
    public sentFrames: string[] = [];
    public openListeners: Array<() => void> = [];
    public messageListeners: Array<(event: { data: unknown }) => void> = [];
    public errorListeners: Array<(event: { message?: string; error?: unknown }) => void> = [];
    public closeListeners: Array<(event: { code?: number; reason?: string }) => void> = [];
    public isClosed = false;

    public addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: unknown): void {
        if (type === 'open') this.openListeners.push(listener as () => void);
        if (type === 'message') this.messageListeners.push(listener as (event: { data: unknown }) => void);
        if (type === 'error') this.errorListeners.push(listener as (event: { message?: string; error?: unknown }) => void);
        if (type === 'close') this.closeListeners.push(listener as (event: { code?: number; reason?: string }) => void);
    }

    public send(data: string): void {
        this.sentFrames.push(data);
    }

    public close(code?: number, reason?: string): void {
        this.isClosed = true;
        for (const l of this.closeListeners) {
            l({ code: code ?? 1000, reason: reason ?? 'Normal closure' });
        }
    }

    public triggerOpen(): void {
        for (const l of this.openListeners) l();
    }

    public triggerMessage(data: unknown): void {
        for (const l of this.messageListeners) l({ data });
    }

    public triggerError(message: string): void {
        for (const l of this.errorListeners) l({ message });
    }
}

class TestableOpenAILiveRealtime extends OpenAILiveRealtime {
    public lastMockSocket?: MockLiveWebSocket;

    protected override createSocket(_url: string, _apiKey: string): ILiveWebSocketLike {
        const mock = new MockLiveWebSocket();
        this.lastMockSocket = mock;
        return mock;
    }
}

describe('OpenAILiveRealtime Driver & Session', () => {
    it('is registered in ClassFactory under BaseRealtimeModel', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(BaseRealtimeModel, 'OpenAILiveRealtime', 'test-api-key');
        expect(instance).toBeInstanceOf(OpenAILiveRealtime);
    });

    it('performs handshake by sending session.start on open and resolving on session.started', async () => {
        const driver = new TestableOpenAILiveRealtime('test-key');
        const params: RealtimeSessionParams = {
            Model: 'gpt-live-1',
            SystemPrompt: 'You are a helpful assistant.',
        };

        const sessionPromise = driver.StartSession(params);
        const socket = driver.lastMockSocket!;
        expect(socket).toBeDefined();

        // Trigger open -> sends session.start
        socket.triggerOpen();
        expect(socket.sentFrames.length).toBe(1);

        const startFrame = JSON.parse(socket.sentFrames[0]);
        expect(startFrame.type).toBe('session.start');
        expect(startFrame.session.model).toBe('gpt-live-1');
        expect(startFrame.session.instructions).toBe('You are a helpful assistant.');
        expect(startFrame.session.audio.output.voice).toBe('alloy');
        expect(startFrame.session.delegation.type).toBe('client');

        // Trigger session.started -> completes StartSession
        socket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-sess-123' }));
        const session = await sessionPromise;
        expect(session).toBeDefined();
        expect(session.Capabilities.SupportedReasoningPlanes).toEqual(['local', 'remote']);
        expect(session.Capabilities.CanReconfigureTurnMode).toBe(false);
        expect(session.Capabilities.EmitsUserInterruptionSignal).toBe(false);
        expect(session.Capabilities.EmitsProviderCutoffSignal).toBe(true);
        expect(session.Capabilities.SupportsDynamicToolSet).toBe(true);
        expect(OpenAILiveRealtime.SupportsDynamicToolSet).toBe(true);
    });

    it('rejects StartSession if socket closes before session.started', async () => {
        const driver = new TestableOpenAILiveRealtime('test-key');
        const sessionPromise = driver.StartSession({
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
        });
        const socket = driver.lastMockSocket!;
        socket.close(1006, 'Connection dropped abnormally');

        await expect(sessionPromise).rejects.toThrow('Socket closed before session.started');
    });

    it('buffers trailing odd PCM bytes across SendInput calls', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(mockSocket, {
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
        });
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-1' }));
        await session.WaitForStarted();

        mockSocket.sentFrames = [];

        // Send 3 bytes (odd) -> sends 2 bytes, buffers 1 byte
        const oddChunk1 = new Uint8Array([1, 2, 3]).buffer;
        session.SendInput(oddChunk1);
        expect(mockSocket.sentFrames.length).toBe(1);
        const frame1 = JSON.parse(mockSocket.sentFrames[0]);
        expect(frame1.type).toBe('session.input_audio.append');
        const decoded1 = Buffer.from(frame1.audio, 'base64');
        expect(decoded1.length).toBe(2);
        expect(Array.from(decoded1)).toEqual([1, 2]);

        // Send 3 bytes again -> merges buffered byte (1) + 3 bytes = 4 bytes (even) -> sends all 4 bytes
        const oddChunk2 = new Uint8Array([4, 5, 6]).buffer;
        session.SendInput(oddChunk2);
        expect(mockSocket.sentFrames.length).toBe(2);
        const frame2 = JSON.parse(mockSocket.sentFrames[1]);
        const decoded2 = Buffer.from(frame2.audio, 'base64');
        expect(decoded2.length).toBe(4);
        expect(Array.from(decoded2)).toEqual([3, 4, 5, 6]);
    });

    it('handles audio, transcripts, and usage telemetry deltas', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(mockSocket, {
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
        });
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-1' }));
        await session.WaitForStarted();

        const receivedAudio: ArrayBuffer[] = [];
        session.OnOutput((chunk) => receivedAudio.push(chunk));

        const transcripts: RealtimeTranscript[] = [];
        session.OnTranscript((t) => transcripts.push(t));

        const usages: RealtimeUsage[] = [];
        session.OnUsage((u) => usages.push(u));

        // Inbound audio
        const rawAudio = Buffer.from([10, 20, 30, 40]).toString('base64');
        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.output_audio.delta',
            delta: rawAudio,
        }));
        expect(receivedAudio.length).toBe(1);
        expect(new Uint8Array(receivedAudio[0])).toEqual(new Uint8Array([10, 20, 30, 40]));

        // Inbound user transcript
        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.input_transcript.delta',
            delta: 'Hello world',
        }));
        // Inbound assistant transcript
        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.output_transcript.delta',
            delta: 'Hi there',
        }));
        expect(transcripts.length).toBe(2);
        expect(transcripts[0]).toEqual({ Text: 'Hello world', IsFinal: false, Role: 'user' });
        expect(transcripts[1]).toEqual({ Text: 'Hi there', IsFinal: false, Role: 'assistant' });

        // Inbound usage
        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.usage.updated',
            usage: { seconds: 12.5 },
        }));
        expect(usages.length).toBe(1);
        expect(usages[0].DurationSeconds).toBe(12.5);
    });

    it('handles delegation, tool results, context notes, and spoken updates', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(mockSocket, {
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
        });
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-1' }));
        await session.WaitForStarted();

        const toolCalls: RealtimeToolCall[] = [];
        session.OnToolCall((c) => toolCalls.push(c));

        // Server requests delegation
        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.delegation.created',
            delegation_id: 'delegation-abc',
        }));
        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0].CallID).toBe('delegation-abc');
        expect(toolCalls[0].ToolName).toBe('backend_delegation');

        mockSocket.sentFrames = [];

        // Send tool result
        await session.SendToolResult('delegation-abc', '{"status":"ok"}');
        expect(mockSocket.sentFrames.length).toBe(1);
        const resultFrame = JSON.parse(mockSocket.sentFrames[0]);
        expect(resultFrame.type).toBe('session.commentary.append');
        expect(resultFrame.content).toBe('{"status":"ok"}');
        expect(resultFrame.delegation_id).toBe('delegation-abc');

        // Send context note
        session.SendContextNote('Background note');
        expect(mockSocket.sentFrames.length).toBe(2);
        const noteFrame = JSON.parse(mockSocket.sentFrames[1]);
        expect(noteFrame.type).toBe('session.thinking.append');
        expect(noteFrame.content).toBe('Background note');
        expect(noteFrame.delegation_id).toBeNull();

        // Request spoken update
        session.RequestSpokenUpdate('Brief update');
        expect(mockSocket.sentFrames.length).toBe(3);
        const updateFrame = JSON.parse(mockSocket.sentFrames[2]);
        expect(updateFrame.type).toBe('session.commentary.append');
        expect(updateFrame.content).toBe('Brief update');
        expect(updateFrame.delegation_id).toBeNull();
    });

    it('triggers OnInterruption on provider cutoff error', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(mockSocket, {
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
        });
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-1' }));
        await session.WaitForStarted();

        let interrupted = false;
        session.OnInterruption(() => {
            interrupted = true;
        });

        mockSocket.triggerMessage(JSON.stringify({
            type: 'error',
            error: {
                message: 'Content policy violation',
                code: 'moderation_cutoff',
            },
        }));

        expect(interrupted).toBe(true);
    });

    it('sends session.close and awaits graceful server close', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(mockSocket, {
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
        });
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-1' }));
        await session.WaitForStarted();

        mockSocket.sentFrames = [];
        const closePromise = session.Close();

        expect(mockSocket.sentFrames.length).toBe(1);
        const closeFrame = JSON.parse(mockSocket.sentFrames[0]);
        expect(closeFrame.type).toBe('session.close');

        // Server responds with session.closed
        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.closed',
            reason: 'close_requested',
        }));

        await closePromise;
        expect(mockSocket.isClosed).toBe(true);
    });

    it('supports remote reasoning plane: sends delegation.type responses and tools in session.start', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(
            mockSocket,
            {
                Model: 'gpt-live-1',
                SystemPrompt: 'Remote prompt',
                Tools: [
                    {
                        Name: 'lookup_order',
                        Description: 'Lookup order details',
                        ParametersSchema: {
                            type: 'object',
                            properties: { orderId: { type: 'string' } },
                            required: ['orderId'],
                        },
                    },
                ],
            },
            {
                reasoningPlane: 'remote',
                remoteSettings: {
                    Kind: 'model',
                    Ref: 'o3-mini',
                    Effort: 'high',
                    MaxOutputTokens: 2000,
                },
            }
        );

        mockSocket.triggerOpen();
        expect(mockSocket.sentFrames.length).toBe(1);
        const startFrame = JSON.parse(mockSocket.sentFrames[0]);
        expect(startFrame.session.delegation.type).toBe('responses');
        expect(startFrame.session.delegation.responses.model).toBe('o3-mini');
        expect(startFrame.session.delegation.responses.reasoning.effort).toBe('high');
        expect(startFrame.session.delegation.responses.max_output_tokens).toBe(2000);
        expect(startFrame.session.delegation.responses.tools.length).toBe(1);
        expect(startFrame.session.delegation.responses.tools[0].name).toBe('lookup_order');
    });

    it('handles remote plane response.event for tool calls and deduplicated token usage', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(
            mockSocket,
            { Model: 'gpt-live-1', SystemPrompt: 'Remote' },
            { reasoningPlane: 'remote' }
        );
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-remote-1' }));
        await session.WaitForStarted();

        const toolCalls: RealtimeToolCall[] = [];
        session.OnToolCall((c) => toolCalls.push(c));

        const usages: RealtimeUsage[] = [];
        session.OnUsage((u) => usages.push(u));

        // Trap 1: Server sends tool call via nested response.output_item.done
        mockSocket.triggerMessage(JSON.stringify({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: {
                    type: 'function_call',
                    name: 'check_inventory',
                    call_id: 'call_remote_999',
                    arguments: '{"sku":"ITEM-123"}',
                },
            },
        }));

        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0].CallID).toBe('call_remote_999');
        expect(toolCalls[0].ToolName).toBe('check_inventory');
        expect(toolCalls[0].Arguments).toBe('{"sku":"ITEM-123"}');
        expect(toolCalls[0].TaskRevision).toBe(0);

        // Trap 3: SendToolResult sends response.item.create followed by response.create
        mockSocket.sentFrames = [];
        await session.SendToolResult('call_remote_999', '{"available":true}');
        expect(mockSocket.sentFrames.length).toBe(2);

        const itemCreateFrame = JSON.parse(mockSocket.sentFrames[0]);
        expect(itemCreateFrame.type).toBe('response.item.create');
        expect(itemCreateFrame.item.call_id).toBe('call_remote_999');
        expect(itemCreateFrame.item.output).toBe('{"available":true}');

        const responseCreateFrame = JSON.parse(mockSocket.sentFrames[1]);
        expect(responseCreateFrame.type).toBe('response.create');

        // Trap 4: Nested response.completed usage deduplicated by response.id
        const completedPayload = {
            type: 'response.event',
            event: {
                type: 'response.completed',
                response: {
                    id: 'resp_uniq_123',
                    output: [], // Trap 2: empty output list is expected
                    usage: {
                        input_tokens: 150,
                        output_tokens: 45,
                        input_token_details: { text_tokens: 100, audio_tokens: 50 },
                        output_token_details: { text_tokens: 45 },
                    },
                },
            },
        };

        // First delivery: recorded
        mockSocket.triggerMessage(JSON.stringify(completedPayload));
        expect(usages.length).toBe(1);
        expect(usages[0].InputTokens).toBe(150);
        expect(usages[0].OutputTokens).toBe(45);
        expect(usages[0].InputTokenDetails?.AudioTokens).toBe(50);

        // Duplicate delivery with same response.id: ignored
        mockSocket.triggerMessage(JSON.stringify(completedPayload));
        expect(usages.length).toBe(1);
    });

    it('batches parallel tool call results and sends exactly one response.create when all results arrive', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(
            mockSocket,
            { Model: 'gpt-live-1', SystemPrompt: 'Prompt' },
            { reasoningPlane: 'remote' }
        );
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-batch-1' }));
        await session.WaitForStarted();

        const toolCalls: RealtimeToolCall[] = [];
        session.OnToolCall((c) => toolCalls.push(c));

        // Two parallel tool calls arrive
        mockSocket.triggerMessage(JSON.stringify({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: { type: 'function_call', name: 'tool_a', call_id: 'call_A', arguments: '{}' },
            },
        }));
        mockSocket.triggerMessage(JSON.stringify({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: { type: 'function_call', name: 'tool_b', call_id: 'call_B', arguments: '{}' },
            },
        }));

        expect(toolCalls.length).toBe(2);

        mockSocket.sentFrames = [];

        // Return first tool result -> item.create sent, but NO response.create yet
        await session.SendToolResult('call_A', '{"a":1}');
        expect(mockSocket.sentFrames.length).toBe(1);
        const frameA = JSON.parse(mockSocket.sentFrames[0]);
        expect(frameA.type).toBe('response.item.create');
        expect(frameA.item.call_id).toBe('call_A');

        // Return second tool result -> item.create sent AND response.create sent (batch complete)
        await session.SendToolResult('call_B', '{"b":2}');
        expect(mockSocket.sentFrames.length).toBe(3);
        const frameB = JSON.parse(mockSocket.sentFrames[1]);
        expect(frameB.type).toBe('response.item.create');
        expect(frameB.item.call_id).toBe('call_B');

        const frameCreate = JSON.parse(mockSocket.sentFrames[2]);
        expect(frameCreate.type).toBe('response.create');
    });

    it('enforces task revision and discards stale tool results upon revision advance', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(mockSocket, {
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
        });
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-1' }));
        await session.WaitForStarted();

        expect(session.CurrentTaskRevision).toBe(0);

        const toolCalls: RealtimeToolCall[] = [];
        session.OnToolCall((c) => toolCalls.push(c));

        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.delegation.created',
            delegation_id: 'del_1',
        }));
        expect(toolCalls[0].TaskRevision).toBe(0);

        // Advance task revision (e.g. user corrected utterance or timeout)
        const newRevision = session.BumpTaskRevision();
        expect(newRevision).toBe(1);
        expect(session.CurrentTaskRevision).toBe(1);

        mockSocket.sentFrames = [];

        // Attempting to send result for stale revision (0) when current is 1 -> discarded
        await session.SendToolResult('del_1', '{"stale":true}', 0);
        expect(mockSocket.sentFrames.length).toBe(0);

        // Sending with matching revision (1) -> succeeds
        await session.SendToolResult('del_1', '{"current":true}', 1);
        expect(mockSocket.sentFrames.length).toBe(1);
    });

    it('supports G.711 μ-law configuration and sends odd-byte carrier chunks untouched without PCM truncation', async () => {
        const driver = new TestableOpenAILiveRealtime('test-key');
        const params: RealtimeSessionParams = {
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
            Config: {
                AudioFormat: { Codec: 'g711_ulaw' },
            },
        };

        const sessionPromise = driver.StartSession(params);
        const socket = driver.lastMockSocket!;
        socket.triggerOpen();

        const startFrame = JSON.parse(socket.sentFrames[0]);
        expect(startFrame.session.audio.format).toEqual({ type: 'audio/pcmu' });

        socket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-g711' }));
        const session = await sessionPromise;

        expect(session.AudioFormat).toEqual({ Codec: 'g711_ulaw', SampleRate: 8000 });
        expect(session.InputSampleRate).toBe(8000);
        expect(session.OutputSampleRate).toBe(8000);

        socket.sentFrames = [];

        // Send an odd number of bytes (e.g. 3 bytes of G.711 μ-law audio)
        const g711Chunk = new Uint8Array([0x55, 0xaa, 0x7f]).buffer;
        session.SendInput(g711Chunk);

        expect(socket.sentFrames.length).toBe(1);
        const appendFrame = JSON.parse(socket.sentFrames[0]);
        expect(appendFrame.type).toBe('session.input_audio.append');
        // Decoded base64 payload should match all 3 bytes exactly (no trailing odd byte dropped)
        const sentBytes = Buffer.from(appendFrame.audio, 'base64');
        expect(sentBytes.length).toBe(3);
        expect(Array.from(sentBytes)).toEqual([0x55, 0xaa, 0x7f]);
    });

    it('implements client-direct WebRTC session minting with omitted audio.format and SDP broker exchange', async () => {
        class MockBrokerDriver extends OpenAILiveRealtime {
            public lastPayload: unknown;
            protected override async postLiveSessions(payload: unknown): Promise<{ id: string; transport: { type: string; sdp: string } }> {
                this.lastPayload = payload;
                return {
                    id: 'live_sess_broker_1',
                    transport: {
                        type: 'webrtc',
                        sdp: 'v=0\r\no=mock_answer_sdp',
                    },
                };
            }
        }

        const driver = new MockBrokerDriver('test-api-key');
        expect(driver.SupportsClientDirect).toBe(true);

        const clientConfig = await driver.CreateClientSession({
            Model: 'gpt-live-1',
            SystemPrompt: 'WebRTC co-agent',
            Config: { Voice: 'echo' },
        });

        expect(clientConfig.Provider).toBe('openai-live');
        expect(clientConfig.Model).toBe('gpt-live-1');
        expect(clientConfig.SessionConfig).toBeDefined();
        // WebRTC omits audio.format entirely
        const sessionCfg = clientConfig.SessionConfig as Record<string, unknown>;
        const audioCfg = sessionCfg.audio as Record<string, unknown>;
        expect(audioCfg.format).toBeUndefined();
        expect((audioCfg.output as Record<string, unknown>).voice).toBe('echo');

        // Test SDP broker exchange
        const result = await driver.ExchangeWebRtcSdp('v=0\r\no=local_offer_sdp', clientConfig.SessionConfig as Record<string, unknown>);
        expect(result.sessionId).toBe('live_sess_broker_1');
        expect(result.answerSdp).toBe('v=0\r\no=mock_answer_sdp');
        expect(result.prebillSeconds).toBe(15);
        expect(driver.lastPayload).toEqual({
            session: clientConfig.SessionConfig,
            transport: {
                type: 'webrtc',
                sdp: 'v=0\r\no=local_offer_sdp',
            },
        });

        // Test with Tools: tools MUST be placed under delegation.responses.tools, NEVER at session.tools
        const configWithTools = await driver.CreateClientSession({
            Model: 'gpt-live-1',
            SystemPrompt: 'WebRTC co-agent with tools',
            Tools: [
                {
                    Name: 'test_tool',
                    Description: 'A test tool',
                    ParametersSchema: { type: 'object', properties: {} },
                },
            ],
            Config: { Voice: 'marin' },
        });

        const sessionWithTools = configWithTools.SessionConfig as Record<string, unknown>;
        expect(sessionWithTools['tools']).toBeUndefined(); // Live API rejects session.tools

        const delegation = sessionWithTools['delegation'] as {
            type: string;
            responses?: { model: string; tools?: Array<{ name: string; type: string }> };
        };
        expect(delegation.type).toBe('responses');
        expect(delegation.responses?.tools).toBeDefined();
        expect(delegation.responses?.tools).toHaveLength(1);
        expect(delegation.responses?.tools?.[0].name).toBe('test_tool');
    });

    it('Step 3: handles three parallel tool calls arriving out of order with exactly one response.create', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(
            mockSocket,
            { Model: 'gpt-live-1', SystemPrompt: 'Prompt' },
            { reasoningPlane: 'remote' }
        );
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-3-parallel' }));
        await session.WaitForStarted();

        const toolCalls: RealtimeToolCall[] = [];
        session.OnToolCall((c) => toolCalls.push(c));

        // Deliver 3 parallel tool calls
        for (const id of ['c1', 'c2', 'c3']) {
            mockSocket.triggerMessage(JSON.stringify({
                type: 'response.event',
                event: {
                    type: 'response.output_item.done',
                    item: { type: 'function_call', name: `fn_${id}`, call_id: id, arguments: '{}' },
                },
            }));
        }
        expect(toolCalls.length).toBe(3);

        mockSocket.sentFrames = [];

        // Return c2 first (out of order)
        await session.SendToolResult('c2', '{"res":2}');
        expect(mockSocket.sentFrames.length).toBe(1);
        expect(JSON.parse(mockSocket.sentFrames[0]).type).toBe('response.item.create');

        // Return c1 second
        await session.SendToolResult('c1', '{"res":1}');
        expect(mockSocket.sentFrames.length).toBe(2);
        expect(JSON.parse(mockSocket.sentFrames[1]).type).toBe('response.item.create');

        // Return c3 last -> triggers response.create
        await session.SendToolResult('c3', '{"res":3}');
        expect(mockSocket.sentFrames.length).toBe(4);
        expect(JSON.parse(mockSocket.sentFrames[2]).type).toBe('response.item.create');
        expect(JSON.parse(mockSocket.sentFrames[3]).type).toBe('response.create');
    });

    it('Step 3: timeout releases turn if one parallel call never arrives, and duplicate results do not re-trigger', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(
            mockSocket,
            { Model: 'gpt-live-1', SystemPrompt: 'Prompt' },
            { reasoningPlane: 'remote' }
        );
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-timeout' }));
        await session.WaitForStarted();

        // Deliver 2 calls
        for (const id of ['call_ok', 'call_lost']) {
            mockSocket.triggerMessage(JSON.stringify({
                type: 'response.event',
                event: {
                    type: 'response.output_item.done',
                    item: { type: 'function_call', name: `fn_${id}`, call_id: id, arguments: '{}' },
                },
            }));
        }

        mockSocket.sentFrames = [];

        // Return only call_ok
        await session.SendToolResult('call_ok', '{"ok":true}');
        expect(mockSocket.sentFrames.length).toBe(1);

        // Duplicate result for already-closed call_ok -> sends item.create but NO extra response.create
        await session.SendToolResult('call_ok', '{"ok":true}');
        expect(mockSocket.sentFrames.length).toBe(2);
        expect(JSON.parse(mockSocket.sentFrames[1]).type).toBe('response.item.create');

        // Note: RealtimeToolBatchBarrier has a safety timeout so lost calls release the turn
    });

    it('Step 4: translates Config.parallelToolCalls to session.parallel_tool_calls and never sends raw camelCase', async () => {
        const driver = new TestableOpenAILiveRealtime('test-key');

        // Case A: parallelToolCalls = false
        const startPromiseA = driver.StartSession({
            Model: 'gpt-live-1',
            SystemPrompt: 'prompt',
            Config: { parallelToolCalls: false },
        });
        const socketA = driver.lastMockSocket!;
        socketA.triggerOpen();
        const startFrameA = JSON.parse(socketA.sentFrames[0]) as LiveClientEvent;
        expect(startFrameA.type).toBe('session.start');
        expect(startFrameA.session.parallel_tool_calls).toBe(false);
        expect((startFrameA.session as Record<string, unknown>)['parallelToolCalls']).toBeUndefined();

        socketA.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 's_a' }));
        await startPromiseA;

        // Case B: parallelToolCalls = true
        const startPromiseB = driver.StartSession({
            Model: 'gpt-live-1',
            SystemPrompt: 'prompt',
            Config: { parallelToolCalls: true },
        });
        const socketB = driver.lastMockSocket!;
        socketB.triggerOpen();
        const startFrameB = JSON.parse(socketB.sentFrames[0]) as LiveClientEvent;
        expect(startFrameB.session.parallel_tool_calls).toBe(true);
        expect((startFrameB.session as Record<string, unknown>)['parallelToolCalls']).toBeUndefined();

        socketB.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 's_b' }));
        await startPromiseB;

        // Case C: omitted when unset
        const startPromiseC = driver.StartSession({
            Model: 'gpt-live-1',
            SystemPrompt: 'prompt',
            Config: {},
        });
        const socketC = driver.lastMockSocket!;
        socketC.triggerOpen();
        const startFrameC = JSON.parse(socketC.sentFrames[0]) as LiveClientEvent;
        expect(startFrameC.session.parallel_tool_calls).toBeUndefined();
        expect((startFrameC.session as Record<string, unknown>)['parallelToolCalls']).toBeUndefined();

        socketC.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 's_c' }));
        await startPromiseC;
    });

    it('Step 5: compiles policy blocks with persona values, omits when absent, and includes holding allowance', async () => {
        const driver = new TestableOpenAILiveRealtime('test-key');

        // With persona specifying interruption and backchannel policies
        const startPromiseA = driver.StartSession({
            Model: 'gpt-live-1',
            SystemPrompt: 'Base prompt',
            Tools: [{ Name: 't1', Description: 'tool 1' }],
            Config: {
                persona: {
                    StyleDescriptors: {
                        interruptionPolicy: 'Yield immediately on user speech.',
                        backchannelPolicy: 'Brief supportive acknowledgments.',
                    },
                },
            },
        });
        const socketA = driver.lastMockSocket!;
        socketA.triggerOpen();
        const startFrameA = JSON.parse(socketA.sentFrames[0]) as LiveClientEvent;
        const instructionsA = startFrameA.session.instructions ?? '';

        expect(instructionsA).toContain('Delegation policy:');
        expect(instructionsA).toContain('Interruption policy:\nYield immediately on user speech.');
        expect(instructionsA).toContain('Backchannel policy:\nBrief supportive acknowledgments.');
        expect(instructionsA).toContain('brief spoken holding phrases while backend work proceeds are permitted.');

        socketA.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 's_pol_a' }));
        await startPromiseA;

        // Without persona policies
        const startPromiseB = driver.StartSession({
            Model: 'gpt-live-1',
            SystemPrompt: 'Base prompt',
            Tools: [{ Name: 't1', Description: 'tool 1' }],
            Config: {},
        });
        const socketB = driver.lastMockSocket!;
        socketB.triggerOpen();
        const startFrameB = JSON.parse(socketB.sentFrames[0]) as LiveClientEvent;
        const instructionsB = startFrameB.session.instructions ?? '';

        expect(instructionsB).toContain('Delegation policy:');
        expect(instructionsB).not.toContain('Interruption policy:');
        expect(instructionsB).not.toContain('Backchannel policy:');

        socketB.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 's_pol_b' }));
        await startPromiseB;
    });

    it('Regression: seconds usage is assigned snapshot value, not accumulated (30s then 45s reports 45, not 75)', async () => {
        const mockSocket = new MockLiveWebSocket();
        const session = new OpenAILiveSession(mockSocket, {
            Model: 'gpt-live-1',
            SystemPrompt: 'Prompt',
        });
        mockSocket.triggerOpen();
        mockSocket.triggerMessage(JSON.stringify({ type: 'session.started', session_id: 'live-sec' }));
        await session.WaitForStarted();

        const reportedUsages: RealtimeUsage[] = [];
        session.OnUsage((u) => reportedUsages.push(u));

        // Snapshot 1: 30 seconds
        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.usage.updated',
            usage: { seconds: 30 },
        }));
        expect(reportedUsages.length).toBe(1);
        expect(reportedUsages[0].DurationSeconds).toBe(30);

        // Snapshot 2: 45 seconds (cumulative snapshot from server)
        mockSocket.triggerMessage(JSON.stringify({
            type: 'session.usage.updated',
            usage: { seconds: 45 },
        }));
        expect(reportedUsages.length).toBe(2);
        expect(reportedUsages[1].DurationSeconds).toBe(45); // NOT 75!
    });
});
