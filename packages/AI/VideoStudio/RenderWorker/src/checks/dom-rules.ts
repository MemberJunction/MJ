import {
    ExtractNumericLiteralTokens,
    type CheckIssue,
    type VideoFormat,
} from '@memberjunction/video-studio-core';
import type { MeasuredText } from '../backend.js';
import { IsAllowedNumericLiteral } from './static-checks.js';

/** Check issue code emitted when a rendered text box extends outside the format's safe area. */
export const MJ_SAFE_AREA_CODE = 'MJ_SAFE_AREA';

/** Check issue code emitted when rendered text has `FontSizePx` below the minimum threshold. */
export const MJ_MIN_TEXT_SIZE_CODE = 'MJ_MIN_TEXT_SIZE';

/** Check issue code emitted when rendered text outside `data-mj-bound` contains an unapproved numeric literal. */
export const MJ_UNBOUND_LITERAL_RENDERED_CODE = 'MJ_UNBOUND_LITERAL_RENDERED';

/** Check issue code emitted when rendered text uses a font family that is not bundled. */
export const MJ_UNBUNDLED_FONT_CODE = 'MJ_UNBUNDLED_FONT';

/**
 * Fractional safe-area insets (`Top`, `Bottom`, `Left`, `Right`) per video format.
 */
export interface SafeAreaInsets {
    Top: number;
    Bottom: number;
    Left: number;
    Right: number;
}

/**
 * Tunable safe-area inset fractions per `VideoFormat` (VS-RND-5 Decision 3).
 *
 * - `16:9` and `1:1`: `0.05` on every side.
 * - `9:16`: top `0.10`, bottom `0.20`, left `0.06`, right `0.12`.
 */
export const SAFE_AREA_INSETS: Readonly<Record<VideoFormat, SafeAreaInsets>> = Object.freeze({
    '16:9': Object.freeze({ Top: 0.05, Bottom: 0.05, Left: 0.05, Right: 0.05 }),
    '1:1': Object.freeze({ Top: 0.05, Bottom: 0.05, Left: 0.05, Right: 0.05 }),
    '9:16': Object.freeze({ Top: 0.1, Bottom: 0.2, Left: 0.06, Right: 0.12 }),
});

/**
 * Tunable minimum text size as a fraction of the frame's short edge (VS-RND-5 Decision 3).
 * At `1920x1080` or `1080x1920` (short edge `1080`), `0.025 * 1080 = 27px`.
 */
export const MIN_TEXT_SIZE_SHORT_EDGE_RATIO = 0.025;

/**
 * Options for `EvaluateDomRules`.
 */
export interface DomRulesOptions {
    Format: VideoFormat;
    Width: number;
    Height: number;
    AllowedDataLiterals?: string[];
}

const FLOAT_EPSILON = 1e-6;

/**
 * Evaluates pure DOM rules (`MJ_SAFE_AREA`, `MJ_MIN_TEXT_SIZE`, `MJ_UNBOUND_LITERAL_RENDERED`,
 * `MJ_UNBUNDLED_FONT`) over a flat or per-timestamp list of `MeasuredText` items.
 */
export function EvaluateDomRules(
    measurements: readonly MeasuredText[],
    options: DomRulesOptions,
): CheckIssue[] {
    const issues: CheckIssue[] = [];
    const insets = SAFE_AREA_INSETS[options.Format] ?? SAFE_AREA_INSETS['16:9'];
    const minLeft = options.Width * insets.Left;
    const maxRight = options.Width * (1 - insets.Right);
    const minTop = options.Height * insets.Top;
    const maxBottom = options.Height * (1 - insets.Bottom);
    const shortEdge = Math.min(options.Width, options.Height);
    const minFontSizePx = shortEdge * MIN_TEXT_SIZE_SHORT_EDGE_RATIO;
    const allowedSet = new Set(
        (options.AllowedDataLiterals ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
    );

    for (const item of measurements) {
        checkSafeArea(item, minLeft, minTop, maxRight, maxBottom, options.Format, issues);
        checkMinTextSize(item, minFontSizePx, issues);
        checkRenderedLiterals(item, allowedSet, issues);
        checkBundledFont(item, issues);
    }

    return issues;
}

function checkSafeArea(
    item: MeasuredText,
    minLeft: number,
    minTop: number,
    maxRight: number,
    maxBottom: number,
    format: VideoFormat,
    issues: CheckIssue[],
): void {
    const right = item.Left + item.Width;
    const bottom = item.Top + item.Height;
    const outsideLeft = item.Left < minLeft - FLOAT_EPSILON;
    const outsideTop = item.Top < minTop - FLOAT_EPSILON;
    const outsideRight = right > maxRight + FLOAT_EPSILON;
    const outsideBottom = bottom > maxBottom + FLOAT_EPSILON;

    if (outsideLeft || outsideTop || outsideRight || outsideBottom) {
        issues.push({
            Code: MJ_SAFE_AREA_CODE,
            Category: 'SafeArea',
            Severity: 'Error',
            Message:
                `Text element "${item.Selector}" box (${Math.round(item.Left)}, ${Math.round(item.Top)}, ` +
                `${Math.round(item.Width)}x${Math.round(item.Height)}) extends outside the ${format} safe area ` +
                `[${Math.round(minLeft)}..${Math.round(maxRight)}, ${Math.round(minTop)}..${Math.round(maxBottom)}].`,
            Selector: item.Selector,
            TimestampSeconds: item.TimestampSeconds,
        });
    }
}

function checkMinTextSize(
    item: MeasuredText,
    minFontSizePx: number,
    issues: CheckIssue[],
): void {
    if (item.FontSizePx < minFontSizePx - FLOAT_EPSILON) {
        issues.push({
            Code: MJ_MIN_TEXT_SIZE_CODE,
            Category: 'MinTextSize',
            Severity: 'Error',
            Message:
                `Text element "${item.Selector}" has font-size ${Number(item.FontSizePx.toFixed(2))}px, ` +
                `below the minimum ${Number(minFontSizePx.toFixed(2))}px.`,
            Selector: item.Selector,
            TimestampSeconds: item.TimestampSeconds,
        });
    }
}

function checkRenderedLiterals(
    item: MeasuredText,
    allowedSet: ReadonlySet<string>,
    issues: CheckIssue[],
): void {
    if (item.IsBound) {
        return;
    }
    const tokens = ExtractNumericLiteralTokens(item.Text);
    for (const token of tokens) {
        if (!IsAllowedNumericLiteral(token, allowedSet)) {
            issues.push({
                Code: MJ_UNBOUND_LITERAL_RENDERED_CODE,
                Category: 'DataLiteral',
                Severity: 'Error',
                Message: `Unbound rendered numeric literal "${token}" in "${item.Selector}" is not in AllowedDataLiterals.`,
                Selector: item.Selector,
                TimestampSeconds: item.TimestampSeconds,
            });
        }
    }
}

function checkBundledFont(item: MeasuredText, issues: CheckIssue[]): void {
    if (!item.FontIsBundled) {
        issues.push({
            Code: MJ_UNBUNDLED_FONT_CODE,
            Category: 'Lint',
            Severity: 'Warning',
            Message: `Text element "${item.Selector}" uses unbundled font family "${item.FontFamily}".`,
            Selector: item.Selector,
            TimestampSeconds: item.TimestampSeconds,
        });
    }
}
