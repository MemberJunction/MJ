import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RenderProgress } from '@memberjunction/video-studio-core';
import {
    VideoRenderDriverBase,
    VideoRenderError,
} from '../index.js';
import {
    CreateHangRenderRequest,
    CreateMinimalBundle,
    CreateMinimalRenderRequest,
    CreateRemoteUrlBundle,
    MINIMAL_BUNDLE_DURATION_SECONDS,
    MINIMAL_BUNDLE_FPS,
    MINIMAL_BUNDLE_HEIGHT,
    MINIMAL_BUNDLE_WIDTH,
} from './fixtures/minimal-bundle.js';

/**
 * Shared contract test suite (`VS-RND-2`) executed against `FakeRenderDriver`,
 * `LocalWorkerRenderDriver` (stub worker), and opt-in `LocalWorkerRenderDriver` (real worker).
 */
export function DescribeRenderDriverContract(
    label: string,
    makeDriver: () => VideoRenderDriverBase | Promise<VideoRenderDriverBase>,
): void {
    describe(`VideoRenderDriverBase contract (${label})`, () => {
        let driver: VideoRenderDriverBase;
        let lastRenderedVideoBase64: string | null = null;

        beforeAll(async () => {
            driver = await makeDriver();
        }, 120_000);

        afterAll(async () => {
            if (driver) {
                await driver.Shutdown();
            }
        }, 30_000);

        it('Health reports Healthy: true with runtime versions', async () => {
            const health = await driver.Health();
            expect(health.Healthy).toBe(true);
            expect(health.NodeVersion.length).toBeGreaterThan(0);
            expect(health.HyperFramesVersion.length).toBeGreaterThan(0);
            expect(health.Errors).toEqual([]);
        }, 60_000);

        it('Render of minimal-bundle returns non-empty MP4, echoes geometry, and emits monotonic progress ending Complete / 100', async () => {
            const req = CreateMinimalRenderRequest();
            const progressEvents: RenderProgress[] = [];

            const result = await driver.Render(req, (progress) => {
                progressEvents.push(progress);
            });

            expect(result.Video).toBeInstanceOf(Uint8Array);
            expect(result.Video.byteLength).toBeGreaterThan(16);
            // Verify ISO BMFF 'ftyp' box header at bytes 4..8
            const boxType = Buffer.from(result.Video.subarray(4, 8)).toString('ascii');
            expect(boxType).toBe('ftyp');

            expect(result.Width).toBe(MINIMAL_BUNDLE_WIDTH);
            expect(result.Height).toBe(MINIMAL_BUNDLE_HEIGHT);
            expect(result.Fps).toBe(MINIMAL_BUNDLE_FPS);
            expect(result.FrameCount).toBe(
                Math.round(MINIMAL_BUNDLE_DURATION_SECONDS * MINIMAL_BUNDLE_FPS),
            );

            expect(progressEvents.length).toBeGreaterThan(0);
            for (let i = 1; i < progressEvents.length; i++) {
                expect(progressEvents[i]!.Percent).toBeGreaterThanOrEqual(
                    progressEvents[i - 1]!.Percent,
                );
            }
            const lastEvent = progressEvents[progressEvents.length - 1]!;
            expect(lastEvent.Phase).toBe('Complete');
            expect(lastEvent.Percent).toBe(100);

            lastRenderedVideoBase64 = Buffer.from(result.Video).toString('base64');
        }, 120_000);

        it('aborts a data-fake-hang render after its first progress with AbortError within 5 s, and a normal render then succeeds within 5 s', async () => {
            const hangReq = CreateHangRenderRequest();
            const abortController = new AbortController();
            let abortTriggeredAtMs = 0;

            const renderPromise = driver.Render(
                hangReq,
                () => {
                    if (!abortController.signal.aborted) {
                        abortTriggeredAtMs = Date.now();
                        abortController.abort();
                    }
                },
                abortController.signal,
            );

            let caughtError: unknown;
            try {
                await renderPromise;
            } catch (err) {
                caughtError = err;
            }

            const abortElapsedMs = abortTriggeredAtMs > 0 ? Date.now() - abortTriggeredAtMs : 0;
            expect(caughtError).toBeInstanceOf(Error);
            expect((caughtError as Error).name).toBe('AbortError');
            expect(abortElapsedMs).toBeLessThan(5_000);

            // Prove the worker slot was freed and the subsequent normal render succeeds within 5 s
            const normalStartMs = Date.now();
            const normalResult = await driver.Render(CreateMinimalRenderRequest());
            const normalElapsedMs = Date.now() - normalStartMs;

            expect(normalResult.Video.byteLength).toBeGreaterThan(16);
            expect(normalElapsedMs).toBeLessThan(5_000);
        }, 120_000);

        it('CaptureStills preserves keys and order, and repeated timestamps are byte-identical; BuildContactSheet covers every still key', async () => {
            const stillsRes = await driver.CaptureStills({
                Bundle: CreateMinimalBundle(),
                Width: MINIMAL_BUNDLE_WIDTH,
                Height: MINIMAL_BUNDLE_HEIGHT,
                Fps: MINIMAL_BUNDLE_FPS,
                Points: [
                    { Key: 'frame-a', TimestampSeconds: 0.5, Role: 'HeroPeak', Label: 'Halfway A' },
                    { Key: 'frame-b', TimestampSeconds: 0.0, Role: 'TransitionStart', Label: 'Start' },
                    { Key: 'frame-c', TimestampSeconds: 0.5, Role: 'TransitionEnd', Label: 'Halfway C' },
                    { Key: 'frame-d', TimestampSeconds: 0.8, Role: 'Custom', Label: 'Late' },
                ],
                Format: 'png',
            });

            expect(stillsRes.Stills.map((s) => s.Key)).toEqual([
                'frame-a',
                'frame-b',
                'frame-c',
                'frame-d',
            ]);
            expect(stillsRes.Stills[0]!.ImageBase64.length).toBeGreaterThan(0);
            expect(stillsRes.Stills[0]!.ImageBase64).toBe(stillsRes.Stills[2]!.ImageBase64);

            const sheetRes = await driver.BuildContactSheet({
                Stills: stillsRes.Stills,
                Format: '16:9',
                MaxTilesPerSheet: 2,
                TransitionStrip: true,
            });

            expect(sheetRes.Sheets.length).toBeGreaterThan(0);
            const coveredKeys = new Set(sheetRes.Sheets.flatMap((s) => s.StillKeys));
            for (const still of stillsRes.Stills) {
                expect(coveredKeys.has(still.Key)).toBe(true);
            }
        }, 120_000);

        it('Check passes a clean bundle and blocks a bundle with <img src="https://example.com/x.png"> with RemoteUrl; Render rejects LintBlocked with issues', async () => {
            const cleanCheck = await driver.Check({
                Bundle: CreateMinimalBundle(),
                Width: MINIMAL_BUNDLE_WIDTH,
                Height: MINIMAL_BUNDLE_HEIGHT,
                SampleTimestampsSeconds: [0],
            });
            expect(cleanCheck.Passed).toBe(true);
            expect(cleanCheck.BlockRender).toBe(false);

            const remoteUrlBundle = CreateRemoteUrlBundle();
            const blockedCheck = await driver.Check({
                Bundle: remoteUrlBundle,
                Width: MINIMAL_BUNDLE_WIDTH,
                Height: MINIMAL_BUNDLE_HEIGHT,
                SampleTimestampsSeconds: [0],
            });
            expect(blockedCheck.Passed).toBe(false);
            expect(blockedCheck.BlockRender).toBe(true);
            expect(
                blockedCheck.Issues.some(
                    (issue) => issue.Category === 'RemoteUrl' && issue.Severity === 'Error',
                ),
            ).toBe(true);

            let renderErr: unknown;
            try {
                await driver.Render({
                    Bundle: remoteUrlBundle,
                    Width: MINIMAL_BUNDLE_WIDTH,
                    Height: MINIMAL_BUNDLE_HEIGHT,
                    Fps: MINIMAL_BUNDLE_FPS,
                    DurationSeconds: MINIMAL_BUNDLE_DURATION_SECONDS,
                });
            } catch (err) {
                renderErr = err;
            }

            expect(renderErr).toBeInstanceOf(VideoRenderError);
            const vErr = renderErr as VideoRenderError;
            expect(vErr.Code).toBe('LintBlocked');
            expect(Array.isArray(vErr.Issues)).toBe(true);
            expect(
                vErr.Issues?.some(
                    (issue) => issue.Category === 'RemoteUrl' && issue.Severity === 'Error',
                ),
            ).toBe(true);
        }, 120_000);

        it('ExtractKeyframes returns at most MaxFrames keyframes sorted by TimestampSeconds', async () => {
            if (!lastRenderedVideoBase64) {
                const renderRes = await driver.Render(CreateMinimalRenderRequest());
                lastRenderedVideoBase64 = Buffer.from(renderRes.Video).toString('base64');
            }

            const maxFrames = 3;
            const keyframesRes = await driver.ExtractKeyframes({
                VideoBase64: lastRenderedVideoBase64,
                MaxFrames: maxFrames,
                IncludeContactSheet: true,
            });

            expect(keyframesRes.Frames.length).toBeGreaterThan(0);
            expect(keyframesRes.Frames.length).toBeLessThanOrEqual(maxFrames);
            for (let i = 1; i < keyframesRes.Frames.length; i++) {
                expect(keyframesRes.Frames[i]!.TimestampSeconds).toBeGreaterThanOrEqual(
                    keyframesRes.Frames[i - 1]!.TimestampSeconds,
                );
            }
        }, 60_000);
    });
}
