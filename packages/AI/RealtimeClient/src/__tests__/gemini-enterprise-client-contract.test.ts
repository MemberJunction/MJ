/**
 * The Gemini Enterprise browser client against the web build of `@google/genai` and a fake global `WebSocket`: what
 * actually goes over the socket to MJAPI's relay. `@google/genai` resolves to the Node build under vitest, so this file
 * swaps in the web build, which is what a browser bundle gets.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@google/genai', async () => vi.importActual<typeof import('@google/genai/web')>('@google/genai/web'));

import { MJGlobal } from '@memberjunction/global';
import type { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient, type RealtimeClientTranscript, type RealtimeClientUsage } from '../generic/baseRealtimeClient';
import { GeminiRealtimeClient, type IGeminiAudioPlayback, type IGeminiMicCapture } from '../drivers/geminiRealtimeClient';
import { GeminiEnterpriseRealtimeClient } from '../drivers/geminiEnterpriseRealtimeClient';
import { GEMINI_AVATAR_MP4_TYPE, VideoPlayout, type IAvatarVideoPlayout, type VideoPlayoutOptions } from '../media/videoPlayout';
import { AttachVideoSource } from '../media/attachVideoSource';
import type { MediaVideoSource } from '../media/model';
import { InstallFakeDom } from './helpers/fake-dom';
import { FakeMediaSource, InstallFakeMse } from './helpers/fake-mse';
import { AvatarFragment, AvatarInitSegment, AvatarVideoFragment, PieceToBase64 } from './helpers/fmp4-pieces';
import { FakeAvatarPlayout, FakeGeminiPlayback, FakeMediaStream, FakeMicCapture, FakeTrack } from './helpers/realtime-fakes';

// ── A fake browser WebSocket ────────────────────────────────────────────────────────────────────────────

/** Stands in for the browser's `WebSocket`: records the URL and every frame sent; the test plays the relay. */
class FakeWebSocket {
    public static readonly Instances: FakeWebSocket[] = [];
    public onopen: ((event: Event) => void) | null = null;
    public onmessage: ((event: { data: string }) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onclose: ((event: CloseEvent) => void) | null = null;
    public readonly Sent: string[] = [];
    public Closed = false;

    constructor(public readonly Url: string, public readonly Protocols?: string | string[]) {
        FakeWebSocket.Instances.push(this);
    }

    public send(data: string): void {
        this.Sent.push(data);
    }

    public close(): void {
        this.Closed = true;
    }

    /** The relay accepted the upgrade. */
    public Open(): void {
        this.onopen?.(new Event('open'));
    }

    /** A frame from the relay (Google's JSON, passed through). */
    public Receive(message: JSONObject): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    /** The frames sent, parsed. */
    public get Frames(): JSONObject[] {
        return this.Sent.map((frame) => JSON.parse(frame) as JSONObject);
    }
}

// ── The client, with fake audio and video ───────────────────────────────────────────────────────────────

/** The Enterprise client with its real transport (the web SDK) and fake mic, playback and avatar player. */
class EnterpriseHarness extends GeminiEnterpriseRealtimeClient {
    public readonly Playback = new FakeGeminiPlayback();
    public readonly Capture = new FakeMicCapture();
    public OnPcmChunk: ((base64Pcm16: string) => void) | null = null;

    protected override async createMicCapture(_micStream: MediaStream, onPcmChunk: (base64Pcm16: string) => void): Promise<IGeminiMicCapture> {
        this.OnPcmChunk = onPcmChunk;
        return this.Capture;
    }

    protected override createPlayback(): IGeminiAudioPlayback {
        return this.Playback;
    }

    protected override CreateVideoPlayout(options: VideoPlayoutOptions): IAvatarVideoPlayout {
        return new FakeAvatarPlayout(options);
    }
}

/** The Enterprise client with the real avatar player, over the fake MSE and DOM. */
class EnterprisePlayerHarness extends EnterpriseHarness {
    protected override CreateVideoPlayout(options: VideoPlayoutOptions): IAvatarVideoPlayout {
        return new VideoPlayout(options);
    }
}

const TICKET = '3f2c7a10-1111-4222-8333-944455556666';
const LOCAL_RELAY = `ws://localhost:4000/realtime/relay/${TICKET}`;
const BIDI_PATH = '/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent';
const PLACEHOLDER_KEY = 'mjapi-relay';

interface PactOptions {
    /** The minted relay URL. Default: MJAPI on localhost without TLS. */
    RelayUrl?: string;
    /** The server granted an avatar (the `avatar` block). */
    Avatar?: boolean;
    /** The host shows the agent's video (the Avatar channel asks for the outbound video track). Default true. */
    ShowAvatar?: boolean;
    /** Replaces the minted config. */
    Config?: JSONObject;
}

/** A session config as `GeminiEnterpriseRealtime` mints it: a minimal config, the model's facts, the avatar block. */
function enterprisePact(options: PactOptions = {}): ClientRealtimeSessionConfig {
    const avatar = options.Avatar ?? false;
    const sessionConfig: JSONObject = {
        model: 'gemini-3.8-live',
        config: options.Config ?? (avatar ? { responseModalities: ['VIDEO'], avatarConfig: { avatarName: 'Ben' } } : { responseModalities: ['AUDIO'] }),
        idleSignal: 'turnComplete',
        supportsInboundVideo: true,
        maxInboundVideoRate: 1,
        maxInboundVideoStreams: 1,
    };
    if (avatar) {
        sessionConfig['avatar'] = { output: true, encoding: GEMINI_AVATAR_MP4_TYPE, audioMuxed: true };
    }
    if (avatar && options.ShowAvatar !== false) {
        sessionConfig['requestedTracks'] = [{ Modality: 'video', Direction: 'outbound' }];
    }
    return {
        Provider: 'gemini-enterprise',
        Model: 'gemini-3.8-live',
        EphemeralToken: '',
        ExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        Transport: 'relay',
        RelayUrl: options.RelayUrl ?? LOCAL_RELAY,
        SessionConfig: sessionConfig,
    };
}

/** Waits for the client to open its next socket. */
async function nextSocket(count: number): Promise<FakeWebSocket> {
    await vi.waitFor(() => expect(FakeWebSocket.Instances.length).toBeGreaterThanOrEqual(count));
    return FakeWebSocket.Instances[count - 1];
}

/** Opens a socket the client asked for: the relay accepts it, the SDK sends its setup, and the relay passes on Google's `setupComplete`. */
async function openAndConfirm(socket: FakeWebSocket): Promise<void> {
    socket.Open();
    await vi.waitFor(() => expect(socket.Sent.length).toBeGreaterThan(0));
    socket.Receive({ setupComplete: {} });
}

/** Connects a client through the fake relay: the socket opens, the SDK sends its setup, and Google confirms it. */
async function connect(pact: ClientRealtimeSessionConfig, client = new EnterpriseHarness()): Promise<{ Client: EnterpriseHarness; Socket: FakeWebSocket }> {
    const connecting = client.Connect(pact, new FakeMediaStream([new FakeTrack()]));
    const socket = await nextSocket(FakeWebSocket.Instances.length + 1);
    await openAndConfirm(socket);
    await connecting;
    return { Client: client, Socket: socket };
}

/** The `setup` body of a socket's first frame. */
function setupOf(socket: FakeWebSocket): JSONObject {
    const first = socket.Frames[0];
    expect(Object.keys(first)).toEqual(['setup']);
    return first['setup'] as JSONObject;
}

function modalitiesOf(socket: FakeWebSocket): unknown {
    return (setupOf(socket)['generationConfig'] as JSONObject | undefined)?.['responseModalities'];
}

// ── Tests ──────────────────────────────────────────────────────────────────────────────────────────────

describe('GeminiEnterpriseRealtimeClient through the relay (web SDK, fake WebSocket)', () => {
    beforeEach(() => {
        FakeWebSocket.Instances.length = 0;
        vi.stubGlobal('WebSocket', FakeWebSocket);
        InstallFakeMse();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("is registered under 'gemini-enterprise', and 'gemini' still resolves the Developer API client", () => {
        const factory = MJGlobal.Instance.ClassFactory;
        expect(factory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'gemini-enterprise')).toBeInstanceOf(GeminiEnterpriseRealtimeClient);
        const developer = factory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'gemini');
        expect(developer).toBeInstanceOf(GeminiRealtimeClient);
        expect(developer).not.toBeInstanceOf(GeminiEnterpriseRealtimeClient);
    });

    describe('the URL', () => {
        it('opens the relay URL plus the Vertex Live path, over ws for a ws relay URL', async () => {
            const { Socket } = await connect(enterprisePact());
            expect(Socket.Url).toBe(`${LOCAL_RELAY}${BIDI_PATH}`);
        });

        it('over wss for a wss relay URL', async () => {
            const relay = `wss://mjapi.example.test/realtime/relay/${TICKET}`;
            const { Socket } = await connect(enterprisePact({ RelayUrl: relay }));
            expect(Socket.Url).toBe(`${relay}${BIDI_PATH}`);
        });

        it('carries no key and no query: the placeholder API key never leaves the page', async () => {
            const { Client, Socket } = await connect(enterprisePact());
            Client.OnPcmChunk?.('AAAA');
            expect(Socket.Url).not.toContain('?');
            expect(Socket.Url).not.toContain(PLACEHOLDER_KEY);
            expect(Socket.Sent.join('\n')).not.toContain(PLACEHOLDER_KEY);
            expect(Socket.Protocols).toBeUndefined();
        });

        it('refuses a relay URL that is not a ws(s) URL, without quoting it', async () => {
            const client = new EnterpriseHarness();
            const failed = client.Connect(enterprisePact({ RelayUrl: `auth_tokens/${TICKET}` }), new FakeMediaStream([new FakeTrack()]));
            await expect(failed).rejects.toThrow('the relay URL is not a ws:// or wss:// URL');
            await expect(failed).rejects.not.toThrow(TICKET);
            expect(FakeWebSocket.Instances).toEqual([]);
        });

        it('connects to RelayUrl and never to the token, even a token that looks like a relay URL', async () => {
            const pact = { ...enterprisePact(), EphemeralToken: 'wss://elsewhere.example.test/realtime/relay/not-this-one' };
            const { Socket } = await connect(pact);
            expect(Socket.Url).toBe(`${LOCAL_RELAY}${BIDI_PATH}`);
        });

        it("refuses a session that is not a relay session (Transport 'direct' or none): Gemini Enterprise has no direct path", async () => {
            const { Transport: _transport, ...unmarked } = enterprisePact();
            const sessions: ClientRealtimeSessionConfig[] = [
                { ...enterprisePact(), Transport: 'direct' },
                unmarked,
                // A session as this client once read it: the relay URL as the token, and no transport.
                { ...unmarked, RelayUrl: undefined, EphemeralToken: LOCAL_RELAY },
            ];
            for (const session of sessions) {
                const failed = new EnterpriseHarness().Connect(session, new FakeMediaStream([new FakeTrack()]));
                await expect(failed).rejects.toThrow("the session is not a relay session (Transport 'relay')");
                await expect(failed).rejects.not.toThrow(TICKET);
            }
            expect(FakeWebSocket.Instances).toEqual([]);
        });

        it('refuses a relay session that has no relay URL', async () => {
            const failed = new EnterpriseHarness().Connect({ ...enterprisePact(), RelayUrl: undefined }, new FakeMediaStream([new FakeTrack()]));
            await expect(failed).rejects.toThrow('the relay session has no relay URL');
            expect(FakeWebSocket.Instances).toEqual([]);
        });
    });

    describe('the relay URL is never logged', () => {
        /** Everything the client wrote to the console, and every error it reported to the host. */
        function captureOutput(client: EnterpriseHarness): () => string[] {
            const spies = [
                vi.mocked(console.warn),
                vi.mocked(console.info),
                ...(['log', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined)),
            ];
            const errors: string[] = [];
            client.OnError((error) => errors.push(error.Message));
            return () => [...spies.flatMap((spy) => spy.mock.calls.map((call: unknown[]) => call.map(String).join(' '))), ...errors];
        }

        it('not while it connects, resumes after a lost connection, or fails, with verbose diagnostics on', async () => {
            vi.stubEnv('MJ_VERBOSE', 'true');
            // A session that loses its connection and resumes on the same relay URL.
            const resumed = new EnterpriseHarness();
            const resumedOutput = captureOutput(resumed);
            const { Socket: first } = await connect(enterprisePact({ Avatar: true }), resumed);
            first.Receive({ sessionResumptionUpdate: { newHandle: 'handle-1', resumable: true } });
            await vi.waitFor(() => expect(resumed.ResumptionHandle).toBe('handle-1'));
            first.onerror?.(new Event('error'));
            first.onclose?.(new CloseEvent('close', { code: 1006, reason: 'relay went away', wasClean: false }));
            const second = await nextSocket(2);
            await openAndConfirm(second);
            await resumed.Disconnect();

            // A session whose connection fails before Google issued a handle: a fatal error to the host.
            const failed = new EnterpriseHarness();
            const failedOutput = captureOutput(failed);
            const { Socket: third } = await connect(enterprisePact(), failed);
            third.onclose?.(new CloseEvent('close', { code: 1011, reason: 'upstream closed', wasClean: false }));
            await failed.Disconnect();

            const lines = [...resumedOutput(), ...failedOutput()];
            expect(lines.some((line) => line.includes('Transport closed'))).toBe(true); // the client did report
            expect(lines.some((line) => line.includes('connection closed (1011)'))).toBe(true);
            expect(lines.filter((line) => line.includes(TICKET))).toEqual([]);
            vi.unstubAllEnvs();
        });

        it('not when it refuses a session', async () => {
            const client = new EnterpriseHarness();
            const output = captureOutput(client);
            for (const session of [{ ...enterprisePact(), Transport: 'direct' as const }, enterprisePact({ RelayUrl: `ftp://mjapi.example.test/realtime/relay/${TICKET}` })]) {
                await expect(client.Connect(session, new FakeMediaStream([new FakeTrack()]))).rejects.toThrow('GeminiEnterpriseRealtimeClient');
            }
            expect(output().filter((line) => line.includes(TICKET))).toEqual([]);
        });
    });

    describe('setup first', () => {
        it('sends one setup frame before anything else, with no system prompt and no tools; input follows on the same socket', async () => {
            const { Client, Socket } = await connect(enterprisePact());
            const setup = setupOf(Socket);
            expect(setup['model']).toBe('publishers/google/models/gemini-3.8-live');
            expect(setup['systemInstruction']).toBeUndefined();
            expect(setup['tools']).toBeUndefined();
            expect(Socket.Sent).toHaveLength(1);

            Client.OnPcmChunk?.('AAAA');
            expect(Socket.Frames[1]).toEqual({ realtimeInput: { audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } } });
        });

        it('sends after the setup only frames the relay forwards: realtime audio, video and text, user text turns, the commit, tool responses', async () => {
            const pact = enterprisePact();
            pact.SessionConfig['requestedTracks'] = [
                { Modality: 'audio', Direction: 'inbound' },
                { Modality: 'audio', Direction: 'outbound' },
                { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 },
            ];
            const { Client, Socket } = await connect(pact);
            const calls: string[] = [];
            Client.OnToolCall((call) => calls.push(call.CallID));

            Client.OnPcmChunk?.('AAAA');
            expect(Client.SendVideoFrame('BBBB', 'image/jpeg')).toBe(true);
            Client.SendContextNote('a note');
            Client.SendText('hello');
            Socket.Receive({ toolCall: { functionCalls: [{ id: 'call-1', name: 'lookup_order', args: {} }] } });
            await vi.waitFor(() => expect(calls).toEqual(['call-1']));
            Client.SendToolResult('call-1', '{"status":"shipped"}');

            // The forms AV6's relay policy forwards (GeminiLiveRelayPolicy): one top-level key, known fields only.
            expect(Socket.Frames.slice(1)).toEqual([
                { realtimeInput: { audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } } },
                { realtimeInput: { video: { data: 'BBBB', mimeType: 'image/jpeg' } } },
                { clientContent: { turns: [{ role: 'user', parts: [{ text: 'a note' }] }], turnComplete: false } },
                { realtimeInput: { text: 'hello' } },
                { toolResponse: { functionResponses: [{ id: 'call-1', name: 'lookup_order', response: { status: 'shipped' } }] } },
                { clientContent: { turnComplete: true } },
            ]);
        });

        it('passes what the relay sends back to the session (Google\'s frames, unchanged)', async () => {
            const { Client, Socket } = await connect(enterprisePact());
            const transcripts: RealtimeClientTranscript[] = [];
            Client.OnTranscript((t) => transcripts.push(t));
            Socket.Receive({ serverContent: { outputTranscription: { text: 'Hello' } } });
            await vi.waitFor(() => expect(transcripts).toEqual([{ Role: 'Assistant', Text: 'Hello', IsFinal: false, Kind: 'normal' }]));
        });
    });

    describe('response modalities', () => {
        it('states VIDEO, with the avatar\'s name, when the host shows the granted avatar', async () => {
            const { Socket } = await connect(enterprisePact({ Avatar: true }));
            expect(modalitiesOf(Socket)).toEqual(['VIDEO']);
            expect(setupOf(Socket)['avatarConfig']).toEqual({ avatarName: 'Ben' });
        });

        it('still states VIDEO when the minted config names no modalities (the web SDK would fill in AUDIO)', async () => {
            const { Socket } = await connect(enterprisePact({ Avatar: true, Config: { avatarConfig: { avatarName: 'Ben' } } }));
            expect(modalitiesOf(Socket)).toEqual(['VIDEO']);
        });

        it('downgrades to AUDIO, without the avatar, when the host shows no agent video', async () => {
            const { Socket } = await connect(enterprisePact({ Avatar: true, ShowAvatar: false }));
            expect(modalitiesOf(Socket)).toEqual(['AUDIO']);
            expect(setupOf(Socket)['avatarConfig']).toBeUndefined();
        });

        it('states AUDIO for a session without an avatar, even when the minted config names no modalities', async () => {
            expect(modalitiesOf((await connect(enterprisePact())).Socket)).toEqual(['AUDIO']);
            expect(modalitiesOf((await connect(enterprisePact({ Config: {} }))).Socket)).toEqual(['AUDIO']);
        });

        it('states AUDIO when the config names an avatar the mint did not grant (no avatar block): VIDEO follows the live track', async () => {
            expect(modalitiesOf((await connect(enterprisePact({ Config: { avatarConfig: { avatarName: 'Ben' } } }))).Socket)).toEqual(['AUDIO']);
        });
    });

    describe('the downgrade line (inherited from the Gemini client)', () => {
        const downgradeLines = (): string[] =>
            vi.mocked(console.warn).mock.calls.map((call) => String(call[0])).filter((line) => line.includes('[GeminiRealtimeClient] Avatar "Ben" not used'));

        it("says 'host' when the host shows no agent video", async () => {
            await connect(enterprisePact({ Avatar: true, ShowAvatar: false }));
            expect(downgradeLines()).toEqual(['[GeminiRealtimeClient] Avatar "Ben" not used: the host shows no agent video. The call is audio only. Reason: host.']);
        });

        it("says 'browser', and asks for audio, when the host shows the avatar but this browser can't play it", async () => {
            FakeMediaSource.Supported = false;
            const { Socket } = await connect(enterprisePact({ Avatar: true }));
            expect(modalitiesOf(Socket)).toEqual(['AUDIO']);
            expect(setupOf(Socket)['avatarConfig']).toBeUndefined();
            expect(downgradeLines()).toEqual([`[GeminiRealtimeClient] Avatar "Ben" not used: this browser cannot play ${GEMINI_AVATAR_MP4_TYPE}. The call is audio only. Reason: browser.`]);
        });
    });

    describe('usage', () => {
        /** A model part as Google sends it: base64 bytes and a MIME type. */
        function videoPart(piece: ArrayBuffer): JSONObject {
            return { inlineData: { mimeType: 'video/mp4', data: PieceToBase64(piece) } };
        }

        it("counts the avatar's video seconds, as the Gemini client does", async () => {
            const { Client, Socket } = await connect(enterprisePact({ Avatar: true }));
            const usages: RealtimeClientUsage[] = [];
            Client.OnUsage((u) => usages.push(u));
            Socket.Receive({ serverContent: { modelTurn: { role: 'model', parts: [videoPart(AvatarInitSegment()), videoPart(AvatarVideoFragment(24))] } } });
            Socket.Receive({ serverContent: { generationComplete: true } });

            await vi.waitFor(() => expect(usages).toHaveLength(1));
            expect(Object.keys(usages[0])).toEqual(['OutputTokenDetails']);
            expect(usages[0].OutputTokenDetails?.VideoSeconds).toBeCloseTo(1, 9);
        });

        it("reads Vertex AI's response split (candidatesTokensDetails), VIDEO included, through the web SDK", async () => {
            const { Client, Socket } = await connect(enterprisePact({ Avatar: true }));
            const usages: RealtimeClientUsage[] = [];
            Client.OnUsage((u) => usages.push(u));
            Socket.Receive({
                usageMetadata: {
                    promptTokenCount: 120,
                    candidatesTokenCount: 6292,
                    candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: 100 }, { modality: 'VIDEO', tokenCount: 6192 }],
                },
            });

            await vi.waitFor(() => expect(usages).toHaveLength(1));
            expect(usages[0]).toMatchObject({ InputTokens: 120, OutputTokens: 6292, OutputTokenDetails: { AudioTokens: 100, VideoTokens: 6192 } });
        });
    });

    describe('resume', () => {
        it('reopens the same relay URL with Google\'s handle, keeping the modalities, and closes the old socket', async () => {
            const { Client, Socket: first } = await connect(enterprisePact({ Avatar: true }));
            first.Receive({ sessionResumptionUpdate: { newHandle: 'handle-1', resumable: true } });
            await vi.waitFor(() => expect(Client.ResumptionHandle).toBe('handle-1'));
            first.Receive({ goAway: { timeLeft: '50s' } });

            const second = await nextSocket(2);
            await openAndConfirm(second);
            expect(second.Url).toBe(first.Url);
            expect(setupOf(second)['sessionResumption']).toEqual({ handle: 'handle-1' });
            expect(modalitiesOf(second)).toEqual(['VIDEO']);
            expect(setupOf(first)['sessionResumption']).toBeUndefined();
            await vi.waitFor(() => expect(first.Closed).toBe(true));
        });

        it("keeps the avatar's player: the relay's new socket brings the next init and fragments to the same element and source buffer", async () => {
            const dom = InstallFakeDom();
            const client = new EnterprisePlayerHarness();
            const videos: MediaVideoSource[] = [];
            client.OnRemoteVideo((video) => videos.push(video));
            const { Socket: first } = await connect(enterprisePact({ Avatar: true }), client);
            AttachVideoSource(videos[0], document.createElement('video'));
            const element = dom.Videos[0];
            const source = FakeMediaSource.Instances[0];
            source.Open();
            const buffer = source.Buffers[0];
            const url = element.src;
            const parts = (...pieces: ArrayBuffer[]): JSONObject => ({
                serverContent: { modelTurn: { role: 'model', parts: pieces.map((piece) => ({ inlineData: { mimeType: 'video/mp4', data: PieceToBase64(piece) } })) } },
            });
            first.Receive(parts(AvatarInitSegment(), AvatarFragment(1)));
            first.Receive({ sessionResumptionUpdate: { newHandle: 'handle-1', resumable: true } });
            first.Receive({ goAway: { timeLeft: '50s' } });

            const second = await nextSocket(2);
            await openAndConfirm(second);
            await vi.waitFor(() => expect(first.Closed).toBe(true));
            second.Receive(parts(AvatarInitSegment(), AvatarFragment(2)));

            await vi.waitFor(() => expect(buffer.Appended).toHaveLength(4));
            expect(second.Url).toBe(first.Url);
            const sent = [AvatarInitSegment(), AvatarFragment(1), AvatarInitSegment(), AvatarFragment(2)];
            expect(buffer.Appended.map((piece) => new Uint8Array(piece))).toEqual(sent.map((piece) => new Uint8Array(piece)));
            expect([FakeMediaSource.Instances.length, source.Buffers.length, element.src, element.Loads, element.Paused]).toEqual([1, 1, url, 0, false]);
            expect(buffer.Removed).toEqual([]);
            expect(videos).toHaveLength(1);
        });
    });
});
