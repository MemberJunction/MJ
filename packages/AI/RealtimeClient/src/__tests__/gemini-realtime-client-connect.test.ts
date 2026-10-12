import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { GeminiRealtimeClient, type GeminiClientConnectArgs, type GeminiLiveClientSession } from '../drivers/geminiRealtimeClient';

// From @google/genai 2.11, `live.connect` resolves only on the server's setupComplete frame and never
// rejects when the socket closes first. These drive the REAL connect seam against a fake SDK client.
vi.mock('@google/genai', async (importOriginal) => ({ ...(await importOriginal<typeof import('@google/genai')>()), GoogleGenAI: vi.fn() }));

type FakeCallbacks = { onclose: (e: Partial<CloseEvent>) => void; onerror: (e: Partial<ErrorEvent>) => void };

/** Exposes the protected connect seam. */
class ConnectSeam extends GeminiRealtimeClient {
    public Open(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        return this.connectLiveSession(args);
    }
}

const fakeSdk = (connect: (p: { callbacks: FakeCallbacks }) => Promise<unknown>): void => {
    vi.mocked(GoogleGenAI).mockImplementation(function () { return { live: { connect } }; } as unknown as typeof GoogleGenAI);
};

describe('GeminiRealtimeClient connect seam', () => {
    let closes: number;
    let args: GeminiClientConnectArgs;
    beforeEach(() => {
        closes = 0;
        args = { Model: 'm', Config: {}, EphemeralToken: 'auth_tokens/t', OnMessage: () => undefined, OnError: () => undefined, OnClose: () => closes++ };
    });

    it('rejects with the close code and reason instead of hanging, and still reports the close', async () => {
        fakeSdk(({ callbacks }) => {
            setTimeout(() => callbacks.onclose({ code: 1008, reason: 'token expired' }));
            return new Promise(() => undefined); // what the SDK does: never settles
        });
        await expect(new ConnectSeam().Open(args)).rejects.toThrow('closed during setup (code 1008: token expired)');
        expect(closes).toBe(1);
    });

    it('rejects on a websocket error before setup completes', async () => {
        fakeSdk(({ callbacks }) => {
            setTimeout(() => callbacks.onerror({ message: 'boom' }));
            return new Promise(() => undefined);
        });
        await expect(new ConnectSeam().Open(args)).rejects.toThrow('connection failed: boom');
    });

    it('resolves normally, and a later close only reaches the handler', async () => {
        let callbacks: FakeCallbacks | null = null;
        const live = { sendRealtimeInput: vi.fn(), sendClientContent: vi.fn(), sendToolResponse: vi.fn(), close: vi.fn() };
        fakeSdk((p) => {
            callbacks = p.callbacks;
            return Promise.resolve(live);
        });
        await expect(new ConnectSeam().Open(args)).resolves.toBe(live);
        callbacks!.onclose({ code: 1000, reason: '' });
        expect(closes).toBe(1);
    });
});
