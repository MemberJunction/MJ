import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    RENDER_WORKER_ROUTES,
    type CapturedStill,
    type CheckResult,
    type ContactSheetResult,
    type KeyframeResult,
    type RenderHealth,
    type RenderProjectBundle,
    type RenderRequest,
    type RenderStreamEvent,
    type RenderWorkerErrorBody,
    type StillsResult,
} from '@memberjunction/video-studio-core';
import {
    CreateRenderWorkerServer,
    EscapeHtmlForLabel,
    FAKE_MP4_BYTES,
    FAKE_ONE_BY_ONE_PNG,
    FakeRenderBackend,
    type RenderWorkerServer,
} from '../index.js';

function createCleanBundle(htmlOverride?: string): RenderProjectBundle {
    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [
            {
                Path: 'index.html',
                Content:
                    htmlOverride ??
                    '<!doctype html><html><body><div data-composition-id="main" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-no-timeline></div></body></html>',
            },
        ],
        Assets: [],
        DataSnapshot: { Title: 'Demo' },
        Seed: 101,
    };
}

function createValidRenderRequest(bundle?: RenderProjectBundle, timeoutMs?: number): RenderRequest {
    return {
        Bundle: bundle ?? createCleanBundle(),
        Width: 1280,
        Height: 720,
        Fps: 30,
        DurationSeconds: 2,
        Quality: 'standard',
        TimeoutMs: timeoutMs,
    };
}

async function parseNdjsonStream(response: Response): Promise<RenderStreamEvent[]> {
    const text = await response.text();
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as RenderStreamEvent);
}

describe('CreateRenderWorkerServer HTTP contract', () => {
    const serversToClose: RenderWorkerServer[] = [];

    afterEach(async () => {
        while (serversToClose.length > 0) {
            const srv = serversToClose.pop();
            if (srv) {
                await srv.Close();
            }
        }
    });

    it('requires Bearer token on /health when configured, serves 200 when healthy and 503 when unhealthy, and refuses non-loopback Host without Token', async () => {
        expect(() =>
            CreateRenderWorkerServer({
                Backend: new FakeRenderBackend(),
                Host: '0.0.0.0',
            }),
        ).toThrow(/non-loopback host/i);

        const healthyServer = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend({ Healthy: true }),
            Token: 'secret-token-123',
        });
        serversToClose.push(healthyServer);
        const port1 = await healthyServer.Listen();

        const unauthRes = await fetch(`http://127.0.0.1:${port1}${RENDER_WORKER_ROUTES.Health}`);
        expect(unauthRes.status).toBe(401);

        const res1 = await fetch(`http://127.0.0.1:${port1}${RENDER_WORKER_ROUTES.Health}`, {
            headers: { Authorization: 'Bearer secret-token-123' },
        });
        expect(res1.status).toBe(200);
        const health1 = (await res1.json()) as RenderHealth;
        expect(health1.Healthy).toBe(true);

        const unhealthyServer = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend({ Healthy: false }),
            Token: 'secret-token-123',
        });
        serversToClose.push(unhealthyServer);
        const port2 = await unhealthyServer.Listen();

        const res2 = await fetch(`http://127.0.0.1:${port2}${RENDER_WORKER_ROUTES.Health}`, {
            headers: { Authorization: 'Bearer secret-token-123' },
        });
        expect(res2.status).toBe(503);
        const health2 = (await res2.json()) as RenderHealth;
        expect(health2.Healthy).toBe(false);
        expect(health2.Errors.length).toBeGreaterThan(0);
    });

    it('returns 401 on missing or wrong Bearer token and succeeds on timing-safe match', async () => {
        const server = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend(),
            BearerToken: 'top-secret-token',
        });
        serversToClose.push(server);
        const port = await server.Listen(0);
        const checkUrl = `http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Check}`;
        const body = JSON.stringify({ Bundle: createCleanBundle(), Width: 1280, Height: 720 });

        const missingRes = await fetch(checkUrl, { method: 'POST', body });
        expect(missingRes.status).toBe(401);

        const wrongRes = await fetch(checkUrl, {
            method: 'POST',
            headers: { Authorization: 'Bearer wrong-token' },
            body,
        });
        expect(wrongRes.status).toBe(401);

        const okRes = await fetch(checkUrl, {
            method: 'POST',
            headers: { Authorization: 'Bearer top-secret-token' },
            body,
        });
        expect(okRes.status).toBe(200);
        const checkResult = (await okRes.json()) as CheckResult;
        expect(checkResult.Passed).toBe(true);
    });

    it('returns 413 on body > MaxBodyBytes, 400 on bad JSON, and 404 on unknown route', async () => {
        const server = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend(),
            MaxBodyBytes: 128,
        });
        serversToClose.push(server);
        const port = await server.Listen(0);

        const largeBody = JSON.stringify({ Padding: 'x'.repeat(500) });
        const tooLargeRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Check}`, {
            method: 'POST',
            body: largeBody,
        });
        expect(tooLargeRes.status).toBe(413);
        const tooLargeErr = (await tooLargeRes.json()) as RenderWorkerErrorBody;
        expect(tooLargeErr.Code).toBe('BodyTooLarge');

        const badJsonRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Check}`, {
            method: 'POST',
            body: '{not-valid-json',
        });
        expect(badJsonRes.status).toBe(400);
        const badJsonErr = (await badJsonRes.json()) as RenderWorkerErrorBody;
        expect(badJsonErr.Code).toBe('InvalidRequest');

        const unknownRes = await fetch(`http://127.0.0.1:${port}/unknown-route`);
        expect(unknownRes.status).toBe(404);
        const unknownErr = (await unknownRes.json()) as RenderWorkerErrorBody;
        expect(unknownErr.Code).toBe('NotFound');
    });

    it('returns 422 LintBlocked with issues on /render and /stills when lint fails, and 400 GEOMETRY_MISMATCH on mismatched data-width', async () => {
        const server = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend(),
        });
        serversToClose.push(server);
        const port = await server.Listen(0);

        const dirtyBundle = createCleanBundle(
            '<!doctype html><html><body><script>fetch("https://evil.example.com");</script></body></html>',
        );

        const renderRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Render}`, {
            method: 'POST',
            body: JSON.stringify(createValidRenderRequest(dirtyBundle)),
        });
        expect(renderRes.status).toBe(422);
        const renderErr = (await renderRes.json()) as RenderWorkerErrorBody;
        expect(renderErr.Code).toBe('LintBlocked');
        expect(renderErr.Issues?.length).toBeGreaterThan(0);

        const stillsRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Stills}`, {
            method: 'POST',
            body: JSON.stringify({
                Bundle: dirtyBundle,
                Width: 1280,
                Height: 720,
                Points: [{ Key: 'p1', TimestampSeconds: 0.5, Role: 'BeatMidpoint' }],
            }),
        });
        expect(stillsRes.status).toBe(422);
        const stillsErr = (await stillsRes.json()) as RenderWorkerErrorBody;
        expect(stillsErr.Code).toBe('LintBlocked');
        expect(stillsErr.Issues?.length).toBeGreaterThan(0);

        // GEOMETRY_MISMATCH -> 400
        const mismatchBundle = createCleanBundle(
            '<!doctype html><html><body><div data-composition-id="main" data-width="1920" data-height="1080"></div></body></html>',
        );
        const mismatchRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Render}`, {
            method: 'POST',
            body: JSON.stringify(createValidRenderRequest(mismatchBundle)),
        });
        expect(mismatchRes.status).toBe(400);
        const mismatchErr = (await mismatchRes.json()) as { Code: string; Message: string };
        expect(mismatchErr.Code).toBe('GEOMETRY_MISMATCH');
    });

    it('streams Progress, Heartbeat, and Result on /render, then GET /videos/<VideoID> serves video/mp4 once and 404 on second fetch', async () => {
        const server = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend({ StepDelayMs: 25 }),
            HeartbeatIntervalMs: 30,
        });
        serversToClose.push(server);
        const port = await server.Listen(0);

        const renderRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Render}`, {
            method: 'POST',
            body: JSON.stringify(createValidRenderRequest()),
        });
        expect(renderRes.status).toBe(200);
        expect(renderRes.headers.get('content-type')).toContain('application/x-ndjson');

        const events = await parseNdjsonStream(renderRes);
        const progressEvents = events.filter((e) => e.Type === 'Progress');
        const heartbeatEvents = events.filter((e) => e.Type === 'Heartbeat');
        const resultEvent = events.find((e) => e.Type === 'Result');

        expect(progressEvents.length).toBe(5);
        expect(heartbeatEvents.length).toBeGreaterThanOrEqual(1);
        expect(resultEvent?.Type).toBe('Result');
        if (!resultEvent || resultEvent.Type !== 'Result') {
            throw new Error('Expected terminal Result event');
        }

        const videoId = resultEvent.Result.VideoID;
        expect(videoId).toBeTruthy();
        expect(resultEvent.Result.VideoSizeBytes).toBe(FAKE_MP4_BYTES.byteLength);

        const videoUrl = `http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Video}/${encodeURIComponent(videoId)}`;
        const firstVideoRes = await fetch(videoUrl);
        expect(firstVideoRes.status).toBe(200);
        expect(firstVideoRes.headers.get('content-type')).toBe('video/mp4');
        const mp4Buf = Buffer.from(await firstVideoRes.arrayBuffer());
        expect(mp4Buf.equals(FAKE_MP4_BYTES)).toBe(true);

        const secondVideoRes = await fetch(videoUrl);
        expect(secondVideoRes.status).toBe(404);
    });

    it('queues a second /render behind the first when Concurrency = 1', async () => {
        const server = CreateRenderWorkerServer({
            Backend: new FakeRenderBackend({ StepDelayMs: 30 }),
            Concurrency: 1,
        });
        serversToClose.push(server);
        const port = await server.Listen(0);
        const renderUrl = `http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Render}`;
        const payload = JSON.stringify(createValidRenderRequest());

        const [resA, resB] = await Promise.all([
            fetch(renderUrl, { method: 'POST', body: payload }),
            fetch(renderUrl, { method: 'POST', body: payload }),
        ]);

        const [eventsA, eventsB] = await Promise.all([
            parseNdjsonStream(resA),
            parseNdjsonStream(resB),
        ]);
        expect(eventsA.some((e) => e.Type === 'Result')).toBe(true);
        expect(eventsB.some((e) => e.Type === 'Result')).toBe(true);
    });

    it('aborts a hanging data-fake-hang render on per-request TimeoutMs with Error event Code: Timeout, and times out hanging /check with 504 Timeout', async () => {
        const hangingCheckBackend = new FakeRenderBackend();
        hangingCheckBackend.RunCheckCli = async (_job, signal) => {
            await new Promise<void>((_resolve, reject) => {
                if (signal?.aborted) {
                    reject(new Error('Aborted'));
                    return;
                }
                signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
            });
            return [];
        };

        const server = CreateRenderWorkerServer({
            Backend: hangingCheckBackend,
            NonRenderTimeoutMs: 60,
        });
        serversToClose.push(server);
        const port = await server.Listen(0);

        const hangBundle = createCleanBundle(
            '<!doctype html><html><body><div data-composition-id="main" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-fake-hang data-no-timeline></div></body></html>',
        );

        const res = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Render}`, {
            method: 'POST',
            body: JSON.stringify(createValidRenderRequest(hangBundle, 80)),
        });
        expect(res.status).toBe(200);
        const events = await parseNdjsonStream(res);
        const errorEvent = events.find((e) => e.Type === 'Error');
        expect(errorEvent?.Type).toBe('Error');
        if (errorEvent && errorEvent.Type === 'Error') {
            expect(errorEvent.Error.Code).toBe('Timeout');
        }

        const checkRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Check}`, {
            method: 'POST',
            body: JSON.stringify({ Bundle: createCleanBundle(), Width: 1280, Height: 720 }),
        });
        expect(checkRes.status).toBe(504);
        const checkErr = (await checkRes.json()) as RenderWorkerErrorBody;
        expect(checkErr.Code).toBe('Timeout');
    });

    it('aborts backend signal, releases concurrency slot, and leaves TempRoot empty after success, LintBlocked, and client disconnect', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-vs-temproot-test-'));
        try {
            const server = CreateRenderWorkerServer({
                Backend: new FakeRenderBackend({ StepDelayMs: 15 }),
                Concurrency: 1,
                TempRoot: tempRoot,
            });
            serversToClose.push(server);
            const port = await server.Listen(0);

            // 1. LintBlocked leaves TempRoot empty
            const dirtyBundle = createCleanBundle(
                '<!doctype html><html><body><script>fetch("https://evil.example.com");</script></body></html>',
            );
            const lintBlockedRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Render}`, {
                method: 'POST',
                body: JSON.stringify(createValidRenderRequest(dirtyBundle)),
            });
            expect(lintBlockedRes.status).toBe(422);
            expect(await fs.readdir(tempRoot)).toEqual([]);

            // 2. Client disconnect mid-render releases slot and cleans up TempRoot
            const hangBundle = createCleanBundle(
                '<!doctype html><html><body><div data-composition-id="main" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-fake-hang data-no-timeline></div></body></html>',
            );
            const hangPayload = JSON.stringify(createValidRenderRequest(hangBundle));

            await new Promise<void>((resolve, reject) => {
                const clientReq = http.request(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: RENDER_WORKER_ROUTES.Render,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(hangPayload),
                        },
                    },
                    (res) => {
                        res.once('data', () => {
                            clientReq.destroy();
                            resolve();
                        });
                    },
                );
                clientReq.once('error', () => resolve());
                clientReq.once('timeout', () => reject(new Error('timeout')));
                clientReq.write(hangPayload);
                clientReq.end();
            });

            // Give the server a moment to process socket close & release the semaphore
            await new Promise((r) => setTimeout(r, 40));
            expect(await fs.readdir(tempRoot)).toEqual([]);

            // 3. Subsequent request succeeds promptly and cleans up TempRoot
            const nextRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Render}`, {
                method: 'POST',
                body: JSON.stringify(createValidRenderRequest()),
            });
            const events = await parseNdjsonStream(nextRes);
            expect(events.some((e) => e.Type === 'Result')).toBe(true);
            expect(await fs.readdir(tempRoot)).toEqual([]);
        } finally {
            await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
        }
    });

    it('handles /stills (> 48 -> 400 TooManyStills), /contact-sheet (grid + TransitionStrip, HTML-escaped label, > 4 sheets -> TooManyStills, bad base64/mime/columns -> 400), /check, and /keyframes (with BuildContactSheet: true)', async () => {
        const backend = new FakeRenderBackend();
        const server = CreateRenderWorkerServer({
            Backend: backend,
        });
        serversToClose.push(server);
        const port = await server.Listen(0);

        // 0. /check forwards AbortSignal to both RunCheckCli and MeasureText
        const checkOkRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Check}`, {
            method: 'POST',
            body: JSON.stringify({
                Bundle: createCleanBundle(),
                Width: 1280,
                Height: 720,
            }),
        });
        expect(checkOkRes.status).toBe(200);
        expect(backend.LastCheckCliSignal).toBeInstanceOf(AbortSignal);
        expect(backend.LastMeasureTextSignal).toBeInstanceOf(AbortSignal);

        // 1. /stills > 48 -> 400 TooManyStills
        const tooManyPoints = Array.from({ length: 49 }, (_, i) => ({
            Key: `pt-${i}`,
            TimestampSeconds: i * 0.1,
            Role: 'Custom' as const,
        }));
        const tooManyStillsRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Stills}`, {
            method: 'POST',
            body: JSON.stringify({
                Bundle: createCleanBundle(),
                Width: 1280,
                Height: 720,
                Points: tooManyPoints,
            }),
        });
        expect(tooManyStillsRes.status).toBe(400);
        const tooManyStillsErr = (await tooManyStillsRes.json()) as RenderWorkerErrorBody;
        expect(tooManyStillsErr.Code).toBe('TooManyStills');

        // Valid /stills
        const validStillsRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Stills}`, {
            method: 'POST',
            body: JSON.stringify({
                Bundle: createCleanBundle(),
                Width: 1280,
                Height: 720,
                Points: [
                    { Key: 's1', TimestampSeconds: 0.2, BeatKey: 'intro', Role: 'TransitionStart', Label: '<script>evil</script>' },
                    { Key: 's2', TimestampSeconds: 0.4, BeatKey: 'hook', Role: 'TransitionEnd', Label: 'End' },
                ],
            }),
        });
        expect(validStillsRes.status).toBe(200);
        const stillsResult = (await validStillsRes.json()) as StillsResult;
        expect(stillsResult.Stills).toHaveLength(2);

        // 2. /contact-sheet with Grid + TransitionStrip and HTML-escaped <script> label
        expect(EscapeHtmlForLabel('<script>evil</script>')).toBe('&lt;script&gt;evil&lt;/script&gt;');
        const contactRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.ContactSheet}`, {
            method: 'POST',
            body: JSON.stringify({
                Format: '16:9',
                Stills: stillsResult.Stills,
                IncludeTransitionStrip: true,
            }),
        });
        expect(contactRes.status).toBe(200);
        const contactResult = (await contactRes.json()) as ContactSheetResult;
        expect(contactResult.Sheets).toHaveLength(2);
        expect(contactResult.Sheets[0]?.Kind).toBe('Grid');
        expect(contactResult.Sheets[0]?.Width).toBe(1536);
        expect(contactResult.Sheets[1]?.Kind).toBe('TransitionStrip');

        // /contact-sheet > 4 grid sheets -> 400 TooManyStills
        const fiftyStills: CapturedStill[] = Array.from({ length: 49 }, (_, i) => ({
            Key: `k-${i}`,
            TimestampSeconds: i,
            Role: 'BeatMidpoint',
            MimeType: 'image/png',
            Width: 1280,
            Height: 720,
            ImageBase64: FAKE_ONE_BY_ONE_PNG.toString('base64'),
        }));
        const overflowSheetRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.ContactSheet}`, {
            method: 'POST',
            body: JSON.stringify({
                Format: '16:9',
                Stills: fiftyStills,
                MaxTilesPerSheet: 12,
            }),
        });
        expect(overflowSheetRes.status).toBe(400);
        const overflowErr = (await overflowSheetRes.json()) as RenderWorkerErrorBody;
        expect(overflowErr.Code).toBe('TooManyStills');

        // /contact-sheet rejects injected ImageBase64, invalid MimeType, or non-integer Columns with 400
        const badBase64Res = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.ContactSheet}`, {
            method: 'POST',
            body: JSON.stringify({
                Format: '16:9',
                Stills: [{ ...stillsResult.Stills[0]!, ImageBase64: '"><script>x</script>' }],
            }),
        });
        expect(badBase64Res.status).toBe(400);

        const badMimeRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.ContactSheet}`, {
            method: 'POST',
            body: JSON.stringify({
                Format: '16:9',
                Stills: [{ ...stillsResult.Stills[0]!, MimeType: 'text/html' }],
            }),
        });
        expect(badMimeRes.status).toBe(400);

        const badColumnsRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.ContactSheet}`, {
            method: 'POST',
            body: JSON.stringify({
                Format: '16:9',
                Stills: stillsResult.Stills,
                Columns: '1; position:fixed',
            }),
        });
        expect(badColumnsRes.status).toBe(400);

        // 3. /keyframes with BuildContactSheet: true
        const kfRes = await fetch(`http://127.0.0.1:${port}${RENDER_WORKER_ROUTES.Keyframes}`, {
            method: 'POST',
            body: JSON.stringify({
                VideoBase64: FAKE_MP4_BYTES.toString('base64'),
                MimeType: 'video/mp4',
                MaxFrames: 3,
                BuildContactSheet: true,
            }),
        });
        expect(kfRes.status).toBe(200);
        const kfResult = (await kfRes.json()) as KeyframeResult;
        expect(kfResult.Frames).toHaveLength(3);
        expect(kfResult.Sheets?.length).toBe(1);
    });
});
