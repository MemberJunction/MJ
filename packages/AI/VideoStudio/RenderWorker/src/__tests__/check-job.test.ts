import { describe, expect, it } from 'vitest';
import type { RenderProjectBundle } from '@memberjunction/video-studio-core';
import {
    FakeRenderBackend,
    MJ_CHECK_CLI_FAILED_CODE,
    MJ_MEASURE_TEXT_FAILED_CODE,
    MJ_MIN_TEXT_SIZE_CODE,
    MJ_MISSING_ASSET_CODE,
    MJ_NETWORK_API_CODE,
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

    it('sets Passed=true and BlockRender=false when only Warnings are present', async () => {
        const backend = new FakeRenderBackend({
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
        expect(result.Issues).toEqual([
            expect.objectContaining({
                Code: MJ_UNBUNDLED_FONT_CODE,
                Category: 'Lint',
                Severity: 'Warning',
            }),
        ]);
    });

    it('returns lint issues immediately and calls neither RunCheckCli nor MeasureText when lint-blocked', async () => {
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

    it('rejects invalid SampleTimestampsSeconds and AllowedDataLiterals with InvalidRequest before staging', async () => {
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
                AllowedDataLiterals: '$1M' as unknown as string[],
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
});
