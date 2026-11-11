/**
 * An unexpected loss of a live call's transport must hand the call to the shared `connection-lost` reconnect (bounded
 * by the controller's recovery window), while an intentional close (the user's End, the planned swap's teardown of the
 * old transport) must not. Gemini already did this; the OpenAI WebRTC and xAI websocket drivers ended the call (xAI) or
 * sat silently on a dead transport (OpenAI) instead (#6462 smoke finding F6).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClientRealtimeSessionConfig, REALTIME_RESUMPTION_RECOVERY_WINDOW_MS } from '@memberjunction/ai';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import {
    IRealtimeAudioSink,
    IRealtimeDataChannel,
    IRealtimePeerConnection,
    OpenAIRealtimeClient,
} from '../drivers/openAIRealtimeClient';
import { xAIRealtimeClient } from '../drivers/xaiRealtimeClient';
import { HuggingFaceRealtimeClient } from '../drivers/huggingFaceRealtimeClient';
import { IOpenAIProtocolClientSocket } from '../generic/openAIProtocolClient';
import { collect, FakeMediaStream, FakeMicCapture, FakeRtpSender, FakeTrack } from './helpers/realtime-fakes';

// ── WebRTC fakes ───────────────────────────────────────────────────────────────

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
    /** The remote end or the network closed the channel (not a local `close()`). */
    public Drop(): void {
        this.readyState = 'closed';
        this.onclose?.(new Event('close'));
    }
    public EmitServer(event: object): void {
        this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
    }
    public SentTypes(): string[] {
        return this.Sent.map((s) => (JSON.parse(s) as { type: string }).type);
    }
}

class FakePeerConnection implements IRealtimePeerConnection {
    public ontrack: ((event: RTCTrackEvent) => void) | null = null;
    public onconnectionstatechange: ((event: Event) => void) | null = null;
    public connectionState: RTCPeerConnectionState = 'new';
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
    /** Whether the channel opens once the answer is applied (false: an attempt during the outage). */
    public OpensOnAnswer = true;
    public async setRemoteDescription(_description: RTCSessionDescriptionInit): Promise<void> {
        // As on a real connection, the channel opens only after the answer, ICE and DTLS: a later task.
        if (this.OpensOnAnswer) {
            setTimeout(() => this.Channel.Open(), 0);
        }
    }
    public close(): void {
        // A local close sets 'closed' without firing connectionstatechange (WebRTC spec).
        this.Closed = true;
        this.connectionState = 'closed';
    }
    public SetConnectionState(state: RTCPeerConnectionState): void {
        this.connectionState = state;
        this.onconnectionstatechange?.(new Event('connectionstatechange'));
    }
    public DeliverRemoteStream(stream: MediaStream): void {
        this.ontrack?.({ streams: [stream] } as unknown as RTCTrackEvent);
    }
}

class FakeAudioSink implements IRealtimeAudioSink {
    public srcObject: MediaProvider | null = null;
    public remove(): void {}
}

/** The real OpenAI client over the WebRTC fakes; each new peer connection's channel opens on the next microtask. */
class LossTestOpenAIClient extends OpenAIRealtimeClient {
    public PeerConnections: FakePeerConnection[] = [];
    public SdpTokens: string[] = [];
    /** When false, a new peer connection's channel stays connecting (an attempt during the outage). */
    public ChannelsOpen = true;

    protected override createPeerConnection(): IRealtimePeerConnection {
        const pc = new FakePeerConnection();
        pc.OpensOnAnswer = this.ChannelsOpen;
        this.PeerConnections.push(pc);
        return pc;
    }
    protected override createAudioSink(): IRealtimeAudioSink {
        return new FakeAudioSink();
    }
    /** When set, the next SDP answer waits for it, so a move stays in flight until the test resolves it. */
    public SdpGate: Promise<void> | null = null;

    protected override async postSdpOffer(_offerSdp: string, ephemeralToken: string): Promise<string> {
        this.SdpTokens.push(ephemeralToken);
        if (this.SdpGate) {
            await this.SdpGate;
        }
        return 'FAKE_ANSWER_SDP';
    }
    public get Pc(): FakePeerConnection {
        return this.PeerConnections[this.PeerConnections.length - 1];
    }
    /** Whether something (an open turn, a tool call in flight, ...) would hold a soft-window move now. */
    public IsHoldingMove(): boolean {
        return this.isTurnActiveForReconnect();
    }
    /** How many times a cycle asked to go back to the old connection after a failed attempt. */
    public ReturnsAsked = 0;
    protected override ResumeOnOldConnection(): boolean {
        this.ReturnsAsked++;
        return super.ResumeOnOldConnection();
    }
}

function freshCredential(token: string): { EphemeralToken: string; ExpiresAt: string; SessionConfig: { instructions: string } } {
    return {
        EphemeralToken: token,
        ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
        SessionConfig: { instructions: 'System prompt' },
    };
}

async function connectOpenAI(): Promise<LossTestOpenAIClient> {
    const client = new LossTestOpenAIClient();
    let minted = 1;
    client.SetTokenRefreshCallback(vi.fn().mockImplementation(async () => freshCredential(`tok-openai-${++minted}`)));
    const config: ClientRealtimeSessionConfig = {
        Provider: 'openai',
        Model: 'gpt-realtime',
        EphemeralToken: 'tok-openai-1',
        ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
        SessionConfig: { instructions: 'System prompt' },
    };
    const connecting = client.Connect(config, new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream);
    await vi.advanceTimersByTimeAsync(1);
    await connecting;
    client.Pc.SetConnectionState('connected');
    // One finished exchange, so the reconnect has history to seed.
    client.Pc.Channel.EmitServer({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Check invoice 77.' });
    client.Pc.Channel.EmitServer({ type: 'response.output_audio_transcript.done', item_id: 'a1', transcript: 'Invoice 77 is paid.' });
    return client;
}

// ── Websocket fakes ────────────────────────────────────────────────────────────

class FakeSocket implements IOpenAIProtocolClientSocket {
    public onopen: (() => void) | null = null;
    public onmessage: ((data: string) => void) | null = null;
    public onerror: ((message: string) => void) | null = null;
    public onclose: (() => void) | null = null;
    public Sent: string[] = [];
    public Closed = false;
    public Url = '';

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.Closed = true;
    }
    public SentTypes(): string[] {
        return this.Sent.map((s) => (JSON.parse(s) as { type: string }).type);
    }
}

class FakePlayback implements IRealtimePcmPlayback {
    public IsPlaying = false;
    public GetOutputStream(): MediaStream | null {
        return null;
    }
    public Enqueue(_pcm16: ArrayBuffer): void {}
    public Flush(): void {}
    public Close(): void {}
}

/** The real xAI client over a fake socket; each new socket opens on the next microtask unless `SocketsOpen` is false. */
class LossTestXAIClient extends xAIRealtimeClient {
    public Sockets: FakeSocket[] = [];
    public SocketsOpen = true;
    /** When true, a new socket neither opens nor fails until the test fires its handler (an attempt kept in flight). */
    public HoldSockets = false;

    protected override createSocket(url: string, _subprotocol: string): IOpenAIProtocolClientSocket {
        const socket = new FakeSocket();
        socket.Url = url;
        this.Sockets.push(socket);
        if (this.HoldSockets) {
            return socket;
        }
        if (this.SocketsOpen) {
            queueMicrotask(() => socket.onopen?.());
        } else {
            // The network is down: the handshake fails.
            queueMicrotask(() => socket.onclose?.());
        }
        return socket;
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
    public get Socket(): FakeSocket {
        return this.Sockets[this.Sockets.length - 1];
    }
    /** Whether the client would send an event on its current socket now. */
    public CanSend(): boolean {
        return this.canSendEvents();
    }
    /** How many times a cycle asked to go back to the old connection after a failed attempt. */
    public ReturnsAsked = 0;
    protected override ResumeOnOldConnection(): boolean {
        this.ReturnsAsked++;
        return super.ResumeOnOldConnection();
    }
}

async function connectXAI(options?: { TrustNativeResumption?: boolean }): Promise<LossTestXAIClient> {
    const client = new LossTestXAIClient();
    let minted = 1;
    client.SetTokenRefreshCallback(
        vi.fn().mockImplementation(async () => ({
            ...freshCredential(`tok-xai-${++minted}`),
            ...(options?.TrustNativeResumption !== undefined
                ? { TrustNativeResumption: options.TrustNativeResumption }
                : {}),
        }))
    );
    const connecting = client.Connect(
        {
            Provider: 'xai',
            Model: 'grok-voice-latest',
            EphemeralToken: 'tok-xai-1',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            ...(options?.TrustNativeResumption !== undefined
                ? { TrustNativeResumption: options.TrustNativeResumption }
                : {}),
            SessionConfig: { instructions: 'Grok prompt' },
        },
        new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream
    );
    await vi.advanceTimersByTimeAsync(1);
    await connecting;
    client.Socket.onmessage?.(JSON.stringify({ type: 'conversation.created', conversation: { id: 'conv_42' } }));
    client.Socket.onmessage?.(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Hello Grok.' }));
    client.Socket.onmessage?.(JSON.stringify({ type: 'response.output_audio_transcript.done', item_id: 'a1', transcript: 'Hello human.' }));
    return client;
}

describe('transport loss during a live call (#6462 F6)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('OpenAIRealtimeClient (WebRTC)', () => {
        it('reconnects with connection-lost when the live data channel closes', async () => {
            const client = await connectOpenAI();
            const { states, errors } = collect(client);
            const lost = client.Pc;

            lost.Channel.Drop();
            await vi.advanceTimersByTimeAsync(10);

            expect(errors).toEqual([]);
            expect(client.PeerConnections).toHaveLength(2);
            expect(lost.Closed).toBe(true);
            expect(client.SdpTokens).toEqual(['tok-openai-1', 'tok-openai-2']);
            expect(client.Pc.Channel.SentTypes()[0]).toBe('session.update');
            expect(client.Pc.Channel.Sent.join('\n')).toContain('Invoice 77 is paid.');
            expect(states).toEqual(['connecting', 'listening']);
            await client.Disconnect();
        });

        it('reconnects when the peer connection fails while the data channel never closes', async () => {
            const client = await connectOpenAI();
            const { states, errors } = collect(client);

            client.Pc.SetConnectionState('failed');
            await vi.advanceTimersByTimeAsync(10);

            expect(errors).toEqual([]);
            expect(client.PeerConnections).toHaveLength(2);
            expect(states).toEqual(['connecting', 'listening']);
            await client.Disconnect();
        });

        it('waits out a short disconnected blip that heals itself, then reconnects one that does not', async () => {
            const client = await connectOpenAI();
            const { states } = collect(client);

            client.Pc.SetConnectionState('disconnected');
            await vi.advanceTimersByTimeAsync(2_000);
            client.Pc.SetConnectionState('connected');
            await vi.advanceTimersByTimeAsync(30_000);
            expect(client.PeerConnections).toHaveLength(1);
            expect(states).toEqual([]);

            client.Pc.SetConnectionState('disconnected');
            await vi.advanceTimersByTimeAsync(10_000);
            expect(client.PeerConnections).toHaveLength(2);
            expect(states).toEqual(['connecting', 'listening']);
            await client.Disconnect();
        });

        it('keeps retrying through a 10 s outage and recovers inside the recovery window', async () => {
            const client = await connectOpenAI();
            const { states, errors } = collect(client);

            client.ChannelsOpen = false;
            client.Pc.SetConnectionState('failed');
            await vi.advanceTimersByTimeAsync(10_000);
            expect(errors).toEqual([]);

            client.ChannelsOpen = true;
            await vi.advanceTimersByTimeAsync(REALTIME_RESUMPTION_RECOVERY_WINDOW_MS);

            expect(errors).toEqual([]);
            expect(states.at(-1)).toBe('listening');
            expect(client.Pc.Channel.readyState).toBe('open');
            await client.Disconnect();
        });

        it('publishes the new peer connection\'s remote stream so the recorder re-attaches', async () => {
            const client = await connectOpenAI();
            const firstStream = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
            client.Pc.DeliverRemoteStream(firstStream);
            const delivered: (MediaStream | null)[] = [];
            client.OnRemoteMediaStream((s) => delivered.push(s));

            client.Pc.Channel.Drop();
            await vi.advanceTimersByTimeAsync(10);
            const secondStream = new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream;
            client.Pc.DeliverRemoteStream(secondStream);

            expect(client.GetRemoteMediaStream()).toBe(secondStream);
            expect(delivered.at(-1)).toBe(secondStream);
            await client.Disconnect();
        });

        it('does not reconnect after the user ends the call', async () => {
            const client = await connectOpenAI();
            const pc = client.Pc;
            await client.Disconnect();
            const { states, errors } = collect(client);

            pc.Channel.onclose?.(new Event('close'));
            pc.onconnectionstatechange?.(new Event('connectionstatechange'));
            await vi.advanceTimersByTimeAsync(10_000);

            expect(client.PeerConnections).toHaveLength(1);
            expect(states).toEqual([]);
            expect(errors).toEqual([]);
        });

        it('does not reconnect again when the planned swap tears down the old transport', async () => {
            const client = await connectOpenAI();
            const old = client.Pc;
            const { states } = collect(client);

            const swap = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(await swap).toBe(true);
            expect(client.PeerConnections).toHaveLength(2);
            states.length = 0;

            old.Channel.onclose?.(new Event('close'));
            old.SetConnectionState('failed');
            await vi.advanceTimersByTimeAsync(10_000);

            expect(client.PeerConnections).toHaveLength(2);
            expect(states).toEqual([]);
            await client.Disconnect();
        });

        it('reconnects again when the transport adopted by a reconnect is lost', async () => {
            const client = await connectOpenAI();
            const swap = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(await swap).toBe(true);
            const { states } = collect(client);

            client.Pc.Channel.Drop();
            await vi.advanceTimersByTimeAsync(10);

            expect(client.PeerConnections).toHaveLength(3);
            expect(states).toEqual(['connecting', 'listening']);
            await client.Disconnect();
        });

        it('does not reconnect a channel that closes before the call went live', async () => {
            const client = new LossTestOpenAIClient();
            client.ChannelsOpen = false;
            await client.Connect(
                { Provider: 'openai', Model: 'gpt-realtime', EphemeralToken: 'tok', ExpiresAt: new Date(Date.now() + 600_000).toISOString(), SessionConfig: {} },
                new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream
            );
            const { states } = collect(client);

            client.Pc.Channel.Drop();
            await vi.advanceTimersByTimeAsync(10_000);

            expect(client.PeerConnections).toHaveLength(1);
            expect(states).toEqual(['closed']);
        });
    });

    describe('xAIRealtimeClient (websocket)', () => {
        it('reconnects with connection-lost and seeds prior turns by default when the live socket closes', async () => {
            const client = await connectXAI();
            const { states, errors } = collect(client);
            const lost = client.Socket;

            lost.onclose?.();
            await vi.advanceTimersByTimeAsync(10);

            expect(errors).toEqual([]);
            expect(client.Sockets).toHaveLength(2);
            expect(client.Socket.Url).not.toContain('conversation_id=');
            expect(client.Socket.SentTypes()[0]).toBe('session.update');
            expect(client.Socket.Sent.join('\n')).toContain('Hello Grok.');
            expect(client.Socket.Sent.join('\n')).toContain('Hello human.');
            expect(states).toEqual(['connecting', 'listening']);
            await client.Disconnect();
        });

        it('reconnects with connection-lost and resumes natively when TrustNativeResumption: true is explicitly configured', async () => {
            const client = await connectXAI({ TrustNativeResumption: true });
            const { states, errors } = collect(client);
            const lost = client.Socket;

            lost.onclose?.();
            await vi.advanceTimersByTimeAsync(10);

            expect(errors).toEqual([]);
            expect(client.Sockets).toHaveLength(2);
            expect(client.Socket.Url).toContain('conversation_id=conv_42');
            expect(client.Socket.SentTypes()[0]).toBe('session.update');
            expect(states).toEqual(['connecting', 'listening']);
            await client.Disconnect();
        });

        it('reconnects once when a live socket error is followed by its close', async () => {
            const client = await connectXAI();
            const { states, errors } = collect(client);
            const lost = client.Socket;

            lost.onerror?.('network went away');
            lost.onclose?.();
            await vi.advanceTimersByTimeAsync(10);

            expect(errors).toEqual([]);
            expect(client.Sockets).toHaveLength(2);
            expect(states).toEqual(['connecting', 'listening']);
            await client.Disconnect();
        });

        it('keeps retrying through a 10 s outage and recovers inside the recovery window', async () => {
            const client = await connectXAI();
            const { states, errors } = collect(client);

            client.SocketsOpen = false;
            client.Socket.onclose?.();
            await vi.advanceTimersByTimeAsync(10_000);
            expect(errors).toEqual([]);

            client.SocketsOpen = true;
            await vi.advanceTimersByTimeAsync(REALTIME_RESUMPTION_RECOVERY_WINDOW_MS);

            expect(errors).toEqual([]);
            expect(states.at(-1)).toBe('listening');
            await client.Disconnect();
        });

        it('ends the call with reconnect-failed when the network never comes back', async () => {
            const client = await connectXAI();
            const { errors } = collect(client);

            client.SocketsOpen = false;
            client.Socket.onclose?.();
            await vi.advanceTimersByTimeAsync(REALTIME_RESUMPTION_RECOVERY_WINDOW_MS + 30_000);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({ Code: 'reconnect-failed', Fatal: true });
            await client.Disconnect();
        });

        it('does not reconnect after the user ends the call', async () => {
            const client = await connectXAI();
            const socket = client.Socket;
            await client.Disconnect();
            const { states, errors } = collect(client);

            socket.onclose?.();
            await vi.advanceTimersByTimeAsync(10_000);

            expect(client.Sockets).toHaveLength(1);
            expect(states).toEqual([]);
            expect(errors).toEqual([]);
        });
    });

    describe('HuggingFaceRealtimeClient (self-hosted proxy hop)', () => {
        it('still reports a live socket error as fatal: its proxy closes benignly and the host reads that as the end', async () => {
            class LossTestHFClient extends HuggingFaceRealtimeClient {
                public Sockets: FakeSocket[] = [];
                protected override createSocket(_url: string): IOpenAIProtocolClientSocket {
                    const socket = new FakeSocket();
                    this.Sockets.push(socket);
                    queueMicrotask(() => {
                        socket.onopen?.();
                        socket.onmessage?.(JSON.stringify({ type: 'session.created' }));
                    });
                    return socket;
                }
                protected override async createMicCapture(): Promise<IPcmMicCapture> {
                    return new FakeMicCapture();
                }
                protected override createPlayback(): IRealtimePcmPlayback {
                    return new FakePlayback();
                }
            }
            const client = new LossTestHFClient();
            const connecting = client.Connect(
                { Provider: 'huggingface', Model: 'hf', EphemeralToken: 'wss://proxy/x', ExpiresAt: new Date(Date.now() + 600_000).toISOString(), SessionConfig: {} },
                new FakeMediaStream([new FakeTrack()]) as unknown as MediaStream
            );
            await vi.advanceTimersByTimeAsync(1);
            await connecting;
            const { states, errors } = collect(client);

            client.Sockets[0].onerror?.('proxy restarted');
            await vi.advanceTimersByTimeAsync(10_000);

            expect(client.Sockets).toHaveLength(1);
            expect(errors).toHaveLength(1);
            expect(errors[0].Fatal).toBe(true);
            expect(states).toEqual(['error']);
        });
    });
});

// ── Review round 6 (#32, #33, #35, #40) ─────────────────────────────────────────

interface SentFrame {
    type: string;
    item?: { type?: string; role?: string; call_id?: string; output?: string; content?: Array<{ text?: string }> };
}

function frames(sent: string[]): SentFrame[] {
    return sent.map((s) => JSON.parse(s) as SentFrame);
}

/** Whether a frame carries the tool output text, as a `function_call_output` item or a late-result note. */
function carriesOutput(frame: SentFrame, text: string): boolean {
    if (frame.type !== 'conversation.item.create') {
        return false;
    }
    if ((frame.item?.output ?? '').includes(text)) {
        return true;
    }
    return (frame.item?.content ?? []).some((c) => (c.text ?? '').includes(text));
}

/** The model is answering the user (a VAD response) and has said part of it. */
function answerInFlight(emit: (event: object) => void): void {
    emit({ type: 'input_audio_buffer.committed', item_id: 'u_q' });
    emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u_q', transcript: 'What is the capital of Peru?' });
    emit({ type: 'response.created' });
    emit({ type: 'response.output_audio_transcript.delta', delta: 'The capital of ' });
}

/** The model started a tool call and is waiting for its result (its state is 'connected'). */
function toolCallInFlight(emit: (event: object) => void): void {
    emit({ type: 'response.created' });
    emit({ type: 'response.output_audio_transcript.delta', delta: 'One moment while I check.' });
    emit({ type: 'response.function_call_arguments.done', call_id: 'call_sage', name: 'AskSage', arguments: '{}' });
    emit({ type: 'response.done' });
}

describe('OpenAI-protocol reconnect state (#6462 review round 6)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('#32: a connection loss during a tool call', () => {
        it('OpenAI WebRTC: a data channel close during the tool run reconnects instead of ending the call', async () => {
            const client = await connectOpenAI();
            toolCallInFlight((e) => client.Pc.Channel.EmitServer(e));
            const { states, errors } = collect(client);

            client.Pc.Channel.Drop();
            await vi.advanceTimersByTimeAsync(10);

            expect(errors).toEqual([]);
            expect(states).not.toContain('closed');
            expect(client.PeerConnections).toHaveLength(2);
            await client.Disconnect();
        });

        it('OpenAI WebRTC: a failed peer connection during the tool run reconnects instead of a fatal error', async () => {
            const client = await connectOpenAI();
            toolCallInFlight((e) => client.Pc.Channel.EmitServer(e));
            const { errors } = collect(client);

            client.Pc.SetConnectionState('failed');
            await vi.advanceTimersByTimeAsync(10);

            expect(errors).toEqual([]);
            expect(client.PeerConnections).toHaveLength(2);
            await client.Disconnect();
        });

        it('xAI: a socket close during the tool run reconnects instead of a fatal error', async () => {
            const client = await connectXAI();
            toolCallInFlight((e) => client.Socket.onmessage?.(JSON.stringify(e)));
            const { errors } = collect(client);

            client.Socket.onclose?.();
            await vi.advanceTimersByTimeAsync(10);

            expect(errors).toEqual([]);
            expect(client.Sockets).toHaveLength(2);
            await client.Disconnect();
        });
    });

    describe('#33: a tool result sent while the call moves', () => {
        it('a result sent while a lost connection is replaced reaches the new connection and memory, once', async () => {
            const client = await connectOpenAI();
            toolCallInFlight((e) => client.Pc.Channel.EmitServer(e));

            client.ChannelsOpen = false;
            client.Pc.Channel.Drop();
            await vi.advanceTimersByTimeAsync(10);
            client.SendToolResult('call_sage', '{"answer":"Sage says 42"}');
            client.ChannelsOpen = true;
            await vi.advanceTimersByTimeAsync(REALTIME_RESUMPTION_RECOVERY_WINDOW_MS);

            const sent = frames(client.Pc.Channel.Sent);
            expect(sent.filter((f) => carriesOutput(f, 'Sage says 42'))).toHaveLength(1);
            expect(sent.at(-1)?.type).toBe('response.create');
            expect(client.ConversationMemory.Seed().Entries.filter((e) => e.Kind === 'toolResult')).toHaveLength(1);
            client.Pc.Channel.EmitServer({ type: 'response.created' });
            client.Pc.Channel.EmitServer({ type: 'response.done' });
            // The call is answered, so it no longer holds every later move.
            expect(client.IsBusy).toBe(false);
            expect(client.IsHoldingMove()).toBe(false);
            await client.Disconnect();
        });

        it('a result sent during a planned move goes to the new connection, not the closing one', async () => {
            const client = await connectOpenAI();
            toolCallInFlight((e) => client.Pc.Channel.EmitServer(e));
            const old = client.Pc;
            let releaseSdp: () => void = () => undefined;
            client.SdpGate = new Promise<void>((resolve) => {
                releaseSdp = resolve;
            });

            const swap = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(client.PeerConnections).toHaveLength(2);
            client.SendToolResult('call_sage', '{"answer":"Sage says 42"}');
            client.SdpGate = null;
            releaseSdp();
            await vi.advanceTimersByTimeAsync(10);
            expect(await swap).toBe(true);

            expect(frames(old.Channel.Sent).some((f) => carriesOutput(f, 'Sage says 42'))).toBe(false);
            const sent = frames(client.Pc.Channel.Sent);
            expect(sent.filter((f) => carriesOutput(f, 'Sage says 42'))).toHaveLength(1);
            expect(sent.at(-1)?.type).toBe('response.create');
            expect(client.ConversationMemory.Seed().Entries.filter((e) => e.Kind === 'toolResult')).toHaveLength(1);
            await client.Disconnect();
        });

        it('a result held for a planned move whose attempt fails goes out on the old connection, once', async () => {
            const client = await connectOpenAI();
            toolCallInFlight((e) => client.Pc.Channel.EmitServer(e));
            const old = client.Pc;
            let failSdp: (error: Error) => void = () => undefined;
            client.SdpGate = new Promise<void>((_resolve, reject) => {
                failSdp = reject;
            });

            void client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            client.SendToolResult('call_sage', '{"answer":"Sage says 42"}');
            expect(frames(old.Channel.Sent).some((f) => carriesOutput(f, 'Sage says 42'))).toBe(false);
            client.SdpGate = null;
            failSdp(new Error('SDP exchange failed'));
            await vi.advanceTimersByTimeAsync(0);

            const sent = frames(old.Channel.Sent);
            expect(sent.filter((f) => carriesOutput(f, 'Sage says 42'))).toHaveLength(1);
            expect(sent.find((f) => carriesOutput(f, 'Sage says 42'))?.item?.type).toBe('function_call_output');
            expect(sent.at(-1)?.type).toBe('response.create');
            expect(client.ConversationMemory.Seed().Entries.filter((e) => e.Kind === 'toolResult')).toHaveLength(1);
            await client.Disconnect();
        });
    });

    describe('#35: the swap resets the local response bookkeeping', () => {
        it('a response.create the old connection never confirmed does not leave IsBusy stuck after the re-request', async () => {
            const client = await connectOpenAI();
            client.Pc.Channel.EmitServer({ type: 'response.function_call_arguments.done', call_id: 'call_1', name: 'Lookup', arguments: '{}' });
            // The result's response.create goes out on the old connection, which dies before confirming it.
            client.SendToolResult('call_1', '{"status":"paid"}');
            expect(client.IsBusy).toBe(true);

            const swap = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(await swap).toBe(true);
            // The cut-off answer is asked for again on the new connection.
            expect(frames(client.Pc.Channel.Sent).at(-1)?.type).toBe('response.create');

            client.Pc.Channel.EmitServer({ type: 'response.created' });
            client.Pc.Channel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: 'It is paid.' });
            client.Pc.Channel.EmitServer({ type: 'response.done' });

            expect(client.IsBusy).toBe(false);
            await client.Disconnect();
        });
    });

    describe('#40: re-requesting an answer the move cut off', () => {
        it('re-requests when context notes follow the question in the seed', async () => {
            const client = await connectOpenAI();
            answerInFlight((e) => client.Pc.Channel.EmitServer(e));
            client.SendContextNote('The user switched to the web channel.');

            const swap = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(await swap).toBe(true);

            const types = frames(client.Pc.Channel.Sent).map((f) => f.type);
            expect(types.filter((t) => t === 'response.create')).toHaveLength(1);
            expect(types.at(-1)).toBe('response.create');
            await client.Disconnect();
        });

        it('xAI native resumption: re-requests a cut-off answer on the resumed connection', async () => {
            const client = await connectXAI({ TrustNativeResumption: true });
            answerInFlight((e) => client.Socket.onmessage?.(JSON.stringify(e)));

            const swap = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(await swap).toBe(true);

            expect(client.Socket.Url).toContain('conversation_id=conv_42');
            const types = client.Socket.SentTypes();
            expect(types).not.toContain('conversation.item.create');
            expect(types.filter((t) => t === 'response.create')).toHaveLength(1);
            await client.Disconnect();
        });

        it('text held during the move is answered together with the cut-off answer, without cancelling it', async () => {
            const client = await connectOpenAI();
            answerInFlight((e) => client.Pc.Channel.EmitServer(e));
            let releaseSdp: () => void = () => undefined;
            client.SdpGate = new Promise<void>((resolve) => {
                releaseSdp = resolve;
            });

            const swap = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            client.SendText('And of Chile?');
            client.SdpGate = null;
            releaseSdp();
            await vi.advanceTimersByTimeAsync(10);
            expect(await swap).toBe(true);

            const sent = frames(client.Pc.Channel.Sent);
            const types = sent.map((f) => f.type);
            expect(types).not.toContain('response.cancel');
            expect(types.filter((t) => t === 'response.create')).toHaveLength(1);
            const textAt = sent.findIndex((f) => (f.item?.content ?? []).some((c) => c.text === 'And of Chile?'));
            expect(textAt).toBeGreaterThan(-1);
            expect(types.lastIndexOf('response.create')).toBeGreaterThan(textAt);
            await client.Disconnect();
        });
    });
});

// ── Review wave 2: a loss of the old transport during a planned move ────────────

/** How many frames in `sent` carry `text` as a typed user turn. */
function typedTurns(sent: string[], text: string): number {
    return frames(sent).filter(
        (f) => f.type === 'conversation.item.create' && f.item?.role === 'user' && (f.item?.content ?? []).some((c) => c.text === text)
    ).length;
}

/** Holds the next OpenAI SDP answer until the returned function fails it (the attempt is in flight until then). */
function holdNextAnswer(client: LossTestOpenAIClient): (error: Error) => void {
    let fail: (error: Error) => void = () => undefined;
    client.SdpGate = new Promise<void>((_resolve, reject) => {
        fail = reject;
    });
    return (error: Error) => {
        client.SdpGate = null;
        fail(error);
    };
}

/** The real HuggingFace client over fake sockets; with `HoldSockets` a new socket waits for the test to open or fail it. */
class HoldTestHFClient extends HuggingFaceRealtimeClient {
    public Sockets: FakeSocket[] = [];
    public HoldSockets = false;

    protected override createSocket(_url: string): IOpenAIProtocolClientSocket {
        const socket = new FakeSocket();
        this.Sockets.push(socket);
        if (!this.HoldSockets) {
            queueMicrotask(() => openHFSocket(socket));
        }
        return socket;
    }
    protected override async createMicCapture(): Promise<IPcmMicCapture> {
        return new FakeMicCapture();
    }
    protected override createPlayback(): IRealtimePcmPlayback {
        return new FakePlayback();
    }
}

/** The endpoint opens the socket and confirms the session, as HuggingFace does before it takes the session config. */
function openHFSocket(socket: FakeSocket): void {
    socket.onopen?.();
    socket.onmessage?.(JSON.stringify({ type: 'session.created' }));
}

async function connectHF(): Promise<HoldTestHFClient> {
    const client = new HoldTestHFClient();
    const connecting = client.Connect(
        {
            Provider: 'huggingface',
            Model: 'hf',
            EphemeralToken: 'wss://proxy/x',
            ExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            ConnectionMaxSeconds: 600,
            SessionConfig: { session: { instructions: 'HF prompt' } },
        },
        new FakeMediaStream([new FakeTrack()])
    );
    await vi.advanceTimersByTimeAsync(1);
    await connecting;
    return client;
}

describe('a loss of the old transport while a planned move runs (#6462 review wave 2)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('the failed attempt does not go back to a dead transport', () => {
        it('OpenAI WebRTC: a peer connection that fails during the attempt is not gone back to; the cycle goes on', async () => {
            const client = await connectOpenAI();
            const old = client.Pc;
            const { states, errors } = collect(client);
            const failAnswer = holdNextAnswer(client);

            void client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            client.SendText('Are you still there?');
            old.SetConnectionState('failed'); // its data channel still reads open
            failAnswer(new Error('SDP exchange failed'));
            await vi.advanceTimersByTimeAsync(0);

            expect(old.Channel.readyState).toBe('open');
            // The cycle knew the old connection was lost, so it did not even ask to go back to it.
            expect(client.ReturnsAsked).toBe(0);
            expect(states).toEqual(['connecting']);
            expect(typedTurns(old.Channel.Sent, 'Are you still there?')).toBe(0);

            await vi.advanceTimersByTimeAsync(1_100); // the next attempt, after its 1 s retry delay
            expect(client.PeerConnections).toHaveLength(3);
            expect(typedTurns(client.Pc.Channel.Sent, 'Are you still there?')).toBe(1);
            expect(states).toContain('listening');
            expect(errors).toEqual([]);
            await client.Disconnect();
        });

        it('OpenAI WebRTC: a data channel that closes during the attempt is not gone back to', async () => {
            const client = await connectOpenAI();
            const old = client.Pc;
            const { states, errors } = collect(client);
            const failAnswer = holdNextAnswer(client);

            void client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            old.Channel.Drop();
            failAnswer(new Error('SDP exchange failed'));
            await vi.advanceTimersByTimeAsync(0);

            expect(client.ReturnsAsked).toBe(0);
            expect(states).toEqual(['connecting']);
            await vi.advanceTimersByTimeAsync(1_100);
            expect(client.PeerConnections).toHaveLength(3);
            expect(states.at(-1)).toBe('listening');
            expect(errors).toEqual([]);
            await client.Disconnect();
        });

        it('OpenAI WebRTC: a peer connection that lost its path is refused, though no loss was reported yet', async () => {
            const client = await connectOpenAI();
            const old = client.Pc;
            const { states } = collect(client);
            const failAnswer = holdNextAnswer(client);

            void client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            client.SendText('Are you still there?');
            old.SetConnectionState('disconnected'); // inside its grace period: no loss reported
            failAnswer(new Error('SDP exchange failed'));
            await vi.advanceTimersByTimeAsync(0);

            expect(old.Channel.readyState).toBe('open');
            expect(client.ReturnsAsked).toBe(1); // asked, and refused
            expect(states).toEqual(['connecting']);
            expect(typedTurns(old.Channel.Sent, 'Are you still there?')).toBe(0);

            await vi.advanceTimersByTimeAsync(1_100);
            expect(client.PeerConnections).toHaveLength(3);
            expect(typedTurns(client.Pc.Channel.Sent, 'Are you still there?')).toBe(1);
            await client.Disconnect();
        });

        it('xAI: a socket adopted by an earlier reconnect that closes during the attempt is not gone back to', async () => {
            const client = await connectXAI();
            const firstMove = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(await firstMove).toBe(true);
            const adopted = client.Socket;
            const { states, errors } = collect(client);

            client.HoldSockets = true;
            void client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(client.Sockets).toHaveLength(3);
            client.SendText('Are you still there?');
            adopted.onclose?.();
            expect(client.CanSend()).toBe(false);
            client.HoldSockets = false;
            client.Socket.onclose?.(); // the attempt's handshake fails
            await vi.advanceTimersByTimeAsync(0);

            expect(client.ReturnsAsked).toBe(0);
            expect(states).toEqual(['connecting']);
            expect(typedTurns(adopted.Sent, 'Are you still there?')).toBe(0);

            await vi.advanceTimersByTimeAsync(1_100);
            expect(client.Sockets).toHaveLength(4);
            expect(typedTurns(client.Socket.Sent, 'Are you still there?')).toBe(1);
            expect(states).toContain('listening');
            expect(errors).toEqual([]);
            await client.Disconnect();
        });
    });

    describe('input sent right after the old transport is lost while the call is live on it', () => {
        it('OpenAI WebRTC: a tool result and a typed turn are held, delivered once on the new connection, and the call settles', async () => {
            const client = await connectOpenAI();
            toolCallInFlight((e) => client.Pc.Channel.EmitServer(e));
            const old = client.Pc;
            const failAnswer = holdNextAnswer(client);
            void client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            failAnswer(new Error('SDP exchange failed'));
            await vi.advanceTimersByTimeAsync(0);
            const { states } = collect(client);

            old.SetConnectionState('failed'); // during the retry delay, with the call live on it again
            client.SendToolResult('call_sage', '{"answer":"Sage says 42"}');
            client.SendText('Did you find it?');

            expect(states).toEqual(['connecting']);
            expect(frames(old.Channel.Sent).some((f) => carriesOutput(f, 'Sage says 42'))).toBe(false);
            expect(typedTurns(old.Channel.Sent, 'Did you find it?')).toBe(0);

            await vi.advanceTimersByTimeAsync(1_100);
            expect(client.PeerConnections).toHaveLength(3);
            const sent = frames(client.Pc.Channel.Sent);
            expect(sent.filter((f) => carriesOutput(f, 'Sage says 42'))).toHaveLength(1);
            expect(typedTurns(client.Pc.Channel.Sent, 'Did you find it?')).toBe(1);
            expect(client.ConversationMemory.Seed().Entries.filter((e) => e.Kind === 'toolResult')).toHaveLength(1);
            expect(client['inFlightToolCallIds'].has('call_sage')).toBe(false);
            await client.Disconnect();
        });
    });

    describe('HuggingFace (it never starts a recovery, but a running move takes the loss)', () => {
        it('the old socket closing while the move is in flight does not end the call', async () => {
            const client = await connectHF();
            const { states, errors } = collect(client);
            client.HoldSockets = true;

            const moving = client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            expect(client.Sockets).toHaveLength(2);
            client.Sockets[0].onclose?.();
            expect(states).not.toContain('closed');

            openHFSocket(client.Sockets[1]);
            await vi.advanceTimersByTimeAsync(10);
            expect(await moving).toBe(true);
            expect(states).toEqual(['connecting', 'listening']);
            expect(errors).toEqual([]);
            await client.Disconnect();
        });

        it('the old socket closing while the call is live on it after a failed attempt goes to the next attempt', async () => {
            const client = await connectHF();
            const { states, errors } = collect(client);
            client.HoldSockets = true;

            void client.TriggerReconnect('duration-expiry');
            await vi.advanceTimersByTimeAsync(10);
            client.HoldSockets = false;
            client.Sockets[1].onclose?.(); // the attempt's handshake fails
            await vi.advanceTimersByTimeAsync(0);
            expect(states).toEqual(['connecting', 'listening']);

            client.Sockets[0].onclose?.();
            expect(states.at(-1)).toBe('connecting');
            await vi.advanceTimersByTimeAsync(1_100);

            expect(client.Sockets).toHaveLength(3);
            expect(states.at(-1)).toBe('listening');
            expect(states).not.toContain('closed');
            expect(errors).toEqual([]);
            await client.Disconnect();
        });
    });

    it('xAI native resumption: a question the old socket heard while the attempt opened is answered on the resumed connection', async () => {
        const client = await connectXAI({ TrustNativeResumption: true });
        const old = client.Socket;
        client.HoldSockets = true;

        const moving = client.TriggerReconnect('duration-expiry');
        await vi.advanceTimersByTimeAsync(10);
        answerInFlight((e) => old.onmessage?.(JSON.stringify(e)));
        client.Socket.onopen?.();
        await vi.advanceTimersByTimeAsync(10);
        expect(await moving).toBe(true);

        expect(client.Socket.Url).toContain('conversation_id=conv_42');
        const types = client.Socket.SentTypes();
        expect(types).not.toContain('conversation.item.create');
        expect(types.filter((t) => t === 'response.create')).toHaveLength(1);
        await client.Disconnect();
    });
});
