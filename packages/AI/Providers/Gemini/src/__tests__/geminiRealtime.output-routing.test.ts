import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LiveServerMessage, Blob as GeminiBlob, Content, FunctionResponse, Part } from '@google/genai';
import type { IRealtimeSession } from '@memberjunction/ai';

import { GeminiRealtime, type GeminiLiveSession, type GeminiConnectArgs } from '../geminiRealtime';

class FakeConnection implements GeminiLiveSession {
    public sendRealtimeInput(_params: { audio?: GeminiBlob }): void {}
    public sendClientContent(_params: { turns?: Content[]; turnComplete?: boolean }): void {}
    public sendToolResponse(_params: { functionResponses: FunctionResponse[] | FunctionResponse }): void {}
    public close(): void {}
}

class TestGemini extends GeminiRealtime {
    public Args: GeminiConnectArgs | null = null;
    protected override async connectLiveSession(args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        this.Args = args;
        return new FakeConnection();
    }
    public Emit(parts: Part[]): void {
        this.Args?.OnMessage({ serverContent: { modelTurn: { role: 'model', parts } } } as LiveServerMessage);
    }
}

const b64 = (bytes: number[]): string => Buffer.from(new Uint8Array(bytes)).toString('base64');

describe('GeminiRealtime routes model output parts by MIME type', () => {
    let driver: TestGemini;
    let session: IRealtimeSession;
    let outputs: ArrayBuffer[];
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        driver = new TestGemini('fake-api-key');
        session = await driver.StartSession({ Model: 'gemini-3.8-live', SystemPrompt: 'hi' });
        outputs = [];
        session.OnOutput((chunk) => outputs.push(chunk));
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('never sends a video/mp4 part to the audio output', () => {
        driver.Emit([{ inlineData: { data: b64([0, 0, 0, 24]), mimeType: 'video/mp4' } }]);
        expect(outputs).toHaveLength(0);
    });

    it('still sends PCM audio parts in the same turn', () => {
        driver.Emit([
            { inlineData: { data: b64([9, 9]), mimeType: 'video/mp4' } },
            { inlineData: { data: b64([1, 2, 3, 4]), mimeType: 'audio/pcm;rate=24000' } },
        ]);
        expect(outputs).toHaveLength(1);
        expect(new Uint8Array(outputs[0])).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('keeps playing a part with no MIME type, as before', () => {
        driver.Emit([{ inlineData: { data: b64([5, 6]) } }]);
        expect(outputs).toHaveLength(1);
    });

    it('reports a dropped type once per session, not once per part', () => {
        driver.Emit([{ inlineData: { data: b64([1]), mimeType: 'video/mp4' } }]);
        driver.Emit([{ inlineData: { data: b64([2]), mimeType: 'video/mp4' } }]);
        const reports = warn.mock.calls.filter((call) => String(call[0]).includes('video/mp4'));
        expect(reports).toHaveLength(1);
    });
});
