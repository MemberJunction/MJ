/**
 * The meeting avatar end to end, without Google or a LiveKit server: a fake model session plays the committed lip-sync
 * fixture as its avatar output (the pieces a Gemini Live avatar sends), and the real engine, LiveKit bridge, native SDK,
 * room client and avatar publisher carry it into a fake `@livekit/rtc-node` room:
 *
 * - with the installed ffmpeg (skipped, with the reason, where there is none): the camera track is published, the
 *   voice plays, and each white flash is shown when the voice's playout reaches its beep;
 * - with an ffmpeg whose decoders die at once: the bot takes the avatar down, says so on its attribute, and the engine
 *   replaces the model session with an audio-only one through the host.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, RunView: { FromMetadataProvider: () => ({ RunView: runViewMock }) } };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { Fmp4PieceToVideoFrame, ReadFmp4Init, type Fmp4Init, type IRealtimeSession, type RealtimeSessionCapabilities, type RealtimeVideoFrame } from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { RegisterNativeRoomModule } from '@memberjunction/ai-bridge-livekit';
import { AIBridgeEngine, type ActiveBridgeSession, type BridgeRealtimeSessionRecoveryRequest } from '@memberjunction/ai-bridge-server';
import { CreateLiveKitRtcNodeModule, FfmpegLocator, type RtcNodeModule } from '@memberjunction/ai-bridge-livekit-native';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../../AI/RealtimeBridge/Providers/LiveKitNative/src/__tests__/fixtures/avatar-sync-flash-beep.mp4');
const FRAME_MS = 1000 / 24;

const hasFfmpeg = ((): boolean => {
    try {
        execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

// ── A fake @livekit/rtc-node room that plays its voice in real time ─────────────

interface RoomRecord {
    VoiceSamples: number[];
    Publishes: Array<{ Video: boolean; Name?: string; Source?: number; Simulcast?: boolean }>;
    Frames: Array<{ Luma: number; PlayedMs: number }>;
    Attributes: Array<Record<string, string>>;
    Unpublished: string[];
    Cleared: number;
    PlayedMs: () => number;
}

/** The fake module and what its room recorded. */
function fakeRtcRoom(): { module: RtcNodeModule; room: RoomRecord } {
    let capturedMs = 0;
    let startedAt = 0;
    const room: RoomRecord = { VoiceSamples: [], Publishes: [], Frames: [], Attributes: [], Unpublished: [], Cleared: 0, PlayedMs: () => (startedAt ? Math.min(capturedMs, performance.now() - startedAt) : 0) };
    const localParticipant = {
        identity: 'agent-s1',
        publishTrack: async (track: { video?: string }, options: { source?: number; simulcast?: boolean }) => {
            room.Publishes.push({ Video: Boolean(track.video), Name: track.video, Source: options.source, Simulcast: options.simulcast });
            return { sid: `TR_${room.Publishes.length}` };
        },
        unpublishTrack: async (sid: string) => {
            room.Unpublished.push(sid);
        },
        setAttributes: async (attributes: Record<string, string>) => {
            room.Attributes.push(attributes);
        },
        publishData: async () => undefined,
    };
    const rtcRoom = { name: 'avatar-room', localParticipant, remoteParticipants: [], connect: async () => undefined, disconnect: async () => undefined, on: () => undefined };
    function Room(): unknown {
        return rtcRoom;
    }
    function AudioSource(): unknown {
        return {
            captureFrame: async (frame: { data: Int16Array; samplesPerChannel: number; sampleRate: number }) => {
                startedAt ||= performance.now();
                capturedMs += (frame.samplesPerChannel / frame.sampleRate) * 1000;
                room.VoiceSamples.push(...frame.data);
            },
            clearQueue: () => {
                room.Cleared++;
            },
            get queuedDuration(): number {
                return Math.max(0, capturedMs - room.PlayedMs());
            },
        };
    }
    function AudioFrame(data: Int16Array, sampleRate: number, channels: number, samplesPerChannel: number): unknown {
        return { data, sampleRate, channels, samplesPerChannel };
    }
    function VideoSource(): unknown {
        return {
            captureFrame: (frame: { data: Uint8Array; width: number; height: number }) => {
                const luma = frame.data.subarray(0, frame.width * frame.height);
                let sum = 0;
                for (let i = 0; i < luma.length; i += 97) sum += luma[i];
                room.Frames.push({ Luma: sum / Math.ceil(luma.length / 97), PlayedMs: room.PlayedMs() });
            },
        };
    }
    function VideoFrame(data: Uint8Array, width: number, height: number, type: number): unknown {
        return { data, width, height, type };
    }
    function TrackPublishOptions(this: { source?: number; simulcast?: boolean }, data: { source?: number; simulcast?: boolean }): void {
        this.source = data.source;
        this.simulcast = data.simulcast;
    }
    const module = {
        Room,
        AudioSource,
        AudioFrame,
        AudioStream: function AudioStream(): unknown { return { [Symbol.asyncIterator]: async function* () {} }; },
        LocalAudioTrack: { createAudioTrack: () => ({}) },
        VideoStream: function VideoStream(): unknown { return {}; },
        VideoBufferType: { I420: 5 },
        VideoRotation: { VIDEO_ROTATION_0: 0, VIDEO_ROTATION_90: 1, VIDEO_ROTATION_180: 2, VIDEO_ROTATION_270: 3 },
        VideoSource,
        VideoFrame,
        LocalVideoTrack: { createVideoTrack: (name: string) => ({ video: name, close: async () => undefined }) },
        RoomEvent: { TrackSubscribed: 'a', TrackUnsubscribed: 'b', TrackSubscriptionFailed: 'c', TrackUnpublished: 'd', TrackMuted: 'e', TrackUnmuted: 'f', ParticipantConnected: 'g', ParticipantDisconnected: 'h', ParticipantAttributesChanged: 'i', Disconnected: 'j' },
        TrackKind: { KIND_AUDIO: 1, KIND_VIDEO: 2 },
        TrackPublishOptions,
        TrackSource: { SOURCE_CAMERA: 1, SOURCE_MICROPHONE: 2, SOURCE_SCREENSHARE: 3 },
    } as unknown as RtcNodeModule;
    return { module, room };
}

// ── A model session that plays the fixture as its avatar ─────────────────────────

class AvatarFixtureSession implements IRealtimeSession {
    public readonly InputSampleRate = 16000;
    public readonly OutputSampleRate = 24000;
    public Closed = false;
    private videoFrameHandler?: (frame: RealtimeVideoFrame) => void;
    private interruptionHandler?: () => void;
    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: false };
    }
    public SendInput(): void {}
    public async RegisterTools(): Promise<void> {}
    public OnOutput(): void {}
    public OnVideoFrame(handler: (frame: RealtimeVideoFrame) => void): void {
        this.videoFrameHandler = handler;
    }
    public OnTranscript(): void {}
    public OnToolCall(): void {}
    public async SendToolResult(): Promise<void> {}
    public OnInterruption(handler: () => void): void {
        this.interruptionHandler = handler;
    }
    public OnError(): void {}
    public OnUsage(): void {}
    public async Close(): Promise<void> {
        this.Closed = true;
    }
    /** Sends the fixture as a driver hands it on: its init segment, then each moof + mdat, each in its own fMP4 frame. */
    public PlayFixture(): void {
        const file = new Uint8Array(readFileSync(FIXTURE));
        const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
        const boxes: Uint8Array[] = [];
        for (let offset = 0; offset < file.length; offset += view.getUint32(offset)) boxes.push(file.subarray(offset, offset + view.getUint32(offset)));
        const piece = (...parts: Uint8Array[]): ArrayBuffer => {
            const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
            let at = 0;
            for (const part of parts) {
                out.set(part, at);
                at += part.length;
            }
            return out.buffer;
        };
        let init: Fmp4Init | null = null;
        const send = (data: ArrayBuffer): void => {
            const frame = Fmp4PieceToVideoFrame(data, 'video/mp4', init);
            init = frame?.Piece === 'init' ? ReadFmp4Init(data) : init;
            if (frame) this.videoFrameHandler?.(frame);
        };
        send(piece(boxes[0], boxes[1]));
        for (let i = 2; i + 1 < boxes.length; i += 2) send(piece(boxes[i], boxes[i + 1]));
    }
    public Interrupt(): void {
        this.interruptionHandler?.();
    }
}

// ── The engine's metadata doubles ────────────────────────────────────────────────

let rowSeq = 0;
const metadata = {
    GetEntityObject: vi.fn(async () => ({ ID: `avatar-e2e-${++rowSeq}`, Status: 'Pending', NewRecord: vi.fn(), Save: vi.fn(async () => true), Load: vi.fn(async () => true), LatestResult: { CompleteMessage: '' } })),
} as unknown as IMetadataProvider;
const user = { ID: 'user-1', Email: 'tester@example.com' } as unknown as UserInfo;
const liveKitProvider = {
    ID: 'provider-livekit',
    Name: 'LiveKit',
    DriverClass: 'LiveKitBridge',
    SupportedFeaturesObject: { OnDemandJoin: true, AudioIn: true, AudioOut: true, VideoOut: true },
} as unknown as MJAIBridgeProviderEntity;

let moduleSeq = 0;
async function startMeeting(session: IRealtimeSession, replace?: (r: BridgeRealtimeSessionRecoveryRequest) => Promise<IRealtimeSession>): Promise<{ active: ActiveBridgeSession; room: RoomRecord }> {
    const { module, room } = fakeRtcRoom();
    const specifier = `test-avatar-e2e-${++moduleSeq}`;
    RegisterNativeRoomModule(specifier, CreateLiveKitRtcNodeModule({ Loader: async () => module, UseWorker: false, VideoEncodeWorker: false }));
    AIBridgeEngine.Instance.SetHostInstanceIdentity({ GetHostInstanceID: () => 'test:1:boot', GetHostNamePrefix: () => 'test:' });
    const active = await AIBridgeEngine.Instance.StartBridgeSession({
        AgentSessionID: `avatar-e2e-session-${moduleSeq}`,
        Provider: liveKitProvider,
        RealtimeSession: session,
        Address: 'wss://lk.example',
        Configuration: { AccessToken: 'tok', BotDisplayName: 'Sage', NativeModuleSpecifier: specifier },
        ContextUser: user,
        MetadataProvider: metadata,
        RecoverRealtimeSessionWithoutAvatar: replace,
    });
    return { active, room };
}

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = performance.now() + timeoutMs;
    while (!condition() && performance.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10));
    }
}

function beepOnsetsMs(samples: number[]): number[] {
    const onsets: number[] = [];
    let quiet = 0;
    for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > 3000 && quiet >= 2400) onsets.push(i / 24);
        quiet = Math.abs(samples[i]) < 1000 ? quiet + 1 : 0;
    }
    return onsets;
}

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
});

afterEach(async () => {
    for (const active of AIBridgeEngine.Instance.ActiveSessions) {
        await AIBridgeEngine.Instance.StopBridgeSession(active.SessionBridgeID, 'Explicit');
    }
    FfmpegLocator.Instance.Configure();
});

describe('the meeting avatar, end to end through the engine, the bridge and the room client', () => {
    it.skipIf(!hasFfmpeg)('publishes the face on a camera track and keeps each flash on its beep (installed ffmpeg)', async () => {
        const session = new AvatarFixtureSession();
        const { room } = await startMeeting(session);
        session.PlayFixture();
        await waitUntil(() => room.PlayedMs() >= 3200, 10_000);

        expect(room.Publishes).toEqual([
            { Video: false, Name: undefined, Source: 2, Simulcast: undefined },
            { Video: true, Name: 'agent-avatar', Source: 1, Simulcast: true },
        ]);
        expect(room.Frames.length).toBeGreaterThan(48);
        const beeps = beepOnsetsMs(room.VoiceSamples);
        expect(beeps).toHaveLength(3);
        const flashes = room.Frames.filter((f) => f.Luma > 200).map((f) => f.PlayedMs);
        expect(flashes.length).toBeGreaterThanOrEqual(2);
        for (const at of flashes) {
            expect(Math.min(...beeps.map((b) => Math.abs(at - b)))).toBeLessThanOrEqual(FRAME_MS);
        }
    }, 20_000);

    it.skipIf(!hasFfmpeg)('a barge-in stops the face with the voice: the source is cleared and no queued frame is shown after', async () => {
        const session = new AvatarFixtureSession();
        const { room } = await startMeeting(session);
        session.PlayFixture();
        await waitUntil(() => room.PlayedMs() >= 800, 10_000);
        session.Interrupt();
        const shownAtBargeIn = room.Frames.length;
        await new Promise((r) => setTimeout(r, 400));
        expect(room.Cleared).toBe(1);
        expect(room.Frames.length).toBe(shownAtBargeIn);
    }, 20_000);

    describe('when the decoders keep dying', () => {
        let dir: string;
        beforeEach(() => {
            // An "ffmpeg" that answers the probe and dies when asked to decode.
            dir = mkdtempSync(join(tmpdir(), 'mj-avatar-ffmpeg-'));
            const script = join(dir, 'ffmpeg');
            writeFileSync(script, '#!/bin/sh\ncase "$*" in\n  *-version*) echo "ffmpeg version 7.1.1 Copyright" ;;\n  *-decoders*) printf " VFS..D h264   H.264\\n A....D aac   AAC\\n" ;;\n  *) echo "broken decoder" >&2; exit 1 ;;\nesac\n');
            chmodSync(script, 0o755);
            FfmpegLocator.Instance.Configure(undefined, { MJ_FFMPEG_PATH: script });
        });
        afterAll(() => rmSync(dir, { recursive: true, force: true }));

        it('takes the avatar down, says so on the bot, and replaces the model session with an audio-only one', async () => {
            const session = new AvatarFixtureSession();
            const audioOnly = new AvatarFixtureSession();
            const requests: BridgeRealtimeSessionRecoveryRequest[] = [];
            const { active, room } = await startMeeting(session, async (request) => {
                requests.push(request);
                return audioOnly;
            });
            session.PlayFixture();
            await waitUntil(() => active.RealtimeSession === audioOnly, 10_000);

            expect(requests).toHaveLength(1);
            expect(requests[0].Reason).toContain('decoder-failed');
            expect(room.Attributes).toEqual([{ 'mj.agentAvatar': 'audio-only:decoder-failed' }]);
            expect(room.Publishes.filter((p) => p.Video)).toEqual([]);
            expect(session.Closed).toBe(true);
        }, 20_000);
    });
});
