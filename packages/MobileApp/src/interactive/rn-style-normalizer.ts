/**
 * @fileoverview Web-CSS → React Native style normalizer for interactive components.
 *
 * Interactive component specs are authored as web React (JSX with `<div>`,
 * `<span>`, inline CSS objects). React Native's `style` prop accepts a strict
 * subset of those declarations: numeric lengths (no `'12px'`), no shadows via
 * `boxShadow`, no `cursor`/`transition`, no pseudo-selectors, and only
 * `'absolute' | 'relative' | 'static'` positioning. This module converts a
 * single web style object into an RN-safe one, dropping declarations RN can't
 * honor (with a dev-only warning) rather than letting them crash the renderer.
 *
 * The function is deliberately pure and side-effect-free (apart from the dev
 * warning) so it can be unit-tested in isolation.
 */

// `__DEV__` is injected by Metro at runtime but is not declared in the RN
// TypeScript types. Declared here as possibly-undefined so the `typeof` guard
// below type-checks and stays safe under Node (where the global is absent).
declare const __DEV__: boolean | undefined;

/** True only in a Metro development build; false under Node/tests/release. */
const IS_DEV: boolean = typeof __DEV__ !== 'undefined' && __DEV__ === true;

/**
 * Style keys that have no React Native equivalent and are dropped outright.
 * `boxShadow` is replaced by the RN `shadow*`/`elevation` props (which authors
 * rarely emit), `cursor` and `transition` are desktop-only affordances.
 */
const WEB_ONLY_KEYS: ReadonlySet<string> = new Set(['boxShadow', 'cursor', 'transition']);

/** Matches a bare pixel length such as `'12px'` or `'-1.5px'`. */
const PX_LENGTH = /^(-?\d+(?:\.\d+)?)px$/;

/**
 * Matches viewport units React Native cannot resolve on a raw style value.
 *
 * `%` is deliberately NOT here. React Native resolves percentage strings natively on dimension,
 * position and spacing properties, and dropping them silently is how an agent-authored bar chart
 * renders as six identical full-width bars — every bar reading 100% because its `width: '38%'` was
 * discarded. That is a wrong answer displayed confidently, which is worse than a missing chart.
 */
const VIEWPORT_UNIT = /(?:vh|vw|vmin|vmax)$/;

/** Matches a percentage length such as `'38%'` or `'12.5%'`. */
const PERCENT_LENGTH = /^-?\d+(?:\.\d+)?%$/;

/**
 * Properties React Native resolves a percentage against a parent for.
 *
 * Everything else — `borderRadius`, `fontSize`, `gap`, `borderWidth` — takes a number only, so a
 * percentage there is still meaningless and still dropped. Keeping the list explicit means a
 * percentage that RN would silently ignore is reported rather than passed through to be ignored.
 */
const PERCENT_CAPABLE = new Set([
    'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'top', 'bottom', 'left', 'right', 'start', 'end',
    'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
    'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
    'paddingHorizontal', 'paddingVertical', 'paddingStart', 'paddingEnd',
    'flexBasis',
]);

/**
 * Emit a one-line dev warning when a web-only declaration is discarded. No-op
 * outside development builds so production/native release stays quiet.
 */
function warnDropped(key: string, value: unknown): void {
    if (IS_DEV) {
        console.warn(`[interactive] Dropped web-only style "${key}: ${String(value)}" (unsupported in React Native).`);
    }
}

/** A style key targeting a pseudo-class, nested selector, or at-rule (`:hover`, `&:focus`, `@media`). */
function isPseudoSelectorKey(key: string): boolean {
    return key.startsWith(':') || key.startsWith('&') || key.startsWith('@');
}

/** Parse a `'<n>px'` length into its numeric value, or `null` if it isn't one. */
function pxStringToNumber(value: string): number | null {
    const match = PX_LENGTH.exec(value.trim());
    return match ? Number.parseFloat(match[1]) : null;
}

/**
 * Decide the fate of a single style declaration, returning the RN-safe value to
 * keep, or `undefined` to drop it. Centralizes the per-key rules so the public
 * function stays a thin loop.
 */
function normalizeDeclaration(key: string, value: unknown): unknown {
    if (key === 'className') return undefined; // web-only, silently stripped
    if (key === 'display' && value === 'contents') return undefined; // compiler marker wrapper
    if (isPseudoSelectorKey(key)) {
        warnDropped(key, value);
        return undefined;
    }
    if (WEB_ONLY_KEYS.has(key)) {
        warnDropped(key, value);
        return undefined;
    }
    if (key === 'position' && value === 'fixed') {
        warnDropped(key, value);
        return undefined;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const px = pxStringToNumber(value);
        if (px !== null) return px;
        if (PERCENT_LENGTH.test(trimmed)) {
            // Kept where RN can resolve it against a parent; dropped where it would be ignored.
            if (PERCENT_CAPABLE.has(key)) return trimmed;
            warnDropped(key, value);
            return undefined;
        }
        if (VIEWPORT_UNIT.test(trimmed)) {
            warnDropped(key, value);
            return undefined;
        }
    }
    return value;
}

/**
 * Convert a web CSS-in-JS style object into a React-Native-safe style object.
 *
 * Strips `className` and the compiler's `display: 'contents'` marker silently; drops
 * shadow/cursor/transition, fixed positioning, pseudo-selectors, and viewport units with a dev
 * warning; converts `'<n>px'` lengths to numbers; KEEPS percentage lengths on the properties React
 * Native resolves them for and drops them elsewhere; and passes every remaining declaration
 * through unchanged.
 *
 * @param style A single inline style object as authored for web React.
 * @returns A new object containing only React-Native-valid declarations.
 */
export function NormalizeWebStyle(style: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(style)) {
        const kept = normalizeDeclaration(key, value);
        if (kept !== undefined) {
            normalized[key] = kept;
        }
    }
    return normalized;
}

/** @deprecated Use {@link NormalizeWebStyle}. */
export function normalizeWebStyle(style: Record<string, unknown>): Record<string, unknown> {
    return NormalizeWebStyle(style);
}
