import { describe, expect, it } from 'vitest';
import {
    CreateMJChartKit,
    DEFAULT_CHART_KIT_TOKENS,
    FormatTableCell,
    MJ_CHART_KIT_PATH,
    MJ_CHART_KIT_SCRIPT,
    WithChartKit,
    ExtractNumericLiteralTokens,
    type ChartKitColumn,
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

type RgbTriplet = [number, number, number];
type Matrix3x3 = [RgbTriplet, RgbTriplet, RgbTriplet];

/**
 * Machado et al. (2009) severity-1.0 simulation matrices for protanopia, deuteranopia, and tritanopia.
 */
const MACHADO_CVD_MATRICES: Record<'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia', Matrix3x3> = {
    normal: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ],
    protanopia: [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
    ],
    deuteranopia: [
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501, 0.047413],
        [-0.011820, 0.042940, 0.968881],
    ],
    tritanopia: [
        [1.255528, -0.076749, -0.178779],
        [-0.078411, 0.930809, 0.147602],
        [0.004733, 0.691367, 0.303900],
    ],
};

function hexToSrgb01(hexColor: string): RgbTriplet {
    const clean = hexColor.replace(/^#/, '');
    return [
        parseInt(clean.slice(0, 2), 16) / 255,
        parseInt(clean.slice(2, 4), 16) / 255,
        parseInt(clean.slice(4, 6), 16) / 255,
    ];
}

function srgbChannelToLinear(c: number): number {
    const clamped = Math.min(1, Math.max(0, c));
    return clamped <= 0.04045 ? clamped / 12.92 : Math.pow((clamped + 0.055) / 1.055, 2.4);
}

function applyMatrix3x3(m: Matrix3x3, rgb: RgbTriplet): RgbTriplet {
    return [
        Math.min(1, Math.max(0, m[0][0] * rgb[0] + m[0][1] * rgb[1] + m[0][2] * rgb[2])),
        Math.min(1, Math.max(0, m[1][0] * rgb[0] + m[1][1] * rgb[1] + m[1][2] * rgb[2])),
        Math.min(1, Math.max(0, m[2][0] * rgb[0] + m[2][1] * rgb[1] + m[2][2] * rgb[2])),
    ];
}

function srgbToCieLab(rgb: RgbTriplet): [number, number, number] {
    const r = srgbChannelToLinear(rgb[0]);
    const g = srgbChannelToLinear(rgb[1]);
    const b = srgbChannelToLinear(rgb[2]);

    // D65 reference white
    const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.0;
    const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

    const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);

    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function cie76DeltaE(lab1: [number, number, number], lab2: [number, number, number]): number {
    const dL = lab1[0] - lab2[0];
    const da = lab1[1] - lab2[1];
    const db = lab1[2] - lab2[2];
    return Math.sqrt(dL * dL + da * da + db * db);
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

    it('formats numbers, currencies, percentages, dates, and deltas deterministically without Intl (including default Decimals)', () => {
        expect(kit.FormatValue(14_200_000, { Kind: 'Currency', Currency: 'USD' })).toBe('$14.2M');
        expect(kit.FormatValue(3400, { Kind: 'Number' })).toBe('3,400');
        expect(kit.FormatValue(3400)).toBe('3,400');
        expect(kit.FormatValue(0.284, { Kind: 'Percent' })).toBe('28.4%');
        expect(kit.FormatValue(-0.035, { Kind: 'Percent' })).toBe('-3.5%');
        expect(kit.FormatValue(1250, { Kind: 'Currency', Currency: 'CAD' })).toBe('CAD 1,250');
        expect(kit.FormatValue(2.5e9, { Kind: 'Currency', Currency: 'EUR' })).toBe('\u20AC2.5B');
        expect(kit.FormatValue(1850, { Kind: 'Currency', Currency: 'GBP' })).toBe('\u00A31,850');
        expect(kit.FormatValue(9500, { Kind: 'Currency', Currency: 'JPY' })).toBe('\u00A59,500');
        expect(kit.FormatValue(Number.NaN, { Kind: 'Number' })).toBe('n/a');
        expect(kit.FormatValue('2026-10-16', { Kind: 'Date' })).toBe('2026-10-16');
        expect(kit.FormatValue(Date.UTC(2026, 9, 16), { Kind: 'Date' })).toBe('2026-10-16');

        const deltaSvg = kit.DeltaBadge(
            {
                Frame: SAMPLE_FRAME,
                Delta: 0.12,
                Format: { Kind: 'Percent' },
            },
            2.0,
        );
        expect(deltaSvg).toContain('>+12.0%<');

        const negativeDeltaSvg = kit.DeltaBadge(
            {
                Frame: SAMPLE_FRAME,
                Delta: -0.045,
                Format: { Kind: 'Percent' },
            },
            2.0,
        );
        expect(negativeDeltaSvg).toContain('>-4.5%<');
    });

    it('FormatTableCell formats table cells identically to TableReveal across Currency and Percent columns', () => {
        const columns: ChartKitColumn[] = [
            { Header: 'Region' },
            { Header: 'ARR', Format: { Kind: 'Currency', Currency: 'USD' } },
            { Header: 'YoY Growth', Format: { Kind: 'Percent' } },
        ];
        const rows: (string | number)[][] = [
            ['Americas', 14_200_000, 0.284],
            ['EMEA', 8_500_000, -0.035],
        ];

        expect(FormatTableCell(columns[0], 'Americas')).toBe('Americas');
        expect(FormatTableCell(columns[1], 14_200_000)).toBe('$14.2M');
        expect(FormatTableCell(columns[2], 0.284)).toBe('28.4%');
        expect(FormatTableCell(columns[1], 8_500_000)).toBe('$8.5M');
        expect(FormatTableCell(columns[2], -0.035)).toBe('-3.5%');

        expect(kit.FormatTableCell(columns[1], 14_200_000)).toBe('$14.2M');
        expect(kit.FormatTableCell(columns[2], 0.284)).toBe('28.4%');

        const tableSvg = kit.TableReveal(
            {
                Frame: SAMPLE_FRAME,
                Columns: columns,
                Rows: rows,
                BindingKey: 'regional_summary',
            },
            start + duration,
        );

        for (const row of rows) {
            for (let c = 0; c < columns.length; c++) {
                const expectedCell = FormatTableCell(columns[c], row[c]!);
                expect(tableSvg).toContain(`>${expectedCell}<`);
            }
        }
    });

    it('Bar anchors positive bars above and negative bars below the zero line', () => {
        const svg = kit.Bar(
            {
                Frame: SAMPLE_FRAME,
                Points: [
                    { Label: 'Up', Value: 5 },
                    { Label: 'Down', Value: -5 },
                ],
                BindingKey: 'net_change',
            },
            start + duration,
        );

        // Extract bar rects (skipping the first background rect which has x="0" y="0")
        const rectMatches = [
            ...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="4"/g),
        ];
        expect(rectMatches).toHaveLength(2);

        const upRect = {
            x: Number(rectMatches[0]![1]),
            y: Number(rectMatches[0]![2]),
            height: Number(rectMatches[0]![4]),
        };
        const downRect = {
            x: Number(rectMatches[1]![1]),
            y: Number(rectMatches[1]![2]),
            height: Number(rectMatches[1]![4]),
        };

        const padTop = Math.round(SAMPLE_FRAME.Height * 0.16 * 100) / 100;
        const padBottom = Math.round(SAMPLE_FRAME.Height * 0.18 * 100) / 100;
        const plotH = SAMPLE_FRAME.Height - padTop - padBottom;
        const expectedZeroLine = Math.round((padTop + plotH * 0.5) * 100) / 100;

        expect(Math.round((upRect.y + upRect.height) * 100) / 100).toBe(expectedZeroLine);
        expect(downRect.y).toBe(expectedZeroLine);
        expect(upRect.y).not.toBe(downRect.y);
    });

    it('Date-formatted values in KpiTile and TableReveal never count up through intermediate dates', () => {
        const targetEpoch = Date.UTC(2026, 9, 16); // 2026-10-16

        for (const t of [0.3, 0.5, start + duration / 2, start + duration]) {
            const kpiSvg = kit.KpiTile(
                {
                    Frame: { Width: 800, Height: 450, StartSeconds: 0, DurationSeconds: 1.2 },
                    Value: targetEpoch,
                    Label: 'As Of Date',
                    Format: { Kind: 'Date' },
                },
                t,
            );
            const kpiDates = kpiSvg.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
            for (const d of kpiDates) {
                expect(d).toBe('2026-10-16');
            }

            const tableSvg = kit.TableReveal(
                {
                    Frame: { Width: 800, Height: 450, StartSeconds: 0, DurationSeconds: 1.2 },
                    Columns: [
                        { Header: 'Event' },
                        { Header: 'Date', Format: { Kind: 'Date' } },
                    ],
                    Rows: [
                        ['Launch', targetEpoch],
                        ['Renewal', targetEpoch],
                    ],
                },
                t,
            );
            const tableDates = tableSvg.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
            for (const d of tableDates) {
                expect(d).toBe('2026-10-16');
            }
        }
    });

    it('RankedList stable-sorts Points by Value descending (non-finite last) before slicing to MaxItems', () => {
        const svg = kit.RankedList(
            {
                Frame: SAMPLE_FRAME,
                Points: [
                    { Label: 'Small', Value: 1 },
                    { Label: 'Big', Value: 9 },
                ],
                MaxItems: 1,
                BindingKey: 'top_item',
            },
            start + duration,
        );

        expect(svg).toContain('>Big<');
        expect(svg).not.toContain('>Small<');

        const withNonFinite = kit.RankedList(
            {
                Frame: SAMPLE_FRAME,
                Points: [
                    { Label: 'Missing', Value: Number.NaN },
                    { Label: 'Second', Value: 5 },
                    { Label: 'First', Value: 10 },
                ],
                MaxItems: 2,
            },
            start + duration,
        );
        expect(withNonFinite).toContain('>First<');
        expect(withNonFinite).toContain('>Second<');
        expect(withNonFinite).not.toContain('>Missing<');
    });

    it('Donut handles a non-finite slice value without corrupting later slices', () => {
        const withMissing = kit.Donut(
            {
                Frame: SAMPLE_FRAME,
                Points: [
                    { Label: 'A', Value: 1 },
                    { Label: 'B', Value: undefined as unknown as number },
                    { Label: 'C', Value: 2 },
                ],
                BindingKey: 'donut_mix',
            },
            start + duration,
        );
        const withZero = kit.Donut(
            {
                Frame: SAMPLE_FRAME,
                Points: [
                    { Label: 'A', Value: 1 },
                    { Label: 'B', Value: 0 },
                    { Label: 'C', Value: 2 },
                ],
                BindingKey: 'donut_mix',
            },
            start + duration,
        );

        expect(withMissing).toContain('>n/a<');
        expect(withMissing.replace('>n/a<', '>0<')).toBe(withZero);
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

    it('DEFAULT_CHART_KIT_TOKENS meets WCAG contrast thresholds, Machado 2009 CVD ΔE76 >= 10, and matches internal defaultTokens', () => {
        const bg = DEFAULT_CHART_KIT_TOKENS.Background;
        expect(wcagContrastRatio(DEFAULT_CHART_KIT_TOKENS.Text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(wcagContrastRatio(DEFAULT_CHART_KIT_TOKENS.MutedText, bg)).toBeGreaterThanOrEqual(4.5);
        expect(wcagContrastRatio(DEFAULT_CHART_KIT_TOKENS.Positive, bg)).toBeGreaterThanOrEqual(3.0);
        expect(wcagContrastRatio(DEFAULT_CHART_KIT_TOKENS.Negative, bg)).toBeGreaterThanOrEqual(3.0);
        for (const seriesColor of DEFAULT_CHART_KIT_TOKENS.Series) {
            expect(wcagContrastRatio(seriesColor, bg)).toBeGreaterThanOrEqual(3.0);
        }

        const seriesRgb = DEFAULT_CHART_KIT_TOKENS.Series.map(hexToSrgb01);
        for (const [, matrix] of Object.entries(MACHADO_CVD_MATRICES)) {
            const simulatedLabs = seriesRgb.map((rgb) => srgbToCieLab(applyMatrix3x3(matrix, rgb)));
            for (let i = 0; i < simulatedLabs.length; i++) {
                for (let j = i + 1; j < simulatedLabs.length; j++) {
                    const deltaE = cie76DeltaE(simulatedLabs[i]!, simulatedLabs[j]!);
                    expect(deltaE).toBeGreaterThanOrEqual(10);
                }
            }
        }

        const sixPoints = [
            { Label: 'S1', Value: 10 },
            { Label: 'S2', Value: 20 },
            { Label: 'S3', Value: 30 },
            { Label: 'S4', Value: 40 },
            { Label: 'S5', Value: 50 },
            { Label: 'S6', Value: 60 },
        ];
        const withExplicitTokens = kit.Bar(
            {
                Frame: { ...SAMPLE_FRAME, Tokens: DEFAULT_CHART_KIT_TOKENS },
                Points: sixPoints,
            },
            start + duration,
        );
        const withDefaultTokens = kit.Bar(
            {
                Frame: { ...SAMPLE_FRAME },
                Points: sixPoints,
            },
            start + duration,
        );
        expect(withExplicitTokens).toBe(withDefaultTokens);
    });
});
