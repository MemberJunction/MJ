import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RenderProjectBundle } from '@memberjunction/video-studio-core';
import { HyperFramesRenderBackend } from '../hyperframes-backend.js';
import {
    ApplyPreambleToStagedBundle,
    BuildPreambleOptionsFromBundle,
    MJ_MIN_TEXT_SIZE_CODE,
    MJ_SAFE_AREA_CODE,
    MJ_UNBOUND_LITERAL_RENDERED_CODE,
    MJ_UNBUNDLED_FONT_CODE,
    RunCheckJob,
    RunRenderJob,
    StageRenderBundle,
} from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, 'fixtures', 'golden');
const RUN_RENDER_TESTS = process.env.VIDEO_STUDIO_RENDER_TESTS === '1';

const ONE_PIXEL_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function createShortWavBase64(durationSeconds = 3, sampleRate = 8000): string {
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
    return buffer.toString('base64');
}

async function loadGoldenBundle(): Promise<RenderProjectBundle> {
    const html = await fs.readFile(path.join(GOLDEN_DIR, 'index.html'), 'utf8');
    const fontBytes = await fs.readFile(path.join(GOLDEN_DIR, 'Roboto-Regular.ttf'));

    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [{ Path: 'index.html', Content: html }],
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
                DataBase64: ONE_PIXEL_PNG_BASE64,
            },
            {
                Key: 'tone',
                RelativePath: 'assets/tone.wav',
                MimeType: 'audio/wav',
                DataBase64: createShortWavBase64(3),
            },
        ],
        DataSnapshot: { Headline: 'Quarterly Revenue Update' },
        Seed: 12345,
    };
}

describe.skipIf(!RUN_RENDER_TESTS)('VS-RND-5 opt-in real-backend deterministic checks', () => {
    const backend = new HyperFramesRenderBackend();
    const realExecPath = process.execPath;
    const origConnect = net.Socket.prototype.connect;
    let offlineGuardDir = '';
    let cliAttemptsLogPath = '';
    let inProcessNonLoopbackAttempts: string[] = [];

    beforeAll(async () => {
        offlineGuardDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-rnd5-offline-guard-'));
        cliAttemptsLogPath = path.join(offlineGuardDir, 'cli-attempts.log');
        const preloadPath = path.join(offlineGuardDir, 'offline-preload.cjs');
        const wrapperPath = path.join(offlineGuardDir, 'node-offline-wrapper.sh');

        const preloadSource = [
            'const fs = require("node:fs");',
            'const net = require("node:net");',
            `const logPath = ${JSON.stringify(cliAttemptsLogPath)};`,
            'const origConnect = net.Socket.prototype.connect;',
            'net.Socket.prototype.connect = function (...args) {',
            '  const rawOpts = Array.isArray(args[0]) ? args[0][0] : args[0];',
            '  if (rawOpts && typeof rawOpts === "object" && !(typeof rawOpts.path === "string" && rawOpts.path.length > 0)) {',
            '    const host = String(rawOpts.host ?? "127.0.0.1").toLowerCase();',
            '    const port = Number(rawOpts.port ?? 0);',
            '    const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "::ffff:127.0.0.1";',
            '    if (!isLoopback) {',
            '      try { fs.appendFileSync(logPath, `${host}:${port}\\n`, "utf8"); } catch {}',
            '      this.destroy(new Error(`Outbound network connection refused in CLI child (${host}:${port})`));',
            '      return this;',
            '    }',
            '  }',
            '  return origConnect.apply(this, args);',
            '};',
        ].join('\n');

        await fs.writeFile(preloadPath, preloadSource, 'utf8');
        await fs.writeFile(
            wrapperPath,
            `#!/bin/sh\nexec ${JSON.stringify(realExecPath)} --require ${JSON.stringify(preloadPath)} "$@"\n`,
            { mode: 0o755 },
        );
        process.execPath = wrapperPath;
    });

    afterAll(async () => {
        process.execPath = realExecPath;
        await backend.Shutdown();
        if (offlineGuardDir) {
            await fs.rm(offlineGuardDir, { recursive: true, force: true }).catch(() => undefined);
        }
    });

    beforeEach(async () => {
        inProcessNonLoopbackAttempts = [];
        await fs.writeFile(cliAttemptsLogPath, '', 'utf8');
        net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]): net.Socket {
            const rawOpts = Array.isArray(args[0]) ? args[0][0] : args[0];
            if (rawOpts && typeof rawOpts === 'object') {
                const opts = rawOpts as { host?: string; port?: number; path?: unknown };
                const isUnixSocket = typeof opts.path === 'string' && opts.path.length > 0;
                if (!isUnixSocket) {
                    const host = (opts.host ?? '127.0.0.1').toLowerCase();
                    const port = opts.port ?? 0;
                    const isLoopback =
                        host === '127.0.0.1' ||
                        host === 'localhost' ||
                        host === '::1' ||
                        host === '::ffff:127.0.0.1';
                    if (!isLoopback) {
                        inProcessNonLoopbackAttempts.push(`${host}:${port}`);
                        this.destroy(new Error(`Outbound network connection refused in test process (${host}:${port})`));
                        return this;
                    }
                }
            }
            return (origConnect as (...a: unknown[]) => net.Socket).apply(this, args);
        } as typeof net.Socket.prototype.connect;
    });

    afterEach(async () => {
        net.Socket.prototype.connect = origConnect;
        const cliLogRaw = await fs.readFile(cliAttemptsLogPath, 'utf8').catch(() => '');
        const cliAttempts = cliLogRaw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        expect(inProcessNonLoopbackAttempts).toEqual([]);
        expect(cliAttempts).toEqual([]);
    });

    it('measures FontIsBundled=true on the Roboto golden fixture and passes a clean MJ Sans composition through RunCheckJob and RunRenderJob with zero non-loopback in-process Node fetch calls', async () => {
        const goldenBundle = await loadGoldenBundle();

        const staged = await StageRenderBundle(goldenBundle, { InjectPreamble: false });
        try {
            const preambleOptions = BuildPreambleOptionsFromBundle(goldenBundle, {
                Width: 1280,
                Height: 720,
                Fps: 30,
            });
            await ApplyPreambleToStagedBundle(staged.RootDir, goldenBundle, preambleOptions);

            const measured = await backend.MeasureText(
                {
                    RootDir: staged.RootDir,
                    EntryFile: 'index.html',
                    Width: 1280,
                    Height: 720,
                    Fps: 30,
                },
                [0],
            );
            expect(measured.length).toBe(1);
            const firstFrameTexts = measured[0] ?? [];
            expect(firstFrameTexts.length).toBeGreaterThan(0);
            const titleItem = firstFrameTexts.find((t) => t.Selector === '#title');
            expect(titleItem).toBeDefined();
            expect(titleItem?.FontFamily.toLowerCase()).toBe('roboto');
            expect(titleItem?.FontIsBundled).toBe(true);
        } finally {
            await staged.Cleanup();
        }

        const cleanHtml = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body, #root { width: 1280px; height: 720px; background: #0f172a; color: #f8fafc; font-family: "MJ Sans", sans-serif; display: flex; align-items: center; justify-content: center; }',
            '  #card { padding: 32px 48px; border-radius: 16px; background: #1e293b; text-align: center; }',
            '  #headline { font-size: 42px; font-weight: 400; color: #f8fafc; }',
            '  #sub { font-size: 28px; color: #e2e8f0; margin-top: 12px; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="clean-mj-sans" data-duration="2" data-fps="15" data-width="1280" data-height="720">',
            '    <div id="card">',
            '      <h1 id="headline">Quarterly Overview</h1>',
            '      <p id="sub">All systems operational</p>',
            '    </div>',
            '  </div>',
            '  <script>',
            '    (function() {',
            '      var card = document.getElementById("card");',
            '      if (window.MJVideo && typeof window.MJVideo.OnFrame === "function") {',
            '        window.MJVideo.OnFrame(function(t) {',
            '          if (card) card.style.opacity = String(0.85 + 0.15 * Math.min(1, t));',
            '        });',
            '      }',
            '    })();',
            '  </script>',
            '</body>',
            '</html>',
        ].join('\n');

        const cleanBundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [{ Path: 'index.html', Content: cleanHtml }],
            Assets: [],
            DataSnapshot: {},
            Seed: 2026,
        };

        const originalFetch = globalThis.fetch;
        const nonLoopbackCalls: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            const parsed = new URL(urlStr);
            if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost' && parsed.hostname !== '::1') {
                nonLoopbackCalls.push(urlStr);
                throw new Error(`Unexpected outbound fetch to ${urlStr}`);
            }
            return originalFetch(input, init);
        }) as typeof fetch;

        try {
            const checkRes = await RunCheckJob(
                {
                    Bundle: cleanBundle,
                    Width: 1280,
                    Height: 720,
                    SampleTimestampsSeconds: [0, 1],
                },
                backend,
            );
            const errors = checkRes.Issues.filter((i) => i.Severity === 'Error');
            expect(errors).toEqual([]);
            expect(checkRes.Passed).toBe(true);
            expect(checkRes.BlockRender).toBe(false);

            const renderRes = await RunRenderJob(
                {
                    Bundle: cleanBundle,
                    Width: 1280,
                    Height: 720,
                    Fps: 15,
                    DurationSeconds: 2,
                    Quality: 'draft',
                },
                backend,
            );
            expect(Buffer.from(renderRes.Video).subarray(4, 8).toString('ascii')).toBe('ftyp');
            expect(nonLoopbackCalls).toEqual([]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    }, 150_000);

    it('Fix 2: full-width centered heading at 1920x1080 passes MJ_SAFE_AREA via tight text Range rects while 9:16 bottom-band text fails MJ_SAFE_AREA', async () => {
        const centered1080pHtml = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body { width: 1920px; height: 1080px; background: #0f172a; color: #f8fafc; font-family: "MJ Sans", sans-serif; position: relative; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="centered-safe" data-duration="2" data-fps="30" data-width="1920" data-height="1080" data-no-timeline>',
            '    <h1 id="centered-title" style="position:absolute;left:0;right:0;top:400px;text-align:center;font-size:72px">Quarterly Review</h1>',
            '  </div>',
            '</body>',
            '</html>',
        ].join('\n');

        const centeredRes = await RunCheckJob(
            {
                Bundle: {
                    Format: '16:9',
                    EntryFile: 'index.html',
                    Files: [{ Path: 'index.html', Content: centered1080pHtml }],
                    Assets: [],
                    DataSnapshot: {},
                    Seed: 1,
                },
                Width: 1920,
                Height: 1080,
                SampleTimestampsSeconds: [0],
            },
            backend,
        );
        expect(centeredRes.Issues.filter((i) => i.Code === MJ_SAFE_AREA_CODE)).toEqual([]);

        const bottomBand9x16Html = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body { width: 1080px; height: 1920px; background: #0f172a; color: #f8fafc; font-family: "MJ Sans", sans-serif; position: relative; }',
            '  #bottom-band { position: absolute; left: 120px; top: 1700px; font-size: 40px; }',
            '  #tiny-text { position: absolute; left: 120px; top: 300px; font-size: 18px; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="bottom-band-fail" data-duration="2" data-fps="30" data-width="1080" data-height="1920" data-no-timeline>',
            '    <div id="bottom-band">Caption in bottom band</div>',
            '    <div id="tiny-text">Small footnote text</div>',
            '  </div>',
            '</body>',
            '</html>',
        ].join('\n');

        const bottomBandRes = await RunCheckJob(
            {
                Bundle: {
                    Format: '9:16',
                    EntryFile: 'index.html',
                    Files: [{ Path: 'index.html', Content: bottomBand9x16Html }],
                    Assets: [],
                    DataSnapshot: {},
                    Seed: 1,
                },
                Width: 1080,
                Height: 1920,
                SampleTimestampsSeconds: [0],
            },
            backend,
        );
        const failCodes = new Set(bottomBandRes.Issues.map((i) => i.Code));
        expect(failCodes.has(MJ_SAFE_AREA_CODE)).toBe(true);
        expect(failCodes.has(MJ_MIN_TEXT_SIZE_CODE)).toBe(true);
    }, 90_000);

    it('Fix 3: OnFrame-only composition that writes "$9.9M" only when t >= 1 passes at [0], reports MJ_UNBOUND_LITERAL_RENDERED at TimestampSeconds=1.5, and quantizes data-fps="24" at t=0.55 to 542ms with MJVideo.Fps===24', async () => {
        const onFrameHtml = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body, #root { width: 1280px; height: 720px; background: #0f172a; color: #f8fafc; font-family: "MJ Sans", sans-serif; display: flex; align-items: center; justify-content: center; }',
            '  #metric { font-size: 48px; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="onframe-seek" data-duration="3" data-fps="30" data-width="1280" data-height="720">',
            '    <div id="metric">Ready</div>',
            '  </div>',
            '  <script>',
            '    (function() {',
            '      var el = document.getElementById("metric");',
            '      if (window.MJVideo && typeof window.MJVideo.OnFrame === "function") {',
            '        window.MJVideo.OnFrame(function(t) {',
            '          if (!el) return;',
            '          if (t >= 1) {',
            '            el.textContent = "Pipeline reached " + "$" + "9.9M";',
            '          } else {',
            '            el.textContent = "Ready";',
            '          }',
            '        });',
            '      }',
            '    })();',
            '  </script>',
            '</body>',
            '</html>',
        ].join('\n');

        const bundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [{ Path: 'index.html', Content: onFrameHtml }],
            Assets: [],
            DataSnapshot: {},
            Seed: 1,
        };

        const resAtZero = await RunCheckJob(
            {
                Bundle: bundle,
                Width: 1280,
                Height: 720,
                SampleTimestampsSeconds: [0],
                AllowedDataLiterals: [],
            },
            backend,
        );
        expect(resAtZero.Issues.filter((i) => i.Code === MJ_UNBOUND_LITERAL_RENDERED_CODE)).toEqual([]);

        const resAtOnePointFive = await RunCheckJob(
            {
                Bundle: bundle,
                Width: 1280,
                Height: 720,
                SampleTimestampsSeconds: [1.5],
                AllowedDataLiterals: [],
            },
            backend,
        );
        const unboundIssues = resAtOnePointFive.Issues.filter(
            (i) => i.Code === MJ_UNBOUND_LITERAL_RENDERED_CODE,
        );
        expect(unboundIssues).toEqual([
            expect.objectContaining({
                Code: MJ_UNBOUND_LITERAL_RENDERED_CODE,
                Selector: '#metric',
                TimestampSeconds: 1.5,
            }),
        ]);

        const fps24Html = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body, #root { width: 1280px; height: 720px; background: #0f172a; color: #f8fafc; font-family: "MJ Sans", sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }',
            '  #ms-probe, #fps-probe { font-size: 48px; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="fps24-probe" data-duration="2" data-fps="24" data-width="1280" data-height="720">',
            '    <div id="ms-probe">init</div>',
            '    <div id="fps-probe">init</div>',
            '  </div>',
            '  <script>',
            '    (function() {',
            '      var msEl = document.getElementById("ms-probe");',
            '      var fpsEl = document.getElementById("fps-probe");',
            '      if (window.MJVideo && typeof window.MJVideo.OnFrame === "function") {',
            '        window.MJVideo.OnFrame(function(t) {',
            '          if (msEl) msEl.textContent = "ms:" + String(Math.round(t * 1000));',
            '          if (fpsEl) fpsEl.textContent = "fps:" + String(window.MJVideo.Fps);',
            '        });',
            '      }',
            '    })();',
            '  </script>',
            '</body>',
            '</html>',
        ].join('\n');

        const fps24Bundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [{ Path: 'index.html', Content: fps24Html }],
            Assets: [],
            DataSnapshot: {},
            Seed: 1,
        };

        const stagedFps24 = await StageRenderBundle(fps24Bundle, {
            Geometry: { Width: 1280, Height: 720, Fps: 24 },
        });
        try {
            const measured24 = await backend.MeasureText(
                {
                    RootDir: stagedFps24.RootDir,
                    EntryFile: 'index.html',
                    Width: 1280,
                    Height: 720,
                    Fps: 24,
                },
                [0.55],
            );
            const probeItems = measured24[0] ?? [];
            expect(probeItems.find((i) => i.Selector === '#ms-probe')?.Text).toBe('ms:542');
            expect(probeItems.find((i) => i.Selector === '#fps-probe')?.Text).toBe('fps:24');
        } finally {
            await stagedFps24.Cleanup();
        }

        const fps24CheckRes = await RunCheckJob(
            {
                Bundle: fps24Bundle,
                Width: 1280,
                Height: 720,
                SampleTimestampsSeconds: [0.55],
                AllowedDataLiterals: ['542', '24'],
            },
            backend,
        );
        expect(fps24CheckRes.Issues.filter((i) => i.Code === MJ_UNBOUND_LITERAL_RENDERED_CODE)).toEqual([]);
    }, 90_000);

    it('Fix 4: Arial and generic sans-serif headings measure FontIsBundled=true via normalizeSystemFontPrimaryFamilies + injectDeterministicFontFaces while a script-assigned Brand Display family reports MJ_UNBUNDLED_FONT', async () => {
        const fontHtml = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body { width: 1280px; height: 720px; background: #0f172a; color: #f8fafc; position: relative; }',
            '  #arial-heading { position: absolute; left: 160px; top: 160px; font-size: 42px; font-family: Arial, sans-serif; }',
            '  #generic-heading { position: absolute; left: 160px; top: 280px; font-size: 42px; font-family: sans-serif; }',
            '  #brand-heading { position: absolute; left: 160px; top: 400px; font-size: 42px; font-family: "MJ Sans", sans-serif; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="font-parity" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-no-timeline>',
            '    <h2 id="arial-heading">Catalog Arial Heading</h2>',
            '    <h2 id="generic-heading">Generic Sans Heading</h2>',
            '    <h2 id="brand-heading">Runtime Brand Display Heading</h2>',
            '  </div>',
            '  <script>',
            '    (function() {',
            '      var el = document.getElementById("brand-heading");',
            '      if (el) el.style.fontFamily = "Brand Display";',
            '    })();',
            '  </script>',
            '</body>',
            '</html>',
        ].join('\n');

        const bundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [{ Path: 'index.html', Content: fontHtml }],
            Assets: [],
            DataSnapshot: {},
            Seed: 1,
        };

        const staged = await StageRenderBundle(bundle, { InjectPreamble: false });
        try {
            const preambleOptions = BuildPreambleOptionsFromBundle(bundle, {
                Width: 1280,
                Height: 720,
                Fps: 30,
            });
            await ApplyPreambleToStagedBundle(staged.RootDir, bundle, preambleOptions);
            const measured = await backend.MeasureText(
                {
                    RootDir: staged.RootDir,
                    EntryFile: 'index.html',
                    Width: 1280,
                    Height: 720,
                    Fps: 30,
                },
                [0],
            );
            const items = measured[0] ?? [];
            const arialItem = items.find((t) => t.Selector === '#arial-heading');
            const genericItem = items.find((t) => t.Selector === '#generic-heading');
            const brandItem = items.find((t) => t.Selector === '#brand-heading');
            expect(arialItem?.FontIsBundled).toBe(true);
            expect(genericItem?.FontFamily.toLowerCase()).toBe('inter');
            expect(genericItem?.FontIsBundled).toBe(true);
            expect(brandItem?.FontFamily).toBe('Brand Display');
            expect(brandItem?.FontIsBundled).toBe(false);
        } finally {
            await staged.Cleanup();
        }

        const res = await RunCheckJob(
            {
                Bundle: bundle,
                Width: 1280,
                Height: 720,
                SampleTimestampsSeconds: [0],
            },
            backend,
        );
        const unbundledIssues = res.Issues.filter((i) => i.Code === MJ_UNBUNDLED_FONT_CODE);
        expect(unbundledIssues).toEqual([
            expect.objectContaining({
                Code: MJ_UNBUNDLED_FONT_CODE,
                Selector: '#brand-heading',
                Severity: 'Warning',
            }),
        ]);
    }, 90_000);

    it('reports contrast_aa_failure and text_box_overflow through the real HyperFrames check CLI', async () => {
        const html = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body { width: 1280px; height: 720px; background: #1e293b; color: #f8fafc; font-family: "MJ Sans", sans-serif; position: relative; }',
            '  #low-contrast { position: absolute; left: 120px; top: 120px; font-size: 36px; color: #263244; background: #1e293b; }',
            '  #overflow-box { position: absolute; left: 1150px; top: 240px; width: 400px; font-size: 36px; color: #f8fafc; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="cli-failures" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-no-timeline>',
            '    <div id="low-contrast">Low contrast text</div>',
            '    <div id="overflow-box">Overflowing box outside viewport</div>',
            '  </div>',
            '</body>',
            '</html>',
        ].join('\n');

        const bundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [{ Path: 'index.html', Content: html }],
            Assets: [],
            DataSnapshot: {},
            Seed: 1,
        };

        const res = await RunCheckJob(
            {
                Bundle: bundle,
                Width: 1280,
                Height: 720,
                SampleTimestampsSeconds: [0],
            },
            backend,
        );

        expect(res.Passed).toBe(false);
        expect(res.BlockRender).toBe(true);
        const codes = new Set(res.Issues.map((i) => i.Code));
        expect(codes.has('contrast_aa_failure')).toBe(true);
        expect(codes.has('text_box_overflow')).toBe(true);
    }, 90_000);
});
