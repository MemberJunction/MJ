/**
 * @fileoverview Browser capability detection for graceful degradation (W6).
 *
 * Voice on a public widget needs microphone capture, which the browser exposes ONLY
 * through `navigator.mediaDevices.getUserMedia` AND ONLY in a secure context
 * (`https:` or `localhost`). On an insecure origin, an old browser, or a context that
 * has stripped `mediaDevices`, the mic affordance must be hidden so the visitor
 * silently falls back to text rather than clicking a button that throws.
 *
 * The probe takes the relevant globals as a minimal structural surface so it stays a
 * pure function — unit-testable without a real browser and without leaking the DOM's
 * own ambient types into the call sites.
 *
 * @module @memberjunction/realtime-widget
 */

/** The minimal slice of `navigator` the voice capability probe inspects. */
export interface VoiceCapabilityNavigator {
    /** Present (with `getUserMedia`) only when the browser supports media capture. */
    mediaDevices?: { getUserMedia?: unknown };
}

/** The minimal slice of `window` the probe inspects (secure-context flag). */
export interface VoiceCapabilityWindow {
    /** `true` on https / localhost; `false` (or absent) on insecure origins. */
    isSecureContext?: boolean;
}

/**
 * Returns `true` when the current browser context can capture microphone audio:
 * a secure context AND a callable `navigator.mediaDevices.getUserMedia`.
 *
 * @param nav   The navigator-like object to probe (defaults to the ambient `navigator`).
 * @param win   The window-like object to probe (defaults to the ambient `window`).
 */
export function VoiceIsSupported(
    nav: VoiceCapabilityNavigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
    win: VoiceCapabilityWindow | undefined = typeof window !== 'undefined' ? window : undefined,
): boolean {
    if (!nav || !win) return false;
    if (win.isSecureContext !== true) return false;
    return typeof nav.mediaDevices?.getUserMedia === 'function';
}
