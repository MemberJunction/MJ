import { describe, expect, it } from 'vitest';
import {
    EvaluateDomRules,
    MIN_TEXT_SIZE_SHORT_EDGE_RATIO,
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
        it('skips IsBound elements, passes allowed literals, and flags every numeric token when AllowedDataLiterals is absent', () => {
            const boundItem = makeMeasuredText({
                Selector: '#chart-tick',
                Text: '$99.4M (42%)',
                IsBound: true,
            });
            const unboundWithTwoNumbers = makeMeasuredText({
                Selector: '#kpi-line',
                Text: 'ARR hit $14.2M, up 28%YoY in Q3 2026',
                IsBound: false,
            });

            // Bound element is skipped even with no AllowedDataLiterals
            expect(
                EvaluateDomRules([boundItem], {
                    Format: '16:9',
                    Width: 1920,
                    Height: 1080,
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

    describe('MJ_UNBUNDLED_FONT', () => {
        it('emits a Warning when FontIsBundled is false and passes when FontIsBundled is true', () => {
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
                    Severity: 'Warning',
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
