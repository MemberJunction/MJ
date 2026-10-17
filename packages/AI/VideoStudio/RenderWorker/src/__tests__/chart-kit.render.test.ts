import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_CHART_KIT_TOKENS,
    WithChartKit,
    type RenderProjectBundle,
} from '@memberjunction/video-studio-core';
import { HyperFramesRenderBackend } from '../hyperframes-backend.js';
import { RunLintGate, RunStillsJob, StageRenderBundle } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_FONT_PATH = path.join(__dirname, 'fixtures', 'golden', 'Roboto-Regular.ttf');
const RUN_RENDER_TESTS = process.env.VIDEO_STUDIO_RENDER_TESTS === '1';

async function buildGalleryBundle(): Promise<RenderProjectBundle> {
    const fontBytes = await fs.readFile(GOLDEN_FONT_PATH);
    const tokensJson = JSON.stringify({
        ...DEFAULT_CHART_KIT_TOKENS,
        FontFamily: 'Roboto, MJ Sans, sans-serif',
    });

    const html = [
        '<!doctype html>',
        '<html>',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <style>',
        '    @font-face {',
        '      font-family: "Roboto";',
        '      src: url("assets/Roboto-Regular.ttf") format("truetype");',
        '      font-weight: 400 700;',
        '      font-style: normal;',
        '    }',
        '    * { box-sizing: border-box; margin: 0; padding: 0; }',
        '    body { width: 1280px; height: 720px; overflow: hidden; background: #0F172A; font-family: "Roboto", sans-serif; }',
        '    #gallery {',
        '      width: 1280px;',
        '      height: 720px;',
        '      display: grid;',
        '      grid-template-columns: repeat(3, 1fr);',
        '      grid-template-rows: repeat(3, 1fr);',
        '      gap: 12px;',
        '      padding: 16px;',
        '    }',
        '    .cell { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }',
        '  </style>',
        '</head>',
        '<body>',
        '  <div id="gallery" data-composition-id="main" data-duration="3.5" data-fps="30" data-width="1280" data-height="720">',
        '    <div id="c-kpi" class="cell"></div>',
        '    <div id="c-delta" class="cell"></div>',
        '    <div id="c-bar" class="cell"></div>',
        '    <div id="c-line" class="cell"></div>',
        '    <div id="c-area" class="cell"></div>',
        '    <div id="c-donut" class="cell"></div>',
        '    <div id="c-ranked" class="cell"></div>',
        '    <div id="c-spark" class="cell"></div>',
        '    <div id="c-table" class="cell"></div>',
        '  </div>',
        '  <script src="mj/chart-kit.js"></script>',
        '  <script>',
        `    const tokens = ${tokensJson};`,
        '    const frame = { Width: 400, Height: 220, StartSeconds: 0.1, DurationSeconds: 1.1, Tokens: tokens };',
        '    const elKpi = document.getElementById("c-kpi");',
        '    const elDelta = document.getElementById("c-delta");',
        '    const elBar = document.getElementById("c-bar");',
        '    const elLine = document.getElementById("c-line");',
        '    const elArea = document.getElementById("c-area");',
        '    const elDonut = document.getElementById("c-donut");',
        '    const elRanked = document.getElementById("c-ranked");',
        '    const elSpark = document.getElementById("c-spark");',
        '    const elTable = document.getElementById("c-table");',
        '    window.MJVideo.OnFrame((TimeSeconds) => {',
        '      const d = window.MJVideo.Data;',
        '      const kit = window.MJChartKit;',
        '      elKpi.innerHTML = kit.KpiTile({ Frame: frame, Value: d.KpiValue, Label: "ARR", BindingKey: "kpi", Format: { Kind: "Currency", Currency: "USD", Decimals: 1 } }, TimeSeconds);',
        '      elDelta.innerHTML = kit.DeltaBadge({ Frame: frame, Delta: d.DeltaValue, BindingKey: "delta", Format: { Kind: "Percent", Decimals: 1 } }, TimeSeconds);',
        '      elBar.innerHTML = kit.Bar({ Frame: frame, Points: d.BarPoints, BindingKey: "bar", Format: { Kind: "Number", Decimals: 0 } }, TimeSeconds);',
        '      elLine.innerHTML = kit.Line({ Frame: frame, Points: d.LinePoints, BindingKey: "line", Format: { Kind: "Number", Decimals: 0 } }, TimeSeconds);',
        '      elArea.innerHTML = kit.Area({ Frame: frame, Points: d.AreaPoints, BindingKey: "area", Format: { Kind: "Percent", Decimals: 1 } }, TimeSeconds);',
        '      elDonut.innerHTML = kit.Donut({ Frame: frame, Points: d.DonutPoints, BindingKey: "donut", Format: { Kind: "Number", Decimals: 0 } }, TimeSeconds);',
        '      elRanked.innerHTML = kit.RankedList({ Frame: frame, Points: d.RankedPoints, MaxItems: 3, BindingKey: "ranked", Format: { Kind: "Currency", Currency: "USD", Decimals: 0 } }, TimeSeconds);',
        '      elSpark.innerHTML = kit.Sparkline({ Frame: frame, Values: d.SparkValues, BindingKey: "spark", Format: { Kind: "Number", Decimals: 0 } }, TimeSeconds);',
        '      elTable.innerHTML = kit.TableReveal({ Frame: frame, Columns: [{ Header: "Plan" }, { Header: "Seats", Format: { Kind: "Number", Decimals: 0 } }], Rows: d.TableRows, BindingKey: "table" }, TimeSeconds);',
        '    });',
        '  </script>',
        '</body>',
        '</html>',
    ].join('\n');

    const baseBundle: RenderProjectBundle = {
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
        ],
        DataSnapshot: {
            KpiValue: 14_200_000,
            DeltaValue: 0.184,
            BarPoints: [
                { Label: 'Q1', Value: 120 },
                { Label: 'Q2', Value: 210 },
                { Label: 'Q3', Value: 340 },
            ],
            LinePoints: [
                { Label: 'M1', Value: 40 },
                { Label: 'M2', Value: 75 },
                { Label: 'M3', Value: 110 },
            ],
            AreaPoints: [
                { Label: 'W1', Value: 0.12 },
                { Label: 'W2', Value: 0.25 },
                { Label: 'W3', Value: 0.38 },
            ],
            DonutPoints: [
                { Label: 'Core', Value: 60 },
                { Label: 'Cloud', Value: 40 },
            ],
            RankedPoints: [
                { Label: 'NA', Value: 5400 },
                { Label: 'EU', Value: 3100 },
                { Label: 'AP', Value: 1900 },
            ],
            SparkValues: [15, 28, 22, 44, 68],
            TableRows: [
                ['Enterprise', 420],
                ['Growth', 185],
            ],
        },
        Seed: 2026,
    };

    return WithChartKit(baseBundle);
}

describe.skipIf(!RUN_RENDER_TESTS)('MJChartKit opt-in gallery render tests (VS-DAT-2)', () => {
    const backend = new HyperFramesRenderBackend();
    const origConnect = net.Socket.prototype.connect;
    let nonLoopbackAttempts: string[] = [];

    beforeEach(() => {
        nonLoopbackAttempts = [];
        net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
            const first = args[0];
            if (first && typeof first === 'object' && !Array.isArray(first)) {
                const opts = first as { host?: string; port?: number; path?: string };
                if (!opts.path) {
                    const host = (opts.host ?? '127.0.0.1').toLowerCase();
                    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
                        nonLoopbackAttempts.push(`${host}:${opts.port ?? ''}`);
                        const err = new Error(`Offline guard blocked connection to ${host}:${opts.port ?? ''}`);
                        queueMicrotask(() => this.destroy(err));
                        return this;
                    }
                }
            }
            return (origConnect as (...a: unknown[]) => net.Socket).apply(this, args);
        } as typeof net.Socket.prototype.connect;
    });

    afterEach(() => {
        net.Socket.prototype.connect = origConnect;
        expect(nonLoopbackAttempts).toEqual([]);
    });

    afterAll(async () => {
        await backend.Shutdown();
    });

    it(
        'renders all 9 primitives from MJVideo.Data and captures deterministic stills at [0, 0.6, 1.2, 3, 0.6]',
        async () => {
            const bundle = await buildGalleryBundle();

            const staged = await StageRenderBundle(bundle);
            try {
                const lintResult = await RunLintGate(bundle, staged.RootDir, backend);
                expect(lintResult.Passed).toBe(true);
                expect(lintResult.Issues).toEqual([]);
            } finally {
                await staged.Cleanup();
            }

            const stillsResult = await RunStillsJob(
                {
                    Bundle: bundle,
                    Width: 1280,
                    Height: 720,
                    Fps: 30,
                    Points: [
                        { Key: 's0', TimestampSeconds: 0, Role: 'TransitionStart', Label: 't=0' },
                        { Key: 's1', TimestampSeconds: 0.6, Role: 'BeatMidpoint', Label: 't=0.6 first' },
                        { Key: 's2', TimestampSeconds: 1.2, Role: 'TransitionEnd', Label: 't=1.2' },
                        { Key: 's3', TimestampSeconds: 3, Role: 'Poster', Label: 't=3' },
                        { Key: 's4', TimestampSeconds: 0.6, Role: 'BeatMidpoint', Label: 't=0.6 repeat' },
                    ],
                },
                backend,
            );

            expect(stillsResult.Stills).toHaveLength(5);
            expect(stillsResult.Stills.map((s) => s.TimestampSeconds)).toEqual([0, 0.6, 1.2, 3, 0.6]);

            const still0 = Buffer.from(stillsResult.Stills[0]!.ImageBase64, 'base64');
            const still1 = Buffer.from(stillsResult.Stills[1]!.ImageBase64, 'base64');
            const still2 = Buffer.from(stillsResult.Stills[2]!.ImageBase64, 'base64');
            const still3 = Buffer.from(stillsResult.Stills[3]!.ImageBase64, 'base64');
            const still4 = Buffer.from(stillsResult.Stills[4]!.ImageBase64, 'base64');

            // Stills 1 and 4 (both at t = 0.6, captured out of order after t = 3) are byte-identical
            expect(Buffer.compare(still1, still4)).toBe(0);

            // Stills 0 (t = 0 before start) and 3 (t = 3 after completion) differ
            expect(Buffer.compare(still0, still3)).not.toBe(0);

            // Midpoint still (t = 0.6) differs from both t = 0 and t = 1.2
            expect(Buffer.compare(still0, still1)).not.toBe(0);
            expect(Buffer.compare(still1, still2)).not.toBe(0);
        },
        60_000,
    );
});
