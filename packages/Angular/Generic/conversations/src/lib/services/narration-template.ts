/**
 * @fileoverview Pure helpers for building the one-off spoken progress-narration instructions a
 * realtime voice session sends to the model while delegated work runs.
 *
 * The instruction text is DB-driven: the server resolves the `Voice Co-Agent - Progress Narration`
 * prompt's `TemplateText` (containing a `{{ progressMessage }}` placeholder) at session start and
 * threads it to the browser. When a deployment hasn't synced that prompt yet, the built-in
 * {@link DefaultNarrationInstructions} fallback keeps narration working unchanged.
 */

/** The placeholder token (with spaces) substituted with the live progress message. */
const PROGRESS_TOKEN_SPACED = '{{ progressMessage }}';
/** The no-spaces variant of the placeholder, tolerated so template authors can't break narration. */
const PROGRESS_TOKEN_TIGHT = '{{progressMessage}}';

/**
 * Builds the built-in (fallback) narration instructions for a progress message — the exact wording
 * the client used before the instruction text became DB-driven.
 *
 * @param message The live delegated-run progress message.
 * @returns The complete spoken-update instruction text.
 */
export function DefaultNarrationInstructions(message: string): string {
  return (
    `Progress on the work YOU are doing for the user: "${message}". ` +
    `Say ONE short, natural sentence about what you are doing right now, strictly in the first person ` +
    `("I'm…"). Example: if the progress says "Analyzing the request", say "I'm looking at that now" — ` +
    `NOT "It's analyzing" or "Sage is analyzing". The words "it" and the agent's name must not be the ` +
    `subject of your sentence. Do not repeat earlier updates and never say generic filler like ` +
    `"it's still running in the background".`
  );
}

/**
 * Builds the narration instructions from the server-provided template by substituting every
 * occurrence of `{{ progressMessage }}` (and the no-spaces `{{progressMessage}}` variant) with the
 * progress message. Falls back to {@link DefaultNarrationInstructions} when the template is absent
 * or blank (deployments that haven't synced the narration prompt).
 *
 * @param template The DB-driven instruction template, or `null`/`undefined` when unavailable.
 * @param message The live delegated-run progress message.
 * @returns The complete spoken-update instruction text.
 */
export function BuildNarrationInstructions(template: string | null | undefined, message: string): string {
  if (!template || template.trim().length === 0) {
    return DefaultNarrationInstructions(message);
  }
  return template
    .split(PROGRESS_TOKEN_SPACED).join(message)
    .split(PROGRESS_TOKEN_TIGHT).join(message);
}
