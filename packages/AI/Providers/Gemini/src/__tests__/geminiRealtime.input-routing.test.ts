import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Blob as GeminiBlob, Content, FunctionResponse } from '@google/genai';
import type { IRealtimeSession, RealtimeSessionParams } from '@memberjunction/ai';

import { GeminiRealtime, type GeminiLiveSession, type GeminiConnectArgs } from '../geminiRealtime';

type SentInput = { audio?: GeminiBlob; video?: GeminiBlob; activityStart?: unknown; activityEnd?: unknown };

class FakeConnection implements GeminiLiveSession {
    public Sent: SentInput[] = [];
    public sendRealtimeInput(params: SentInput): void {
        this.Sent.push(params);
    }
    public sendClientContent(_params: { turns?: Content[]; turnComplete?: boolean }): void {}
    public sendToolResponse(_params: { functionResponses: FunctionResponse[] | FunctionResponse }): void {}
    public close(): void {}
}

class TestGemini extends GeminiRealtime {
    public Fake = new FakeConnection();
    protected override async connectLiveSession(_args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        return this.Fake;
    }
}

const bytes = (...values: number[]): ArrayBuffer => new Uint8Array(values).buffer;
const b64 = (...values: number[]): string => Buffer.from(new Uint8Array(values)).toString('base64');

describe('GeminiRealtime routes input frames by kind and MIME type', () => {
    let driver: TestGemini;
    let session: IRealtimeSession;
    let warn: ReturnType<typeof vi.spyOn>;

    async function start(overrides: Partial<RealtimeSessionParams> = {}): Promise<void> {
        driver = new TestGemini('fake-api-key');
        session = await driver.StartSession({ Model: 'gemini-3.8-live', SystemPrompt: 'hi', ...overrides });
    }

    function reportsMentioning(text: string): number {
        return warn.mock.calls.filter((call) => String(call[0]).includes(text)).length;
    }

    beforeEach(async () => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await start();
    });

    afterEach(() => {
        warn.mockRestore();
    });

    describe('video', () => {
        it('sends a JPEG frame as video, not audio', () => {
            session.SendInput({ Data: bytes(0xff, 0xd8, 0xff), Kind: 'video', MimeType: 'image/jpeg', TimestampMs: 1000 });

            expect(driver.Fake.Sent).toEqual([{ video: { data: b64(0xff, 0xd8, 0xff), mimeType: 'image/jpeg' } }]);
        });

        it('sends a PNG frame, whatever the case of its type', () => {
            session.SendInput({ Data: bytes(0x89, 0x50), Kind: 'video', MimeType: 'IMAGE/PNG' });

            expect(driver.Fake.Sent).toEqual([{ video: { data: b64(0x89, 0x50), mimeType: 'image/png' } }]);
        });

        it('drops a frame with no type and reports it once', () => {
            session.SendInput({ Data: bytes(1), Kind: 'video' });
            session.SendInput({ Data: bytes(2), Kind: 'video' });

            expect(driver.Fake.Sent).toEqual([]);
            expect(reportsMentioning('video input of type (no type)')).toBe(1);
        });

        it('drops a frame in a format Gemini does not take', () => {
            session.SendInput({ Data: bytes(1), Kind: 'video', MimeType: 'video/x-raw' });

            expect(driver.Fake.Sent).toEqual([]);
            expect(reportsMentioning('video input of type video/x-raw')).toBe(1);
        });
    });

    describe('audio', () => {
        it('sends a frame with no type as 16 kHz PCM, as before', () => {
            session.SendInput({ Data: bytes(1, 2), Kind: 'audio' });

            expect(driver.Fake.Sent).toEqual([{ audio: { data: b64(1, 2), mimeType: 'audio/pcm;rate=16000' } }]);
        });

        it('keeps the PCM rate the frame names', () => {
            session.SendInput({ Data: bytes(1, 2), Kind: 'audio', MimeType: 'audio/pcm;rate=24000' });

            expect(driver.Fake.Sent).toEqual([{ audio: { data: b64(1, 2), mimeType: 'audio/pcm;rate=24000' } }]);
        });

        it('drops a non-PCM frame instead of sending it as audio', () => {
            session.SendInput({ Data: bytes(0xff, 0xd8), Kind: 'audio', MimeType: 'image/jpeg' });

            expect(driver.Fake.Sent).toEqual([]);
            expect(reportsMentioning('audio input of type image/jpeg')).toBe(1);
        });
    });

    describe('meeting mode', () => {
        beforeEach(async () => {
            await start({ Config: { disableAutoResponse: true } });
        });

        it('a video frame does not open the activity window; the first audio does', () => {
            session.SendInput({ Data: bytes(0xff, 0xd8), Kind: 'video', MimeType: 'image/jpeg' });
            expect(driver.Fake.Sent).toEqual([{ video: { data: b64(0xff, 0xd8), mimeType: 'image/jpeg' } }]);

            session.SendInput({ Data: bytes(1, 2), Kind: 'audio' });
            expect(driver.Fake.Sent.slice(1)).toEqual([
                { activityStart: {} },
                { audio: { data: b64(1, 2), mimeType: 'audio/pcm;rate=16000' } },
            ]);
        });

        it('a dropped audio frame does not open the activity window', () => {
            session.SendInput({ Data: bytes(1), Kind: 'audio', MimeType: 'audio/opus' });

            expect(driver.Fake.Sent).toEqual([]);
        });
    });
});
