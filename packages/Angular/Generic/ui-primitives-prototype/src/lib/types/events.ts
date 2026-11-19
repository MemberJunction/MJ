/** Cancelable before-transition event payload for Wave 0 primitives. */
export interface MJBeforeEvent<TReason extends string = string> {
  Cancel: boolean;
  Reason?: TReason;
}

/** Post-transition event payload for Wave 0 primitives. */
export interface MJAfterEvent<TReason extends string = string> {
  Reason?: TReason;
}

const SAFE_AXIS_SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Validates open-axis names (`Tone`, `VisualRole`, `Level`) so malformed values fall back
 * cleanly to the default token slug instead of producing invalid `var()` identifiers (CSS IACVT).
 */
export function sanitizeAxisSlug(value: string, fallback: string): string {
  const trimmed = value.trim();
  return SAFE_AXIS_SLUG_RE.test(trimmed) ? trimmed : fallback;
}

/** Dispatches a bubbling, composed CustomEvent for Angular Elements / non-Angular hosts. */
export function dispatchMJElementEvent<TDetail>(
  host: HTMLElement,
  name: string,
  detail: TDetail
): void {
  host.dispatchEvent(
    new CustomEvent<TDetail>(name, {
      bubbles: true,
      composed: true,
      detail,
    })
  );
}
