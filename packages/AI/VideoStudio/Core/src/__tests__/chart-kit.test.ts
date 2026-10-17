import { describe, expect, it } from 'vitest';
import {
    CreateMJChartKit,
    DEFAULT_CHART_KIT_TOKENS,
    MJ_CHART_KIT_PATH,
    MJ_CHART_KIT_SCRIPT,
    WithChartKit,
    ExtractNumericLiteralTokens,
    type MJChartKit,
    type RenderProjectBundle,
} from '../index.js';

const SAMPLE_FRAME = {
    Width: 800,
    Height: 450,
    StartSeconds: 0.4,
    DurationSeconds: 1.2,
};

interface PrimitiveCase {
    Name: string;
    Render: (kit: MJChartKit, t: number) => string;
    FinalFormattedValues: (kit: MJChartKit) => string[];
}

const PRIMITIVE_CASES: PrimitiveCase[] = [
    {
        Name: 'KpiTile',
        Render: (kit, t) =>
            kit.KpiTile(
                {
                    Frame: SAMPLE_FRAME,
                    Value: 14_200_000,
                    Label: 'Annual Recurring Revenue',
                    BindingKey: 'arr_total',
                    Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
                },
                t,
            ),
        FinalFormattedValues: (kit) => [
            kit.FormatValue(14_200_000, { Kind: 'Currency', Currency: 'USD', Decimals: 1 }),
        ],
    },
    {
        Name: 'DeltaBadge',
        Render: (kit, t) =>
            kit.DeltaBadge(
                {
                    Frame: { Width: 320, Height: 120, StartSeconds: 0.4, DurationSeconds: 1.2 },
                    Delta: 0.12,
                    BindingKey: 'yoy_growth',
                    Format: { Kind: 'Percent', Decimals: 1 },
                },
                t,
            ),
        FinalFormattedValues: () => ['+12.0%'],
    },
    {
        Name: 'Bar',
        Render: (kit, t) =>
            kit.Bar(
                {
                    Frame: SAMPLE_FRAME,
                    Points: [
                        { Label: 'Q1', Value: 3200 },
                        { Label: 'Q2', Value: 4800 },
                        { Label: 'Q3', Value: 6100 },
                    ],
                    BindingKey: 'quarterly_sales',
                    Format: { Kind: 'Currency', Currency: 'USD', Decimals: 0 },
                },
                t,
            ),
        FinalFormattedValues: (kit) => [
            kit.FormatValue(3200, { Kind: 'Currency', Currency: 'USD', Decimals: 0 }),
            kit.FormatValue(4800, { Kind: 'Currency', Currency: 'USD', Decimals: 0 }),
            kit.FormatValue(6100, { Kind: 'Currency', Currency: 'USD', Decimals: 0 }),
        ],
    },
    {
        Name: 'Line',
        Render: (kit, t) =>
            kit.Line(
                {
                    Frame: SAMPLE_FRAME,
                    Points: [
                        { Label: 'Jan', Value: 120 },
                        { Label: 'Feb', Value: 185 },
                        { Label: 'Mar', Value: 240 },
                    ],
                    BindingKey: 'monthly_signups',
                    Format: { Kind: 'Number', Decimals: 0 },
                },
                t,
            ),
        FinalFormattedValues: (kit) => [
            kit.FormatValue(120, { Kind: 'Number', Decimals: 0 }),
            kit.FormatValue(185, { Kind: 'Number', Decimals: 0 }),
            kit.FormatValue(240, { Kind: 'Number', Decimals: 0 }),
        ],
    },
    {
        Name: 'Area',
        Render: (kit, t) =>
            kit.Area(
                {
                    Frame: SAMPLE_FRAME,
                    Points: [
                        { Label: 'W1', Value: 0.18 },
                        { Label: 'W2', Value: 0.24 },
                        { Label: 'W3', Value: 0.31 },
                    ],
                    BindingKey: 'conversion_rate',
                    Format: { Kind: 'Percent', Decimals: 1 },
                },
                t,
            ),
        FinalFormattedValues: (kit) => [
            kit.FormatValue(0.18, { Kind: 'Percent', Decimals: 1 }),
            kit.FormatValue(0.24, { Kind: 'Percent', Decimals: 1 }),
            kit.FormatValue(0.31, { Kind: 'Percent', Decimals: 1 }),
        ],
    },
    {
        Name: 'Donut',
        Render: (kit, t) =>
            kit.Donut(
                {
                    Frame: SAMPLE_FRAME,
                    Points: [
                        { Label: 'Enterprise', Value: 540 },
                        { Label: 'Mid-Market', Value: 310 },
                        { Label: 'SMB', Value: 150 },
                    ],
                    BindingKey: 'segment_mix',
                    Format: { Kind: 'Number', Decimals: 0 },
                },
                t,
            ),
        FinalFormattedValues: (kit) => [
            kit.FormatValue(540, { Kind: 'Number', Decimals: 0 }),
            kit.FormatValue(310, { Kind: 'Number', Decimals: 0 }),
            kit.FormatValue(150, { Kind: 'Number', Decimals: 0 }),
        ],
    },
    {
        Name: 'RankedList',
        Render: (kit, t) =>
            kit.RankedList(
                {
                    Frame: SAMPLE_FRAME,
                    Points: [
                        { Label: 'North America', Value: 8500 },
                        { Label: 'EMEA', Value: 5200 },
                        { Label: 'APAC', Value: 3900 },
                    ],
                    MaxItems: 3,
                    BindingKey: 'region_rank',
                    Format: { Kind: 'Currency', Currency: 'USD', Decimals: 0 },
                },
                t,
            ),
        FinalFormattedValues: (kit) => [
            kit.FormatValue(8500, { Kind: 'Currency', Currency: 'USD', Decimals: 0 }),
            kit.FormatValue(5200, { Kind: 'Currency', Currency: 'USD', Decimals: 0 }),
            kit.FormatValue(3900, { Kind: 'Currency', Currency: 'USD', Decimals: 0 }),
        ],
    },
    {
        Name: 'Sparkline',
        Render: (kit, t) =>
            kit.Sparkline(
                {
                    Frame: { Width: 480, Height: 160, StartSeconds: 0.4, DurationSeconds: 1.2 },
                    Values: [42, 58, 51, 79, 96],
                    BindingKey: 'nps_trend',
                    Format: { Kind: 'Number', Decimals: 0 },
                },
                t,
            ),
        FinalFormattedValues: (kit) => [
            kit.FormatValue(96, { Kind: 'Number', Decimals: 0 }),
        ],
    },
    {
        Name: 'TableReveal',
        Render: (kit, t) =>
            kit.TableReveal(
                {
                    Frame: SAMPLE_FRAME,
                    Columns: [
                        { Header: 'Segment' },
                        { Header: 'Revenue', Format: { Kind: 'Currency', Currency: 'USD', Decimals: 0 } },
                        { Header: 'Retention', Format: { Kind: 'Percent', Decimals: 1 } },
                    ],
                    Rows: [
                        ['Enterprise', 4200, 0.965],
                        ['Commercial', 2750, 0.912],
                    ],
                    BindingKey: 'cohort_table',
                },
                t,
            ),
        FinalFormattedValues: (kit) => [
            kit.FormatValue(4200, { Kind: 'Currency', Currency: 'USD', Decimals: 0 }),
            kit.FormatValue(0.965, { Kind: 'Percent', Decimals: 1 }),
            kit.FormatValue(2750, { Kind: 'Currency', Currency: 'USD', Decimals: 0 }),
            kit.FormatValue(0.912, { Kind: 'Percent', Decimals: 1 }),
        ],
    },
];

function extractUnboundVisibleText(svgMarkup: string): string {
    const withoutBoundText = svgMarkup.replace(
        /<text\b[^>]*\bdata-mj-bound="[^"]*"[^>]*>[\s\S]*?<\/text>/g,
        ' ',
    );
    return withoutBoundText.replace(/<[^>]+>/g, ' ');
}

function parseHexChannel(hex: string): number {
    const c = parseInt(hex, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hexColor: string): number {
    const clean = hexColor.replace(/^#/, '');
    const r = parseHexChannel(clean.slice(0, 2));
    const g = parseHexChannel(clean.slice(2, 4));
    const b = parseHexChannel(clean.slice(4, 6));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function wcagContrastRatio(fg: string, bg: string): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

describe('MJChartKit (VS-DAT-2)', () => {
    const kit = CreateMJChartKit();
    const start = SAMPLE_FRAME.StartSeconds;
    const duration = SAMPLE_FRAME.DurationSeconds;
    const sampleTimestamps = [
        start - 0.1,
        start + duration / 2,
        start + duration,
        start + duration + 2,
    ];

    describe('golden markup snapshots across all 9 primitives', () => {
        for (const primitive of PRIMITIVE_CASES) {
            it(`matches golden SVG snapshot for ${primitive.Name} at Start-0.1, mid, Start+Duration, Start+Duration+2`, () => {
                const snapshots = {
                    beforeStart: primitive.Render(kit, sampleTimestamps[0]),
                    mid: primitive.Render(kit, sampleTimestamps[1]),
                    atEnd: primitive.Render(kit, sampleTimestamps[2]),
                    afterEnd: primitive.Render(kit, sampleTimestamps[3]),
                };
                expect(snapshots).toMatchSnapshot();
            });
        }
    });

    describe('purity and seek order independence', () => {
        for (const primitive of PRIMITIVE_CASES) {
            it(`${primitive.Name} returns identical markup across repeated and out-of-order seeks (t = 1, 0.5, 1)`, () => {
                const firstAtOne = primitive.Render(kit, 1.0);
                const secondAtOne = primitive.Render(kit, 1.0);
                expect(secondAtOne).toBe(firstAtOne);

                const atHalf = primitive.Render(kit, 0.5);
                expect(atHalf).not.toBe(firstAtOne);

                const thirdAtOne = primitive.Render(kit, 1.0);
                expect(thirdAtOne).toBe(firstAtOne);
            });
        }
    });

    describe('animation bounds (t <= Start vs t >= Start + Duration)', () => {
        for (const primitive of PRIMITIVE_CASES) {
            it(`${primitive.Name} contains no final value at t <= Start and contains every FormatValue(final) at t >= Start + Duration`, () => {
                const beforeMarkup = primitive.Render(kit, start - 0.1);
                const atStartMarkup = primitive.Render(kit, start);
                const atEndMarkup = primitive.Render(kit, start + duration);
                const afterEndMarkup = primitive.Render(kit, start + duration + 2);

                const finals = primitive.FinalFormattedValues(kit);
                for (const finalStr of finals) {
                    expect(beforeMarkup).not.toContain(`>${finalStr}<`);
                    expect(atStartMarkup).not.toContain(`>${finalStr}<`);
                    expect(atEndMarkup).toContain(`>${finalStr}<`);
                    expect(afterEndMarkup).toContain(`>${finalStr}<`);
                }
                expect(afterEndMarkup).toBe(atEndMarkup);
            });
        }
    });

    describe('every numeric text is inside data-mj-bound', () => {
        for (const primitive of PRIMITIVE_CASES) {
            it(`${primitive.Name} emits zero unbound numeric tokens across all sample timestamps`, () => {
                for (const t of sampleTimestamps) {
                    const svg = primitive.Render(kit, t);
                    const unboundText = extractUnboundVisibleText(svg);
                    const unboundNumericTokens = ExtractNumericLiteralTokens(unboundText);
                    expect(unboundNumericTokens).toEqual([]);
                }
            });
        }
    });

    it('escapes XML special characters in labels and table cells (<b>&"x")', () => {
        const unsafeLabel = '<b>&"x"';
        const expectedEscaped = '&lt;b&gt;&amp;&quot;x&quot;';

        const kpiSvg = kit.KpiTile(
            {
                Frame: SAMPLE_FRAME,
                Value: 100,
                Label: unsafeLabel,
                BindingKey: unsafeLabel,
            },
            2.0,
        );
        expect(kpiSvg).toContain(expectedEscaped);
        expect(kpiSvg).not.toContain('<b>');

        const barSvg = kit.Bar(
            {
                Frame: SAMPLE_FRAME,
                Points: [{ Label: unsafeLabel, Value: 42 }],
            },
            2.0,
        );
        expect(barSvg).toContain(expectedEscaped);
        expect(barSvg).not.toContain('<b>');

        const tableSvg = kit.TableReveal(
            {
                Frame: SAMPLE_FRAME,
                Columns: [{ Header: unsafeLabel }],
                Rows: [[unsafeLabel]],
            },
            2.0,
        );
        expect(tableSvg).toContain(expectedEscaped);
        expect(tableSvg).not.toContain('<b>');
    });

    it('formats numbers, currencies, percentages, dates, and deltas deterministically without Intl', () => {
        expect(
            kit.FormatValue(14_200_000, { Kind: 'Currency', Currency: 'USD', Decimals: 1 }),
        ).toBe('$14.2M');
        expect(kit.FormatValue(3400, { Kind: 'Number', Decimals: 0 })).toBe('3,400');
        expect(kit.FormatValue(0.284, { Kind: 'Percent', Decimals: 1 })).toBe('28.4%');
        expect(kit.FormatValue(-0.035, { Kind: 'Percent', Decimals: 1 })).toBe('-3.5%');
        expect(
            kit.FormatValue(1250, { Kind: 'Currency', Currency: 'CAD', Decimals: 0 }),
        ).toBe('CAD 1,250');
        expect(kit.FormatValue(Number.NaN, { Kind: 'Number' })).toBe('n/a');
        expect(kit.FormatValue('2026-10-16', { Kind: 'Date' })).toBe('2026-10-16');
        expect(kit.FormatValue(Date.UTC(2026, 9, 16), { Kind: 'Date' })).toBe('2026-10-16');

        const deltaSvg = kit.DeltaBadge(
            {
                Frame: SAMPLE_FRAME,
                Delta: 0.12,
                Format: { Kind: 'Percent', Decimals: 1 },
            },
            2.0,
        );
        expect(deltaSvg).toContain('>+12.0%<');

        const negativeDeltaSvg = kit.DeltaBadge(
            {
                Frame: SAMPLE_FRAME,
                Delta: -0.045,
                Format: { Kind: 'Percent', Decimals: 1 },
            },
            2.0,
        );
        expect(negativeDeltaSvg).toContain('>-4.5%<');
    });

    it('MJ_CHART_KIT_SCRIPT is self-contained and attaches an identical MJChartKit on window', () => {
        const fakeWindow: { MJChartKit?: MJChartKit } = {};
        const runner = new Function('window', MJ_CHART_KIT_SCRIPT);
        runner(fakeWindow);

        expect(fakeWindow.MJChartKit).toBeDefined();
        const windowKit = fakeWindow.MJChartKit!;

        for (const primitive of PRIMITIVE_CASES) {
            expect(primitive.Render(windowKit, 1.0)).toBe(primitive.Render(kit, 1.0));
            expect(primitive.Render(windowKit, 2.0)).toBe(primitive.Render(kit, 2.0));
        }
    });

    it('MJ_CHART_KIT_SCRIPT contains no forbidden clock, timer, network, or Intl tokens', () => {
        const forbiddenSubstrings = [
            'Date.now',
            'performance.now',
            'Math.random',
            'requestAnimationFrame',
            'setTimeout',
            'setInterval',
            'fetch(',
            'XMLHttpRequest',
            'location',
            'Intl',
        ];
        for (const token of forbiddenSubstrings) {
            expect(MJ_CHART_KIT_SCRIPT).not.toContain(token);
        }
    });

    it('WithChartKit adds mj/chart-kit.js once, replaces a stale copy, and does not mutate the input bundle', () => {
        const original: RenderProjectBundle = {
            Format: '16:9',
            Seed: 42,
            EntryFile: 'index.html',
            Files: [{ Path: 'index.html', Content: '<html></html>' }],
            Assets: [],
        };
        const snapshot = structuredClone(original);

        const first = WithChartKit(original);
        expect(original).toEqual(snapshot);
        expect(first.Files).toHaveLength(2);
        expect(first.Files.filter((f) => f.Path === MJ_CHART_KIT_PATH)).toEqual([
            { Path: MJ_CHART_KIT_PATH, Content: MJ_CHART_KIT_SCRIPT },
        ]);

        const withStale: RenderProjectBundle = {
            Format: '16:9',
            Seed: 42,
            EntryFile: 'index.html',
            Files: [
                { Path: 'index.html', Content: '<html></html>' },
                { Path: MJ_CHART_KIT_PATH, Content: '// stale copy' },
            ],
            Assets: [],
        };
        const replaced = WithChartKit(withStale);
        expect(replaced.Files).toHaveLength(2);
        expect(replaced.Files.filter((f) => f.Path === MJ_CHART_KIT_PATH)).toEqual([
            { Path: MJ_CHART_KIT_PATH, Content: MJ_CHART_KIT_SCRIPT },
        ]);
    });

    it('DEFAULT_CHART_KIT_TOKENS meets WCAG relative luminance contrast thresholds against Background', () => {
        const bg = DEFAULT_CHART_KIT_TOKENS.Background;
        expect(wcagContrastRatio(DEFAULT_CHART_KIT_TOKENS.Text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(wcagContrastRatio(DEFAULT_CHART_KIT_TOKENS.MutedText, bg)).toBeGreaterThanOrEqual(4.5);
        expect(wcagContrastRatio(DEFAULT_CHART_KIT_TOKENS.Positive, bg)).toBeGreaterThanOrEqual(3.0);
        expect(wcagContrastRatio(DEFAULT_CHART_KIT_TOKENS.Negative, bg)).toBeGreaterThanOrEqual(3.0);
        for (const seriesColor of DEFAULT_CHART_KIT_TOKENS.Series) {
            expect(wcagContrastRatio(seriesColor, bg)).toBeGreaterThanOrEqual(3.0);
        }
    });
});
