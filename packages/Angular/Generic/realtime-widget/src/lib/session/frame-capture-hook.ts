/**
 * `frame-capture`: the page's statement that a rendered component may be captured as an image for the agent.
 *
 * ── PHASE 2 HOOK ──────────────────────────────────────────────────────────────────────────────────────────
 * The rasterizer that actually turns a component into a JPEG is Phase 2's (it registers itself through
 * `InteractiveComponentFrameCapture`, which ng-conversations already provides). Until it lands this hook only
 * RECORDS the page's intent and says so once if it is asked for something nothing can yet deliver. When the
 * default rasterizer exists, THIS is the place to register it (as its own lazily loaded chunk, never in the
 * session chunk) when `enabled` is true, and to unregister it when false. Nothing else in the widget needs to
 * change: the attribute, the property, the config field and the call site are all already wired.
 * ───────────────────────────────────────────────────────────────────────────────────────────────────────────
 */
import { InteractiveComponentFrameCapture } from '@memberjunction/ng-conversations/dist/lib/components/realtime/interactive-component/interactive-component-frame-capture';

let warnedUnavailable = false;

/** Forgets that the "no rasterizer" notice was shown (tests). */
export function ResetFrameCaptureHookWarning(): void {
  warnedUnavailable = false;
}

/**
 * Applies the page's `frame-capture` preference.
 *
 * @param enabled The page's setting.
 * @returns Whether a capturer is registered and the preference is on (the channel can offer pixels).
 */
export function ApplyFrameCapturePreference(enabled: boolean): boolean {
  if (!enabled) {
    return false;
  }
  if (InteractiveComponentFrameCapture.Instance.Capturer !== null) {
    return true;
  }
  if (!warnedUnavailable) {
    warnedUnavailable = true;
    console.warn('[mj-realtime-widget] frame-capture is on, but no component rasterizer is registered yet, so the agent receives component state only.');
  }
  return false;
}
