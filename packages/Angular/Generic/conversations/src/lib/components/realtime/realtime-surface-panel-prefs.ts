/**
 * Framework-free helpers for the call overlay's SURFACE PANEL width preference —
 * the user-dragged width of the right tabbed panel, persisted per-user via
 * `UserInfoEngine` (key {@link SURFACE_PANEL_PREF_KEY}, JSON `{ "width": number }`).
 *
 * Kept free of Angular imports so the clamp / parse / serialize rules are
 * unit-testable in isolation (plain-node vitest).
 */

/** `MJ: User Settings` key for the surface panel width preference (versioned shape). */
export const SURFACE_PANEL_PREF_KEY = 'mj.realtimeVoice.surfacePanel.v1';

/** The narrowest the user may drag the panel. */
export const SURFACE_PANEL_MIN_WIDTH = 340;

/** The widest the panel may grow, as a fraction of the overlay's width. */
export const SURFACE_PANEL_MAX_FRACTION = 0.7;

/** The collapsed slim-strip width (the chevron rail the panel collapses to). */
export const SURFACE_PANEL_COLLAPSED_WIDTH = 40;

/** Default panel width (Activity tab focused, user never resized). */
export const SURFACE_PANEL_DEFAULT_WIDTH = 308;

/** Wide-tier floor: a focused content tab widens the panel to at least this. */
export const SURFACE_PANEL_WIDE_MIN_WIDTH = 380;

/** Wide-tier ceiling: the auto-widened panel never exceeds this. */
export const SURFACE_PANEL_WIDE_MAX_WIDTH = 640;

/** Wide-tier preferred size, as a fraction of the overlay's width. */
export const SURFACE_PANEL_WIDE_FRACTION = 0.44;

/**
 * The panel's DEFAULT width when the user has never dragged it: the Activity tier
 * ({@link SURFACE_PANEL_DEFAULT_WIDTH}) normally, auto-widening to
 * `clamp(380px, 44% of the overlay, 640px)` while a content tab (artifact / channel)
 * is focused. An unknown overlay width (`<= 0`, `NaN`) resolves the wide tier to its
 * floor.
 */
export function DefaultSurfacePanelWidth(wide: boolean, overlayWidth: number): number {
  if (!wide) {
    return SURFACE_PANEL_DEFAULT_WIDTH;
  }
  if (!Number.isFinite(overlayWidth) || overlayWidth <= 0) {
    return SURFACE_PANEL_WIDE_MIN_WIDTH;
  }
  return Math.min(
    Math.max(SURFACE_PANEL_WIDE_MIN_WIDTH, overlayWidth * SURFACE_PANEL_WIDE_FRACTION),
    SURFACE_PANEL_WIDE_MAX_WIDTH
  );
}

/** The persisted shape of the surface panel preference. */
export interface SurfacePanelPref {
  /** The user's explicit panel width in px. */
  Width: number;
}

/**
 * Clamps a candidate panel width to `[SURFACE_PANEL_MIN_WIDTH, 70% of the overlay]`.
 * When the overlay width is unknown / not yet measurable (`<= 0`, `NaN`), only the
 * minimum is enforced. The upper bound never drops below the minimum (tiny overlays
 * resolve to the minimum width).
 */
export function ClampSurfacePanelWidth(width: number, overlayWidth: number): number {
  const min = SURFACE_PANEL_MIN_WIDTH;
  if (!Number.isFinite(width)) {
    return min;
  }
  const max = Number.isFinite(overlayWidth) && overlayWidth > 0
    ? Math.max(min, overlayWidth * SURFACE_PANEL_MAX_FRACTION)
    : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(width, min), max);
}

/**
 * Parses a raw persisted preference value. Returns `null` (no preference) for
 * missing / blank / malformed JSON, non-object payloads, and non-finite or
 * non-positive widths — a reset is stored as `{ "width": null }`, which also
 * parses to `null`. Never throws.
 */
export function ParseSurfacePanelPref(raw: string | null | undefined): SurfacePanelPref | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }
    const width = (parsed as { width?: unknown }).width;
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      return null;
    }
    return { Width: width };
  } catch {
    return null;
  }
}

/**
 * Serializes the preference for persistence. `null` serializes a reset
 * (`{ "width": null }`) — written instead of a delete so a pending debounced
 * width write can never resurrect the old value.
 */
export function SerializeSurfacePanelPref(width: number | null): string {
  return JSON.stringify({ width });
}
