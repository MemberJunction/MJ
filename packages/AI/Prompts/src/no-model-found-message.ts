/**
 * The "no suitable model found" error message, as a dependency-free function.
 *
 * This lives outside `AIPromptRunner` for one reason: it is the message an operator reads when a
 * prompt fails before any provider is called, so it needs real test coverage. As a private method
 * it had none — the suite that covers it re-implemented it in-test and asserted against its own
 * copy, which passes whatever the production method does.
 *
 * The parameter types are structural rather than `AIModelSelectionInfo` so this module imports
 * nothing. `AIModelSelectionInfo` satisfies them.
 */

/**
 * Marker used in `AIModelSelectionInfo.modelsConsidered[].unavailableReason` for candidates that
 * were intentionally NOT credential-checked because a higher-priority candidate had already been
 * selected. See the DECISION note in `AIPromptRunner.selectModelWithAPIKeyTracked`.
 */
export const NOT_EVALUATED_REASON =
  'Not evaluated (a higher-priority candidate was already selected; set AIPromptParams.forceFullModelEvaluation to probe all)';

/** The fields of one considered model/vendor row that the message actually reads. */
export interface ConsideredModelSummary {
  // case-violation-ok-legacy-back-compat: mirrors the camelCase row shape of AIModelSelectionInfo.modelsConsidered, which callers pass straight in
  model: { Name?: string | null };
  // case-violation-ok-legacy-back-compat: mirrors the camelCase row shape of AIModelSelectionInfo.modelsConsidered, which callers pass straight in
  vendor?: { Name?: string | null } | null;
  // case-violation-ok-legacy-back-compat: mirrors the camelCase row shape of AIModelSelectionInfo.modelsConsidered, which callers pass straight in
  available: boolean;
  // case-violation-ok-legacy-back-compat: mirrors the camelCase row shape of AIModelSelectionInfo.modelsConsidered, which callers pass straight in
  unavailableReason?: string;
  /** The provider implementation (e.g. `OpenRouterLLM`), when the caller recorded it. */
  // case-violation-ok-legacy-back-compat: mirrors the camelCase row shape of AIModelSelectionInfo.modelsConsidered, which callers pass straight in
  driverClass?: string;
}

/** The fields of `AIModelSelectionInfo` that the message actually reads. */
export interface NoModelFoundSelectionInfo {
  // case-violation-ok-legacy-back-compat: mirrors AIModelSelectionInfo's camelCase accessors, which callers (and plain-object fixtures) pass straight in
  modelsConsidered?: ConsideredModelSummary[];
  // case-violation-ok-legacy-back-compat: mirrors AIModelSelectionInfo's camelCase accessors, which callers (and plain-object fixtures) pass straight in
  selectionReason?: string;
}

/**
 * One sentence naming the distinct provider implementations behind a candidate list, and which of
 * them hold credentials.
 *
 * WHY THIS EXISTS. A candidate count on its own is actively misleading. A tenant running on
 * platform credits has a single metered provider in front of every model, so a failure reads
 * "101 candidates" and looks like a chain that is badly configured — when in fact all 101 rows are
 * one driver class with no key, and the fix is key delivery, not chain surgery. Naming the classes
 * turns that into "101 candidates over 1 driver class (OpenRouterLLM); credentialed: none".
 *
 * Returns an empty string when no row carries a `driverClass`, so callers can append it
 * unconditionally without changing the message for callers that do not record one.
 */
export function SummarizeDriverClasses(considered: ConsideredModelSummary[]): string {
  const classes = new Map<string, boolean>();
  let notEvaluated = 0;
  for (const row of considered) {
    if (row.unavailableReason === NOT_EVALUATED_REASON) {
      notEvaluated++;
    }
    if (!row.driverClass) {
      continue;
    }
    classes.set(row.driverClass, (classes.get(row.driverClass) ?? false) || row.available);
  }
  if (classes.size === 0) {
    return '';
  }

  const names = [...classes.keys()];
  const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? `, +${names.length - 3} more` : '');
  const credentialed = names.filter(n => classes.get(n));
  // "credentialed: none" is the line that points at key delivery. It is stated as an observation
  // about what was PROBED — hence the not-evaluated count, so a short-circuited tail is never read
  // as proof that a provider has no key.
  const tail = notEvaluated > 0 ? ` (${notEvaluated} not probed)` : '';
  const n = considered.length;
  const k = classes.size;
  return (
    `${n} candidate${n === 1 ? '' : 's'} over ${k} driver class${k === 1 ? '' : 'es'} (${shown}); ` +
    `credentialed: ${credentialed.length > 0 ? credentialed.join(', ') : 'none'}${tail}.`
  );
}

/** The run's credential scope, as far as the message needs it. Omitted = the platform's credentials count. */
export interface NoModelFoundCredentialScope {
  /** The scope's name, quoted in the message (e.g. `RequestOnly`). */
  Name: string;
  /** Whether the scope lets the platform's own credentials (environment or AI Credential settings) count. */
  PlatformAllowed: boolean;
}

/**
 * Builds a descriptive error message when no model could be selected for a prompt. Includes which
 * models were considered and why they were unavailable, so the error is actionable for an operator
 * (most often: missing API credentials).
 */
export function BuildNoModelFoundMessage(
  promptName: string,
  selectionInfo?: NoModelFoundSelectionInfo,
  credentialScope?: NoModelFoundCredentialScope
): string {
  const base = `No suitable model found for prompt ${promptName}`;

  // A selection step that threw (for example the model-type floor) records its error here; show it
  // rather than the generic "no candidates" text. Every other reason keeps its detailed message below.
  if (selectionInfo?.selectionReason?.startsWith('Error during model selection:')) {
    return `${base}. ${selectionInfo.selectionReason}`;
  }

  if (!selectionInfo?.modelsConsidered || selectionInfo.modelsConsidered.length === 0) {
    return `${base}. No model-vendor candidates were available. Please ensure AI models are configured for this prompt.`;
  }

  const considered = selectionInfo.modelsConsidered;
  const summary = SummarizeDriverClasses(considered);
  const summarySuffix = summary ? ` ${summary}` : '';

  // Check if all models were unavailable due to missing credentials
  const unavailableModels = considered.filter(m => !m.available);
  if (unavailableModels.length === considered.length) {
    const triedSummary = unavailableModels
      .slice(0, 5)
      .map(m => `${m.model.Name}/${m.vendor?.Name || 'default'}`)
      .join(', ');

    const suffix = unavailableModels.length > 5 ? ` (${unavailableModels.length} total)` : '';
    // When the scope rules out the platform's credentials, "configure them" would point the reader
    // at exactly the fallback the caller ruled out.
    const remedy =
      !credentialScope || credentialScope.PlatformAllowed
        ? `Please configure API credentials in your environment or AI Credential settings.`
        : `The credential scope is ${credentialScope.Name}, so only the API keys supplied with this run count; supply a key for one of these vendors.`;
    return (
      `${base}. No valid API credentials/keys are configured for any of the candidate model-vendor combinations. ` +
      `Tried: ${triedSummary}${suffix}.${summarySuffix} ${remedy}`
    );
  }

  const reason = selectionInfo.selectionReason || 'Unknown reason';
  return `${base}. ${reason}${reason.endsWith('.') ? '' : '.'}${summarySuffix}`;
}
