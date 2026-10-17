import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { CapturedStill, RenderProjectBundle } from '@memberjunction/video-studio-core';
import { StageRenderBundle } from '../bundle.js';
import { HyperFramesRenderBackend } from '../hyperframes-backend.js';
import {
    GetWorkerHealth,
    RunContactSheetJob,
    RunKeyframesJob,
    RunRenderJob,
    RunStillsJob,
} from '../index.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, 'fixtures', 'golden');
const GOLDEN_HTML_PATH = path.join(GOLDEN_DIR, 'index.html');
const GOLDEN_FONT_PATH = path.join(GOLDEN_DIR, 'Roboto-Regular.ttf');

/**
 * Generates a valid N-second 8 kHz mono 16-bit PCM WAV buffer (44-byte RIFF header + sine wave).
 */
function createSineWavBase64(durationSeconds = 3, sampleRate = 8000): string {
    const numSamples = Math.floor(durationSeconds * sampleRate);
    const dataBytes = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataBytes);

    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataBytes, 40);

    for (let i = 0; i < numSamples; i++) {
        const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
        buffer.writeInt16LE(sample, 44 + i * 2);
    }

    return buffer.toString('base64');
}

/**
 * Generates a valid 16x16 RGB PNG image in memory (with valid CRC32 chunks).
 */
function createSolidPngBase64(width = 16, height = 16): string {
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crcTable[n] = c;
    }
    const crc32 = (buf: Buffer): number => {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
        }
        return (c ^ 0xffffffff) >>> 0;
    };
    const makeChunk = (type: string, data: Buffer): Buffer => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
        return Buffer.concat([len, typeBuf, data, crc]);
    };

    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB

    const rawRows: Buffer[] = [];
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 3);
        row[0] = 0; // filter none
        for (let x = 0; x < width; x++) {
            row[1 + x * 3] = 56;
            row[1 + x * 3 + 1] = 189;
            row[1 + x * 3 + 2] = 248;
        }
        rawRows.push(row);
    }
    const idat = zlib.deflateSync(Buffer.concat(rawRows));
    return Buffer.concat([
        signature,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', idat),
        makeChunk('IEND', Buffer.alloc(0)),
    ]).toString('base64');
}

async function buildGoldenBundle(): Promise<RenderProjectBundle> {
    const [goldenHtml, fontBytes] = await Promise.all([
        fs.readFile(GOLDEN_HTML_PATH, 'utf8'),
        fs.readFile(GOLDEN_FONT_PATH),
    ]);
    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [{ Path: 'index.html', Content: goldenHtml }],
        Assets: [
            {
                Key: 'roboto',
                RelativePath: 'assets/Roboto-Regular.ttf',
                MimeType: 'font/ttf',
                DataBase64: fontBytes.toString('base64'),
            },
            {
                Key: 'badge',
                RelativePath: 'assets/badge.png',
                MimeType: 'image/png',
                DataBase64: createSolidPngBase64(16, 16),
            },
            {
                Key: 'tone',
                RelativePath: 'assets/tone.wav',
                MimeType: 'audio/wav',
                DataBase64: createSineWavBase64(3),
            },
        ],
        DataSnapshot: { Headline: 'Golden Render Test' },
        Seed: 2026,
    };
}

describe.skipIf(process.env.VIDEO_STUDIO_RENDER_TESTS !== '1')(
    'HyperFramesRenderBackend opt-in integration suite',
    () => {
        const backend = new HyperFramesRenderBackend();

        afterAll(async () => {
            await backend.Shutdown();
        });

        it('Health reports healthy with Node, HyperFrames, Chromium and ffmpeg versions', async () => {
            const health = await GetWorkerHealth(backend);
            expect(health.Healthy).toBe(true);
            expect(health.NodeVersion).toMatch(/^v?\d+\./);
            expect(health.HyperFramesVersion).toBe('0.8.134');
            expect(health.ChromiumVersion.length).toBeGreaterThan(0);
            expect(health.FfmpegVersion.length).toBeGreaterThan(0);
        }, 30_000);

        it(
            'renders the 3s 1280x720 30fps golden composition (Roboto, PNG, tone, MJVideo.Data + Noise) and captures stills + contact sheets',
            async () => {
                const bundle = await buildGoldenBundle();

                const progressEvents: number[] = [];
                const renderResult = await RunRenderJob(
                    {
                        Bundle: bundle,
                        Width: 1280,
                        Height: 720,
                        Fps: 30,
                        DurationSeconds: 3,
                        Quality: 'draft',
                    },
                    backend,
                    (p) => progressEvents.push(p.Percent),
                );

                // MP4 starts with ftyp box at offset 4..8
                const mp4Buf = Buffer.from(renderResult.Video);
                expect(mp4Buf.subarray(4, 8).toString('ascii')).toBe('ftyp');
                expect(Math.abs(renderResult.DurationSeconds - 3.0)).toBeLessThanOrEqual(1 / 30 + 0.05);
                expect(renderResult.Width).toBe(1280);
                expect(renderResult.Height).toBe(720);
                expect(renderResult.FrameCount).toBe(90);
                expect(renderResult.HasAudio).toBe(true);
                expect(renderResult.RendererVersion).toBe('0.8.134');
                expect(progressEvents.length).toBeGreaterThan(0);

                // Stills at [2, 1, 2, 0, 2.95]: keys and order kept; stills 0 and 2 byte-identical
                const stillsResult = await RunStillsJob(
                    {
                        Bundle: bundle,
                        Width: 1280,
                        Height: 720,
                        Fps: 30,
                        Points: [
                            { Key: 's0', TimestampSeconds: 2, Role: 'BeatMidpoint', Label: 'Two A' },
                            { Key: 's1', TimestampSeconds: 1, Role: 'TransitionStart', Label: 'One' },
                            { Key: 's2', TimestampSeconds: 2, Role: 'TransitionEnd', Label: 'Two B' },
                            { Key: 's3', TimestampSeconds: 0, Role: 'BeatStart', Label: 'Zero' },
                            { Key: 's4', TimestampSeconds: 2.95, Role: 'FinalHold', Label: 'End' },
                        ],
                    },
                    backend,
                );
                expect(stillsResult.Stills.map((s) => s.Key)).toEqual(['s0', 's1', 's2', 's3', 's4']);
                expect(stillsResult.Stills.map((s) => s.TimestampSeconds)).toEqual([2, 1, 2, 0, 2.95]);
                const still0Bytes = Buffer.from(stillsResult.Stills[0]!.ImageBase64, 'base64');
                const still2Bytes = Buffer.from(stillsResult.Stills[2]!.ImageBase64, 'base64');
                const still3Bytes = Buffer.from(stillsResult.Stills[3]!.ImageBase64, 'base64');
                expect(still0Bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
                expect(still0Bytes.equals(still2Bytes)).toBe(true);
                expect(still0Bytes.equals(still3Bytes)).toBe(false);

                // Extract two frames from the rendered MP4 (t=0.1 and t=2.5) and assert they differ (MJVideo.OnFrame animated the video)
                const frameTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-vs-mp4-frames-'));
                try {
                    const mp4Path = path.join(frameTempDir, 'out.mp4');
                    const frameEarlyPath = path.join(frameTempDir, 'early.png');
                    const frameLatePath = path.join(frameTempDir, 'late.png');
                    await fs.writeFile(mp4Path, mp4Buf);
                    await execFileAsync('ffmpeg', ['-y', '-ss', '0.1', '-i', mp4Path, '-frames:v', '1', frameEarlyPath]);
                    await execFileAsync('ffmpeg', ['-y', '-ss', '2.5', '-i', mp4Path, '-frames:v', '1', frameLatePath]);
                    const [earlyBytes, lateBytes] = await Promise.all([
                        fs.readFile(frameEarlyPath),
                        fs.readFile(frameLatePath),
                    ]);
                    expect(earlyBytes.equals(lateBytes)).toBe(false);
                } finally {
                    await fs.rm(frameTempDir, { recursive: true, force: true }).catch(() => undefined);
                }

                // Contact sheet of 6 stills: one Grid PNG with all keys; a transition strip when asked
                const sixStills: CapturedStill[] = [
                    ...stillsResult.Stills,
                    {
                        ...stillsResult.Stills[3]!,
                        Key: 's5',
                        Label: 'Extra <Still>',
                    },
                ];
                const sheetResult = await RunContactSheetJob(
                    {
                        Format: '16:9',
                        Stills: sixStills,
                        IncludeTransitionStrip: true,
                    },
                    backend,
                );
                expect(sheetResult.Sheets).toHaveLength(2);
                const gridSheet = sheetResult.Sheets[0]!;
                const stripSheet = sheetResult.Sheets[1]!;
                expect(gridSheet.Kind).toBe('Grid');
                expect(gridSheet.StillKeys).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
                expect(
                    Buffer.from(gridSheet.ImageBase64, 'base64')
                        .subarray(0, 4)
                        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
                ).toBe(true);
                expect(stripSheet.Kind).toBe('TransitionStrip');
                expect(stripSheet.StillKeys).toEqual(['s1', 's2']);
                expect(
                    Buffer.from(stripSheet.ImageBase64, 'base64')
                        .subarray(0, 4)
                        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
                ).toBe(true);
            },
            180_000,
        );

        function installLoopbackOnlySocketGuard(): {
            NonLoopbackTargets: string[];
            Restore: () => void;
        } {
            const nonLoopbackTargets: string[] = [];
            const origConnect = net.Socket.prototype.connect;
            const connectSpy = vi
                .spyOn(net.Socket.prototype, 'connect')
                .mockImplementation(function (this: net.Socket, ...args: unknown[]) {
                    const rawFirst = Array.isArray(args[0]) ? (args[0] as unknown[])[0] : args[0];
                    let host: string | undefined;
                    if (typeof rawFirst === 'object' && rawFirst !== null) {
                        if ('host' in rawFirst && typeof (rawFirst as { host?: unknown }).host === 'string') {
                            host = (rawFirst as { host: string }).host;
                        } else if (
                            'hostname' in rawFirst &&
                            typeof (rawFirst as { hostname?: unknown }).hostname === 'string'
                        ) {
                            host = (rawFirst as { hostname: string }).hostname;
                        }
                    } else if (typeof rawFirst === 'number' && typeof args[1] === 'string') {
                        host = args[1];
                    }
                    if (
                        host &&
                        host !== '127.0.0.1' &&
                        host !== 'localhost' &&
                        host !== '::1' &&
                        !host.startsWith('127.')
                    ) {
                        nonLoopbackTargets.push(host);
                        this.destroy(new Error(`Blocked non-loopback socket connect to ${host}`));
                        return this;
                    }
                    return (origConnect as (...a: unknown[]) => net.Socket).apply(this, args);
                });
            return {
                NonLoopbackTargets: nonLoopbackTargets,
                Restore: () => connectSpy.mockRestore(),
            };
        }

        it(
            'makes zero non-loopback socket connections during RunRenderJob, RunStillsJob, and RunContactSheetJob on an MJ Sans + MJVideo.OnFrame-only composition with deterministic MJVideo.Random()',
            async () => {
                const guard = installLoopbackOnlySocketGuard();

                // Pure MJVideo.OnFrame-only fixture (no authored __hf or __timelines) using bundled 'MJ Sans' and MJVideo.Random()
                const onFrameOnlyHtml = [
                    '<!doctype html>',
                    '<html><head><meta charset="utf-8" />',
                    '<style>',
                    "  body { margin: 0; width: 320px; height: 180px; font-family: 'MJ Sans'; }",
                    '  #stage { width: 320px; height: 180px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #ffffff; }',
                    '</style>',
                    '</head><body>',
                    '<div id="root" data-composition-id="onframe-only" data-duration="2.5" data-fps="15" data-width="320" data-height="180">',
                    '  <div id="stage">Init</div>',
                    '</div>',
                    '<script>',
                    '  window.MJVideo.OnFrame(function(frame, time) {',
                    '    var r = Math.floor(window.MJVideo.Random() * 200) + 20;',
                    '    var g = Math.floor(window.MJVideo.Random() * 200) + 20;',
                    '    var b = Math.floor(window.MJVideo.Random() * 200) + 20;',
                    '    var el = document.getElementById("stage");',
                    '    if (el) {',
                    '      el.style.backgroundColor = "rgb(" + r + "," + g + "," + b + ")";',
                    '      el.textContent = "F" + frame + ":" + r + "-" + g + "-" + b;',
                    '    }',
                    '  });',
                    '</script>',
                    '</body></html>',
                ].join('\n');

                const bundle: RenderProjectBundle = {
                    Format: '16:9',
                    EntryFile: 'index.html',
                    Files: [{ Path: 'index.html', Content: onFrameOnlyHtml }],
                    Assets: [],
                    DataSnapshot: {},
                    Seed: 777,
                };

                try {
                    const renderRes = await RunRenderJob(
                        {
                            Bundle: bundle,
                            Width: 320,
                            Height: 180,
                            Fps: 15,
                            DurationSeconds: 2.5,
                            Quality: 'draft',
                        },
                        backend,
                    );
                    expect(renderRes.FrameCount).toBe(38);

                    const stillsMulti = await RunStillsJob(
                        {
                            Bundle: bundle,
                            Width: 320,
                            Height: 180,
                            Fps: 15,
                            Points: [
                                { Key: 't0', TimestampSeconds: 0, Role: 'BeatStart', Label: 'Start' },
                                { Key: 't1', TimestampSeconds: 1, Role: 'BeatMidpoint', Label: 'One' },
                                { Key: 't1_5', TimestampSeconds: 1.5, Role: 'BeatMidpoint', Label: 'Mid' },
                                { Key: 't2', TimestampSeconds: 2, Role: 'FinalHold', Label: 'Two' },
                            ],
                        },
                        backend,
                    );
                    const stillsSingleT2 = await RunStillsJob(
                        {
                            Bundle: bundle,
                            Width: 320,
                            Height: 180,
                            Fps: 15,
                            Points: [{ Key: 'only2', TimestampSeconds: 2, Role: 'FinalHold', Label: 'Two' }],
                        },
                        backend,
                    );

                    const bufT0 = Buffer.from(stillsMulti.Stills[0]!.ImageBase64, 'base64');
                    const bufT1_5 = Buffer.from(stillsMulti.Stills[2]!.ImageBase64, 'base64');
                    const bufT2FromMulti = Buffer.from(stillsMulti.Stills[3]!.ImageBase64, 'base64');
                    const bufT2Single = Buffer.from(stillsSingleT2.Stills[0]!.ImageBase64, 'base64');

                    // Stills at t=0 and t=1.5 differ (MJVideo.OnFrame + MJVideo.Random() advanced the visual state)
                    expect(bufT0.equals(bufT1_5)).toBe(false);
                    // Stills at t=2 captured in [2] vs [0, 1, 1.5, 2] are byte-identical (per-frame PRNG reseed)
                    expect(bufT2Single.equals(bufT2FromMulti)).toBe(true);

                    const sheetRes = await RunContactSheetJob(
                        {
                            Format: '16:9',
                            Stills: stillsMulti.Stills,
                        },
                        backend,
                    );
                    expect(sheetRes.Sheets).toHaveLength(1);
                    expect(guard.NonLoopbackTargets).toEqual([]);
                } finally {
                    guard.Restore();
                }
            },
            120_000,
        );

        it(
            'extracts keyframes from an ffmpeg testsrc clip with a cut: <= MaxFrames, sorted, with a SceneChange',
            async () => {
                const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-vs-testsrc-'));
                try {
                    const clipPath = path.join(tempDir, 'cut.mp4');
                    await execFileAsync('ffmpeg', [
                        '-y',
                        '-f',
                        'lavfi',
                        '-i',
                        'testsrc=size=320x180:rate=15:duration=1',
                        '-f',
                        'lavfi',
                        '-i',
                        'color=c=white:s=320x180:r=15:d=1',
                        '-filter_complex',
                        '[0:v][1:v]concat=n=2:v=1:a=0[outv]',
                        '-map',
                        '[outv]',
                        '-c:v',
                        'libx264',
                        '-pix_fmt',
                        'yuv420p',
                        clipPath,
                    ]);
                    const clipBytes = await fs.readFile(clipPath);
                    const result = await RunKeyframesJob(
                        {
                            VideoBase64: clipBytes.toString('base64'),
                            MimeType: 'video/mp4',
                            MaxFrames: 6,
                        },
                        backend,
                    );
                    expect(result.Frames.length).toBeLessThanOrEqual(6);
                    expect(result.Frames.length).toBeGreaterThanOrEqual(2);
                    for (let i = 1; i < result.Frames.length; i++) {
                        expect(result.Frames[i]!.TimestampSeconds).toBeGreaterThanOrEqual(
                            result.Frames[i - 1]!.TimestampSeconds,
                        );
                    }
                    expect(result.Frames.some((f) => f.Reason === 'SceneChange')).toBe(true);
                } finally {
                    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
                }
            },
            60_000,
        );

        it(
            'CSP forced: lint gate bypassed through RunRenderJob seam (no request interception) makes zero loopback requests, while negative control without CSP <meta> hits loopback server',
            async () => {
                const guard = installLoopbackOnlySocketGuard();
                const hits: string[] = [];
                const loopbackServer = http.createServer((req, res) => {
                    hits.push(req.url ?? '/');
                    res.writeHead(200);
                    res.end('ok');
                });
                await new Promise<void>((resolve) => loopbackServer.listen(0, '127.0.0.1', resolve));
                const addr = loopbackServer.address();
                const port = typeof addr === 'object' && addr ? addr.port : 0;

                const html = [
                    '<!doctype html>',
                    '<html><head><meta charset="utf-8" />',
                    `<style>body { width: 320px; height: 180px; background-image: url("http://127.0.0.1:${port}/css-bg.png"); }</style>`,
                    '</head><body>',
                    '<div id="root" data-composition-id="csp-comp" data-duration="0.4" data-fps="10" data-width="320" data-height="180" data-no-timeline>CSP</div>',
                    '<script>',
                    '(function() {',
                    '  window.__hf = { duration: 0.4, seek: function() {} };',
                    `  try { fetch("http://127.0.0.1:${port}/fetch").catch(function(){}); } catch (e) {}`,
                    `  try { var img = new Image(); img.src = "http://127.0.0.1:${port}/img.png"; document.body.appendChild(img); } catch (e) {}`,
                    `  try { new WebSocket("ws://127.0.0.1:${port}/ws"); } catch (e) {}`,
                    '})();',
                    '</script></body></html>',
                ].join('\n');

                const bundle: RenderProjectBundle = {
                    Format: '16:9',
                    EntryFile: 'index.html',
                    Files: [{ Path: 'index.html', Content: html }],
                    Assets: [],
                    DataSnapshot: {},
                    Seed: 1,
                };

                try {
                    // 1. RunRenderJob with SkipLintGate: true injects the CSP <meta> tag and runs @hyperframes/producer
                    //    (which has NO Puppeteer request interception). The CSP <meta> tag alone blocks all requests.
                    const renderRes = await RunRenderJob(
                        {
                            Bundle: bundle,
                            Width: 320,
                            Height: 180,
                            Fps: 10,
                            DurationSeconds: 0.4,
                            Quality: 'draft',
                        },
                        backend,
                        undefined,
                        undefined,
                        { SkipLintGate: true },
                    );
                    expect(renderRes.FrameCount).toBe(4);
                    expect(hits).toEqual([]);

                    // 2. Negative control: stage the same HTML with InjectPreamble: false (no CSP <meta>) and render via backend.Render
                    const unstagedPreamble = await StageRenderBundle(bundle, {
                        InjectPreamble: false,
                        Geometry: { Width: 320, Height: 180, Fps: 10, DurationSeconds: 0.4 },
                    });
                    try {
                        await backend.Render({
                            RootDir: unstagedPreamble.RootDir,
                            EntryFile: 'index.html',
                            Width: 320,
                            Height: 180,
                            Fps: 10,
                            DurationSeconds: 0.4,
                            Quality: 'draft',
                        });
                        expect(hits.length).toBeGreaterThan(0);
                    } finally {
                        await unstagedPreamble.Cleanup();
                    }
                    expect(guard.NonLoopbackTargets).toEqual([]);
                } finally {
                    guard.Restore();
                    await new Promise<void>((resolve) => loopbackServer.close(() => resolve()));
                }
            },
            90_000,
        );
    },
);
