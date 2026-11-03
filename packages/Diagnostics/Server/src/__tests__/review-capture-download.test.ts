import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DiagnosticSessionManager } from '../sessionManager.js';
import { DiagnosticsServerMiddleware } from '../middleware.js';
import { DiagnosticIntakeService } from '../intakeService.js';

type ExpressAppParam = Parameters<DiagnosticsServerMiddleware['ConfigureExpressApp']>[0];
type ReceivedBundle = NonNullable<ReturnType<DiagnosticIntakeService['GetReceivedBundle']>>;

interface FakeResponse {
    StatusCode: number;
    Body: { error?: string } | undefined;
    Sent: Buffer | undefined;
    status: (code: number) => FakeResponse;
    json: (body: { error?: string }) => FakeResponse;
    send: (bytes: Buffer) => FakeResponse;
    setHeader: () => void;
}
type DownloadHandler = (req: { params: Record<string, string>; query: Record<string, string>; headers: Record<string, string> }, res: FakeResponse) => void;

function fakeResponse(): FakeResponse {
    const res: FakeResponse = {
        StatusCode: 200,
        Body: undefined,
        Sent: undefined,
        status: (code) => {
            res.StatusCode = code;
            return res;
        },
        json: (body) => {
            res.Body = body;
            return res;
        },
        send: (bytes) => {
            res.Sent = bytes;
            return res;
        },
        setHeader: () => undefined,
    };
    return res;
}

/** Registers the middleware routes and returns the download handler. */
function downloadHandler(): DownloadHandler {
    const handlers = new Map<string, DownloadHandler>();
    const record = (path: string, handler: DownloadHandler): void => {
        handlers.set(path, handler);
    };
    const app = { get: record, post: record, put: record } as unknown as ExpressAppParam;
    new DiagnosticsServerMiddleware().ConfigureExpressApp(app, { ApiRoute: (p: string) => p });
    return handlers.get('/diagnostics/bundles/:bundleId/download')!;
}

describe('bundle download token (review fixes)', () => {
    const bundleId = 'BUNDLE-LATE-BYTES';
    let manager: DiagnosticSessionManager;

    beforeEach(() => {
        manager = DiagnosticSessionManager.Instance;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the link usable after a 410, then serves it once', () => {
        const download = downloadHandler();
        const token = manager.MintDownloadToken(bundleId, 'user-1');
        const received = vi.spyOn(DiagnosticIntakeService.Instance, 'GetReceivedBundle').mockReturnValue(undefined);

        const missing = fakeResponse();
        download({ params: { bundleId }, query: { token }, headers: {} }, missing);
        expect(missing.StatusCode).toBe(410);

        received.mockReturnValue({ decryptedZipBytes: new Uint8Array([1, 2, 3]) } as unknown as ReceivedBundle);
        const served = fakeResponse();
        download({ params: { bundleId }, query: { token }, headers: {} }, served);
        expect(served.StatusCode).toBe(200);
        expect(served.Sent?.byteLength).toBe(3);

        const replay = fakeResponse();
        download({ params: { bundleId }, query: { token }, headers: {} }, replay);
        expect(replay.StatusCode).toBe(403);
    });
});
