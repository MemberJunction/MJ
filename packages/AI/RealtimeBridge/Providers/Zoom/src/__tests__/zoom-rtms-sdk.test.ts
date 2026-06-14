import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    ZoomRtmsMeetingSdk,
    BindZoomRtms,
    readRtmsConfig,
    mapRtmsAudioFrame,
    toArrayBuffer,
    RtmsClient,
    RtmsModule,
    RtmsAudioCallback,
    RtmsMediaMetadata,
    ZoomRtmsSdkConfig,
} from '../zoom-rtms-sdk';
import { ZoomAudioFrame, ZoomJoinArgs, ZoomParticipant } from '../zoom-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// FakeRtmsClient / FakeRtmsModule — an in-memory `@zoom/rtms` with drive helpers.
// No native addon, no network.
// ──────────────────────────────────────────────────────────────────────────────

class FakeRtmsClient implements RtmsClient {
    public Joined = false;
    public Left = false;
    public LastPayload?: Record<string, unknown>;

    private audioCb?: RtmsAudioCallback;
    private activeSpeakerCb?: (timestamp: number, userId: string | number, userName?: string) => void;
    private leaveCb?: (reason?: number) => void;
    private sessionUpdateCb?: (op: number, ...rest: unknown[]) => void;

    public join(payload: Record<string, unknown>): void {
        this.Joined = true;
        this.LastPayload = payload;
    }
    public leave(): void {
        this.Left = true;
    }
    public onAudioData(cb: RtmsAudioCallback): void {
        this.audioCb = cb;
    }
    public onActiveSpeakerEvent(cb: (timestamp: number, userId: string | number, userName?: string) => void): void {
        this.activeSpeakerCb = cb;
    }
    public onLeave(cb: (reason?: number) => void): void {
        this.leaveCb = cb;
    }
    public onSessionUpdate(cb: (op: number, ...rest: unknown[]) => void): void {
        this.sessionUpdateCb = cb;
    }

    // ── drive helpers ──
    public DriveAudio3Arg(data: Uint8Array | ArrayBuffer, timestamp: number, metadata: RtmsMediaMetadata): void {
        this.audioCb?.(data, timestamp, metadata);
    }
    public DriveAudio4Arg(
        data: Uint8Array | ArrayBuffer,
        size: number,
        timestamp: number,
        metadata: RtmsMediaMetadata,
    ): void {
        this.audioCb?.(data, size, timestamp, metadata);
    }
    public DriveActiveSpeaker(userId: string | number, userName?: string): void {
        this.activeSpeakerCb?.(Date.now(), userId, userName);
    }
    public DriveLeave(): void {
        this.leaveCb?.();
    }
    public DriveSessionUpdate(op: number): void {
        this.sessionUpdateCb?.(op);
    }
}

/** Builds a fake `@zoom/rtms` module whose Client constructor yields a fixed FakeRtmsClient. */
function fakeModule(client: FakeRtmsClient): RtmsModule {
    return { Client: function () { return client; } as unknown as new () => RtmsClient };
}

function bytes(...vals: number[]): Uint8Array {
    return new Uint8Array(vals);
}

const CONNECTION = {
    meeting_uuid: 'uuid-abc',
    rtms_stream_id: 'stream-123',
    server_urls: 'wss://rtms.zoom.us/abc',
    signature: 'sig-xyz',
};

function fullConfig(): ZoomRtmsSdkConfig {
    return { ClientId: 'cid', ClientSecret: 'csecret', Connection: { ...CONNECTION } };
}

const JOIN_ARGS: ZoomJoinArgs = { MeetingNumber: '987654321', BotDisplayName: 'Sage' };

// ──────────────────────────────────────────────────────────────────────────────
// Pure mapping — mapRtmsAudioFrame / toArrayBuffer.
// ──────────────────────────────────────────────────────────────────────────────

describe('mapRtmsAudioFrame — pure RTMS frame → {Pcm, ParticipantId} mapping', () => {
    it('maps the 3-arg form (data, timestamp, metadata)', () => {
        const frame = mapRtmsAudioFrame(bytes(1, 2, 3), 42, { userId: 'u-7', userName: 'Alice' });
        expect(new Uint8Array(frame.Pcm)).toEqual(new Uint8Array([1, 2, 3]));
        expect(frame.ParticipantId).toBe('u-7');
        expect(frame.DisplayName).toBe('Alice');
        expect(frame.TimestampMs).toBe(42);
    });

    it('maps the 4-arg form (data, size, timestamp, metadata)', () => {
        const frame = mapRtmsAudioFrame(bytes(9, 8), 2, 100, { userId: 5, userName: 'Bob' });
        expect(new Uint8Array(frame.Pcm)).toEqual(new Uint8Array([9, 8]));
        expect(frame.ParticipantId).toBe('5'); // numeric id coerced to string
        expect(frame.TimestampMs).toBe(100);
    });

    it('prefers userId, falls back to userName for the diarization label', () => {
        const byName = mapRtmsAudioFrame(bytes(1), 0, { userName: 'Carol' });
        expect(byName.ParticipantId).toBe('Carol');
    });

    it('labels a frame "unknown" when metadata carries no identity (never drops it)', () => {
        const frame = mapRtmsAudioFrame(bytes(1), 0, {});
        expect(frame.ParticipantId).toBe('unknown');
    });

    it('falls back to Date.now() when no timestamp is present', () => {
        const before = Date.now();
        const frame = mapRtmsAudioFrame(bytes(1), undefined, { userId: 'u-1' });
        expect(frame.TimestampMs).toBeGreaterThanOrEqual(before);
    });

    it('copies a Uint8Array view into a standalone ArrayBuffer (no shared backing window)', () => {
        const backing = new Uint8Array([0, 1, 2, 3, 4]);
        const view = backing.subarray(1, 3); // [1,2]
        const frame = mapRtmsAudioFrame(view, 0, { userId: 'u' });
        expect(new Uint8Array(frame.Pcm)).toEqual(new Uint8Array([1, 2]));
        expect(frame.Pcm.byteLength).toBe(2); // not the full 5-byte backing buffer
    });

    it('toArrayBuffer passes an ArrayBuffer through unchanged', () => {
        const ab = new Uint8Array([7]).buffer;
        expect(toArrayBuffer(ab)).toBe(ab);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// readRtmsConfig — loosely-typed Configuration → ZoomRtmsSdkConfig.
// ──────────────────────────────────────────────────────────────────────────────

describe('readRtmsConfig — Configuration extraction without `any`', () => {
    it('reads creds + a well-formed Connection block', () => {
        const cfg = readRtmsConfig({ ClientId: 'cid', ClientSecret: 'sec', Connection: { ...CONNECTION } });
        expect(cfg.ClientId).toBe('cid');
        expect(cfg.ClientSecret).toBe('sec');
        expect(cfg.Connection).toEqual(CONNECTION);
    });

    it('returns Connection=undefined when required webhook fields are missing', () => {
        const cfg = readRtmsConfig({ Connection: { meeting_uuid: 'u', rtms_stream_id: 's' } }); // no server_urls
        expect(cfg.Connection).toBeUndefined();
    });

    it('tolerates a completely empty/undefined config', () => {
        expect(readRtmsConfig(undefined).Connection).toBeUndefined();
        expect(readRtmsConfig({}).ClientId).toBeUndefined();
    });

    it('ignores non-string cred values rather than coercing them', () => {
        const cfg = readRtmsConfig({ ClientId: 123 as unknown as string });
        expect(cfg.ClientId).toBeUndefined();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// ZoomRtmsMeetingSdk — join / hearing path.
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomRtmsMeetingSdk — join + hearing', () => {
    let client: FakeRtmsClient;
    let sdk: ZoomRtmsMeetingSdk;

    beforeEach(() => {
        client = new FakeRtmsClient();
        sdk = new ZoomRtmsMeetingSdk(fullConfig(), async () => fakeModule(client));
    });

    it('joins RTMS with the webhook-derived payload and returns stream/meeting handles', async () => {
        const result = await sdk.join(JOIN_ARGS);
        expect(client.Joined).toBe(true);
        expect(client.LastPayload).toMatchObject({
            meeting_uuid: 'uuid-abc',
            rtms_stream_id: 'stream-123',
            server_urls: 'wss://rtms.zoom.us/abc',
            signature: 'sig-xyz',
            client_id: 'cid',
            client_secret: 'csecret',
        });
        expect(result.BotParticipantId).toBe('rtms:stream-123');
        expect(result.MeetingId).toBe('987654321');
    });

    it('uses the meeting UUID as the meeting id when no meeting number is supplied', async () => {
        const result = await sdk.join({ MeetingNumber: '', BotDisplayName: 'Sage' });
        expect(result.MeetingId).toBe('uuid-abc');
    });

    it('throws a precise error when no RTMS connection params are present (webhook not wired)', async () => {
        const orphan = new ZoomRtmsMeetingSdk({ ClientId: 'c' }, async () => fakeModule(client));
        await expect(orphan.join(JOIN_ARGS)).rejects.toThrow(/RTMS is webhook-initiated/i);
    });

    it('forwards inbound per-participant audio to onAudioFrame with the diarization label', async () => {
        const heard: ZoomAudioFrame[] = [];
        sdk.onAudioFrame((f) => heard.push(f));
        await sdk.join(JOIN_ARGS);

        client.DriveAudio3Arg(bytes(1, 2, 3), 7, { userId: 'p-alice', userName: 'Alice' });

        expect(heard.length).toBe(1);
        expect(heard[0].ParticipantId).toBe('p-alice');
        expect(new Uint8Array(heard[0].Pcm)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('discovers participants from audio frames and fires onParticipantJoin once each', async () => {
        const joined: ZoomParticipant[] = [];
        sdk.onParticipantJoin((p) => joined.push(p));
        await sdk.join(JOIN_ARGS);

        client.DriveAudio3Arg(bytes(1), 1, { userId: 'p-alice', userName: 'Alice' });
        client.DriveAudio3Arg(bytes(2), 2, { userId: 'p-alice', userName: 'Alice' }); // same speaker again
        client.DriveAudio3Arg(bytes(3), 3, { userId: 'p-bob', userName: 'Bob' });

        expect(joined.map((p) => p.ParticipantId)).toEqual(['p-alice', 'p-bob']);
        const roster = await sdk.getParticipants();
        expect(roster.map((p) => p.ParticipantId).sort()).toEqual(['p-alice', 'p-bob']);
    });

    it('discovers participants from active-speaker events too', async () => {
        await sdk.join(JOIN_ARGS);
        client.DriveActiveSpeaker('p-carol', 'Carol');
        const roster = await sdk.getParticipants();
        expect(roster.find((p) => p.ParticipantId === 'p-carol')).toBeDefined();
    });

    it('fires onMeetingEnded and clears the roster on an RTMS leave signal', async () => {
        const ended = vi.fn();
        sdk.onMeetingEnded(ended);
        await sdk.join(JOIN_ARGS);
        client.DriveAudio3Arg(bytes(1), 1, { userId: 'p-alice' });

        client.DriveLeave();

        expect(ended).toHaveBeenCalledTimes(1);
        expect(await sdk.getParticipants()).toEqual([]);
    });

    it('treats a session-stopped update (op 0) as meeting-ended', async () => {
        const ended = vi.fn();
        sdk.onMeetingEnded(ended);
        await sdk.join(JOIN_ARGS);
        client.DriveSessionUpdate(0);
        expect(ended).toHaveBeenCalledTimes(1);
    });

    it('leave() closes the RTMS client and clears state', async () => {
        await sdk.join(JOIN_ARGS);
        await sdk.leave();
        expect(client.Left).toBe(true);
        expect(await sdk.getParticipants()).toEqual([]);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Receive-only guards — outbound surfaces are documented no-ops (never throw).
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomRtmsMeetingSdk — receive-only guards (RTMS cannot send)', () => {
    let sdk: ZoomRtmsMeetingSdk;

    beforeEach(() => {
        sdk = new ZoomRtmsMeetingSdk(fullConfig(), async () => fakeModule(new FakeRtmsClient()));
    });

    it('sendAudioFrame is a no-op and does not throw (outbound requires the Meeting SDK)', () => {
        expect(() => sdk.sendAudioFrame(new Uint8Array([1, 2]).buffer)).not.toThrow();
    });

    it('postChatMessage resolves without throwing (no-op over RTMS)', async () => {
        await expect(sdk.postChatMessage('hi')).resolves.toBeUndefined();
    });

    it('muteParticipant resolves without throwing (no-op over RTMS)', async () => {
        await expect(sdk.muteParticipant('p-1')).resolves.toBeUndefined();
    });

    it('onHandRaise registers harmlessly without throwing (no RTMS hand-raise signal)', () => {
        expect(() => sdk.onHandRaise(() => undefined)).not.toThrow();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// BindZoomRtms — the SetSdkFactory-shaped binding.
// ──────────────────────────────────────────────────────────────────────────────

describe('BindZoomRtms — factory for ZoomBridge.SetSdkFactory', () => {
    it('builds a ZoomRtmsMeetingSdk from the engine Configuration map', async () => {
        const client = new FakeRtmsClient();
        const factory = BindZoomRtms(async () => fakeModule(client));
        const sdk = factory({ ClientId: 'cid', ClientSecret: 'sec', Connection: { ...CONNECTION } });
        expect(sdk).toBeInstanceOf(ZoomRtmsMeetingSdk);

        await sdk.join(JOIN_ARGS);
        expect(client.Joined).toBe(true);
        expect(client.LastPayload).toMatchObject({ rtms_stream_id: 'stream-123', client_id: 'cid' });
    });

    it('produces an SDK that throws on join when the webhook Connection block is absent', async () => {
        const factory = BindZoomRtms(async () => fakeModule(new FakeRtmsClient()));
        const sdk = factory({ ClientId: 'cid' }); // no Connection
        await expect(sdk.join(JOIN_ARGS)).rejects.toThrow(/RTMS is webhook-initiated/i);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// defaultRtmsLoader — fails loudly when @zoom/rtms is absent (it is, in this package).
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomRtmsMeetingSdk — optional dependency absence', () => {
    it('throws an actionable error when @zoom/rtms cannot be loaded', async () => {
        // No loader override → the real defaultRtmsLoader runs and @zoom/rtms is NOT installed here.
        const sdk = new ZoomRtmsMeetingSdk(fullConfig());
        await expect(sdk.join(JOIN_ARGS)).rejects.toThrow(/optional '@zoom\/rtms' dependency/i);
    });
});
