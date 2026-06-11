/**
 * @fileoverview Pure helpers for building the one-off spoken progress-narration instructions a
 * realtime voice session sends to the model while delegated work runs.
 *
 * The instruction text is DB-driven: the server resolves the `Realtime Co-Agent - Progress Narration`
 * prompt's `TemplateText` at session start and threads it to the browser. The template may use:
 *   - `{{ progressMessage }}`  — the aggregated progress digest (one or more updates, oldest first)
 *   - `{{ priorNarrations }}`  — what the model has ALREADY said aloud for this task (so it can
 *                                continue the story instead of repeating itself)
 *   - `{{ updateNumber }}`     — 1-based count of spoken updates for this task
 * When a deployment hasn't synced that prompt yet, the built-in
 * {@link DefaultNarrationInstructions} fallback keeps narration working with the same semantics.
 */

/** Options accompanying the progress digest when building narration instructions. */
export interface NarrationBuildOptions {
  /** The narration utterances the model has already spoken for this task, oldest first. */
  PriorNarrations?: string[];
  /** 1-based number of this spoken update within the current task. */
  UpdateNumber?: number;
}

const PROGRESS_TOKENS = ['{{ progressMessage }}', '{{progressMessage}}'];
const PRIOR_TOKENS = ['{{ priorNarrations }}', '{{priorNarrations}}'];
const NUMBER_TOKENS = ['{{ updateNumber }}', '{{updateNumber}}'];

/** Replaces every occurrence of each token with the value. */
function replaceTokens(text: string, tokens: string[], value: string): string {
  let out = text;
  for (const t of tokens) {
    out = out.split(t).join(value);
  }
  return out;
}

/** Formats the prior spoken narrations for injection ("none yet" when this is the first update). */
function formatPriorNarrations(prior: string[] | undefined): string {
  if (!prior || prior.length === 0) {
    return 'Nothing yet — this is your first spoken update for this task.';
  }
  return prior.map((p) => `- "${p}"`).join('\n');
}

/**
 * Builds the built-in (fallback) narration instructions — same semantics as the DB template:
 * first person, varied phrasing that continues from what was already said, no repeats.
 *
 * @param digest The aggregated progress digest (one or more updates, oldest first).
 * @param options Prior narrations + update number for phrasing variation/chaining.
 * @returns The complete spoken-update instruction text.
 */
export function DefaultNarrationInstructions(digest: string, options?: NarrationBuildOptions): string {
  const updateNumber = options?.UpdateNumber ?? 1;
  return (
    `Live progress on the work YOU are doing for the user (oldest first): ${digest}. ` +
    `This is spoken update #${updateNumber} for this task. You have already told the user:\n` +
    `${formatPriorNarrations(options?.PriorNarrations)}\n` +
    `Say ONE short, natural sentence in the FIRST PERSON continuing the story of what you are doing. ` +
    `For the first update something like "I'm pulling that up now" is fine; for later updates VARY the ` +
    `phrasing and build on what you last said ("Got the first part — grabbing the rest", "Almost there, ` +
    `just double-checking the numbers") instead of repeating an "I'm now…" pattern. Never repeat ` +
    `information you've already conveyed — only add what's new. Strictly first person: the words "it" ` +
    `and the agent's name must not be the subject of your sentence, and never say generic filler like ` +
    `"it's still running in the background".`
  );
}

/**
 * Builds the narration instructions from the server-provided template by substituting
 * `{{ progressMessage }}`, `{{ priorNarrations }}`, and `{{ updateNumber }}` (space and no-space
 * variants). Falls back to {@link DefaultNarrationInstructions} when the template is absent or
 * blank (deployments that haven't synced the narration prompt).
 *
 * @param template The DB-driven instruction template, or `null`/`undefined` when unavailable.
 * @param digest The aggregated progress digest (one or more updates, oldest first).
 * @param options Prior narrations + update number for phrasing variation/chaining.
 * @returns The complete spoken-update instruction text.
 */
export function BuildNarrationInstructions(
  template: string | null | undefined,
  digest: string,
  options?: NarrationBuildOptions
): string {
  if (!template || template.trim().length === 0) {
    return DefaultNarrationInstructions(digest, options);
  }
  let out = replaceTokens(template, PROGRESS_TOKENS, digest);
  out = replaceTokens(out, PRIOR_TOKENS, formatPriorNarrations(options?.PriorNarrations));
  out = replaceTokens(out, NUMBER_TOKENS, String(options?.UpdateNumber ?? 1));
  return out;
}
