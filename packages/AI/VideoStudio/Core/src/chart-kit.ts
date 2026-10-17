/**
 * Deterministic, seekable, brand-token-driven SVG chart kit for MemberJunction Video Studio (§10.3, D11).
 *
 * Ships both as typed Node functions (`CreateMJChartKit`, `WithChartKit`, `DEFAULT_CHART_KIT_TOKENS`)
 * and as a self-contained classic browser script (`MJ_CHART_KIT_SCRIPT` at `mj/chart-kit.js`) that
 * attaches `window.MJChartKit` under the render worker's strict `script-src 'self'` CSP.
 */

import type {
    AreaChartProps,
    BarChartProps,
    ChartKitColumn,
    ChartKitFrame,
    ChartKitPoint,
    ChartKitTokens,
    DeltaBadgeProps,
    DonutChartProps,
    KpiTileProps,
    LineChartProps,
    MJChartKit,
    RankedListProps,
    SparklineProps,
    TableRevealProps,
} from './chart-kit-types.js';
import type { RenderProjectBundle } from './render-contract.js';
import type { VideoDataFormat } from './video-generation-spec.js';

/**
 * Relative bundle path where `WithChartKit` injects the chart-kit browser script.
 */
export const MJ_CHART_KIT_PATH = 'mj/chart-kit.js';

/**
 * Default neutral light palette with a 6-color color-vision-deficiency-safe categorical series
 * palette. Meets WCAG contrast targets against `Background` (`Text` and `MutedText` >= 4.5;
 * each `Series`, `Positive`, and `Negative` >= 3.0).
 */
export const DEFAULT_CHART_KIT_TOKENS: Readonly<ChartKitTokens> = Object.freeze({
    FontFamily: 'MJ Sans, Roboto, sans-serif',
    Text: '#0F172A',
    MutedText: '#475569',
    Background: '#F8FAFC',
    Grid: '#CBD5E1',
    Series: ['#005AB5', '#C2410C', '#0F766E', '#7E22CE', '#9F1239', '#0891B2'],
    Positive: '#15803D',
    Negative: '#B91C1C',
});

/**
 * Creates a new `MJChartKit` instance.
 *
 * IMPORTANT: The body of `CreateMJChartKit` is intentionally 100% self-contained (zero outer
 * module references or runtime imports) so `CreateMJChartKit.toString()` can be serialized
 * directly into `MJ_CHART_KIT_SCRIPT` and executed in headless Chromium.
 */
export function CreateMJChartKit(): MJChartKit {
    const defaultTokens: ChartKitTokens = {
        FontFamily: 'MJ Sans, Roboto, sans-serif',
        Text: '#0F172A',
        MutedText: '#475569',
        Background: '#F8FAFC',
        Grid: '#CBD5E1',
        Series: ['#005AB5', '#C2410C', '#0F766E', '#7E22CE', '#9F1239', '#0891B2'],
        Positive: '#15803D',
        Negative: '#B91C1C',
    };

    function r2(n: number): number {
        if (typeof n !== 'number' || !Number.isFinite(n)) {
            return 0;
        }
        const rounded = Math.round(n * 100) / 100;
        return rounded === 0 ? 0 : rounded;
    }

    function clamp01(n: number): number {
        if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
            return 0;
        }
        if (n >= 1) {
            return 1;
        }
        return n;
    }

    function easeOutCubic(p: number): number {
        const c = clamp01(p);
        const inv = 1 - c;
        return 1 - inv * inv * inv;
    }

    function resolveFrame(frame: ChartKitFrame | undefined): {
        Width: number;
        Height: number;
        Start: number;
        Duration: number;
        Tokens: ChartKitTokens;
    } {
        const width = frame && Number.isFinite(frame.Width) && frame.Width > 0 ? frame.Width : 800;
        const height = frame && Number.isFinite(frame.Height) && frame.Height > 0 ? frame.Height : 450;
        const start = frame && typeof frame.StartSeconds === 'number' && Number.isFinite(frame.StartSeconds)
            ? frame.StartSeconds
            : 0;
        const duration = frame && typeof frame.DurationSeconds === 'number' && Number.isFinite(frame.DurationSeconds)
            ? Math.max(0, frame.DurationSeconds)
            : 1.2;
        const custom = frame && frame.Tokens ? frame.Tokens : undefined;
        const tokens: ChartKitTokens = {
            FontFamily: custom && custom.FontFamily ? custom.FontFamily : defaultTokens.FontFamily,
            Text: custom && custom.Text ? custom.Text : defaultTokens.Text,
            MutedText: custom && custom.MutedText ? custom.MutedText : defaultTokens.MutedText,
            Background: custom && custom.Background ? custom.Background : defaultTokens.Background,
            Grid: custom && custom.Grid ? custom.Grid : defaultTokens.Grid,
            Series: custom && Array.isArray(custom.Series) && custom.Series.length > 0
                ? custom.Series
                : defaultTokens.Series,
            Positive: custom && custom.Positive ? custom.Positive : defaultTokens.Positive,
            Negative: custom && custom.Negative ? custom.Negative : defaultTokens.Negative,
        };
        return { Width: width, Height: height, Start: start, Duration: duration, Tokens: tokens };
    }

    function overallProgress(t: number, start: number, duration: number): number {
        if (typeof t !== 'number' || !Number.isFinite(t) || t <= start) {
            return 0;
        }
        if (duration <= 0 || t >= start + duration) {
            return 1;
        }
        return clamp01((t - start) / duration);
    }

    function staggeredProgress(
        t: number,
        start: number,
        duration: number,
        index: number,
        count: number,
    ): number {
        if (typeof t !== 'number' || !Number.isFinite(t) || t <= start) {
            return 0;
        }
        if (duration <= 0 || t >= start + duration) {
            return 1;
        }
        if (count <= 1) {
            return overallProgress(t, start, duration);
        }
        const maxOffset = duration * 0.4;
        const step = Math.min(0.06, maxOffset / (count - 1));
        const itemDuration = duration - (count - 1) * step;
        const itemStart = start + index * step;
        if (t <= itemStart) {
            return 0;
        }
        if (t >= itemStart + itemDuration) {
            return 1;
        }
        return clamp01((t - itemStart) / itemDuration);
    }

    function escapeXml(raw: unknown): string {
        const str = String(raw ?? '');
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function seriesColor(tokens: ChartKitTokens, index: number): string {
        const list = tokens.Series && tokens.Series.length > 0 ? tokens.Series : defaultTokens.Series;
        return list[Math.abs(index) % list.length] ?? '#005AB5';
    }

    function groupThousands(intStr: string): string {
        return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function formatUtcEpochMs(epochMs: number): string {
        const days = Math.floor(epochMs / 86400000);
        const z = days + 719468;
        const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
        const doe = z - era * 146097;
        const yoe = Math.floor(
            (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
        );
        const y = yoe + era * 400;
        const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
        const mp = Math.floor((5 * doy + 2) / 153);
        const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
        const m = mp + (mp < 10 ? 3 : -9);
        const year = y + (m <= 2 ? 1 : 0);
        const yyyy = String(year).padStart(4, '0');
        const mm = String(m).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function currencyPrefixFor(codeRaw: string | undefined): string {
        const code = (codeRaw ?? 'USD').trim().toUpperCase() || 'USD';
        if (code === 'USD') {
            return '$';
        }
        if (code === 'EUR') {
            return '\u20AC';
        }
        if (code === 'GBP') {
            return '\u00A3';
        }
        if (code === 'JPY') {
            return '\u00A5';
        }
        return `${code} `;
    }

    function formatValue(value: number | string, format?: VideoDataFormat): string {
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return 'n/a';
        }
        const cleanVal = value === 0 ? 0 : value;
        const kind = format && format.Kind ? format.Kind : 'Number';
        const hasDecimals =
            Boolean(format) &&
            typeof format!.Decimals === 'number' &&
            Number.isFinite(format!.Decimals) &&
            format!.Decimals >= 0;
        const explicitDecimals = hasDecimals ? Math.trunc(format!.Decimals!) : undefined;

        if (kind === 'Date') {
            return formatUtcEpochMs(cleanVal);
        }

        if (kind === 'Percent') {
            const dec = explicitDecimals !== undefined ? explicitDecimals : 1;
            const scaledAbs = Math.abs(cleanVal * 100);
            const fixed = scaledAbs.toFixed(dec);
            const isNonZero = /[1-9]/.test(fixed);
            const sign = cleanVal < 0 && isNonZero ? '-' : '';
            return `${sign}${fixed}%`;
        }

        const abs = Math.abs(cleanVal);
        let body: string;
        if (abs >= 1e9) {
            const dec = explicitDecimals !== undefined ? explicitDecimals : 1;
            body = `${(abs / 1e9).toFixed(dec)}B`;
        } else if (abs >= 1e6) {
            const dec = explicitDecimals !== undefined ? explicitDecimals : 1;
            body = `${(abs / 1e6).toFixed(dec)}M`;
        } else {
            const dec = explicitDecimals !== undefined ? explicitDecimals : 0;
            const fixed = abs.toFixed(dec);
            const parts = fixed.split('.');
            const groupedInt = groupThousands(parts[0] ?? '0');
            body = parts.length > 1 ? `${groupedInt}.${parts[1]}` : groupedInt;
        }

        const isNonZero = /[1-9]/.test(body);
        const sign = cleanVal < 0 && isNonZero ? '-' : '';
        const prefix = kind === 'Currency' ? currencyPrefixFor(format?.Currency) : '';
        return `${sign}${prefix}${body}`;
    }

    function formatTableCell(
        column: ChartKitColumn | undefined,
        value: number | string,
        fallbackFormat?: VideoDataFormat,
    ): string {
        const colFormat = column && column.Format ? column.Format : fallbackFormat;
        if (typeof value === 'number') {
            return formatValue(value, colFormat);
        }
        return formatValue(String(value), colFormat);
    }

    function interpolatedValue(
        finalVal: number,
        progress: number,
        eased: number,
        format?: VideoDataFormat,
    ): number {
        if (progress >= 1 || (format && format.Kind === 'Date')) {
            return finalVal;
        }
        return finalVal * eased;
    }

    function formatDeltaValue(delta: number, format?: VideoDataFormat): string {
        if (typeof delta !== 'number' || !Number.isFinite(delta)) {
            return 'n/a';
        }
        const formatted = formatValue(delta, format);
        if (delta > 0 && /[1-9]/.test(formatted) && !formatted.startsWith('+') && !formatted.startsWith('-')) {
            return `+${formatted}`;
        }
        return formatted;
    }

    function openSvg(w: number, h: number, tokens: ChartKitTokens, primitiveName: string): string {
        return (
            `<svg width="${r2(w)}" height="${r2(h)}" viewBox="0 0 ${r2(w)} ${r2(h)}" ` +
            `font-family="${escapeXml(tokens.FontFamily)}" data-mj-primitive="${escapeXml(primitiveName)}">` +
            `<rect x="0" y="0" width="${r2(w)}" height="${r2(h)}" rx="12" fill="${escapeXml(tokens.Background)}" />`
        );
    }

    function renderKpiTile(props: KpiTileProps, timeSeconds: number): string {
        const f = resolveFrame(props.Frame);
        const p = overallProgress(timeSeconds, f.Start, f.Duration);
        const eased = easeOutCubic(p);
        const bound = escapeXml(props.BindingKey ?? '');
        const pad = r2(Math.min(f.Width, f.Height) * 0.12);
        const labelSize = r2(Math.max(14, Math.min(f.Width, f.Height) * 0.11));
        const valSize = r2(Math.max(24, Math.min(f.Width, f.Height) * 0.26));
        const accentColor = seriesColor(f.Tokens, 0);
        const barWidth = r2((f.Width - pad * 2) * eased);

        let svg = openSvg(f.Width, f.Height, f.Tokens, 'KpiTile');
        svg += `<rect x="${pad}" y="${pad}" width="6" height="${r2(f.Height - pad * 2)}" rx="3" fill="${escapeXml(accentColor)}" />`;
        svg +=
            `<text x="${r2(pad + 20)}" y="${r2(pad + labelSize)}" ` +
            `fill="${escapeXml(f.Tokens.MutedText)}" font-size="${labelSize}" font-weight="500">` +
            `${escapeXml(props.Label)}</text>`;

        if (p > 0) {
            const currentVal = interpolatedValue(props.Value, p, eased, props.Format);
            const formatted = formatValue(currentVal, props.Format);
            svg +=
                `<text x="${r2(pad + 20)}" y="${r2(f.Height * 0.68)}" ` +
                `fill="${escapeXml(f.Tokens.Text)}" font-size="${valSize}" font-weight="700" ` +
                `opacity="${r2(eased)}" data-mj-bound="${bound}">${escapeXml(formatted)}</text>`;
        }

        svg +=
            `<rect x="${r2(pad + 20)}" y="${r2(f.Height - pad - 4)}" ` +
            `width="${barWidth}" height="4" rx="2" fill="${escapeXml(accentColor)}" />`;
        svg += '</svg>';
        return svg;
    }

    function renderDeltaBadge(props: DeltaBadgeProps, timeSeconds: number): string {
        const f = resolveFrame(props.Frame);
        const p = overallProgress(timeSeconds, f.Start, f.Duration);
        const eased = easeOutCubic(p);
        const bound = escapeXml(props.BindingKey ?? '');
        const isPos = Number.isFinite(props.Delta) && props.Delta > 0;
        const isNeg = Number.isFinite(props.Delta) && props.Delta < 0;
        const accent = isPos ? f.Tokens.Positive : isNeg ? f.Tokens.Negative : f.Tokens.MutedText;

        const pillPadX = r2(f.Width * 0.06);
        const pillPadY = r2(f.Height * 0.14);
        const pillW = r2(f.Width - pillPadX * 2);
        const pillH = r2(f.Height - pillPadY * 2);
        const pillR = r2(pillH / 2);

        const arrowCx = r2(pillPadX + pillH * 0.55);
        const arrowCy = r2(f.Height / 2);
        const arrowSize = r2(Math.max(5, pillH * 0.2 * eased));
        const fontSize = r2(Math.max(14, pillH * 0.42));

        let svg = openSvg(f.Width, f.Height, f.Tokens, 'DeltaBadge');
        svg +=
            `<rect x="${pillPadX}" y="${pillPadY}" width="${pillW}" height="${pillH}" rx="${pillR}" ` +
            `fill="none" stroke="${escapeXml(accent)}" stroke-width="2" />`;

        if (isPos) {
            svg +=
                `<polygon points="${arrowCx},${r2(arrowCy - arrowSize)} ` +
                `${r2(arrowCx - arrowSize)},${r2(arrowCy + arrowSize)} ` +
                `${r2(arrowCx + arrowSize)},${r2(arrowCy + arrowSize)}" ` +
                `fill="${escapeXml(accent)}" />`;
        } else if (isNeg) {
            svg +=
                `<polygon points="${arrowCx},${r2(arrowCy + arrowSize)} ` +
                `${r2(arrowCx - arrowSize)},${r2(arrowCy - arrowSize)} ` +
                `${r2(arrowCx + arrowSize)},${r2(arrowCy - arrowSize)}" ` +
                `fill="${escapeXml(accent)}" />`;
        } else {
            svg +=
                `<rect x="${r2(arrowCx - arrowSize)}" y="${r2(arrowCy - 2)}" ` +
                `width="${r2(arrowSize * 2)}" height="4" rx="2" fill="${escapeXml(accent)}" />`;
        }

        if (p > 0) {
            const currentDelta = interpolatedValue(props.Delta, p, eased, props.Format);
            const formatted = formatDeltaValue(currentDelta, props.Format);
            svg +=
                `<text x="${r2(arrowCx + pillH * 0.35)}" y="${r2(arrowCy + fontSize * 0.35)}" ` +
                `fill="${escapeXml(accent)}" font-size="${fontSize}" font-weight="700" ` +
                `opacity="${r2(eased)}" data-mj-bound="${bound}">${escapeXml(formatted)}</text>`;
        }

        svg += '</svg>';
        return svg;
    }

    function renderBar(props: BarChartProps, timeSeconds: number): string {
        const f = resolveFrame(props.Frame);
        const points: ChartKitPoint[] = Array.isArray(props.Points) ? props.Points : [];
        const bound = escapeXml(props.BindingKey ?? '');
        const padLeft = r2(f.Width * 0.08);
        const padRight = r2(f.Width * 0.08);
        const padTop = r2(f.Height * 0.16);
        const padBottom = r2(f.Height * 0.18);
        const plotW = Math.max(10, f.Width - padLeft - padRight);
        const plotH = Math.max(10, f.Height - padTop - padBottom);
        const baseY = r2(padTop + plotH);

        let minV = 0;
        let maxV = 0;
        for (let i = 0; i < points.length; i++) {
            const v = points[i]?.Value ?? 0;
            if (Number.isFinite(v)) {
                if (v < minV) {
                    minV = v;
                }
                if (v > maxV) {
                    maxV = v;
                }
            }
        }
        const span = maxV - minV > 0 ? maxV - minV : 1;
        const zeroY = maxV - minV > 0 ? r2(padTop + (plotH * maxV) / span) : baseY;

        let svg = openSvg(f.Width, f.Height, f.Tokens, 'Bar');
        const gridSteps = 3;
        for (let g = 0; g <= gridSteps; g++) {
            const gy = r2(padTop + (plotH * g) / gridSteps);
            svg +=
                `<line x1="${padLeft}" y1="${gy}" x2="${r2(padLeft + plotW)}" y2="${gy}" ` +
                `stroke="${escapeXml(f.Tokens.Grid)}" stroke-width="1" />`;
        }

        const count = points.length;
        if (count > 0) {
            const slotW = plotW / count;
            const barW = r2(Math.max(8, slotW * 0.6));
            const labelFont = r2(Math.max(12, Math.min(18, f.Height * 0.045)));

            for (let i = 0; i < count; i++) {
                const pt = points[i]!;
                const pi = staggeredProgress(timeSeconds, f.Start, f.Duration, i, count);
                const easedI = easeOutCubic(pi);
                const rawVal = Number.isFinite(pt.Value) ? pt.Value : 0;
                const ratio = Math.min(1, Math.max(0, Math.abs(rawVal) / span));
                const barH = r2(plotH * ratio * easedI);
                const barX = r2(padLeft + i * slotW + (slotW - barW) / 2);
                const isNegative = rawVal < 0;
                const barY = isNegative ? zeroY : r2(zeroY - barH);
                const centerX = r2(barX + barW / 2);
                const color = seriesColor(f.Tokens, i);

                svg +=
                    `<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="4" ` +
                    `fill="${escapeXml(color)}" />`;
                svg +=
                    `<text x="${centerX}" y="${r2(baseY + labelFont * 1.35)}" text-anchor="middle" ` +
                    `fill="${escapeXml(f.Tokens.MutedText)}" font-size="${labelFont}">${escapeXml(pt.Label)}</text>`;

                if (pi > 0) {
                    const currentVal = interpolatedValue(pt.Value, pi, easedI, props.Format);
                    const formatted = formatValue(currentVal, props.Format);
                    const valY = isNegative
                        ? r2(Math.min(baseY - 4, barY + barH + labelFont))
                        : r2(Math.max(padTop * 0.75, barY - 8));
                    svg +=
                        `<text x="${centerX}" y="${valY}" text-anchor="middle" ` +
                        `fill="${escapeXml(f.Tokens.Text)}" font-size="${labelFont}" font-weight="600" ` +
                        `opacity="${r2(easedI)}" data-mj-bound="${bound}">${escapeXml(formatted)}</text>`;
                }
            }
        }

        svg += '</svg>';
        return svg;
    }

    function renderLineOrArea(
        props: LineChartProps | AreaChartProps,
        timeSeconds: number,
        isArea: boolean,
    ): string {
        const f = resolveFrame(props.Frame);
        const points: ChartKitPoint[] = Array.isArray(props.Points) ? props.Points : [];
        const p = overallProgress(timeSeconds, f.Start, f.Duration);
        const eased = easeOutCubic(p);
        const bound = escapeXml(props.BindingKey ?? '');

        const padLeft = r2(f.Width * 0.1);
        const padRight = r2(f.Width * 0.12);
        const padTop = r2(f.Height * 0.18);
        const padBottom = r2(f.Height * 0.18);
        const plotW = Math.max(10, f.Width - padLeft - padRight);
        const plotH = Math.max(10, f.Height - padTop - padBottom);
        const baseY = r2(padTop + plotH);

        let minVal = 0;
        let maxVal = 0;
        for (let i = 0; i < points.length; i++) {
            const v = points[i]?.Value ?? 0;
            if (Number.isFinite(v)) {
                if (v < minVal) {
                    minVal = v;
                }
                if (v > maxVal) {
                    maxVal = v;
                }
            }
        }
        const span = maxVal - minVal > 0 ? maxVal - minVal : 1;

        let svg = openSvg(f.Width, f.Height, f.Tokens, isArea ? 'Area' : 'Line');
        for (let g = 0; g <= 3; g++) {
            const gy = r2(padTop + (plotH * g) / 3);
            svg +=
                `<line x1="${padLeft}" y1="${gy}" x2="${r2(padLeft + plotW)}" y2="${gy}" ` +
                `stroke="${escapeXml(f.Tokens.Grid)}" stroke-width="1" />`;
        }

        const count = points.length;
        if (count > 0) {
            const color = seriesColor(f.Tokens, 0);
            const labelFont = r2(Math.max(12, Math.min(18, f.Height * 0.045)));
            const coords: Array<{ X: number; Y: number; Pt: ChartKitPoint }> = [];

            for (let i = 0; i < count; i++) {
                const pt = points[i]!;
                const x = count === 1 ? r2(padLeft + plotW / 2) : r2(padLeft + (plotW * i) / (count - 1));
                const norm = Math.min(1, Math.max(0, ((pt.Value || 0) - minVal) / span));
                const targetY = padTop + plotH * (1 - norm);
                const y = r2(baseY - (baseY - targetY) * eased);
                coords.push({ X: x, Y: y, Pt: pt });

                svg +=
                    `<text x="${x}" y="${r2(baseY + labelFont * 1.35)}" text-anchor="middle" ` +
                    `fill="${escapeXml(f.Tokens.MutedText)}" font-size="${labelFont}">${escapeXml(pt.Label)}</text>`;
            }

            if (p > 0) {
                const pathParts: string[] = [];
                for (let i = 0; i < coords.length; i++) {
                    const c = coords[i]!;
                    pathParts.push(`${i === 0 ? 'M' : 'L'} ${c.X} ${c.Y}`);
                }
                const linePath = pathParts.join(' ');

                if (isArea && coords.length >= 2) {
                    const firstX = coords[0]!.X;
                    const lastX = coords[coords.length - 1]!.X;
                    const areaPath = `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
                    svg += `<path d="${areaPath}" fill="${escapeXml(color)}" fill-opacity="${r2(0.22 * eased)}" />`;
                }

                svg +=
                    `<path d="${linePath}" fill="none" stroke="${escapeXml(color)}" ` +
                    `stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;

                for (let i = 0; i < coords.length; i++) {
                    const c = coords[i]!;
                    const isLast = i === coords.length - 1;
                    const currentVal = interpolatedValue(c.Pt.Value, p, eased, props.Format);
                    const formatted = formatValue(currentVal, props.Format);
                    svg +=
                        `<circle cx="${c.X}" cy="${c.Y}" r="${isLast ? 6 : 4}" ` +
                        `fill="${escapeXml(color)}" />`;
                    svg +=
                        `<text x="${c.X}" y="${r2(Math.max(padTop * 0.7, c.Y - 10))}" text-anchor="middle" ` +
                        `fill="${escapeXml(isLast ? color : f.Tokens.Text)}" ` +
                        `font-size="${labelFont}" font-weight="${isLast ? '700' : '600'}" ` +
                        `opacity="${r2(eased)}" data-mj-bound="${bound}">${escapeXml(formatted)}</text>`;
                }
            }
        }

        svg += '</svg>';
        return svg;
    }

    function renderDonut(props: DonutChartProps, timeSeconds: number): string {
        const f = resolveFrame(props.Frame);
        const points: ChartKitPoint[] = Array.isArray(props.Points) ? props.Points : [];
        const bound = escapeXml(props.BindingKey ?? '');
        const cx = r2(f.Width / 2);
        const cy = r2(f.Height / 2);
        const minDim = Math.min(f.Width, f.Height);
        const rMid = r2(minDim * 0.26);
        const ringW = r2(Math.max(12, minDim * 0.1));
        const rLabel = r2(rMid + ringW * 0.95);
        const labelFont = r2(Math.max(12, Math.min(17, minDim * 0.042)));

        let total = 0;
        for (let i = 0; i < points.length; i++) {
            const v = Math.abs(points[i]?.Value ?? 0);
            if (Number.isFinite(v)) {
                total += v;
            }
        }
        if (total <= 0) {
            total = 1;
        }

        let svg = openSvg(f.Width, f.Height, f.Tokens, 'Donut');
        svg +=
            `<circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" ` +
            `stroke="${escapeXml(f.Tokens.Grid)}" stroke-width="${ringW}" />`;

        const count = points.length;
        let startAngle = -Math.PI / 2;

        for (let i = 0; i < count; i++) {
            const pt = points[i]!;
            const pi = staggeredProgress(timeSeconds, f.Start, f.Duration, i, count);
            const easedI = easeOutCubic(pi);
            const v = Number.isFinite(pt.Value) ? Math.abs(pt.Value) : 0;
            const sliceFraction = Math.max(0, v) / total;
            const fullSweep = sliceFraction * Math.PI * 2;
            const currentSweep = Math.min(fullSweep * easedI, Math.PI * 1.999);
            const midAngle = startAngle + fullSweep / 2;
            const color = seriesColor(f.Tokens, i);

            const lx = r2(cx + Math.cos(midAngle) * rLabel);
            const ly = r2(cy + Math.sin(midAngle) * rLabel);
            const anchor = Math.cos(midAngle) >= 0 ? 'start' : 'end';

            svg +=
                `<text x="${lx}" y="${ly}" text-anchor="${anchor}" ` +
                `fill="${escapeXml(f.Tokens.MutedText)}" font-size="${labelFont}">${escapeXml(pt.Label)}</text>`;

            if (pi > 0 && currentSweep > 0.001) {
                const endAngle = startAngle + currentSweep;
                const x1 = r2(cx + Math.cos(startAngle) * rMid);
                const y1 = r2(cy + Math.sin(startAngle) * rMid);
                const x2 = r2(cx + Math.cos(endAngle) * rMid);
                const y2 = r2(cy + Math.sin(endAngle) * rMid);
                const largeArc = currentSweep > Math.PI ? 1 : 0;

                svg +=
                    `<path d="M ${x1} ${y1} A ${rMid} ${rMid} 0 ${largeArc} 1 ${x2} ${y2}" ` +
                    `fill="none" stroke="${escapeXml(color)}" stroke-width="${ringW}" />`;
            }

            if (pi > 0) {
                const currentVal = interpolatedValue(pt.Value, pi, easedI, props.Format);
                const formatted = formatValue(currentVal, props.Format);
                svg +=
                    `<text x="${lx}" y="${r2(ly + labelFont * 1.15)}" text-anchor="${anchor}" ` +
                    `fill="${escapeXml(f.Tokens.Text)}" font-size="${labelFont}" font-weight="700" ` +
                    `opacity="${r2(easedI)}" data-mj-bound="${bound}">${escapeXml(formatted)}</text>`;
            }

            startAngle += fullSweep;
        }

        svg += '</svg>';
        return svg;
    }

    function renderRankedList(props: RankedListProps, timeSeconds: number): string {
        const f = resolveFrame(props.Frame);
        const allPoints: ChartKitPoint[] = Array.isArray(props.Points) ? props.Points : [];
        const sortedPoints = allPoints.slice().sort((a, b) => {
            const aFin = typeof a?.Value === 'number' && Number.isFinite(a.Value);
            const bFin = typeof b?.Value === 'number' && Number.isFinite(b.Value);
            if (aFin && bFin) {
                return b.Value - a.Value;
            }
            if (aFin && !bFin) {
                return -1;
            }
            if (!aFin && bFin) {
                return 1;
            }
            return 0;
        });
        const maxItems =
            typeof props.MaxItems === 'number' && Number.isFinite(props.MaxItems) && props.MaxItems > 0
                ? Math.trunc(props.MaxItems)
                : sortedPoints.length;
        const items = sortedPoints.slice(0, maxItems);
        const bound = escapeXml(props.BindingKey ?? '');

        let maxAbs = 0;
        for (let i = 0; i < items.length; i++) {
            const v = Math.abs(items[i]?.Value ?? 0);
            if (Number.isFinite(v) && v > maxAbs) {
                maxAbs = v;
            }
        }
        if (maxAbs <= 0) {
            maxAbs = 1;
        }

        const padX = r2(f.Width * 0.06);
        const padY = r2(f.Height * 0.1);
        const availH = Math.max(20, f.Height - padY * 2);
        const count = items.length;
        const rowH = count > 0 ? availH / count : availH;
        const fontSize = r2(Math.max(12, Math.min(18, rowH * 0.36)));
        const barStartX = r2(padX + f.Width * 0.28);
        const barMaxW = Math.max(20, f.Width - barStartX - padX - f.Width * 0.18);

        let svg = openSvg(f.Width, f.Height, f.Tokens, 'RankedList');

        for (let i = 0; i < count; i++) {
            const item = items[i]!;
            const pi = staggeredProgress(timeSeconds, f.Start, f.Duration, i, count);
            const easedI = easeOutCubic(pi);
            const rowTop = r2(padY + i * rowH);
            const textY = r2(rowTop + rowH * 0.58);
            const barH = r2(Math.max(6, rowH * 0.34));
            const barY = r2(rowTop + (rowH - barH) / 2);
            const rawVal = Number.isFinite(item.Value) ? Math.abs(item.Value) : 0;
            const ratio = Math.min(1, Math.max(0, rawVal / maxAbs));
            const barW = r2(barMaxW * ratio * easedI);
            const color = seriesColor(f.Tokens, i);

            svg +=
                `<text x="${padX}" y="${textY}" fill="${escapeXml(f.Tokens.MutedText)}" ` +
                `font-size="${fontSize}" font-weight="700">#${i + 1}</text>`;
            svg +=
                `<text x="${r2(padX + fontSize * 2.2)}" y="${textY}" fill="${escapeXml(f.Tokens.Text)}" ` +
                `font-size="${fontSize}" font-weight="500">${escapeXml(item.Label)}</text>`;
            svg +=
                `<rect x="${barStartX}" y="${barY}" width="${barW}" height="${barH}" rx="4" ` +
                `fill="${escapeXml(color)}" />`;

            if (pi > 0) {
                const currentVal = interpolatedValue(item.Value, pi, easedI, props.Format);
                const formatted = formatValue(currentVal, props.Format);
                svg +=
                    `<text x="${r2(f.Width - padX)}" y="${textY}" text-anchor="end" ` +
                    `fill="${escapeXml(f.Tokens.Text)}" font-size="${fontSize}" font-weight="700" ` +
                    `opacity="${r2(easedI)}" data-mj-bound="${bound}">${escapeXml(formatted)}</text>`;
            }
        }

        svg += '</svg>';
        return svg;
    }

    function renderSparkline(props: SparklineProps, timeSeconds: number): string {
        const f = resolveFrame(props.Frame);
        const values: number[] = Array.isArray(props.Values) ? props.Values : [];
        const p = overallProgress(timeSeconds, f.Start, f.Duration);
        const eased = easeOutCubic(p);
        const bound = escapeXml(props.BindingKey ?? '');

        const padLeft = r2(f.Width * 0.08);
        const padRight = r2(f.Width * 0.22);
        const padY = r2(f.Height * 0.22);
        const plotW = Math.max(10, f.Width - padLeft - padRight);
        const plotH = Math.max(10, f.Height - padY * 2);
        const baseY = r2(padY + plotH);

        let minVal = Infinity;
        let maxVal = -Infinity;
        for (let i = 0; i < values.length; i++) {
            const v = values[i] ?? 0;
            if (Number.isFinite(v)) {
                if (v < minVal) {
                    minVal = v;
                }
                if (v > maxVal) {
                    maxVal = v;
                }
            }
        }
        if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
            minVal = 0;
            maxVal = 1;
        }
        const span = maxVal - minVal > 0 ? maxVal - minVal : 1;

        let svg = openSvg(f.Width, f.Height, f.Tokens, 'Sparkline');
        const count = values.length;

        if (count > 0 && p > 0) {
            const color = seriesColor(f.Tokens, 0);
            const fontSize = r2(Math.max(12, Math.min(18, f.Height * 0.18)));
            const pathParts: string[] = [];
            let lastX = padLeft;
            let lastY = baseY;

            for (let i = 0; i < count; i++) {
                const v = values[i]!;
                const x = count === 1 ? r2(padLeft + plotW / 2) : r2(padLeft + (plotW * i) / (count - 1));
                const norm = Math.min(1, Math.max(0, (v - minVal) / span));
                const targetY = padY + plotH * (1 - norm);
                const y = r2(baseY - (baseY - targetY) * eased);
                pathParts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
                lastX = x;
                lastY = y;

                const currentVal = interpolatedValue(v, p, eased, props.Format);
                const formatted = formatValue(currentVal, props.Format);
                const isLast = i === count - 1;
                if (isLast) {
                    svg += `<circle cx="${lastX}" cy="${lastY}" r="5" fill="${escapeXml(color)}" />`;
                    svg +=
                        `<text x="${r2(lastX + 10)}" y="${r2(lastY + fontSize * 0.35)}" ` +
                        `fill="${escapeXml(f.Tokens.Text)}" font-size="${fontSize}" font-weight="700" ` +
                        `opacity="${r2(eased)}" data-mj-bound="${bound}">${escapeXml(formatted)}</text>`;
                } else {
                    svg +=
                        `<text x="${x}" y="${r2(Math.max(fontSize, y - 6))}" text-anchor="middle" ` +
                        `fill="${escapeXml(f.Tokens.MutedText)}" font-size="${r2(Math.max(10, fontSize * 0.75))}" ` +
                        `opacity="${r2(eased * 0.85)}" data-mj-bound="${bound}">${escapeXml(formatted)}</text>`;
                }
            }

            svg +=
                `<path d="${pathParts.join(' ')}" fill="none" stroke="${escapeXml(color)}" ` +
                `stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
        }

        svg += '</svg>';
        return svg;
    }

    function renderTableReveal(props: TableRevealProps, timeSeconds: number): string {
        const f = resolveFrame(props.Frame);
        const columns = Array.isArray(props.Columns) ? props.Columns : [];
        const rows = Array.isArray(props.Rows) ? props.Rows : [];
        const bound = escapeXml(props.BindingKey ?? '');

        const padX = r2(f.Width * 0.05);
        const padY = r2(f.Height * 0.08);
        const tableW = Math.max(20, f.Width - padX * 2);
        const tableH = Math.max(20, f.Height - padY * 2);
        const totalRows = rows.length + 1;
        const rowH = tableH / Math.max(1, totalRows);
        const colCount = Math.max(1, columns.length);
        const colW = tableW / colCount;
        const fontSize = r2(Math.max(12, Math.min(18, rowH * 0.38)));

        let svg = openSvg(f.Width, f.Height, f.Tokens, 'TableReveal');

        const headerBaseline = r2(padY + rowH * 0.62);
        for (let c = 0; c < columns.length; c++) {
            const col = columns[c]!;
            const cellX = r2(padX + c * colW + 8);
            svg +=
                `<text x="${cellX}" y="${headerBaseline}" fill="${escapeXml(f.Tokens.MutedText)}" ` +
                `font-size="${fontSize}" font-weight="700">${escapeXml(col.Header)}</text>`;
        }
        const headerBottom = r2(padY + rowH);
        svg +=
            `<line x1="${padX}" y1="${headerBottom}" x2="${r2(padX + tableW)}" y2="${headerBottom}" ` +
            `stroke="${escapeXml(f.Tokens.Grid)}" stroke-width="1.5" />`;

        const rowCount = rows.length;
        for (let r = 0; r < rowCount; r++) {
            const row = rows[r] ?? [];
            const pr = staggeredProgress(timeSeconds, f.Start, f.Duration, r, rowCount);
            if (pr <= 0) {
                continue;
            }
            const easedR = easeOutCubic(pr);
            const rowTop = r2(padY + (r + 1) * rowH);
            const rowBaseline = r2(rowTop + rowH * 0.62);
            const rowBottom = r2(rowTop + rowH);

            svg +=
                `<line x1="${padX}" y1="${rowBottom}" x2="${r2(padX + tableW)}" y2="${rowBottom}" ` +
                `stroke="${escapeXml(f.Tokens.Grid)}" stroke-width="1" opacity="${r2(easedR)}" />`;

            for (let c = 0; c < colCount; c++) {
                const rawCell = row[c];
                if (rawCell === undefined || rawCell === null) {
                    continue;
                }
                const col = columns[c];
                const colFormat = col && col.Format ? col.Format : props.Format;
                const cellX = r2(padX + c * colW + 8);
                const cellValue =
                    typeof rawCell === 'number'
                        ? interpolatedValue(rawCell, pr, easedR, colFormat)
                        : String(rawCell);
                const cellText = formatTableCell(col, cellValue, props.Format);
                svg +=
                    `<text x="${cellX}" y="${rowBaseline}" fill="${escapeXml(f.Tokens.Text)}" ` +
                    `font-size="${fontSize}" opacity="${r2(easedR)}" ` +
                    `data-mj-bound="${bound}">${escapeXml(cellText)}</text>`;
            }
        }

        svg += '</svg>';
        return svg;
    }

    return {
        KpiTile: renderKpiTile,
        DeltaBadge: renderDeltaBadge,
        Bar: renderBar,
        Line: (props: LineChartProps, timeSeconds: number) => renderLineOrArea(props, timeSeconds, false),
        Area: (props: AreaChartProps, timeSeconds: number) => renderLineOrArea(props, timeSeconds, true),
        Donut: renderDonut,
        RankedList: renderRankedList,
        Sparkline: renderSparkline,
        TableReveal: renderTableReveal,
        FormatValue: formatValue,
        FormatTableCell: formatTableCell,
    };
}

const SHARED_CHART_KIT = CreateMJChartKit();

/**
 * Formats a single table cell using the column's `Format` (or optional fallback `Format`) via `FormatValue`.
 * Shared between `TableReveal` rendering and VS-DAT-3 bound literal validation.
 */
export function FormatTableCell(
    column: ChartKitColumn | undefined,
    value: number | string,
    fallbackFormat?: VideoDataFormat,
): string {
    return SHARED_CHART_KIT.FormatTableCell(column, value, fallbackFormat);
}

/**
 * Self-contained browser script string attaching `window.MJChartKit` for composition use.
 */
export const MJ_CHART_KIT_SCRIPT = `window.MJChartKit = (${CreateMJChartKit.toString()})();`;

/**
 * Returns a new `RenderProjectBundle` with `MJ_CHART_KIT_SCRIPT` staged at `MJ_CHART_KIT_PATH`
 * (`mj/chart-kit.js`), replacing any existing file at that path without mutating the input bundle.
 */
export function WithChartKit(bundle: RenderProjectBundle): RenderProjectBundle {
    const normalizedTarget = MJ_CHART_KIT_PATH;
    const nextFiles = bundle.Files.filter(
        (file) => file.Path.replace(/\\/g, '/').replace(/^\.\//, '') !== normalizedTarget,
    ).map((file) => ({ ...file }));

    nextFiles.push({
        Path: MJ_CHART_KIT_PATH,
        Content: MJ_CHART_KIT_SCRIPT,
    });

    return {
        ...bundle,
        Files: nextFiles,
        Assets: (bundle.Assets ?? []).map((asset) => ({ ...asset })),
    };
}
