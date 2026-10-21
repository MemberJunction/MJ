import { describe, expect, it } from 'vitest';
import { BuildBoundDataLiterals } from '@memberjunction/video-studio-core';
import {
    EvaluateDomRules,
    MIN_TEXT_SIZE_SHORT_EDGE_RATIO,
    MJ_ASOF_CARD_MISSING_CODE,
    MJ_BOUND_KEY_UNKNOWN_CODE,
    MJ_BOUND_VALUE_MISMATCH_CODE,
    MJ_MIN_TEXT_SIZE_CODE,
    MJ_SAFE_AREA_CODE,
    MJ_UNBOUND_LITERAL_RENDERED_CODE,
    MJ_UNBUNDLED_FONT_CODE,
    SAFE_AREA_INSETS,
    type MeasuredText,
} from '../index.js';

function makeMeasuredText(overrides: Partial<MeasuredText> = {}): MeasuredText {
    return {
        Text: 'Quarterly update',
        Left: 200,
        Top: 200,
        Width: 400,
        Height: 60,
        FontSizePx: 36,
        FontFamily: 'Inter',
        FontIsBundled: true,
        IsBound: false,
        Selector: '#headline',
        TimestampSeconds: 0.5,
        ...overrides,
    };
}

describe('EvaluateDomRules', () => {
    it('exports the tunable SAFE_AREA_INSETS and MIN_TEXT_SIZE_SHORT_EDGE_RATIO constants', () => {
        expect(MIN_TEXT_SIZE_SHORT_EDGE_RATIO).toBe(0.025);
        expect(SAFE_AREA_INSETS['16:9']).toEqual({ Top: 0.05, Bottom: 0.05, Left: 0.05, Right: 0.05 });
        expect(SAFE_AREA_INSETS['1:1']).toEqual({ Top: 0.05, Bottom: 0.05, Left: 0.05, Right: 0.05 });
        expect(SAFE_AREA_INSETS['9:16']).toEqual({ Top: 0.1, Bottom: 0.2, Left: 0.06, Right: 0.12 });
    });

    describe('MJ_SAFE_AREA', () => {
        it('enforces 9:16 safe-area edges (a box at 79% height passes, one reaching 85% fails)', () => {
            const width = 1080;
            const height = 1920;

            const passingAt79Percent = makeMeasuredText({
                Selector: '#safe-caption',
                Left: Math.ceil(width * 0.06) + 10,
                Top: Math.round(height * 0.7),
                Width: 500,
                Height: Math.round(height * 0.09), // bottom = 79% of height (<= 80% maxBottom)
            });

            const failingAt85Percent = makeMeasuredText({
                Selector: '#unsafe-caption',
                Left: Math.ceil(width * 0.06) + 10,
                Top: Math.round(height * 0.75),
                Width: 500,
                Height: Math.round(height * 0.1), // bottom = 85% of height (> 80% maxBottom)
            });

            const passIssues = EvaluateDomRules([passingAt79Percent], {
                Format: '9:16',
                Width: width,
                Height: height,
            });
            expect(passIssues.filter((i) => i.Code === MJ_SAFE_AREA_CODE)).toEqual([]);

            const failIssues = EvaluateDomRules([failingAt85Percent], {
                Format: '9:16',
                Width: width,
                Height: height,
            });
            expect(failIssues).toEqual([
                expect.objectContaining({
                    Code: MJ_SAFE_AREA_CODE,
                    Category: 'SafeArea',
                    Severity: 'Error',
                    Selector: '#unsafe-caption',
                    TimestampSeconds: 0.5,
                }),
            ]);
        });

        it('enforces 16:9 and 1:1 5% safe-area insets on all sides', () => {
            const inside16x9 = makeMeasuredText({
                Left: 96,
                Top: 54,
                Width: 1728,
                Height: 972,
            });
            expect(
                EvaluateDomRules([inside16x9], { Format: '16:9', Width: 1920, Height: 1080 }),
            ).toEqual([]);

            const outsideLeft = makeMeasuredText({
                Selector: '#bleed-left',
                Left: 40,
                Top: 100,
                Width: 300,
                Height: 50,
            });
            const issues = EvaluateDomRules([outsideLeft], {
                Format: '1:1',
                Width: 1080,
                Height: 1080,
            });
            expect(issues.map((i) => i.Code)).toEqual([MJ_SAFE_AREA_CODE]);
        });
    });

    describe('MJ_MIN_TEXT_SIZE', () => {
        it('flags 26px and passes 27px at 1920x1080', () => {
            const failing26Px = makeMeasuredText({
                Selector: '#tiny',
                FontSizePx: 26,
            });
            const passing27Px = makeMeasuredText({
                Selector: '#readable',
                FontSizePx: 27,
            });

            const failIssues = EvaluateDomRules([failing26Px], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
            });
            expect(failIssues).toEqual([
                expect.objectContaining({
                    Code: MJ_MIN_TEXT_SIZE_CODE,
                    Category: 'MinTextSize',
                    Severity: 'Error',
                    Selector: '#tiny',
                }),
            ]);

            const passIssues = EvaluateDomRules([passing27Px], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
            });
            expect(passIssues).toEqual([]);
        });
    });

    describe('MJ_UNBOUND_LITERAL_RENDERED', () => {
        it('flags a bound element with no BoundDataLiterals as MJ_BOUND_KEY_UNKNOWN, skips AllowedDataLiterals on a listed bound key, passes allowed literals, and flags every numeric token when AllowedDataLiterals is absent', () => {
            const boundItem = makeMeasuredText({
                Selector: '#chart-tick',
                Text: '$99.4M (42%)',
                IsBound: true,
                BoundKey: 'ChartTick',
            });
            const unboundWithTwoNumbers = makeMeasuredText({
                Selector: '#kpi-line',
                Text: 'ARR hit $14.2M, up 28%YoY in Q3 2026',
                IsBound: false,
            });

            // A bound element with no BoundDataLiterals gets MJ_BOUND_KEY_UNKNOWN; under a listed key it is not checked against AllowedDataLiterals
            expect(
                EvaluateDomRules([boundItem], {
                    Format: '16:9',
                    Width: 1920,
                    Height: 1080,
                }),
            ).toEqual([
                expect.objectContaining({
                    Code: MJ_BOUND_KEY_UNKNOWN_CODE,
                    Category: 'DataLiteral',
                    Severity: 'Error',
                    Selector: '#chart-tick',
                }),
            ]);
            expect(
                EvaluateDomRules([boundItem], {
                    Format: '16:9',
                    Width: 1920,
                    Height: 1080,
                    BoundDataLiterals: { ChartTick: ['$99.4M', '42%'] },
                }),
            ).toEqual([]);

            // Absent AllowedDataLiterals flags every numeric literal token ($14.2M and 28%; Q3 and 2026 are skipped by Core scanner)
            const absentAllowedIssues = EvaluateDomRules([unboundWithTwoNumbers], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
            });
            expect(absentAllowedIssues.map((i) => i.Code)).toEqual([
                MJ_UNBOUND_LITERAL_RENDERED_CODE,
                MJ_UNBOUND_LITERAL_RENDERED_CODE,
            ]);
            expect(absentAllowedIssues.every((i) => i.Category === 'DataLiteral' && i.Severity === 'Error')).toBe(
                true,
            );

            // Allowing both tokens passes cleanly
            const allowedIssues = EvaluateDomRules([unboundWithTwoNumbers], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
                AllowedDataLiterals: ['$14.2M', '28%'],
            });
            expect(allowedIssues).toEqual([]);
        });
    });

    describe('MJ_BOUND_KEY_UNKNOWN and MJ_BOUND_VALUE_MISMATCH', () => {
        it('flags empty or unknown data-mj-bound keys with MJ_BOUND_KEY_UNKNOWN at any timestamp', () => {
            const emptyKey = makeMeasuredText({
                Selector: '#empty-bound',
                Text: '$14.2M',
                IsBound: true,
                BoundKey: '',
                TimestampSeconds: 0.5,
            });
            const unknownKey = makeMeasuredText({
                Selector: '#typo-bound',
                Text: '$14.2M',
                IsBound: true,
                BoundKey: 'TotlARR',
                TimestampSeconds: 1.0,
            });

            const issues = EvaluateDomRules([emptyKey, unknownKey], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
                BoundDataLiterals: {
                    TotalARR: ['$14.2M', '14200000'],
                },
            });

            expect(issues).toEqual([
                expect.objectContaining({
                    Code: MJ_BOUND_KEY_UNKNOWN_CODE,
                    Category: 'DataLiteral',
                    Severity: 'Error',
                    Selector: '#empty-bound',
                    TimestampSeconds: 0.5,
                }),
                expect.objectContaining({
                    Code: MJ_BOUND_KEY_UNKNOWN_CODE,
                    Category: 'DataLiteral',
                    Severity: 'Error',
                    Selector: '#typo-bound',
                    TimestampSeconds: 1.0,
                }),
            ]);
        });

        it('does not flag intermediate count-up values at non-settle timestamps, passes matching settled values (including non-symbol currencies like CAD 1,250 from BuildBoundDataLiterals), and flags wrong settled values with MJ_BOUND_VALUE_MISMATCH', () => {
            const midBeatCountUp = makeMeasuredText({
                Selector: '#arr-kpi',
                Text: '$7.1M',
                IsBound: true,
                BoundKey: 'TotalARR',
                TimestampSeconds: 1.0,
            });
            const settledCorrect = makeMeasuredText({
                Selector: '#arr-kpi',
                Text: '$14.2M',
                IsBound: true,
                BoundKey: 'TotalARR',
                TimestampSeconds: 1.967,
            });
            const settledCad = makeMeasuredText({
                Selector: '#cad-kpi',
                Text: 'CAD 1,250',
                IsBound: true,
                BoundKey: 'Rev',
                TimestampSeconds: 1.967,
            });
            const settledWrong = makeMeasuredText({
                Selector: '#arr-kpi',
                Text: '$99.9M',
                IsBound: true,
                BoundKey: 'TotalARR',
                TimestampSeconds: 1.967,
            });

            const boundDataLiterals = BuildBoundDataLiterals(
                [
                    {
                        Key: 'TotalARR',
                        Source: { Kind: 'Inline' },
                        Shape: 'Scalar',
                        Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
                    },
                    {
                        Key: 'Rev',
                        Source: { Kind: 'Inline' },
                        Shape: 'Scalar',
                        Format: { Kind: 'Currency', Currency: 'CAD', Decimals: 0 },
                    },
                ],
                {
                    TotalARR: 14_200_000,
                    Rev: 1_250,
                },
            );

            const passingIssues = EvaluateDomRules([midBeatCountUp, settledCorrect, settledCad], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
                BoundDataLiterals: boundDataLiterals,
                SettleTimestampsSeconds: [1.967],
            });
            expect(passingIssues).toEqual([]);

            const mismatchIssues = EvaluateDomRules([midBeatCountUp, settledWrong], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
                BoundDataLiterals: boundDataLiterals,
                SettleTimestampsSeconds: [1.967],
            });
            expect(mismatchIssues).toEqual([
                expect.objectContaining({
                    Code: MJ_BOUND_VALUE_MISMATCH_CODE,
                    Category: 'DataLiteral',
                    Severity: 'Error',
                    Selector: '#arr-kpi',
                    TimestampSeconds: 1.967,
                }),
            ]);
        });
    });

    describe('MJ_ASOF_CARD_MISSING', () => {
        it('flags missing RequiredFinalFrameText on the final frame and passes when visible on the final frame', () => {
            const earlierFrameWithAsOf = makeMeasuredText({
                Selector: '#footer-asof',
                Text: 'Data as of 2026-10-16',
                IsBound: true,
                BoundKey: 'AsOf',
                TimestampSeconds: 1.0,
            });
            const finalFrameWithoutAsOf = makeMeasuredText({
                Selector: '#closing-cta',
                Text: 'Thank you',
                IsBound: false,
                TimestampSeconds: 4.967,
            });
            const finalFrameWithAsOf = makeMeasuredText({
                Selector: '#footer-asof',
                Text: 'Source: MJ • Data as of 2026-10-16',
                IsBound: true,
                BoundKey: 'AsOf',
                TimestampSeconds: 4.967,
            });

            const missingIssues = EvaluateDomRules(
                [earlierFrameWithAsOf, finalFrameWithoutAsOf],
                {
                    Format: '16:9',
                    Width: 1920,
                    Height: 1080,
                    BoundDataLiterals: { AsOf: ['2026-10-16'] },
                    RequiredFinalFrameText: ['Data as of 2026-10-16'],
                    FinalFrameTimestampSeconds: 4.967,
                },
            );
            expect(missingIssues).toEqual([
                expect.objectContaining({
                    Code: MJ_ASOF_CARD_MISSING_CODE,
                    Category: 'Provenance',
                    Severity: 'Error',
                    TimestampSeconds: 4.967,
                }),
            ]);

            const presentIssues = EvaluateDomRules(
                [earlierFrameWithAsOf, finalFrameWithoutAsOf, finalFrameWithAsOf],
                {
                    Format: '16:9',
                    Width: 1920,
                    Height: 1080,
                    BoundDataLiterals: { AsOf: ['2026-10-16'] },
                    RequiredFinalFrameText: ['Data as of 2026-10-16'],
                    FinalFrameTimestampSeconds: 4.967,
                },
            );
            expect(presentIssues).toEqual([]);
        });
    });

    describe('MJ_UNBUNDLED_FONT', () => {
        it('emits an Error when FontIsBundled is false and passes when FontIsBundled is true', () => {
            const unbundled = makeMeasuredText({
                Selector: '#sys-heading',
                FontFamily: 'Arial',
                FontIsBundled: false,
            });
            const bundled = makeMeasuredText({
                Selector: '#brand-heading',
                FontFamily: 'Inter',
                FontIsBundled: true,
            });

            const failIssues = EvaluateDomRules([unbundled], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
            });
            expect(failIssues).toEqual([
                expect.objectContaining({
                    Code: MJ_UNBUNDLED_FONT_CODE,
                    Category: 'Lint',
                    Severity: 'Error',
                    Selector: '#sys-heading',
                }),
            ]);

            const passIssues = EvaluateDomRules([bundled], {
                Format: '16:9',
                Width: 1920,
                Height: 1080,
            });
            expect(passIssues).toEqual([]);
        });
    });
});

