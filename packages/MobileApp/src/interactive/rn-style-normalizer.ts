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

/** Matches viewport / percentage units RN cannot resolve on a raw style value. */
const WEB_ONLY_UNIT = /(?:%|vh|vw|vmin|vmax)$/;

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
        const px = pxStringToNumber(value);
        if (px !== null) return px;
        if (WEB_ONLY_UNIT.test(value.trim())) {
            warnDropped(key, value);
            return undefined;
        }
    }
    return value;
}

/**
 * Convert a web CSS-in-JS style object into a React-Native-safe style object.
 *
 * Strips `className` and the compiler's `display: 'contents'` marker silently;
 * drops shadow/cursor/transition, fixed positioning, pseudo-selectors, and
 * viewport/percentage string values with a dev warning; converts `'<n>px'`
 * lengths to numbers; and passes every remaining declaration through unchanged.
 *
 * @param style A single inline style object as authored for web React.
 * @returns A new object containing only React-Native-valid declarations.
 */
export function normalizeWebStyle(style: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(style)) {
        const kept = normalizeDeclaration(key, value);
        if (kept !== undefined) {
            normalized[key] = kept;
        }
    }
    return normalized;
}
