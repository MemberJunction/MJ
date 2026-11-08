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
import { IOpenAIProtocolClientSocket } from '../generic/openAIProtocolClient';
import { xAIRealtimeClient } from '../drivers/xaiRealtimeClient';
import {
    ElevenLabsRealtimeClient,
    IElevenLabsClientSocket,
} from '../drivers/elevenLabsRealtimeClient';
import {
    AssemblyAIRealtimeClient,
    IAssemblyAIClientSocket,
} from '../drivers/assemblyAIRealtimeClient';
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
});

