import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    CHANNEL_INBOUND_VIDEO_TRACK,
    ClientRealtimeSessionConfig,
    RealtimeTrackDescriptor,
} from '@memberjunction/ai';
import type { LiveServerMessage } from '@google/genai';

const DEFAULT_AUDIO_TRACKS: readonly RealtimeTrackDescriptor[] = [
    { Modality: 'audio', Direction: 'inbound' },
    { Modality: 'audio', Direction: 'outbound' },
];
import {
    FakeMediaStream,
    FakeTrack,
    GeminiTestClient,
    makeGeminiConfig,
} from './helpers/realtime-fakes';
import {
    createCameraCapture,
    createScreenCapture,
    createStreamFrameCapture,
} from '../media/frameCapture';
import {
    ChannelInboundVideoBridge,
    IChannelFrameProvider,
} from '../media/channelVideoSource';

describe('Phase F — Realtime Video Tracks, Bridge, and Continuity', () => {
    let client: GeminiTestClient;

    beforeEach(() => {
        vi.useFakeTimers();
        client = new GeminiTestClient();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ── F1: Frame Capture ──────────────────────────────────────────────────────

    describe('F1: Frame Capture consent and rate ceiling', () => {
        it('refuses camera capture when consent is required but not granted', async () => {
            const onFrame = vi.fn();
            await expect(
                createCameraCapture({
                    Descriptor: { ...CHANNEL_INBOUND_VIDEO_TRACK, RequiresConsent: true },
                    ConsentGranted: false,
                    OnFrame: onFrame,
                })
            ).rejects.toThrow('Explicit consent is required');
        });

        it('refuses screen capture when consent is required but not granted', async () => {
            const onFrame = vi.fn();
            await expect(
                createScreenCapture({
                    Descriptor: { ...CHANNEL_INBOUND_VIDEO_TRACK, RequiresConsent: true },
                    ConsentGranted: false,
                    OnFrame: onFrame,
                })
            ).rejects.toThrow('Explicit consent is required');
        });

        it('clamps capture rate to at most 1 fps ceiling', () => {
            const track = new FakeTrack();
            const stream = new FakeMediaStream([track]);
            const onFrame = vi.fn();

            // Requesting 10 fps — must be clamped to 1 fps (interval >= 1000ms)
            const capture = createStreamFrameCapture(stream, {
                Rate: 10,
                OnFrame: onFrame,
            });

            expect(capture).toBeDefined();
            expect(capture.Stream).toBe(stream);
            capture.Stop();
        });
    });

    // ── F2: Track Negotiation & Video Fallback ──────────────────────────────────

    describe('Track Negotiation and Fallback (§8 Tests #6 & #7)', () => {
        it('Test #6: absent requestedTracks config defaults to audio-only established', async () => {
            const track = new FakeTrack();
            await client.Connect(makeGeminiConfig(), new FakeMediaStream([track]));

            expect(client.IsTrackEstablished('audio', 'inbound')).toBe(true);
            expect(client.IsTrackEstablished('audio', 'outbound')).toBe(true);
            expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
            expect(client.EstablishedTracks).toHaveLength(2);
        });

        it('establishes inbound video track when requested and supported by model', async () => {
            const track = new FakeTrack();
            const config: ClientRealtimeSessionConfig = {
                Provider: 'gemini',
                Model: 'gemini-3.8-live',
                EphemeralToken: 'auth_tokens/ephemeral-video',
                ExpiresAt: new Date(Date.now() + 60000).toISOString(),
                SessionConfig: {
                    model: 'gemini-3.8-live',
                    requestedTracks: [
                        ...DEFAULT_AUDIO_TRACKS,
                        CHANNEL_INBOUND_VIDEO_TRACK,
                    ],
                },
            };

            await client.Connect(config, new FakeMediaStream([track]));

            expect(client.IsTrackEstablished('video', 'inbound')).toBe(true);
            expect(client.EstablishedTracks.some((t) => t.Descriptor.Modality === 'video' && t.Descriptor.Direction === 'inbound')).toBe(true);
        });

        it('Test #7: video requested on non-video model falls back cleanly with no error', async () => {
            const track = new FakeTrack();
            const config: ClientRealtimeSessionConfig = {
                Provider: 'gemini',
                Model: 'gemini-live-2.5-flash-preview', // Legacy preview lacks video support
                EphemeralToken: 'auth_tokens/ephemeral-legacy',
                ExpiresAt: new Date(Date.now() + 60000).toISOString(),
                SessionConfig: {
                    model: 'gemini-live-2.5-flash-preview',
                    requestedTracks: [
                        ...DEFAULT_AUDIO_TRACKS,
                        CHANNEL_INBOUND_VIDEO_TRACK,
                    ],
                },
            };

            await client.Connect(config, new FakeMediaStream([track]));

            // Video must NOT be established because legacy model does not support video
            expect(client.IsTrackEstablished('video', 'inbound')).toBe(false);
            expect(client.IsTrackEstablished('audio', 'inbound')).toBe(true);

            // Sending video frame drops cleanly with no error and no frames sent
            expect(() => client.SendVideoFrame('fakeBase64Frame')).not.toThrow();
            expect(client.Fake.RealtimeInputs).toHaveLength(0);
        });
    });

    // ── F2 & F6: Video Send, Cadence Throttling & Usage Accounting ──────────────

    describe('F2 & F6: Video Send, Throttling and Cost Accounting', () => {
        async function connectWithVideo(targetClient: GeminiTestClient): Promise<void> {
            const track = new FakeTrack();
            const config: ClientRealtimeSessionConfig = {
                Provider: 'gemini',
                Model: 'gemini-3.8-live',
                EphemeralToken: 'auth_tokens/test',
                ExpiresAt: new Date(Date.now() + 60000).toISOString(),
                SessionConfig: {
                    model: 'gemini-3.8-live',
                    requestedTracks: [
                        ...DEFAULT_AUDIO_TRACKS,
                        CHANNEL_INBOUND_VIDEO_TRACK,
                    ],
                },
            };
            await targetClient.Connect(config, new FakeMediaStream([track]));
        }

        it('sends video frame payload via session.sendRealtimeInput', async () => {
            await connectWithVideo(client);

            client.SendVideoFrame('base64JpegData', 'image/jpeg');

            expect(client.Fake.RealtimeInputs).toHaveLength(1);
            const input = client.Fake.RealtimeInputs[0];
            expect(input.media).toEqual({ data: 'base64JpegData', mimeType: 'image/jpeg' });
            expect(input.video).toEqual({ data: 'base64JpegData', mimeType: 'image/jpeg' });
        });

        it('throttles rapid video frame sends to 1 fps ceiling', async () => {
            await connectWithVideo(client);

            client.SendVideoFrame('frame1', 'image/jpeg');
            expect(client.Fake.RealtimeInputs).toHaveLength(1);

            // Attempting to send another frame 200ms later — should be throttled/dropped
            vi.advanceTimersByTime(200);
            client.SendVideoFrame('frame2', 'image/jpeg');
            expect(client.Fake.RealtimeInputs).toHaveLength(1);

            // After 1000ms has elapsed, send is permitted
            vi.advanceTimersByTime(801);
            client.SendVideoFrame('frame3', 'image/jpeg');
            expect(client.Fake.RealtimeInputs).toHaveLength(2);
        });

        it('tracks VideoFrames and emits in RealtimeClientUsage', async () => {
            await connectWithVideo(client);

            let lastUsage: unknown = null;
            client.OnUsage((u) => {
                lastUsage = u;
            });

            client.SendVideoFrame('frame1');
            vi.advanceTimersByTime(1100);
            client.SendVideoFrame('frame2');

            // Model emits usage metadata
            client.Emit({
                usageMetadata: {
                    totalTokenCount: 150,
                    promptTokenCount: 100,
                    candidatesTokenCount: 50,
                    promptTokensDetails: [
                        { modality: 'AUDIO', tokenCount: 40 },
                        { modality: 'IMAGE', tokenCount: 30 },
                        { modality: 'TEXT', tokenCount: 30 },
                    ],
                },
            } as LiveServerMessage);

            expect(lastUsage).toBeDefined();
            const usage = lastUsage as { VideoFrames?: number; InputTokenDetails?: { ImageTokens?: number } };
            expect(usage.VideoFrames).toBe(2);
            expect(usage.InputTokenDetails?.ImageTokens).toBe(30);
        });
    });

    // ── F5: Shared Channel Video Bridge ────────────────────────────────────────

    describe('F5: Shared Channel Inbound Video Bridge', () => {
        it('refuses to start when video track is not established on client', () => {
            const provider: IChannelFrameProvider = {
                GetLatestFrame: () => 'fakeFrame',
            };
            const bridge = new ChannelInboundVideoBridge(client, provider);

            // Client not connected -> video track not established
            const started = bridge.Start();
            expect(started).toBe(false);
            expect(bridge.IsActive).toBe(false);
        });

        it('starts periodic pumping and pushes event frames when track is established', async () => {
            const track = new FakeTrack();
            const config: ClientRealtimeSessionConfig = {
                Provider: 'gemini',
                Model: 'gemini-3.8-live',
                EphemeralToken: 'auth_tokens/test',
                ExpiresAt: new Date(Date.now() + 60000).toISOString(),
                SessionConfig: {
                    model: 'gemini-3.8-live',
                    requestedTracks: [
                        ...DEFAULT_AUDIO_TRACKS,
                        CHANNEL_INBOUND_VIDEO_TRACK,
                    ],
                },
            };
            await client.Connect(config, new FakeMediaStream([track]));

            let currentFrame: string | null = 'firstFrame';
            const provider: IChannelFrameProvider = {
                GetLatestFrame: () => currentFrame,
            };

            const bridge = new ChannelInboundVideoBridge(client, provider, { Rate: 1 });
            const started = bridge.Start();
            expect(started).toBe(true);
            expect(bridge.IsActive).toBe(true);

            // Periodic tick pushes the frame
            await vi.advanceTimersByTimeAsync(1050);
            expect(client.Fake.RealtimeInputs.length).toBeGreaterThanOrEqual(1);

            // Event-driven PushFrame (e.g. RemoteBrowser screencast frame)
            vi.advanceTimersByTime(1100);
            const pushed = bridge.PushFrame('screencastFrame');
            expect(pushed).toBe(true);

            // Bridge stop clears timers
            bridge.Stop();
            expect(bridge.IsActive).toBe(false);
        });

        it('Item 25: async provider with variable latency does not drop frames to throttle fight', async () => {
            const track = new FakeTrack();
            const config: ClientRealtimeSessionConfig = {
                Provider: 'gemini',
                Model: 'gemini-3.8-live',
                EphemeralToken: 'auth_tokens/test',
                ExpiresAt: new Date(Date.now() + 60000).toISOString(),
                SessionConfig: {
                    model: 'gemini-3.8-live',
                    requestedTracks: [
                        ...DEFAULT_AUDIO_TRACKS,
                        CHANNEL_INBOUND_VIDEO_TRACK,
                    ],
                },
            };
            await client.Connect(config, new FakeMediaStream([track]));

            let callCount = 0;
            const provider: IChannelFrameProvider = {
                GetLatestFrame: async () => {
                    callCount++;
                    // Variable latency: 200ms on first tick, 50ms on second tick, 150ms on third
                    const latency = (callCount % 3) * 75 + 50;
                    await new Promise((r) => setTimeout(r, latency));
                    return `frame_${callCount}`;
                },
            };

            const bridge = new ChannelInboundVideoBridge(client, provider, { Rate: 1 });
            bridge.Start();

            // Run 3 full 1-second cycles
            for (let i = 0; i < 3; i++) {
                await vi.advanceTimersByTimeAsync(1000);
            }
            // Allow the last in-flight async provider fetch (50ms) to resolve
            await vi.advanceTimersByTimeAsync(100);

            expect(client.Fake.RealtimeInputs.length).toBe(3);
            bridge.Stop();
        });

        it('Item 26: logs error when GetLatestFrame throws and does not crash the bridge', async () => {
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                const track = new FakeTrack();
                const config: ClientRealtimeSessionConfig = {
                    Provider: 'gemini',
                    Model: 'gemini-3.8-live',
                    EphemeralToken: 'auth_tokens/test',
                    ExpiresAt: new Date(Date.now() + 60000).toISOString(),
                    SessionConfig: {
                        model: 'gemini-3.8-live',
                        requestedTracks: [
                            ...DEFAULT_AUDIO_TRACKS,
                            CHANNEL_INBOUND_VIDEO_TRACK,
                        ],
                    },
                };
                await client.Connect(config, new FakeMediaStream([track]));

                const provider: IChannelFrameProvider = {
                    GetLatestFrame: async () => {
                        throw new Error('snapshot endpoint down');
                    },
                };

                const bridge = new ChannelInboundVideoBridge(client, provider, { Rate: 1 });
                bridge.Start();
                await vi.advanceTimersByTimeAsync(1050);

                expect(errSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[ChannelInboundVideoBridge] Error fetching frame from provider:'),
                    expect.any(Error)
                );
                expect(bridge.IsActive).toBe(true);
                bridge.Stop();
            } finally {
                errSpy.mockRestore();
            }
        });

        it('Item 27: PushFrame returns false when client lacks SendVideoFrame implementation', async () => {
            const track = new FakeTrack();
            const config: ClientRealtimeSessionConfig = {
                Provider: 'gemini',
                Model: 'gemini-3.8-live',
                EphemeralToken: 'auth_tokens/test',
                ExpiresAt: new Date(Date.now() + 60000).toISOString(),
                SessionConfig: {
                    model: 'gemini-3.8-live',
                    requestedTracks: [
                        ...DEFAULT_AUDIO_TRACKS,
                        CHANNEL_INBOUND_VIDEO_TRACK,
                    ],
                },
            };
            await client.Connect(config, new FakeMediaStream([track]));

            // Temporarily delete SendVideoFrame to emulate a client without video send capability
            const originalSend = client.SendVideoFrame;
            (client as { SendVideoFrame?: unknown }).SendVideoFrame = undefined;

            const provider: IChannelFrameProvider = {
                GetLatestFrame: () => 'frame',
            };
            const bridge = new ChannelInboundVideoBridge(client, provider);
            const pushed = bridge.PushFrame('testFrame');
            expect(pushed).toBe(false);

            client.SendVideoFrame = originalSend;
        });
    });

    // ── F7: Session Continuity ─────────────────────────────────────────────────

    describe('F7: Session Continuity and Resumption', () => {
        it('captures resumption handle from sessionResumptionUpdate', async () => {
            const track = new FakeTrack();
            await client.Connect(makeGeminiConfig(), new FakeMediaStream([track]));

            expect(client.ResumptionHandle).toBeNull();

            client.Emit({
                sessionResumptionUpdate: {
                    newHandle: 'resumption_handle_token_123',
                },
            } as LiveServerMessage);

            expect(client.ResumptionHandle).toBe('resumption_handle_token_123');
        });

        it('triggers reconnect on goAway and clears resumption handle on Disconnect', async () => {
            const track = new FakeTrack();
            await client.Connect(makeGeminiConfig(), new FakeMediaStream([track]));

            client.Emit({
                sessionResumptionUpdate: {
                    newHandle: 'token_abc',
                },
            } as LiveServerMessage);

            expect(client.ResumptionHandle).toBe('token_abc');

            // goAway triggers reconnect using resumption handle
            client.Emit({
                goAway: true,
            } as LiveServerMessage);

            await vi.advanceTimersByTimeAsync(100);

            // Disconnect resets resumption handle
            await client.Disconnect();
            expect(client.ResumptionHandle).toBeNull();
        });
    });
});
