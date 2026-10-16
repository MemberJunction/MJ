import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import type { CapturedStill, RenderProjectBundle } from '@memberjunction/video-studio-core';
import { StageRenderBundle } from '../bundle.js';
import { HyperFramesRenderBackend } from '../hyperframes-backend.js';
import {
    GetWorkerHealth,
    RunCheckJob,
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

                const check = await RunCheckJob(
                    {
                        Bundle: bundle,
                        Width: 1280,
                        Height: 720,
                        Fps: 30,
                        DurationSeconds: 3,
                    },
                    backend,
                );
                expect(check.Issues).toEqual([]);
                expect(check.BlockRender).toBe(false);

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
                expect(still0Bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
                expect(still0Bytes.equals(still2Bytes)).toBe(true);

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
            'CSP forced: lint gate bypassed through job seam; fetch, Image.src, WebSocket and CSS url() make zero loopback requests',
            async () => {
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
                    '<div id="root" data-composition-id="csp-comp" data-duration="1" data-fps="15" data-width="320" data-height="180" data-no-timeline>CSP</div>',
                    '<script>',
                    '(function() {',
                    `  try { fetch("http://127.0.0.1:${port}/fetch").catch(function(){}); } catch (e) {}`,
                    `  try { var img = new Image(); img.src = "http://127.0.0.1:${port}/img.png"; document.body.appendChild(img); } catch (e) {}`,
                    `  try { new WebSocket("ws://127.0.0.1:${port}/ws"); } catch (e) {}`,
                    '  window.__hf = { duration: 1, seek: function() {} };',
                    '})();',
                    '</script></body></html>',
                ].join('\n');

                const staged = await StageRenderBundle(
                    {
                        Format: '16:9',
                        EntryFile: 'index.html',
                        Files: [{ Path: 'index.html', Content: html }],
                        Assets: [],
                        DataSnapshot: {},
                        Seed: 1,
                    },
                    {
                        Geometry: { Width: 320, Height: 180, Fps: 15, DurationSeconds: 1 },
                    },
                );

                try {
                    const buffers = await backend.CaptureStills({
                        RootDir: staged.RootDir,
                        EntryFile: 'index.html',
                        Width: 320,
                        Height: 180,
                        Fps: 15,
                        TimestampsSeconds: [0, 0.5],
                        ImageFormat: 'png',
                    });
                    expect(buffers).toHaveLength(2);
                    expect(hits).toEqual([]);
                } finally {
                    await staged.Cleanup();
                    await new Promise<void>((resolve) => loopbackServer.close(() => resolve()));
                }
            },
            60_000,
        );
    },
);
