/**
 * Pure layout/visibility logic for the media player's transcript panel.
 *
 * Kept framework-agnostic and side-effect-free so the rules (default-below,
 * show/hide toggle, effective visibility) are independently unit-testable.
 */

/** Where the transcript panel sits relative to the media. */
export type TranscriptPosition = 'side' | 'bottom';

/**
 * Resolves whether the transcript panel should actually render, combining:
 *  - whether a transcript exists at all (`hasTranscript`),
 *  - the consumer's `ShowTranscript` master switch,
 *  - the user's runtime show/hide toggle state (`userVisible`).
 *
 * All three must be truthy for the panel to render. When no transcript exists
 * (or `ShowTranscript` is false) the runtime toggle is irrelevant.
 *
 * @param hasTranscript whether one or more transcript cues are present
 * @param showTranscript the `ShowTranscript` master input
 * @param userVisible the runtime (toggle-driven) visibility state
 * @returns true when the transcript panel should render
 */
export function resolveTranscriptVisible(
  hasTranscript: boolean,
  showTranscript: boolean,
  userVisible: boolean,
): boolean {
  return hasTranscript && showTranscript && userVisible;
}

/**
 * Resolves whether the show/hide toggle button should render. The toggle only
 * makes sense when there is a transcript to toggle AND the consumer opted into
 * showing it (`ShowTranscript`) AND the consumer enabled the toggle control.
 *
 * @param hasTranscript whether one or more transcript cues are present
 * @param showTranscript the `ShowTranscript` master input
 * @param showToggle the `ShowTranscriptToggle` input (whether the button renders)
 * @returns true when the toggle button should render
 */
export function resolveTranscriptToggleVisible(
  hasTranscript: boolean,
  showTranscript: boolean,
  showToggle: boolean,
): boolean {
  return hasTranscript && showTranscript && showToggle;
}
