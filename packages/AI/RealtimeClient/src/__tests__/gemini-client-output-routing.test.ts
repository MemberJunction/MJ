import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerMessage, Part } from '@google/genai';
import { FakeMediaStream, FakeTrack, GeminiTestClient, makeGeminiConfig } from './helpers/realtime-fakes';

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
