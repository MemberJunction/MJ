import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
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

    afterAll(async () => {
        await backend.Shutdown();
    });

    it('passes the clean Roboto golden fixture with zero Errors and measures FontIsBundled=true', async () => {
        const bundle = await loadGoldenBundle();

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
            expect(titleItem?.IsBound).toBe(true);
        } finally {
            await staged.Cleanup();
        }

        const checkRes = await RunCheckJob(
            {
                Bundle: bundle,
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
    }, 90_000);

    it('reports MJ_SAFE_AREA for text in the 9:16 bottom band, MJ_MIN_TEXT_SIZE for 18px text, MJ_UNBOUND_LITERAL_RENDERED for a JS-written $9.9M, and MJ_UNBUNDLED_FONT for a system-font heading', async () => {
        const html = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body { width: 1080px; height: 1920px; background: #0f172a; color: #f8fafc; font-family: "Inter", sans-serif; position: relative; }',
            '  #bottom-band { position: absolute; left: 120px; top: 1700px; font-size: 40px; }',
            '  #tiny-text { position: absolute; left: 120px; top: 300px; font-size: 18px; }',
            '  #js-literal { position: absolute; left: 120px; top: 450px; font-size: 42px; }',
            '  #sys-heading { position: absolute; left: 120px; top: 600px; font-size: 42px; font-family: Arial, sans-serif; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="dom-failures" data-duration="2" data-fps="30" data-width="1080" data-height="1920" data-no-timeline>',
            '    <div id="bottom-band">Caption in bottom band</div>',
            '    <div id="tiny-text">Small footnote text</div>',
            '    <div id="js-literal">Placeholder</div>',
            '    <h2 id="sys-heading">System font heading</h2>',
            '  </div>',
            '  <script>',
            '    (function() {',
            '      var el = document.getElementById("js-literal");',
            '      if (el) el.textContent = "Pipeline reached " + "$" + "9.9M";',
            '      if (!window.__hf) {',
            '        window.__hf = { duration: 2, seek: function() {} };',
            '      }',
            '    })();',
            '  </script>',
            '</body>',
            '</html>',
        ].join('\n');

        const bundle: RenderProjectBundle = {
            Format: '9:16',
            EntryFile: 'index.html',
            Files: [{ Path: 'index.html', Content: html }],
            Assets: [],
            DataSnapshot: {},
            Seed: 1,
        };

        const res = await RunCheckJob(
            {
                Bundle: bundle,
                Width: 1080,
                Height: 1920,
                SampleTimestampsSeconds: [0],
                AllowedDataLiterals: [],
            },
            backend,
        );

        expect(res.Passed).toBe(false);
        expect(res.BlockRender).toBe(true);

        const codes = new Set(res.Issues.map((i) => i.Code));
        expect(codes.has(MJ_SAFE_AREA_CODE)).toBe(true);
        expect(codes.has(MJ_MIN_TEXT_SIZE_CODE)).toBe(true);
        expect(codes.has(MJ_UNBOUND_LITERAL_RENDERED_CODE)).toBe(true);
        expect(codes.has(MJ_UNBUNDLED_FONT_CODE)).toBe(true);
    }, 90_000);

    it('reports contrast_aa_failure and text_box_overflow through the real HyperFrames check CLI', async () => {
        const html = [
            '<!doctype html>',
            '<html>',
            '<head>',
            '<meta charset="utf-8" />',
            '<style>',
            '  * { box-sizing: border-box; margin: 0; padding: 0; }',
            '  body { width: 1280px; height: 720px; background: #1e293b; color: #f8fafc; font-family: "Inter", sans-serif; position: relative; }',
            '  #low-contrast { position: absolute; left: 120px; top: 120px; font-size: 36px; color: #263244; background: #1e293b; }',
            '  #overflow-box { position: absolute; left: 1150px; top: 240px; width: 400px; font-size: 36px; color: #f8fafc; }',
            '</style>',
            '</head>',
            '<body>',
            '  <div id="root" data-composition-id="cli-failures" data-duration="2" data-fps="30" data-width="1280" data-height="720" data-no-timeline>',
            '    <div id="low-contrast">Low contrast text</div>',
            '    <div id="overflow-box">Overflowing box outside viewport</div>',
            '  </div>',
            '  <script>',
            '    if (!window.__hf) {',
            '      window.__hf = { duration: 2, seek: function() {} };',
            '    }',
            '  </script>',
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
