import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo, Socket } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { OpenAssemblyAISocket, type AssemblyAISocket } from '../voice/assemblyAISocket';
import { OpenAssemblyAISTT, type IAssemblyAISTT } from '../voice/assemblyAIStreamingSTT';
import { OpenAssemblyAITTS } from '../voice/assemblyAIStreamingTTS';

const LIMIT = 256 * 1024;
const SAMPLE_RATE = 24000;
const ONE_SECOND = SAMPLE_RATE * 2;

/** The real socket against a local server that plays the provider, and can stop reading. */
describe('AssemblyAI socket', () => {
    let server: WebSocketServer;
    let port = 0;
    let provider: WebSocket | null = null;
    let sent = 0;
    let real: WebSocket | null = null;

    beforeEach(async () => {
        sent = 0;
        real = null;
        server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
        server.on('connection', (ws) => {
            provider = ws;
            ws.on('error', () => undefined);
            ws.send(JSON.stringify({ type: 'Begin' }));
        });
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        port = (server.address() as AddressInfo).port;
        const send = WebSocket.prototype.send;
        vi.spyOn(WebSocket.prototype, 'send').mockImplementation(function (this: WebSocket, ...args: unknown[]) {
            if (this !== provider) {
                real = this;
                sent++;
            }
            return Reflect.apply(send, this, args);
        });
    });
    afterEach(async () => {
        vi.restoreAllMocks();
        real?.terminate();
        for (const ws of server.clients) ws.terminate();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    const opener = (maxBufferedBytes?: number) => (_url: string, key: string): AssemblyAISocket =>
        OpenAssemblyAISocket(`ws://127.0.0.1:${port}`, key, maxBufferedBytes);
    const openSTT = (onLost: (message: string) => void, maxBufferedBytes?: number): Promise<IAssemblyAISTT> =>
        OpenAssemblyAISTT(
            { APIKey: 'secret', SpeechModel: 'assemblyai-stt-3-7-realtime-agent', SampleRate: SAMPLE_RATE },
            { OnSpeechStarted: () => undefined, OnTurn: () => undefined, OnLost: onLost },
            opener(maxBufferedBytes)
        );
    const stopReading = (): void => {
        (provider as unknown as { _socket: Socket })._socket.pause();
    };
    const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

    /** Sends audio until the session reports its loss; gives up once far more than any kernel buffer has been queued. */
    async function sendUntilLost(stt: IAssemblyAISTT, lost: ReturnType<typeof vi.fn>): Promise<number> {
        let peak = 0;
        for (let seconds = 0; seconds < 600 && lost.mock.calls.length === 0; seconds++) {
            stt.SendAudio(Buffer.alloc(ONE_SECOND));
            peak = Math.max(peak, real?.bufferedAmount ?? 0);
            await tick();
        }
        return peak;
    }

    it('drops an STT connection that stops reading, and reports the session lost once', async () => {
        const lost = vi.fn();
        const stt = await openSTT(lost, LIMIT);
        stopReading();
        const peak = await sendUntilLost(stt, lost);
        expect(lost).toHaveBeenCalledTimes(1);
        expect(String(lost.mock.calls[0][0])).toMatch(/stopped reading/);
        expect(peak).toBeLessThanOrEqual(LIMIT + 2 * ONE_SECOND);
        // Dropped, not closed politely: a close frame would wait behind the queue it is meant to free.
        expect(real?.readyState).toBe(WebSocket.CLOSED);
        const before = sent;
        stt.SendAudio(Buffer.alloc(ONE_SECOND));
        await stt.Close();
        expect(sent).toBe(before);
        expect(lost).toHaveBeenCalledTimes(1);
    });

    it('holds no more than the relay does unless told otherwise', async () => {
        const lost = vi.fn();
        const stt = await openSTT(lost);
        stopReading();
        const peak = await sendUntilLost(stt, lost);
        expect(lost).toHaveBeenCalledTimes(1);
        expect(peak).toBeGreaterThan(16 * 1024 * 1024 - ONE_SECOND);
        expect(peak).toBeLessThanOrEqual(16 * 1024 * 1024 + 2 * ONE_SECOND);
    });

    it('keeps a connection that keeps reading, however much it is sent', async () => {
        const lost = vi.fn();
        let received = 0;
        const stt = await openSTT(lost, LIMIT);
        provider?.on('message', (data: Buffer) => (received += data.byteLength));
        for (let seconds = 1; seconds <= 20; seconds++) {
            stt.SendAudio(Buffer.alloc(ONE_SECOND));
            await vi.waitFor(() => expect(received).toBe(seconds * ONE_SECOND), { interval: 5 });
        }
        expect(lost).not.toHaveBeenCalled();
    });

    it('drops a TTS connection that stops reading', async () => {
        const lost = vi.fn();
        const tts = await OpenAssemblyAITTS(
            { APIKey: 'secret', VoiceID: 'aai-kyla', SampleRate: SAMPLE_RATE },
            { OnAudio: () => undefined, OnSegmentDone: () => undefined, OnLost: lost },
            opener(LIMIT)
        );
        stopReading();
        for (let i = 0; i < 400 && lost.mock.calls.length === 0; i++) {
            tts.Speak('a'.repeat(64 * 1024), i);
            await tick();
        }
        expect(lost).toHaveBeenCalledTimes(1);
        expect(tts.IsOpen).toBe(false);
    });
});
