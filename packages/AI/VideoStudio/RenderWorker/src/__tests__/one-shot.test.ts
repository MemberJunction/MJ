import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
    CheckResult,
    ContactSheetResult,
    KeyframeResult,
    RenderHealth,
    RenderProjectBundle,
    RenderRequest,
    RenderResultMetadata,
    RenderStreamEvent,
    RenderWorkerErrorBody,
    StillsResult,
} from '@memberjunction/video-studio-core';
import {
    FAKE_MP4_BYTES,
    FAKE_ONE_BY_ONE_PNG,
    FakeRenderBackend,
    RunOneShot,
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

function createValidRenderRequest(bundle?: RenderProjectBundle): RenderRequest {
    return {
        Bundle: bundle ?? createCleanBundle(),
        Width: 1280,
        Height: 720,
        Fps: 30,
        DurationSeconds: 2,
        Quality: 'standard',
    };
}

describe('RunOneShot CLI (VS-RND-4)', () => {
    let tempDir: string;
    let outDir: string;
    let requestPath: string;
    let stdoutLines: string[];
    let stderrChunks: string[];
    let stdoutWriter: { write(chunk: string): unknown };
    let stderrWriter: { write(chunk: string): unknown };

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-video-oneshot-test-'));
        outDir = path.join(tempDir, 'out');
        requestPath = path.join(tempDir, 'request.json');
        stdoutLines = [];
        stderrChunks = [];
        stdoutWriter = {
            write: (chunk: string): boolean => {
                for (const line of chunk.split('\n')) {
                    if (line.trim().length > 0) {
                        stdoutLines.push(line);
                    }
                }
                return true;
            },
        };
        stderrWriter = {
            write: (chunk: string): boolean => {
                stderrChunks.push(chunk);
                return true;
            },
        };
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('renders a clean bundle, writes result.json + video.mp4, emits Progress lines to stdout, and returns 0', async () => {
        const backend = new FakeRenderBackend({ StepDelayMs: 5 });
        const req = createValidRenderRequest();
        await fs.writeFile(requestPath, JSON.stringify(req), 'utf8');

        const code = await RunOneShot(
            ['run', 'render', '--request', requestPath, '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );

        expect(code).toBe(0);
        expect(stderrChunks).toEqual([]);
        expect(stdoutLines.length).toBeGreaterThan(0);

        const parsedEvents = stdoutLines.map((line) => JSON.parse(line) as RenderStreamEvent);
        for (const event of parsedEvents) {
            expect(event.Type).toBe('Progress');
            expect(event.Progress.Percent).toBeGreaterThan(0);
        }

        const metadataRaw = await fs.readFile(path.join(outDir, 'result.json'), 'utf8');
        const metadata = JSON.parse(metadataRaw) as RenderResultMetadata;
        expect(metadata.VideoID).toBe('video.mp4');
        expect(metadata.VideoSizeBytes).toBe(FAKE_MP4_BYTES.byteLength);
        expect(metadata.Format).toBe('16:9');
        expect(metadata.Width).toBe(1280);
        expect(metadata.Height).toBe(720);
        expect(metadata.Fps).toBe(30);
        expect(metadata.FrameCount).toBe(60);

        const videoBytes = await fs.readFile(path.join(outDir, 'video.mp4'));
        expect(Buffer.compare(videoBytes, FAKE_MP4_BYTES)).toBe(0);
    });

    it('writes error.json with LintBlocked and returns 1 when the bundle is lint-blocked', async () => {
        const backend = new FakeRenderBackend();
        const remoteBundle = createCleanBundle(
            '<!doctype html><html><body><div data-composition-id="main" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-no-timeline><img src="https://example.com/blocked.png" /></div></body></html>',
        );
        const req = createValidRenderRequest(remoteBundle);
        await fs.writeFile(requestPath, JSON.stringify(req), 'utf8');

        const code = await RunOneShot(
            ['run', 'render', '--request', requestPath, '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );

        expect(code).toBe(1);
        const errorRaw = await fs.readFile(path.join(outDir, 'error.json'), 'utf8');
        const errorBody = JSON.parse(errorRaw) as RenderWorkerErrorBody;
        expect(errorBody.Code).toBe('LintBlocked');
        expect(Array.isArray(errorBody.Issues)).toBe(true);
        expect(
            errorBody.Issues?.some(
                (issue) => issue.Category === 'RemoteUrl' && issue.Severity === 'Error',
            ),
        ).toBe(true);
    });

    it('returns exit code 2 and writes usage to stderr on invalid or missing CLI arguments', async () => {
        const backend = new FakeRenderBackend();

        const codeMissingOut = await RunOneShot(
            ['run', 'render', '--request', requestPath],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );
        expect(codeMissingOut).toBe(2);
        expect(stderrChunks.join('')).toContain('Usage: main.js run');

        stderrChunks = [];
        const codeUnknownOp = await RunOneShot(
            ['run', 'unknown-op', '--request', requestPath, '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );
        expect(codeUnknownOp).toBe(2);
        expect(stderrChunks.join('')).toContain('Usage: main.js run');

        stderrChunks = [];
        const codeMissingRequest = await RunOneShot(
            ['run', 'render', '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );
        expect(codeMissingRequest).toBe(2);
        expect(stderrChunks.join('')).toContain('Usage: main.js run');
    });

    it('executes health, stills, contact-sheet, check, and keyframes operations into result.json', async () => {
        const backend = new FakeRenderBackend();

        // 1. health
        await fs.writeFile(requestPath, JSON.stringify({}), 'utf8');
        const healthCode = await RunOneShot(
            ['run', 'health', '--request', requestPath, '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );
        expect(healthCode).toBe(0);
        const health = JSON.parse(
            await fs.readFile(path.join(outDir, 'result.json'), 'utf8'),
        ) as RenderHealth;
        expect(health.Healthy).toBe(true);
        expect(health.NodeVersion.length).toBeGreaterThan(0);

        // 2. stills
        await fs.writeFile(
            requestPath,
            JSON.stringify({
                Bundle: createCleanBundle(),
                Width: 1280,
                Height: 720,
                Points: [{ Key: 's1', TimestampSeconds: 0.5, Role: 'BeatMidpoint' }],
            }),
            'utf8',
        );
        const stillsCode = await RunOneShot(
            ['run', 'stills', '--request', requestPath, '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );
        expect(stillsCode).toBe(0);
        const stillsRes = JSON.parse(
            await fs.readFile(path.join(outDir, 'result.json'), 'utf8'),
        ) as StillsResult;
        expect(stillsRes.Stills).toHaveLength(1);
        expect(stillsRes.Stills[0]?.Key).toBe('s1');

        // 3. contact-sheet
        await fs.writeFile(
            requestPath,
            JSON.stringify({
                Format: '16:9',
                Stills: stillsRes.Stills,
            }),
            'utf8',
        );
        const sheetCode = await RunOneShot(
            ['run', 'contact-sheet', '--request', requestPath, '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );
        expect(sheetCode).toBe(0);
        const sheetRes = JSON.parse(
            await fs.readFile(path.join(outDir, 'result.json'), 'utf8'),
        ) as ContactSheetResult;
        expect(sheetRes.Sheets).toHaveLength(1);

        // 4. check
        await fs.writeFile(
            requestPath,
            JSON.stringify({
                Bundle: createCleanBundle(),
                Width: 1280,
                Height: 720,
            }),
            'utf8',
        );
        const checkCode = await RunOneShot(
            ['run', 'check', '--request', requestPath, '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );
        expect(checkCode).toBe(0);
        const checkRes = JSON.parse(
            await fs.readFile(path.join(outDir, 'result.json'), 'utf8'),
        ) as CheckResult;
        expect(checkRes.Passed).toBe(true);

        // 5. keyframes
        await fs.writeFile(
            requestPath,
            JSON.stringify({
                VideoBase64: FAKE_MP4_BYTES.toString('base64'),
                MimeType: 'video/mp4',
                MaxFrames: 2,
            }),
            'utf8',
        );
        const kfCode = await RunOneShot(
            ['run', 'keyframes', '--request', requestPath, '--out', outDir],
            backend,
            stdoutWriter,
            { Stderr: stderrWriter },
        );
        expect(kfCode).toBe(0);
        const kfRes = JSON.parse(
            await fs.readFile(path.join(outDir, 'result.json'), 'utf8'),
        ) as KeyframeResult;
        expect(kfRes.Frames.length).toBeGreaterThan(0);
        expect(kfRes.Frames[0]?.ImageBase64).toBe(FAKE_ONE_BY_ONE_PNG.toString('base64'));
    });

    it('aborts an in-flight render and exits with 1 when the stdin pipe closes', async () => {
        const backend = new FakeRenderBackend();
        const hangBundle = createCleanBundle(
            '<!doctype html><html><body><div data-composition-id="main" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-no-timeline data-fake-hang="true"></div></body></html>',
        );
        await fs.writeFile(
            requestPath,
            JSON.stringify(createValidRenderRequest(hangBundle)),
            'utf8',
        );

        const stdinPipe = new PassThrough();
        const closeTriggerStdout = {
            write: (chunk: string): boolean => {
                stdoutWriter.write(chunk);
                stdinPipe.end();
                return true;
            },
        };

        const code = await RunOneShot(
            ['run', 'render', '--request', requestPath, '--out', outDir],
            backend,
            closeTriggerStdout,
            { Stderr: stderrWriter, Stdin: stdinPipe },
        );

        expect(code).toBe(1);
        const errorBody = JSON.parse(
            await fs.readFile(path.join(outDir, 'error.json'), 'utf8'),
        ) as RenderWorkerErrorBody;
        expect(errorBody.Code).toBe('Cancelled');
    });
});
