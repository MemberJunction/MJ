import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import {
    IRealtimeAudioSink,
    IRealtimeDataChannel,
    IRealtimePeerConnection,
    OpenAIRealtimeClient,
} from '../drivers/openAIRealtimeClient';
import { IOpenAIProtocolClientSocket, PENDING_USER_UTTERANCE_MAX_AGE_MS } from '../generic/openAIProtocolClient';
import { xAIRealtimeClient } from '../drivers/xaiRealtimeClient';
import {
    ElevenLabsRealtimeClient,
    IElevenLabsClientSocket,
} from '../drivers/elevenLabsRealtimeClient';
import {
    AssemblyAIRealtimeClient,
    IAssemblyAIClientSocket,
} from '../drivers/assemblyAIRealtimeClient';
import { HuggingFaceRealtimeClient } from '../drivers/huggingFaceRealtimeClient';
import { IRealtimeLivePeerConnection, OpenAILiveClient } from '../drivers/openAILiveClient';
import { FakeMediaStream, FakeMicCapture, FakeRtpSender, FakeTrack } from './helpers/realtime-fakes';

// ── Shared fakes ───────────────────────────────────────────────────────────────

class FakeDataChannel implements IRealtimeDataChannel {
    public readyState: RTCDataChannelState = 'connecting';
    public onopen: ((event: Event) => void) | null = null;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onclose: ((event: Event) => void) | null = null;
    public Sent: string[] = [];

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.readyState = 'closed';
    }
    public Open(): void {
        this.readyState = 'open';
        this.onopen?.(new Event('open'));
    }
    public EmitServer(event: object): void {
        this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
    }
    public SentEvents(): Array<{ type: string } & Record<string, unknown>> {
        return this.Sent.map((s) => JSON.parse(s) as { type: string } & Record<string, unknown>);
    }
}

class FakePeerConnection implements IRealtimePeerConnection {
    public ontrack: ((event: RTCTrackEvent) => void) | null = null;
    public connectionState: RTCPeerConnectionState = 'new';
    public onconnectionstatechange: ((event: Event) => void) | null = null;
    public Channel = new FakeDataChannel();
    public Closed = false;

    public addTrack(track: MediaStreamTrack, _stream: MediaStream): FakeRtpSender {
        return new FakeRtpSender(track);
    }
    public createDataChannel(_label: string): IRealtimeDataChannel {
        return this.Channel;
    }
    public async createOffer(): Promise<RTCSessionDescriptionInit> {
        return { type: 'offer', sdp: 'FAKE_OFFER_SDP' };
    }
    public async setLocalDescription(_description: RTCSessionDescriptionInit): Promise<void> {}
    public async setRemoteDescription(_description: RTCSessionDescriptionInit): Promise<void> {}
    public close(): void {
        this.Closed = true;
    }
}

class FakeAudioSink implements IRealtimeAudioSink {
    public srcObject: MediaProvider | null = null;
    public remove(): void {}
}

class FakePlayback implements IRealtimePcmPlayback {
    public IsPlaying = false;
    public GetOutputStream(): MediaStream | null {
        return null;
    }
    public Enqueue(_pcm16: ArrayBuffer): void {}
    public Flush(): void {
        this.IsPlaying = false;
    }
    public Close(): void {
        this.IsPlaying = false;
    }
}

class FakeProtocolSocket implements IOpenAIProtocolClientSocket {
    public onopen: (() => void) | null = null;
    public onmessage: ((data: string) => void) | null = null;
    public onerror: ((message: string) => void) | null = null;
    public onclose: ((code?: number, reason?: string) => void) | null = null;
    public Sent: string[] = [];
    public Closed = false;

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.Closed = true;
    }
    public SentEvents(): Array<{ type: string } & Record<string, unknown>> {
        return this.Sent.map((s) => JSON.parse(s) as { type: string } & Record<string, unknown>);
    }
}

class FakeSimpleSocket implements IElevenLabsClientSocket, IAssemblyAIClientSocket {
    public onopen: (() => void) | null = null;
    public onmessage: ((data: string) => void) | null = null;
    public onerror: ((message: string) => void) | null = null;
    public onclose: (() => void) | null = null;
    public Sent: string[] = [];
    public Closed = false;

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.Closed = true;
    }
    public SentFrames(): Array<Record<string, unknown>> {
        return this.Sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    }
}

describe('Slice 5 — Client driver long-call reconnects and history seeding', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('OpenAIRealtimeClient reconnects WebRTC before ConnectionMaxSeconds expiry, refreshes token, and seeds conversation.item.create turns', async () => {
        class ReconnectableOpenAIClient extends OpenAIRealtimeClient {
            public PeerConnections: FakePeerConnection[] = [];
            public SdpTokens: string[] = [];
            protected override createPeerConnection(): IRealtimePeerConnection {
                const pc = new FakePeerConnection();
                this.PeerConnections.push(pc);
                queueMicrotask(() => pc.Channel.Open());
                return pc;
            }
            protected override createAudioSink(): IRealtimeAudioSink {
                return new FakeAudioSink();
            }
            protected override async postSdpOffer(_offerSdp: string, ephemeralToken: string): Promise<string> {
                this.SdpTokens.push(ephemeralToken);
                return 'FAKE_ANSWER_SDP';
            }
        }

        const client = new ReconnectableOpenAIClient();
        const refreshMock = vi.fn().mockResolvedValue({
            EphemeralToken: 'tok-openai-2',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: {
                type: 'realtime',
                instructions: 'System prompt',
                connectionMaxSeconds: 120,
                reconnectBufferSeconds: 10,
            },
        });
        client.SetTokenRefreshCallback(refreshMock);

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'openai',
                Model: 'gpt-realtime-2.1',
                EphemeralToken: 'tok-openai-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 120,
                ReconnectBufferSeconds: 10,
                SessionConfig: {
                    type: 'realtime',
                    instructions: 'System prompt',
                },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        expect(client.PeerConnections).toHaveLength(1);
        expect(client.SdpTokens).toEqual(['tok-openai-1']);

        // Emit user + assistant turns on the first data channel
        client.PeerConnections[0].Channel.EmitServer({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: 'u_1',
            transcript: 'Check invoice 77.',
        });
        client.PeerConnections[0].Channel.EmitServer({
            type: 'response.output_audio_transcript.done',
            item_id: 'a_1',
            transcript: 'Invoice 77 is paid.',
        });

        // Advance into the soft reconnect window
        await vi.advanceTimersByTimeAsync(95_000);

        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(client.PeerConnections).toHaveLength(2);
        expect(client.PeerConnections[0].Closed).toBe(true);
        expect(client.SdpTokens).toEqual(['tok-openai-1', 'tok-openai-2']);

        const secondEvents = client.PeerConnections[1].Channel.SentEvents();
        expect(secondEvents[0]?.type).toBe('session.update');
        const seeded = secondEvents.filter((e) => e.type === 'conversation.item.create');
        expect(seeded.length).toBeGreaterThanOrEqual(2);
        const seededJson = JSON.stringify(seeded);
        expect(seededJson).toContain('Check invoice 77.');
        expect(seededJson).toContain('Invoice 77 is paid.');

        await client.Disconnect();
    });

    it('xAIRealtimeClient reconnects WebSocket before ConnectionMaxSeconds expiry, refreshes token, and seeds conversation.item.create turns', async () => {
        class ReconnectableXAIClient extends xAIRealtimeClient {
            public Sockets: FakeProtocolSocket[] = [];
            public Tokens: string[] = [];
            protected override createSocket(_url: string, ephemeralToken: string): IOpenAIProtocolClientSocket {
                this.Tokens.push(ephemeralToken);
                const sock = new FakeProtocolSocket();
                this.Sockets.push(sock);
                queueMicrotask(() => sock.onopen?.());
                return sock;
            }
            protected override async createMicCapture(
                _micStream: MediaStream,
                _sampleRate: number,
                _onPcmChunk: (base64Pcm16: string) => void
            ): Promise<IPcmMicCapture> {
                return new FakeMicCapture();
            }
            protected override createPlayback(_sampleRate: number): IRealtimePcmPlayback {
                return new FakePlayback();
            }
        }

        const client = new ReconnectableXAIClient();
        const refreshMock = vi.fn().mockResolvedValue({
            EphemeralToken: 'tok-xai-2',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: {
                instructions: 'Grok prompt',
                connectionMaxSeconds: 120,
                reconnectBufferSeconds: 10,
            },
        });
        client.SetTokenRefreshCallback(refreshMock);

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'xai',
                Model: 'grok-2-realtime',
                EphemeralToken: 'tok-xai-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 120,
                ReconnectBufferSeconds: 10,
                SessionConfig: { instructions: 'Grok prompt' },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        expect(client.Sockets).toHaveLength(1);
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'conversation.item.input_audio_transcription.completed',
                item_id: 'u_x1',
                transcript: 'Hello Grok.',
            })
        );
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'response.output_audio_transcript.done',
                item_id: 'a_x1',
                transcript: 'Hello human.',
            })
        );

        await vi.advanceTimersByTimeAsync(95_000);

        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(client.Sockets).toHaveLength(2);
        expect(client.Sockets[0].Closed).toBe(true);
        expect(client.Tokens).toEqual(['xai-client-secret.tok-xai-1', 'xai-client-secret.tok-xai-2']);

        const secondEvents = client.Sockets[1].SentEvents();
        expect(secondEvents[0]?.type).toBe('session.update');
        const seeded = secondEvents.filter((e) => e.type === 'conversation.item.create');
        expect(seeded.length).toBeGreaterThanOrEqual(2);
        expect(JSON.stringify(seeded)).toContain('Hello Grok.');
        expect(JSON.stringify(seeded)).toContain('Hello human.');

        await client.Disconnect();
    });

    it('ElevenLabsRealtimeClient reconnects before ConnectionMaxSeconds expiry and seeds history via contextual_update', async () => {
        class ReconnectableElevenLabsClient extends ElevenLabsRealtimeClient {
            public Sockets: FakeSimpleSocket[] = [];
            public SignedUrls: string[] = [];
            protected override createSocket(signedUrl: string): IElevenLabsClientSocket {
                this.SignedUrls.push(signedUrl);
                const sock = new FakeSimpleSocket();
                this.Sockets.push(sock);
                queueMicrotask(() => {
                    sock.onopen?.();
                    queueMicrotask(() => {
                        sock.onmessage?.(
                            JSON.stringify({
                                type: 'conversation_initiation_metadata',
                                conversation_initiation_metadata_event: {
                                    conversation_id: `conv_${this.Sockets.length}`,
                                    agent_output_audio_format: 'pcm_16000',
                                    user_input_audio_format: 'pcm_16000',
                                },
                            })
                        );
                    });
                });
                return sock;
            }
            protected override async createMicCapture(): Promise<IPcmMicCapture> {
                return new FakeMicCapture();
            }
            protected override createPlayback(): IRealtimePcmPlayback {
                return new FakePlayback();
            }
        }

        const client = new ReconnectableElevenLabsClient();
        const refreshMock = vi.fn().mockResolvedValue({
            EphemeralToken: 'wss://eleven.example/v1?token=2',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: {
                overrides: { agent: { prompt: { prompt: 'Eleven prompt' } } },
                connectionMaxSeconds: 120,
                reconnectBufferSeconds: 10,
            } satisfies JSONObject,
        });
        client.SetTokenRefreshCallback(refreshMock);

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'elevenlabs',
                Model: 'eleven_convai',
                EphemeralToken: 'wss://eleven.example/v1?token=1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 120,
                ReconnectBufferSeconds: 10,
                SessionConfig: {
                    overrides: { agent: { prompt: { prompt: 'Eleven prompt' } } },
                },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        expect(client.Sockets).toHaveLength(1);
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'user_transcript',
                user_transcription_event: { user_transcript: 'My code is 5511.' },
            })
        );
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'agent_response',
                agent_response_event: { agent_response: 'Confirmed 5511.' },
            })
        );
        client.Sockets[0].onmessage?.(JSON.stringify({ type: 'agent_response_complete' }));

        await vi.advanceTimersByTimeAsync(95_000);

        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(client.Sockets).toHaveLength(2);
        expect(client.SignedUrls).toEqual(['wss://eleven.example/v1?token=1', 'wss://eleven.example/v1?token=2']);

        const secondFrames = client.Sockets[1].SentFrames();
        expect(secondFrames[0]?.['type']).toBe('conversation_initiation_client_data');
        const updates = secondFrames.filter((f) => f['type'] === 'contextual_update');
        expect(updates.length).toBeGreaterThanOrEqual(1);
        expect(String(updates[0]?.['text'])).toContain('My code is 5511.');
        expect(String(updates[0]?.['text'])).toContain('Confirmed 5511.');

        await client.Disconnect();
    });

    it('AssemblyAIRealtimeClient reconnects before ConnectionMaxSeconds expiry and folds history seed into system_prompt on session.update', async () => {
        class ReconnectableAssemblyAIClient extends AssemblyAIRealtimeClient {
            public Sockets: FakeSimpleSocket[] = [];
            public Urls: string[] = [];
            protected override createSocket(url: string): IAssemblyAIClientSocket {
                this.Urls.push(url);
                const sock = new FakeSimpleSocket();
                this.Sockets.push(sock);
                queueMicrotask(() => {
                    sock.onopen?.();
                    queueMicrotask(() => {
                        sock.onmessage?.(
                            JSON.stringify({
                                type: 'session.ready',
                                session_id: `sess_${this.Sockets.length}`,
                            })
                        );
                    });
                });
                return sock;
            }
            protected override async createMicCapture(): Promise<IPcmMicCapture> {
                return new FakeMicCapture();
            }
            protected override createPlayback(): IRealtimePcmPlayback {
                return new FakePlayback();
            }
        }

        const client = new ReconnectableAssemblyAIClient();
        const refreshMock = vi.fn().mockResolvedValue({
            EphemeralToken: 'aai-tok-2',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: {
                session: { system_prompt: 'Base AssemblyAI prompt' },
                connectionMaxSeconds: 120,
                reconnectBufferSeconds: 10,
            } satisfies JSONObject,
        });
        client.SetTokenRefreshCallback(refreshMock);

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const config: ClientRealtimeSessionConfig = {
            Provider: 'assemblyai',
            Model: 'assemblyai-voice-agent',
            EphemeralToken: 'aai-tok-1',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            ConnectionMaxSeconds: 120,
            ReconnectBufferSeconds: 10,
            SessionConfig: {
                session: { system_prompt: 'Base AssemblyAI prompt' },
            },
        };
        const connectPromise = client.Connect(config, mic);
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        expect(client.Sockets).toHaveLength(1);
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'transcript.user',
                text: 'Schedule meeting at 3pm.',
            })
        );
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'transcript.agent',
                text: 'Meeting scheduled for 3pm.',
            })
        );
        client.Sockets[0].onmessage?.(JSON.stringify({ type: 'reply.done' }));

        await vi.advanceTimersByTimeAsync(95_000);

        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(client.Sockets).toHaveLength(2);
        expect(client.Urls[1]).toContain('token=aai-tok-2');

        const secondFrames = client.Sockets[1].SentFrames();
        expect(secondFrames[0]?.['type']).toBe('session.update');
        const sessionObj = secondFrames[0]?.['session'] as Record<string, unknown>;
        expect(String(sessionObj?.['system_prompt'])).toContain('Base AssemblyAI prompt');
        expect(String(sessionObj?.['system_prompt'])).toContain('Schedule meeting at 3pm.');
        expect(String(sessionObj?.['system_prompt'])).toContain('Meeting scheduled for 3pm.');

        await client.Disconnect();
    });

    it('xAIRealtimeClient uses native ?conversation_id=<id> resumption without seeding turns when TrustNativeResumption is true and conversation.created provided an id', async () => {
        class NativeResumeXAIClient extends xAIRealtimeClient {
            public Sockets: FakeProtocolSocket[] = [];
            public Urls: string[] = [];
            protected override createSocket(url: string, _ephemeralToken: string): IOpenAIProtocolClientSocket {
                this.Urls.push(url);
                const sock = new FakeProtocolSocket();
                this.Sockets.push(sock);
                queueMicrotask(() => sock.onopen?.());
                return sock;
            }
            protected override async createMicCapture(): Promise<IPcmMicCapture> {
                return new FakeMicCapture();
            }
            protected override createPlayback(): IRealtimePcmPlayback {
                return new FakePlayback();
            }
        }

        const client = new NativeResumeXAIClient();
        client.SetTokenRefreshCallback(async () => ({
            EphemeralToken: 'tok-xai-native-2',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: {
                instructions: 'Grok native prompt',
                connectionMaxSeconds: 120,
                reconnectBufferSeconds: 10,
                trustNativeResumption: true,
            },
        }));

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'xai',
                Model: 'grok-2-realtime',
                EphemeralToken: 'tok-xai-native-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 120,
                ReconnectBufferSeconds: 10,
                TrustNativeResumption: true,
                SessionConfig: { instructions: 'Grok native prompt' },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'conversation.created',
                conversation: { id: 'conv_xai_9000' },
            })
        );
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'conversation.item.input_audio_transcription.completed',
                item_id: 'u_1',
                transcript: 'Remember secret falcon.',
            })
        );

        await vi.advanceTimersByTimeAsync(95_000);

        expect(client.Sockets).toHaveLength(2);
        expect(client.Urls[1]).toContain('conversation_id=conv_xai_9000');
        const secondEvents = client.Sockets[1].SentEvents();
        expect(secondEvents.filter((e) => e.type === 'conversation.item.create')).toHaveLength(0);

        await client.Disconnect();
    });

    it('delivers a straddling tool call result on Connection 2 as a user message + response.create when a hard reconnect occurs mid-tool', async () => {
        class StraddlingToolOpenAIClient extends OpenAIRealtimeClient {
            public PeerConnections: FakePeerConnection[] = [];
            protected override createPeerConnection(): IRealtimePeerConnection {
                const pc = new FakePeerConnection();
                this.PeerConnections.push(pc);
                queueMicrotask(() => pc.Channel.Open());
                return pc;
            }
            protected override createAudioSink(): IRealtimeAudioSink {
                return new FakeAudioSink();
            }
            protected override async postSdpOffer(): Promise<string> {
                return 'FAKE_ANSWER_SDP';
            }
        }

        const client = new StraddlingToolOpenAIClient();
        let leg = 1;
        client.SetTokenRefreshCallback(async () => ({
            EphemeralToken: `tok-leg-${++leg}`,
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: {
                type: 'realtime',
                instructions: 'System prompt',
                connectionMaxSeconds: 120,
                reconnectBufferSeconds: 10,
            },
        }));

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'openai',
                Model: 'gpt-realtime-2.1',
                EphemeralToken: 'tok-leg-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 120,
                ReconnectBufferSeconds: 10,
                SessionConfig: {
                    type: 'realtime',
                    instructions: 'System prompt',
                },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        // Advance to just before the hard deadline (110s - 1s = 109s) and fire a tool call
        await vi.advanceTimersByTimeAsync(90_000);
        client.PeerConnections[0].Channel.EmitServer({
            type: 'response.function_call_arguments.done',
            call_id: 'call_straddle_1',
            name: 'lookup_account',
            arguments: '{"id":42}',
        });
        client.PeerConnections[0].Channel.EmitServer({
            type: 'response.done',
            response: { id: 'r1', status: 'completed' },
        });

        // Advance past the hard deadline (110s total) while the tool is still executing
        await vi.advanceTimersByTimeAsync(25_000);
        expect(client.PeerConnections).toHaveLength(2);

        // Now complete the tool call on Connection 2
        client.SendToolResult('call_straddle_1', '{"balance":1250}');

        const conn2Events = client.PeerConnections[1].Channel.SentEvents();
        const userResultItems = conn2Events.filter(
            (e) =>
                e.type === 'conversation.item.create' &&
                JSON.stringify(e).includes('lookup_account') &&
                JSON.stringify(e).includes('1250')
        );
        expect(userResultItems.length).toBeGreaterThanOrEqual(1);
        expect(conn2Events.some((e) => e.type === 'response.create')).toBe(true);

        // Complete the tool-result response on Connection 2 so the session returns to idle ('listening')
        client.PeerConnections[1].Channel.EmitServer({
            type: 'response.created',
        });
        client.PeerConnections[1].Channel.EmitServer({
            type: 'response.done',
            response: { id: 'r2', status: 'completed' },
        });

        // Advance through two more full connection legs (3 consecutive timed reconnects total)
        await vi.advanceTimersByTimeAsync(95_000);
        expect(client.PeerConnections).toHaveLength(3);
        await vi.advanceTimersByTimeAsync(95_000);
        expect(client.PeerConnections).toHaveLength(4);

        await client.Disconnect();
    });

    it('HuggingFaceRealtimeClient reconnects before ConnectionMaxSeconds expiry, waits for session.created, and seeds turns', async () => {
        class ReconnectableHuggingFaceClient extends HuggingFaceRealtimeClient {
            public Sockets: FakeProtocolSocket[] = [];
            public Urls: string[] = [];
            protected override createSocket(url: string): IOpenAIProtocolClientSocket {
                this.Urls.push(url);
                const sock = new FakeProtocolSocket();
                this.Sockets.push(sock);
                queueMicrotask(() => {
                    sock.onopen?.();
                    queueMicrotask(() => {
                        sock.onmessage?.(JSON.stringify({ type: 'session.created' }));
                    });
                });
                return sock;
            }
            protected override async createMicCapture(): Promise<IPcmMicCapture> {
                return new FakeMicCapture();
            }
            protected override createPlayback(): IRealtimePcmPlayback {
                return new FakePlayback();
            }
        }

        const client = new ReconnectableHuggingFaceClient();
        const refreshMock = vi.fn().mockResolvedValue({
            EphemeralToken: 'wss://proxy.example/realtime-proxy?ticket=hf-ticket-2',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: {
                session: { instructions: 'HuggingFace assistant' },
                sampleRate: 16000,
                connectionMaxSeconds: 120,
                reconnectBufferSeconds: 10,
            } satisfies JSONObject,
        });
        client.SetTokenRefreshCallback(refreshMock);

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'huggingface',
                Model: 'hf-s2s',
                EphemeralToken: 'wss://proxy.example/realtime-proxy?ticket=hf-ticket-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 120,
                ReconnectBufferSeconds: 10,
                SessionConfig: {
                    session: { instructions: 'HuggingFace assistant' },
                    sampleRate: 16000,
                },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        expect(client.Sockets).toHaveLength(1);
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'conversation.item.input_audio_transcription.completed',
                transcript: 'Check server status.',
            })
        );
        client.Sockets[0].onmessage?.(
            JSON.stringify({
                type: 'response.output_audio_transcript.done',
                transcript: 'All systems operational.',
            })
        );

        await vi.advanceTimersByTimeAsync(95_000);

        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(client.Sockets).toHaveLength(2);
        expect(client.Urls[1]).toContain('hf-ticket-2');
        const secondEvents = client.Sockets[1].SentEvents();
        expect(secondEvents[0]?.type).toBe('session.update');
        const itemCreates = secondEvents.filter((e) => e.type === 'conversation.item.create');
        expect(itemCreates.length).toBeGreaterThanOrEqual(2);

        await client.Disconnect();
    });

    it('OpenAILiveClient reconnects WebRTC before ConnectionMaxSeconds expiry, waits for session.started, and seeds turns', async () => {
        class ReconnectableOpenAILiveClient extends OpenAILiveClient {
            public PeerConnections: Array<FakePeerConnection & IRealtimeLivePeerConnection> = [];
            public Tokens: string[] = [];
            protected override createPeerConnection(): IRealtimeLivePeerConnection {
                const pc: FakePeerConnection & IRealtimeLivePeerConnection = Object.assign(
                    new FakePeerConnection(),
                    { iceGatheringState: 'complete' as RTCIceGatheringState }
                );
                this.PeerConnections.push(pc);
                return pc;
            }
            protected override createAudioSink(): IRealtimeAudioSink {
                return { srcObject: null, remove: () => {} };
            }
            protected override async postSdpOffer(
                _offerSdp: string,
                config: ClientRealtimeSessionConfig
            ): Promise<string> {
                this.Tokens.push(config.EphemeralToken);
                const latest = this.PeerConnections[this.PeerConnections.length - 1];
                queueMicrotask(() => {
                    latest.Channel.Open();
                    queueMicrotask(() => {
                        latest.Channel.EmitServer({
                            type: 'session.started',
                            session: { id: `live_sess_${this.PeerConnections.length}` },
                        });
                    });
                });
                return 'v=0\r\n';
            }
        }

        const client = new ReconnectableOpenAILiveClient();
        const refreshMock = vi.fn().mockResolvedValue({
            EphemeralToken: 'live-tok-2',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            SessionConfig: {
                instructions: 'Live prompt',
                connectionMaxSeconds: 120,
                reconnectBufferSeconds: 10,
            } satisfies JSONObject,
        });
        client.SetTokenRefreshCallback(refreshMock);

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'openai-live',
                Model: 'gpt-live-1',
                EphemeralToken: 'live-tok-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                ConnectionMaxSeconds: 120,
                ReconnectBufferSeconds: 10,
                SessionConfig: {
                    instructions: 'Live prompt',
                },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        expect(client.PeerConnections).toHaveLength(1);
        client.PeerConnections[0].Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Remind me about the deployment.',
        });
        client.PeerConnections[0].Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Deployment is set for Friday.',
        });
        client.PeerConnections[0].Channel.EmitServer({
            type: 'response.event',
            event: { type: 'response.completed' },
        });

        await vi.advanceTimersByTimeAsync(95_000);

        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(client.PeerConnections).toHaveLength(2);
        expect(client.Tokens).toEqual(['live-tok-1', 'live-tok-2']);
        expect(client.PeerConnections[0].Closed).toBe(true);

        const secondEvents = client.PeerConnections[1].Channel.SentEvents();
        const seedFrames = secondEvents.filter((e) => e.type === 'session.thinking.append');
        expect(seedFrames).toHaveLength(1);
        expect(JSON.stringify(seedFrames[0])).toContain('Remind me about the deployment.');
        expect(JSON.stringify(seedFrames[0])).toContain('Deployment is set for Friday.');

        await client.Disconnect();
    });

    it('attaches remote audio stream when nextPc.ontrack fires during setRemoteDescription before peerConnection swap (#23)', async () => {
        const remoteStream = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        class EarlyOnTrackOpenAIClient extends OpenAIRealtimeClient {
            public PeerConnections: FakePeerConnection[] = [];
            public AudioSinks: FakeAudioSink[] = [];
            protected override createPeerConnection(): IRealtimePeerConnection {
                const pc = new FakePeerConnection();
                const origSetRemote = pc.setRemoteDescription.bind(pc);
                pc.setRemoteDescription = async (desc: RTCSessionDescriptionInit): Promise<void> => {
                    await origSetRemote(desc);
                    // Fire ontrack synchronously inside setRemoteDescription (before dcOpened resolves / before swap)
                    pc.ontrack?.({ streams: [remoteStream] } as unknown as RTCTrackEvent);
                    queueMicrotask(() => pc.Channel.Open());
                };
                this.PeerConnections.push(pc);
                return pc;
            }
            protected override createAudioSink(): IRealtimeAudioSink {
                const sink = new FakeAudioSink();
                this.AudioSinks.push(sink);
                return sink;
            }
            protected override async postSdpOffer(): Promise<string> {
                return 'FAKE_ANSWER_SDP';
            }
        }

        const client = new EarlyOnTrackOpenAIClient();
        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'openai',
                Model: 'gpt-realtime-2.1',
                EphemeralToken: 'tok-early-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                SessionConfig: { type: 'realtime', instructions: 'System prompt' },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        const reconnected = client.TriggerReconnect('duration-expiry');
        await vi.advanceTimersByTimeAsync(1);
        expect(await reconnected).toBe(true);
        expect(client.AudioSinks[0]?.srcObject).toBe(remoteStream);
        await client.Disconnect();
    });

    it('ignores old-socket onerror during an in-flight WebSocket reconnect (#27)', async () => {
        class ErrorDuringReconnectXAIClient extends xAIRealtimeClient {
            public Sockets: FakeProtocolSocket[] = [];
            protected override createSocket(): IOpenAIProtocolClientSocket {
                const sock = new FakeProtocolSocket();
                this.Sockets.push(sock);
                if (this.Sockets.length === 1) {
                    queueMicrotask(() => sock.onopen?.());
                }
                return sock;
            }
            protected override async createMicCapture(): Promise<IPcmMicCapture> {
                return new FakeMicCapture();
            }
            protected override createPlayback(): IRealtimePcmPlayback {
                return new FakePlayback();
            }
        }

        const client = new ErrorDuringReconnectXAIClient();
        const errors: string[] = [];
        client.OnError((e) => errors.push(e.Message));

        const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
        const connectPromise = client.Connect(
            {
                Provider: 'xai',
                Model: 'grok-2-realtime',
                EphemeralToken: 'tok-xai-err-1',
                ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                SessionConfig: { instructions: 'Grok prompt' },
            },
            mic
        );
        await vi.advanceTimersByTimeAsync(1);
        await connectPromise;

        const reconnecting = client.TriggerReconnect('duration-expiry');
        await vi.advanceTimersByTimeAsync(0);
        expect(client.Sockets).toHaveLength(2);

        // Old socket emits an error while the new socket is still connecting
        client.Sockets[0].onerror?.('stale socket reset');
        expect(errors).toEqual([]);

        client.Sockets[1].onopen?.();
        await vi.advanceTimersByTimeAsync(1);
        expect(await reconnecting).toBe(true);
        expect(errors).toEqual([]);
        await client.Disconnect();
    });

    describe("OpenAI Live first connection's data channel during a move (#36)", () => {
        /** The second connection's SDP answer is held until the test releases it, so the move stays in flight. */
        class HeldMoveOpenAILiveClient extends OpenAILiveClient {
            public PeerConnections: Array<FakePeerConnection & IRealtimeLivePeerConnection> = [];
            public ReleaseAnswer: (() => void) | null = null;
            protected override createPeerConnection(): IRealtimeLivePeerConnection {
                const pc: FakePeerConnection & IRealtimeLivePeerConnection = Object.assign(
                    new FakePeerConnection(),
                    { iceGatheringState: 'complete' as RTCIceGatheringState }
                );
                this.PeerConnections.push(pc);
                return pc;
            }
            protected override createAudioSink(): IRealtimeAudioSink {
                return { srcObject: null, remove: () => {} };
            }
            protected override async postSdpOffer(): Promise<string> {
                const latest = this.PeerConnections[this.PeerConnections.length - 1];
                if (this.PeerConnections.length > 1) {
                    await new Promise<void>((resolve) => {
                        this.ReleaseAnswer = resolve;
                    });
                }
                queueMicrotask(() => latest.Channel.Open());
                return 'v=0\r\n';
            }
        }

        async function connectLive(): Promise<{ client: HeldMoveOpenAILiveClient; states: string[]; fatalErrors: string[] }> {
            const client = new HeldMoveOpenAILiveClient();
            const states: string[] = [];
            const fatalErrors: string[] = [];
            client.OnStateChange((s) => states.push(s));
            client.OnError((e) => {
                if (e.Fatal) {
                    fatalErrors.push(e.Message);
                }
            });
            const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
            const connectPromise = client.Connect(
                {
                    Provider: 'openai-live',
                    Model: 'gpt-live-1',
                    EphemeralToken: 'live-tok-36',
                    ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                    SessionConfig: { instructions: 'Live prompt' },
                },
                mic
            );
            await vi.advanceTimersByTimeAsync(1);
            await connectPromise;
            states.length = 0;
            return { client, states, fatalErrors };
        }

        it('ignores a close of the first channel while the move is in flight', async () => {
            const { client, states, fatalErrors } = await connectLive();
            const moving = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);
            expect(client.PeerConnections).toHaveLength(2);

            client.PeerConnections[0].Channel.onclose?.(new Event('close'));
            expect(states).not.toContain('closed');
            expect(client.State).not.toBe('closed');

            client.ReleaseAnswer?.();
            await vi.advanceTimersByTimeAsync(1);
            expect(await moving).toBe(true);
            expect(client.State).toBe('listening');
            expect(fatalErrors).toEqual([]);
            await client.Disconnect();
        });

        it('ignores an error on the first channel while the move is in flight', async () => {
            const { client, states, fatalErrors } = await connectLive();
            const moving = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(0);

            client.PeerConnections[0].Channel.onerror?.(new Event('error'));
            expect(fatalErrors).toEqual([]);
            expect(states).not.toContain('error');

            client.ReleaseAnswer?.();
            await vi.advanceTimersByTimeAsync(1);
            expect(await moving).toBe(true);
            expect(client.State).toBe('listening');
            await client.Disconnect();
        });

        it('still ends the call when the first channel closes with no move in flight', async () => {
            const { client, states } = await connectLive();
            client.PeerConnections[0].Channel.onclose?.(new Event('close'));
            expect(states).toEqual(['closed']);
            await client.Disconnect();
        });

        it('still reports a fatal error when the first channel errors with no move in flight', async () => {
            const { client, states, fatalErrors } = await connectLive();
            client.PeerConnections[0].Channel.onerror?.(new Event('error'));
            expect(fatalErrors).toHaveLength(1);
            expect(states).toEqual(['error']);
            await client.Disconnect();
        });
    });

    describe('typed text during an OpenAI reconnect (F12)', () => {
        /** An OpenAI client whose reconnect handshakes wait until the test releases them. */
        class HeldHandshakeOpenAIClient extends OpenAIRealtimeClient {
            public PeerConnections: FakePeerConnection[] = [];
            private releaseHandshake: (() => void) | null = null;
            protected override createPeerConnection(): IRealtimePeerConnection {
                const pc = new FakePeerConnection();
                this.PeerConnections.push(pc);
                queueMicrotask(() => pc.Channel.Open());
                return pc;
            }
            protected override createAudioSink(): IRealtimeAudioSink {
                return new FakeAudioSink();
            }
            protected override async postSdpOffer(): Promise<string> {
                if (this.PeerConnections.length > 1) {
                    await new Promise<void>((resolve) => {
                        this.releaseHandshake = resolve;
                    });
                }
                return 'FAKE_ANSWER_SDP';
            }
            public ReleaseHandshake(): void {
                const release = this.releaseHandshake;
                this.releaseHandshake = null;
                release?.();
            }
        }

        async function connectHeldClient(): Promise<HeldHandshakeOpenAIClient> {
            const client = new HeldHandshakeOpenAIClient();
            const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
            const connectPromise = client.Connect(
                {
                    Provider: 'openai',
                    Model: 'gpt-realtime-2.1',
                    EphemeralToken: 'tok-f12',
                    ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                    SessionConfig: { type: 'realtime', instructions: 'System prompt' },
                },
                mic
            );
            await vi.advanceTimersByTimeAsync(1);
            await connectPromise;
            return client;
        }

        async function reconnect(client: HeldHandshakeOpenAIClient, duringMove?: () => void): Promise<void> {
            const reconnected = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(1);
            duringMove?.();
            client.ReleaseHandshake();
            await vi.advanceTimersByTimeAsync(1);
            expect(await reconnected).toBe(true);
        }

        function userTexts(channel: FakeDataChannel): string[] {
            return channel
                .SentEvents()
                .filter((e) => e.type === 'conversation.item.create')
                .flatMap((e) => {
                    const item = e['item'] as { role?: string; content?: Array<{ text?: string }> };
                    return item.role === 'user' ? (item.content ?? []).map((c) => c.text ?? '') : [];
                });
        }

        it('holds SendText while reconnecting and delivers it on the new data channel after the seed, not on the closing one', async () => {
            const client = await connectHeldClient();
            const oldChannel = client.PeerConnections[0].Channel;
            const sentBefore = oldChannel.Sent.length;

            await reconnect(client, () => client.SendText('Please say the word banana.'));

            expect(oldChannel.Sent.slice(sentBefore)).toEqual([]);
            const newEvents = client.PeerConnections[1].Channel.SentEvents();
            const textIndex = newEvents.findIndex(
                (e) => e.type === 'conversation.item.create' && JSON.stringify(e).includes('banana')
            );
            expect(textIndex).toBeGreaterThan(-1);
            expect(newEvents[0]?.type).toBe('session.update');
            expect(newEvents.slice(textIndex + 1).some((e) => e.type === 'response.create')).toBe(true);
            await client.Disconnect();
        });

        it('records typed text in conversation memory so a later reseed carries it', async () => {
            const client = await connectHeldClient();
            client.SendText('My account number is 4411.');

            await reconnect(client);

            expect(userTexts(client.PeerConnections[1].Channel).join('\n')).toContain('My account number is 4411.');
            await client.Disconnect();
        });

        it('a text held across one move is in the seed of the next move, once', async () => {
            const client = await connectHeldClient();
            await reconnect(client, () => client.SendText('Please say the word banana.'));
            await reconnect(client);

            const seededTexts = userTexts(client.PeerConnections[2].Channel).join('\n');
            expect(seededTexts.split('Please say the word banana.').length - 1).toBe(1);
            await client.Disconnect();
        });

        it('drops held text when the call ends during the move', async () => {
            const client = await connectHeldClient();
            const reconnected = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(1);
            client.SendText('Never delivered.');
            await client.Disconnect();
            client.ReleaseHandshake();
            // The ended cycle still waits out its retry delay before it sees the disposal.
            await vi.advanceTimersByTimeAsync(60_000);
            expect(await reconnected).toBe(false);

            for (const pc of client.PeerConnections) {
                expect(userTexts(pc.Channel).join('\n')).not.toContain('Never delivered.');
            }
        });
    });

    describe('user speech across a timed OpenAI-protocol reconnect (F12b)', () => {
        // ConnectionMaxSeconds 120 with a 10 s buffer: the soft window opens at 92 s and the hard deadline is 110 s.
        const SOFT_WINDOW_OPENS_MS = 92_000;
        const HARD_DEADLINE_MS = 110_000;

        class TimedOpenAIClient extends OpenAIRealtimeClient {
            public PeerConnections: FakePeerConnection[] = [];
            protected override createPeerConnection(): IRealtimePeerConnection {
                const pc = new FakePeerConnection();
                this.PeerConnections.push(pc);
                queueMicrotask(() => pc.Channel.Open());
                return pc;
            }
            protected override createAudioSink(): IRealtimeAudioSink {
                return new FakeAudioSink();
            }
            protected override async postSdpOffer(): Promise<string> {
                return 'FAKE_ANSWER_SDP';
            }
            /** Injects a server event on the connection the call is on now. */
            public Emit(event: object): void {
                this.PeerConnections[this.PeerConnections.length - 1].Channel.EmitServer(event);
            }
            /** Whether a soft-window move would be held right now. */
            public IsHoldingReconnect(): boolean {
                return this.isTurnActiveForReconnect();
            }
        }

        class TimedXAIClient extends xAIRealtimeClient {
            public Sockets: FakeProtocolSocket[] = [];
            protected override createSocket(): IOpenAIProtocolClientSocket {
                const sock = new FakeProtocolSocket();
                this.Sockets.push(sock);
                queueMicrotask(() => sock.onopen?.());
                return sock;
            }
            protected override async createMicCapture(): Promise<IPcmMicCapture> {
                return new FakeMicCapture();
            }
            protected override createPlayback(): IRealtimePcmPlayback {
                return new FakePlayback();
            }
            public Emit(event: object): void {
                this.Sockets[this.Sockets.length - 1].onmessage?.(JSON.stringify(event));
            }
        }

        async function connectTimedOpenAI(): Promise<TimedOpenAIClient> {
            const client = new TimedOpenAIClient();
            const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
            const connectPromise = client.Connect(
                {
                    Provider: 'openai',
                    Model: 'gpt-realtime-2.1',
                    EphemeralToken: 'tok-f12b',
                    ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                    ConnectionMaxSeconds: 120,
                    ReconnectBufferSeconds: 10,
                    SessionConfig: { type: 'realtime', instructions: 'System prompt' },
                },
                mic
            );
            await vi.advanceTimersByTimeAsync(1);
            await connectPromise;
            return client;
        }

        /** Moves the fake clock to `atMs` since the test started (Connect took the first 1 ms). */
        async function advanceTo(atMs: number): Promise<void> {
            await vi.advanceTimersByTimeAsync(atMs - Date.now() + startedAtMs);
        }

        function seedText(channel: FakeDataChannel): string {
            return JSON.stringify(channel.SentEvents().filter((e) => e.type === 'conversation.item.create'));
        }

        let startedAtMs = 0;
        beforeEach(() => {
            startedAtMs = Date.now();
        });

        it('defers a soft-window swap while the user is mid-utterance, then swaps once the answer has been given', async () => {
            const client = await connectTimedOpenAI();
            await advanceTo(91_000);
            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'u_1' });

            await advanceTo(SOFT_WINDOW_OPENS_MS + 1_000);
            expect(client.PeerConnections).toHaveLength(1);

            client.Emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'u_1' });
            client.Emit({ type: 'input_audio_buffer.committed', item_id: 'u_1' });
            client.Emit({ type: 'response.created' });
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u_1', transcript: 'What is my balance?' });
            await vi.advanceTimersByTimeAsync(1);
            expect(client.PeerConnections).toHaveLength(1);

            client.Emit({ type: 'response.output_audio_transcript.delta', delta: 'It is ' });
            client.Emit({ type: 'response.output_audio_transcript.done', transcript: 'It is forty dollars.' });
            client.Emit({ type: 'response.done' });
            await vi.advanceTimersByTimeAsync(1);

            expect(client.PeerConnections).toHaveLength(2);
            expect(Date.now() - startedAtMs).toBeLessThan(HARD_DEADLINE_MS);
            const seeded = seedText(client.PeerConnections[1].Channel);
            expect(seeded).toContain('What is my balance?');
            expect(seeded).toContain('It is forty dollars.');
            await client.Disconnect();
        });

        it('holds the swap for a committed utterance that gets no auto-reply until its transcript is in memory (create_response:false)', async () => {
            const client = await connectTimedOpenAI();
            await advanceTo(91_000);
            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'u_2' });
            client.Emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'u_2' });
            client.Emit({ type: 'input_audio_buffer.committed', item_id: 'u_2' });

            await advanceTo(SOFT_WINDOW_OPENS_MS + 1_000);
            expect(client.PeerConnections).toHaveLength(1);

            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u_2', transcript: 'Note the meeting room.' });
            await vi.advanceTimersByTimeAsync(1);

            expect(client.PeerConnections).toHaveLength(2);
            expect(seedText(client.PeerConnections[1].Channel)).toContain('Note the meeting room.');
            await client.Disconnect();
        });

        it('a failed transcription releases the hold too', async () => {
            const client = await connectTimedOpenAI();
            await advanceTo(91_000);
            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'u_f' });
            client.Emit({ type: 'input_audio_buffer.committed', item_id: 'u_f' });
            await advanceTo(SOFT_WINDOW_OPENS_MS + 1_000);
            expect(client.PeerConnections).toHaveLength(1);

            client.Emit({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'u_f' });
            await vi.advanceTimersByTimeAsync(1);

            expect(client.PeerConnections).toHaveLength(2);
            await client.Disconnect();
        });

        it('input_audio_buffer.cleared releases an uncommitted utterance', async () => {
            const client = await connectTimedOpenAI();
            await advanceTo(91_000);
            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'u_c' });
            await advanceTo(SOFT_WINDOW_OPENS_MS + 1_000);
            expect(client.PeerConnections).toHaveLength(1);

            client.Emit({ type: 'input_audio_buffer.cleared' });
            await vi.advanceTimersByTimeAsync(1);

            expect(client.PeerConnections).toHaveLength(2);
            await client.Disconnect();
        });

        it('an utterance with no closing event stops holding the swap after the bounded max age', async () => {
            const client = await connectTimedOpenAI();
            await advanceTo(85_000);
            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'u_3' });

            await advanceTo(85_000 + PENDING_USER_UTTERANCE_MAX_AGE_MS - 1_000);
            expect(client.PeerConnections).toHaveLength(1);

            await advanceTo(85_000 + PENDING_USER_UTTERANCE_MAX_AGE_MS + 1);
            expect(client.PeerConnections).toHaveLength(2);
            expect(Date.now() - startedAtMs).toBeLessThan(HARD_DEADLINE_MS);
            await client.Disconnect();
        });

        it('a pending utterance never holds the swap past the hard deadline', async () => {
            const client = await connectTimedOpenAI();
            // Keep the soft window busy with an open model turn, then start speaking close to the hard deadline.
            await advanceTo(90_000);
            client.Emit({ type: 'response.created' });
            client.Emit({ type: 'response.output_audio_transcript.delta', delta: 'Let me explain ' });
            await advanceTo(105_000);
            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'u_4' });
            client.Emit({ type: 'response.done' });

            await advanceTo(HARD_DEADLINE_MS - 1_000);
            expect(client.PeerConnections).toHaveLength(1);

            await advanceTo(HARD_DEADLINE_MS + 1);
            expect(client.PeerConnections).toHaveLength(2);
            // The old connection's utterance must not hold the new connection's moves.
            expect(client.IsHoldingReconnect()).toBe(false);
            await client.Disconnect();
        });

        describe('an answer the move cuts off (F2)', () => {
            // The provider limit is 120 s; a hard-point move that waits for an answer keeps a 3333 ms margin before it.
            const LAST_CALL_MS = 120_000 - 3_333;

            function sentAfterSeed(channel: FakeDataChannel): string[] {
                return channel.SentEvents().map((e) => e.type);
            }

            async function askQuestion(client: TimedOpenAIClient, atMs: number): Promise<void> {
                await advanceTo(atMs);
                client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'u_q' });
                client.Emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'u_q' });
                client.Emit({ type: 'input_audio_buffer.committed', item_id: 'u_q' });
                client.Emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u_q', transcript: 'What is the capital of Peru?' });
                client.Emit({ type: 'response.created' });
                client.Emit({ type: 'response.output_audio_transcript.delta', delta: 'The capital of ' });
            }

            it('the hard point does not cut an answer that ends before the provider limit', async () => {
                const client = await connectTimedOpenAI();
                await askQuestion(client, 91_000);
                await advanceTo(HARD_DEADLINE_MS + 3_000);
                expect(client.PeerConnections).toHaveLength(1);

                client.Emit({ type: 'response.output_audio_transcript.done', transcript: 'The capital of Peru is Lima.' });
                client.Emit({ type: 'response.done' });
                await vi.advanceTimersByTimeAsync(1);

                expect(client.PeerConnections).toHaveLength(2);
                expect(seedText(client.PeerConnections[1].Channel)).toContain('The capital of Peru is Lima.');
                // The answer was given in full, so the new connection is not asked for it again.
                expect(sentAfterSeed(client.PeerConnections[1].Channel)).not.toContain('response.create');
                await client.Disconnect();
            });

            it('re-requests an answer cut off near the provider limit, once, after the seed', async () => {
                const client = await connectTimedOpenAI();
                await askQuestion(client, 91_000);
                await advanceTo(LAST_CALL_MS - 1);
                expect(client.PeerConnections).toHaveLength(1);
                await advanceTo(LAST_CALL_MS + 10);

                expect(client.PeerConnections).toHaveLength(2);
                const types = sentAfterSeed(client.PeerConnections[1].Channel);
                expect(types.filter((t) => t === 'response.create')).toHaveLength(1);
                const lastSeedItem = types.lastIndexOf('conversation.item.create');
                expect(types.indexOf('response.create')).toBeGreaterThan(lastSeedItem);
                expect(seedText(client.PeerConnections[1].Channel)).toContain('What is the capital of Peru?');
                await client.Disconnect();
            });

            it('does not re-request after a move with no answer in flight', async () => {
                const client = await connectTimedOpenAI();
                await advanceTo(SOFT_WINDOW_OPENS_MS + 1_000);
                expect(client.PeerConnections).toHaveLength(2);
                expect(sentAfterSeed(client.PeerConnections[1].Channel)).not.toContain('response.create');
                await client.Disconnect();
            });
        });

        it('xAI: a streamed transcript does not release the hold before the commit; the committed transcript does', async () => {
            const client = new TimedXAIClient();
            const mic = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
            const connectPromise = client.Connect(
                {
                    Provider: 'xai',
                    Model: 'grok-2-realtime',
                    EphemeralToken: 'tok-xai-f12b',
                    ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
                    ConnectionMaxSeconds: 120,
                    ReconnectBufferSeconds: 10,
                    SessionConfig: { instructions: 'Grok prompt' },
                },
                mic
            );
            await vi.advanceTimersByTimeAsync(1);
            await connectPromise;

            await advanceTo(91_000);
            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'x_1' });
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'x_1', transcript: 'Book a' });
            await advanceTo(SOFT_WINDOW_OPENS_MS + 1_000);
            expect(client.Sockets).toHaveLength(1);

            client.Emit({ type: 'input_audio_buffer.committed', item_id: 'x_1' });
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'x_1', transcript: 'Book a room.' });
            await vi.advanceTimersByTimeAsync(1);

            expect(client.Sockets).toHaveLength(2);
            await client.Disconnect();
        });
    });
});
