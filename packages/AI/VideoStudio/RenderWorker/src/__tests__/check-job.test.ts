import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    BuildDataCheckInputs,
    BuildRenderDataSnapshot,
    type RenderProjectBundle,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    FakeRenderBackend,
    MJ_ASOF_CARD_MISSING_CODE,
    MJ_BOUND_KEY_UNKNOWN_CODE,
    MJ_BOUND_VALUE_MISMATCH_CODE,
    MJ_CHECK_CLI_FAILED_CODE,
    MJ_MEASURE_TEXT_FAILED_CODE,
    MJ_MIN_TEXT_SIZE_CODE,
    MJ_MISSING_ASSET_CODE,
    MJ_NETWORK_API_CODE,
    MJ_NON_BUNDLE_URL_CODE,
    MJ_SAFE_AREA_CODE,
    MJ_UNBUNDLED_FONT_CODE,
    RunCheckJob,
} from '../index.js';

function makeCleanBundle(overrides: Partial<RenderProjectBundle> = {}): RenderProjectBundle {
    return {
        Format: '16:9',
        EntryFile: 'index.html',
        Files: [
            {
                Path: 'index.html',
                Content:
                    '<!doctype html><html><body><div id="root"><h1 id="title">Quarterly Review</h1></div></body></html>',
            },
        ],
        Assets: [],
        DataSnapshot: {},
        Seed: 42,
        ...overrides,
    };
}

describe('RunCheckJob', () => {
    it('merges, deduplicates on Code + Selector + File + Line keeping earliest TimestampSeconds, and sorts deterministically', async () => {
        const backend = new FakeRenderBackend({
            CheckCliIssues: [
                {
                    Code: 'contrast_aa_failure',
                    Category: 'Contrast',
                    Severity: 'Error',
                    Message: 'Contrast failure at t=1.5',
                    Selector: '#title',
                    File: 'index.html',
                    TimestampSeconds: 1.5,
                },
                {
                    Code: 'contrast_aa_failure',
                    Category: 'Contrast',
                    Severity: 'Error',
                    Message: 'Contrast failure at t=0.25',
                    Selector: '#title',
                    File: 'index.html',
                    TimestampSeconds: 0.25,
                },
            ],
            MeasuredTexts: [
                [
                    {
                        Text: 'Quarterly Review',
                        Left: 10,
                        Top: 200,
                        Width: 300,
                        Height: 50,
                        FontSizePx: 20,
                        FontFamily: 'Inter',
                        FontIsBundled: true,
                        IsBound: false,
                        Selector: '#title',
                        TimestampSeconds: 1.0,
                    },
                ],
                [
                    {
                        Text: 'Quarterly Review',
                        Left: 10,
                        Top: 200,
                        Width: 300,
                        Height: 50,
                        FontSizePx: 20,
                        FontFamily: 'Inter',
                        FontIsBundled: true,
                        IsBound: false,
                        Selector: '#title',
                        TimestampSeconds: 0.2,
                    },
                ],
            ],
        });

        const bundleWithMissingAsset = makeCleanBundle({
            Files: [
                {
                    Path: 'index.html',
                    Content:
                        '<!doctype html><html><body><img src="assets/missing.png" /><h1 id="title">Quarterly Review</h1></body></html>',
                },
            ],
        });

        const result = await RunCheckJob(
            {
                Bundle: bundleWithMissingAsset,
                Width: 1920,
                Height: 1080,
                SampleTimestampsSeconds: [1.0, 0.2],
            },
            backend,
        );

        expect(result.Passed).toBe(false);
        expect(result.BlockRender).toBe(true);
        expect(backend.RunCheckCliCallCount).toBe(1);
        expect(backend.MeasureTextCallCount).toBe(1);
        expect(backend.LastMeasuredTimestamps).toEqual([1.0, 0.2]);

        // Sorted by Category: Contrast, MinTextSize, MissingAsset, SafeArea
        expect(result.Issues.map((i) => ({ Code: i.Code, Category: i.Category, TimestampSeconds: i.TimestampSeconds }))).toEqual([
            { Code: 'contrast_aa_failure', Category: 'Contrast', TimestampSeconds: 0.25 },
            { Code: MJ_MIN_TEXT_SIZE_CODE, Category: 'MinTextSize', TimestampSeconds: 0.2 },
            { Code: MJ_MISSING_ASSET_CODE, Category: 'MissingAsset', TimestampSeconds: undefined },
            { Code: MJ_SAFE_AREA_CODE, Category: 'SafeArea', TimestampSeconds: 0.2 },
        ]);
    });

    it('sets Passed=true and BlockRender=false when only Warnings are present, and blocks render when MJ_UNBUNDLED_FONT (Error) is emitted', async () => {
        const warningOnlyBackend = new FakeRenderBackend({
            CheckCliIssues: [
                {
                    Code: 'minor_layout_notice',
                    Category: 'Layout',
                    Severity: 'Warning',
                    Message: 'Non-blocking layout warning',
                    Selector: '#title',
                },
            ],
        });

        const warningResult = await RunCheckJob(
            {
                Bundle: makeCleanBundle(),
                Width: 1920,
                Height: 1080,
            },
            warningOnlyBackend,
        );

        expect(warningResult.Passed).toBe(true);
        expect(warningResult.BlockRender).toBe(false);
        expect(warningResult.Issues).toEqual([
            expect.objectContaining({
                Code: 'minor_layout_notice',
                Category: 'Layout',
                Severity: 'Warning',
            }),
        ]);

        const unbundledFontBackend = new FakeRenderBackend({
            MeasuredTexts: [
                [
                    {
                        Text: 'Quarterly Review',
                        Left: 200,
                        Top: 200,
                        Width: 400,
                        Height: 60,
                        FontSizePx: 36,
                        FontFamily: 'Arial',
                        FontIsBundled: false,
                        IsBound: false,
                        Selector: '#title',
                        TimestampSeconds: 0,
                    },
                ],
            ],
        });

        const unbundledResult = await RunCheckJob(
            {
                Bundle: makeCleanBundle(),
                Width: 1920,
                Height: 1080,
            },
            unbundledFontBackend,
        );

        expect(unbundledResult.Passed).toBe(false);
        expect(unbundledResult.BlockRender).toBe(true);
        expect(unbundledResult.Issues).toEqual([
            expect.objectContaining({
                Code: MJ_UNBUNDLED_FONT_CODE,
                Category: 'Lint',
                Severity: 'Error',
            }),
        ]);
    });

    it('returns lint issues immediately and calls neither RunCheckCli nor MeasureText when lint-blocked (including Asset script, Asset module import, and missing gsap/dist path)', async () => {
        const backend = new FakeRenderBackend({
            CheckCliIssues: [
                {
                    Code: 'text_box_overflow',
                    Category: 'Layout',
                    Severity: 'Error',
                    Message: 'Should not run',
                },
            ],
        });

        const lintBlockedBundle = makeCleanBundle({
            Files: [
                {
                    Path: 'index.html',
                    Content:
                        '<!doctype html><html><body><script>fetch("https://evil.example.com");</script></body></html>',
                },
            ],
        });

        const result = await RunCheckJob(
            {
                Bundle: lintBlockedBundle,
                Width: 1920,
                Height: 1080,
            },
            backend,
        );

        expect(result.Passed).toBe(false);
        expect(result.BlockRender).toBe(true);
        expect(result.Issues.some((i) => i.Code === MJ_NETWORK_API_CODE)).toBe(true);
        expect(backend.RunCheckCliCallCount).toBe(0);
        expect(backend.MeasureTextCallCount).toBe(0);

        const assetJsBase64 = Buffer.from('fetch("https://evil.example.com");', 'utf8').toString('base64');
        const scriptProbes: RenderProjectBundle[] = [
            makeCleanBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content:
                            '<!doctype html><html><body><div id="root" data-composition-id="c" data-duration="2"><script src="assets/evil.js"></script></div></body></html>',
                    },
                ],
                Assets: [{ Key: 'evil', RelativePath: 'assets/evil.js', MimeType: 'text/javascript', DataBase64: assetJsBase64 }],
            }),
            makeCleanBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content:
                            '<!doctype html><html><body><div id="root" data-composition-id="c" data-duration="2"><script type="module" src="app.js"></script></div></body></html>',
                    },
                    { Path: 'app.js', Content: 'import "./assets/evil.js";\n' },
                ],
                Assets: [{ Key: 'evil', RelativePath: 'assets/evil.js', MimeType: 'text/javascript', DataBase64: assetJsBase64 }],
            }),
            makeCleanBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content:
                            '<!doctype html><html><body><div id="root" data-composition-id="c" data-duration="2"><script src="vendor/gsap/dist/gsap.min.js"></script></div></body></html>',
                    },
                ],
            }),
        ];

        for (const probeBundle of scriptProbes) {
            const probeRes = await RunCheckJob(
                {
                    Bundle: probeBundle,
                    Width: 1920,
                    Height: 1080,
                },
                backend,
            );
            expect(probeRes.Passed).toBe(false);
            expect(probeRes.BlockRender).toBe(true);
            expect(probeRes.Issues.some((i) => i.Code === MJ_NON_BUNDLE_URL_CODE)).toBe(true);
            expect(backend.RunCheckCliCallCount).toBe(0);
            expect(backend.MeasureTextCallCount).toBe(0);
        }
    });

    it('turns a throwing MeasureText or RunCheckCli into Warning issues instead of crashing the job', async () => {
        const backend = new FakeRenderBackend({
            ThrowOnCheckCli: new Error('Simulated CLI crash'),
            ThrowOnMeasureText: new Error('Simulated page evaluate timeout'),
        });

        const result = await RunCheckJob(
            {
                Bundle: makeCleanBundle(),
                Width: 1920,
                Height: 1080,
            },
            backend,
        );

        expect(result.Passed).toBe(true);
        expect(result.BlockRender).toBe(false);
        expect(result.Issues.map((i) => i.Code)).toEqual([
            MJ_CHECK_CLI_FAILED_CODE,
            MJ_MEASURE_TEXT_FAILED_CODE,
        ]);
        expect(result.Issues.every((i) => i.Severity === 'Warning')).toBe(true);
    });

    it('rejects invalid SampleTimestampsSeconds, SettleTimestampsSeconds, AllowedDataLiterals, BoundDataLiterals, and RequiredFinalFrameText with InvalidRequest before staging', async () => {
        const backend = new FakeRenderBackend();
        const bundle = makeCleanBundle();

        const badInputs: Array<Parameters<typeof RunCheckJob>[0]> = [
            { Bundle: bundle, Width: 1920, Height: 1080, SampleTimestampsSeconds: [-1] },
            {
                Bundle: bundle,
                Width: 1920,
                Height: 1080,
                SampleTimestampsSeconds: ['1' as unknown as number],
            },
            {
                Bundle: bundle,
                Width: 1920,
                Height: 1080,
                SampleTimestampsSeconds: new Array<number>(49).fill(0),
            },
            {
                Bundle: bundle,
                Width: 1920,
                Height: 1080,
                SettleTimestampsSeconds: [-0.5],
            },
            {
                Bundle: bundle,
                Width: 1920,
                Height: 1080,
                AllowedDataLiterals: '$1M' as unknown as string[],
            },
            {
                Bundle: bundle,
                Width: 1920,
                Height: 1080,
                BoundDataLiterals: ['bad'] as unknown as Record<string, string[]>,
            },
            {
                Bundle: bundle,
                Width: 1920,
                Height: 1080,
                BoundDataLiterals: { TotalARR: [123 as unknown as string] },
            },
            {
                Bundle: bundle,
                Width: 1920,
                Height: 1080,
                RequiredFinalFrameText: [42 as unknown as string],
            },
        ];

        for (const req of badInputs) {
            await expect(RunCheckJob(req, backend)).rejects.toMatchObject({
                Code: 'InvalidRequest',
            });
        }
        expect(backend.LintCallCount).toBe(0);
        expect(backend.RunCheckCliCallCount).toBe(0);
        expect(backend.MeasureTextCallCount).toBe(0);
    });

    it('unions SampleTimestampsSeconds, SettleTimestampsSeconds, and final-frame timestamp, and evaluates BoundDataLiterals + RequiredFinalFrameText via BuildDataCheckInputs', async () => {
        const spec: Pick<
            VideoGenerationSpec,
            'DataBindings' | 'DataSnapshot' | 'Beats' | 'Render'
        > = {
            Render: {
                Renderer: 'HyperFrames',
                RendererVersion: '0.16.21',
                Fps: 30,
                Seed: 42,
                Quality: 'standard',
            },
            DataBindings: [
                {
                    Key: 'TotalARR',
                    Source: { Kind: 'Inline' },
                    Shape: 'Scalar',
                    Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
                },
            ],
            DataSnapshot: {
                AsOf: '2026-10-16T00:00:00.000Z',
                Sources: ['Inline:TotalARR'],
                Inline: { TotalARR: 14_200_000 },
            },
            Beats: [
                {
                    Key: 'b1',
                    Label: 'Reveal',
                    StartSeconds: 0,
                    EndSeconds: 2,
                    EntryState: 'Blank',
                    ExitState: 'Settled KPI + AsOf footer',
                    Purpose: 'Count up ARR to $14.2M with Data as of 2026-10-16 footer',
                    OnScreenText: ['Total ARR {TotalARR}'],
                    DataRefs: ['TotalARR'],
                    AssetRefs: [],
                    LayoutNotes: { '16:9': 'Centered KPI' },
                },
            ],
        };
        const values = { TotalARR: 14_200_000 };
        const checkInputs = BuildDataCheckInputs(spec, values);
        const dataSnapshot = BuildRenderDataSnapshot(values, '2026-10-16T00:00:00.000Z');

        const bundleWithDuration = makeCleanBundle({
            Files: [
                {
                    Path: 'index.html',
                    Content:
                        '<!doctype html><html><body><div id="root" data-composition-id="kpi" data-duration="3" data-fps="30">' +
                        '<div id="kpi" data-mj-bound="TotalARR"></div><footer id="asof"></footer>' +
                        '</div></body></html>',
                },
            ],
            DataSnapshot: dataSnapshot,
        });

        // Settle timestamp for beat ending at 2s @ 30fps is 2 - 1/30, while final frame for 3s @ 30fps is 2.966667
        const settleTs = checkInputs.SettleTimestampsSeconds[0]!;
        const finalFrameTs = 2.966667;
        const passingBackend = new FakeRenderBackend({
            MeasuredTexts: [
                // Mid-beat t = 1.0s (count-up intermediate value $7.1M is NOT flagged because 1.0 != settleTs)
                [
                    {
                        Text: '$7.1M',
                        Left: 200,
                        Top: 200,
                        Width: 300,
                        Height: 60,
                        FontSizePx: 48,
                        FontFamily: 'Inter',
                        FontIsBundled: true,
                        IsBound: true,
                        BoundKey: 'TotalARR',
                        Selector: '#kpi',
                        TimestampSeconds: 1.0,
                    },
                ],
                // Settle frame t = 2 - 1/30
                [
                    {
                        Text: '$14.2M',
                        Left: 200,
                        Top: 200,
                        Width: 300,
                        Height: 60,
                        FontSizePx: 48,
                        FontFamily: 'Inter',
                        FontIsBundled: true,
                        IsBound: true,
                        BoundKey: 'TotalARR',
                        Selector: '#kpi',
                        TimestampSeconds: settleTs,
                    },
                ],
                // Final frame t = 2.966667s
                [
                    {
                        Text: '$14.2M',
                        Left: 200,
                        Top: 200,
                        Width: 300,
                        Height: 60,
                        FontSizePx: 48,
                        FontFamily: 'Inter',
                        FontIsBundled: true,
                        IsBound: true,
                        BoundKey: 'TotalARR',
                        Selector: '#kpi',
                        TimestampSeconds: finalFrameTs,
                    },
                    {
                        Text: 'Data as of 2026-10-16',
                        Left: 200,
                        Top: 900,
                        Width: 400,
                        Height: 40,
                        FontSizePx: 28,
                        FontFamily: 'Inter',
                        FontIsBundled: true,
                        IsBound: false,
                        Selector: '#asof',
                        TimestampSeconds: finalFrameTs,
                    },
                ],
            ],
        });

        const passResult = await RunCheckJob(
            {
                Bundle: bundleWithDuration,
                Width: 1920,
                Height: 1080,
                SampleTimestampsSeconds: [1.0],
                AllowedDataLiterals: checkInputs.AllowedDataLiterals,
                BoundDataLiterals: checkInputs.BoundDataLiterals,
                SettleTimestampsSeconds: checkInputs.SettleTimestampsSeconds,
                RequiredFinalFrameText: checkInputs.RequiredFinalFrameText,
            },
            passingBackend,
        );

        expect(passingBackend.LastMeasuredTimestamps).toEqual([1.0, 2 - 1 / 30, 2.966667]);
        expect(passResult.Passed).toBe(true);
        expect(passResult.Issues).toEqual([]);

        // Failing run: unknown key, wrong settled value, and missing as-of card on final frame
        const failingBackend = new FakeRenderBackend({
            MeasuredTexts: [
                [
                    {
                        Text: '$7.1M',
                        Left: 200,
                        Top: 200,
                        Width: 300,
                        Height: 60,
                        FontSizePx: 48,
                        FontFamily: 'Inter',
                        FontIsBundled: true,
                        IsBound: true,
                        BoundKey: 'UnknownKey',
                        Selector: '#bad-bound',
                        TimestampSeconds: 1.0,
                    },
                ],
                [
                    {
                        Text: '$99.9M',
                        Left: 200,
                        Top: 200,
                        Width: 300,
                        Height: 60,
                        FontSizePx: 48,
                        FontFamily: 'Inter',
                        FontIsBundled: true,
                        IsBound: true,
                        BoundKey: 'TotalARR',
                        Selector: '#kpi',
                        TimestampSeconds: settleTs,
                    },
                ],
                [],
            ],
        });

        const failResult = await RunCheckJob(
            {
                Bundle: bundleWithDuration,
                Width: 1920,
                Height: 1080,
                SampleTimestampsSeconds: [1.0],
                AllowedDataLiterals: checkInputs.AllowedDataLiterals,
                BoundDataLiterals: checkInputs.BoundDataLiterals,
                SettleTimestampsSeconds: checkInputs.SettleTimestampsSeconds,
                RequiredFinalFrameText: checkInputs.RequiredFinalFrameText,
            },
            failingBackend,
        );

        expect(failResult.Passed).toBe(false);
        expect(failResult.BlockRender).toBe(true);
        expect(failResult.Issues.map((i) => i.Code)).toEqual([
            MJ_BOUND_KEY_UNKNOWN_CODE,
            MJ_BOUND_VALUE_MISMATCH_CODE,
            MJ_ASOF_CARD_MISSING_CODE,
        ]);
    });

    it('parses data-fps from the composition root, passes it to StageRenderBundle and FakeRenderBackend.MeasureText, and range-checks invalid data-fps', async () => {
        let stagedIndexHtml = '';
        class InspectingBackend extends FakeRenderBackend {
            public override async MeasureText(
                ...args: Parameters<FakeRenderBackend['MeasureText']>
            ): Promise<Awaited<ReturnType<FakeRenderBackend['MeasureText']>>> {
                const [job] = args;
                stagedIndexHtml = await fs.readFile(path.join(job.RootDir, job.EntryFile), 'utf8');
                return super.MeasureText(...args);
            }
        }
        const backend = new InspectingBackend();

        const fps24Bundle = makeCleanBundle({
            Files: [
                {
                    Path: 'index.html',
                    Content:
                        '<!doctype html><html><body><div id="root" data-composition-id="film-24" data-fps="24" data-duration="2"><h1 id="title">24fps Film</h1></div></body></html>',
                },
            ],
        });

        await RunCheckJob(
            {
                Bundle: fps24Bundle,
                Width: 1920,
                Height: 1080,
                SampleTimestampsSeconds: [0.55],
            },
            backend,
        );

        expect(backend.LastMeasureTextJob?.Fps).toBe(24);
        expect(backend.LastCheckCliJob?.Fps).toBe(24);
        expect(stagedIndexHtml).toContain('Fps: 24');

        for (const badFps of ['0', '240', 'abc', '']) {
            const badBundle = makeCleanBundle({
                Files: [
                    {
                        Path: 'index.html',
                        Content: `<!doctype html><html><body><div id="root" data-composition-id="bad-fps" data-fps="${badFps}"></div></body></html>`,
                    },
                ],
            });
            await expect(
                RunCheckJob({ Bundle: badBundle, Width: 1920, Height: 1080 }, backend),
            ).rejects.toMatchObject({
                Code: 'InvalidRequest',
            });
        }
    });
});

