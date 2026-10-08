import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerMessage, Part } from '@google/genai';
import { InstallFakeMse } from './helpers/fake-mse';
import { AvatarFragment, AvatarInitSegment, AvatarStypFragment, PieceToBase64 } from './helpers/fmp4-pieces';
import { FakeMediaStream, FakeTrack, GeminiTestClient, makeGeminiAvatarConfig, makeGeminiConfig } from './helpers/realtime-fakes';

const b64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));

function emitParts(client: GeminiTestClient, parts: Part[]): void {
    client.Emit({ serverContent: { modelTurn: { role: 'model', parts } } } as LiveServerMessage);
}

describe('GeminiRealtimeClient routes model output parts by MIME type', () => {
    let client: GeminiTestClient;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        client = new GeminiTestClient();
        await client.Connect(makeGeminiConfig(), new FakeMediaStream([new FakeTrack()]));
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('never sends a video/mp4 part to PCM playback', () => {
        emitParts(client, [{ inlineData: { data: b64([0, 0, 0, 24]), mimeType: 'video/mp4' } }]);
        expect(client.Playback.Enqueued).toHaveLength(0);
    });

    it('still plays PCM audio parts in the same turn', () => {
        emitParts(client, [
            { inlineData: { data: b64([9, 9]), mimeType: 'video/mp4' } },
            { inlineData: { data: b64([1, 2, 3, 4]), mimeType: 'audio/pcm;rate=24000' } },
        ]);
        expect(client.Playback.Enqueued).toHaveLength(1);
        expect(new Uint8Array(client.Playback.Enqueued[0])).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('keeps playing a part with no MIME type, as before', () => {
        emitParts(client, [{ inlineData: { data: b64([5, 6]) } }]);
        expect(client.Playback.Enqueued).toHaveLength(1);
    });

    it('reports a dropped type once per session, not once per part', () => {
        emitParts(client, [{ inlineData: { data: b64([1]), mimeType: 'video/mp4' } }]);
        emitParts(client, [{ inlineData: { data: b64([2]), mimeType: 'video/mp4' } }]);
        const reports = warn.mock.calls.filter((call) => String(call[0]).includes('video/mp4'));
        expect(reports).toHaveLength(1);
    });
});

describe('GeminiRealtimeClient routes model output parts in a session that shows an avatar', () => {
    let client: GeminiTestClient;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        InstallFakeMse();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        client = new GeminiTestClient();
        await client.Connect(makeGeminiAvatarConfig(), new FakeMediaStream([new FakeTrack()]));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('sends a video/mp4 part to the avatar player, never to PCM playback', () => {
        const init = AvatarInitSegment();
        emitParts(client, [{ inlineData: { data: PieceToBase64(init), mimeType: 'video/mp4' } }]);
        expect(client.Playout.Appended.map((piece) => new Uint8Array(piece))).toEqual([new Uint8Array(init)]);
        expect(client.Playback.Enqueued).toHaveLength(0);
    });

    it('sends any video type to the avatar player, whatever its case or parameters', () => {
        emitParts(client, [{ inlineData: { data: PieceToBase64(AvatarFragment()), mimeType: 'VIDEO/MP4; codecs="avc1.42c01f"' } }]);
        expect(client.Playout.Appended).toHaveLength(1);
    });

    it('sniffs a part with no MIME type: one that opens with ftyp, moof or styp goes to the avatar player', () => {
        emitParts(client, [
            { inlineData: { data: PieceToBase64(AvatarInitSegment()) } },
            { inlineData: { data: PieceToBase64(AvatarFragment()) } },
            { inlineData: { data: PieceToBase64(AvatarStypFragment()) } },
        ]);
        expect(client.Playout.Appended).toHaveLength(3);
        expect(client.Playback.Enqueued).toHaveLength(0);
    });

    it('plays a part with no MIME type as PCM when it is not MP4', () => {
        emitParts(client, [{ inlineData: { data: b64([5, 6, 7, 8, 9, 10, 11, 12]) } }, { inlineData: { data: b64([5, 6]) } }]);
        expect(client.Playback.Enqueued).toHaveLength(2);
        expect(client.Playout.Appended).toHaveLength(0);
    });

    it('drops any other type, reported once per session', () => {
        emitParts(client, [{ inlineData: { data: b64([1]), mimeType: 'text/plain' } }]);
        emitParts(client, [{ inlineData: { data: b64([2]), mimeType: 'text/plain' } }]);
        expect(client.Playback.Enqueued).toHaveLength(0);
        expect(client.Playout.Appended).toHaveLength(0);
        expect(warn.mock.calls.filter((call) => String(call[0]).includes('text/plain'))).toHaveLength(1);
    });
});
