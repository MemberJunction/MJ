/**
 * @module leakage-guard-validation
 *
 * Shared validation + normalization for {@link LeakageGuard} (plan §6.4).
 *
 * The leakage guard is the load-bearing safety primitive in Predictive Studio:
 * it keeps target-leaking columns out of the feature matrix. Its failure mode is
 * therefore the worst kind — a guard that matches **nothing** is
 * indistinguishable, from the outside, from a guard that is armed. Training then
 * "succeeds" on leaked features and the model looks brilliant.
 *
 * The real-world trigger: a user pastes a bracketed list (`[CheckInTime, Status]`)
 * into the deny-fields editor. The naive comma-split yields
 * `["[CheckInTime", "Status]"]`, neither of which matches any column, so the two
 * most dangerous columns sail straight into the matrix.
 *
 * This module lives in Core (a dependency-free leaf) so the exact same rules are
 * enforced in three places that must not drift:
 *
 * 1. the pipeline editor, at input time (fail early, with a good message);
 * 2. `MJMLTrainingPipelineEntityServer.ValidateAsync`, at save time (the
 *    authoritative gate — nothing malformed reaches the database);
 * 3. the runtime enforcer, via {@link clampDominanceThreshold} (defense in depth
 *    for rows that were saved *before* this validation existed).
 */

import type { LeakageGuard } from './pipeline-spec';

/**
 * Default dominance threshold. A single feature holding more than this share of
 * total importance flags the run as suspicious.
 *
 * This is the single source of truth — it previously existed as two divergent
 * private constants (`0.6` in the promote gate, `0.85` in the agent's
 * plan→pipeline mapper), which meant agent-authored pipelines were silently
 * held to a much laxer standard than hand-authored ones.
 */
export const DOMINANCE_THRESHOLD_DEFAULT = 0.6;

/**
 * Lowest meaningful dominance threshold. Below this, virtually every run trips
 * the flag and the signal becomes noise that reviewers learn to click through.
 * Fails *safe* (over-flags), so it is a floor rather than a hard error.
 */
export const DOMINANCE_THRESHOLD_MIN = 0.05;

/**
 * Highest permissible dominance threshold. A feature carrying >90% of a model's
 * total importance is essentially always leakage, so a threshold above this
 * cannot flag anything that matters — it disables the guard while still looking
 * configured. This is the *unsafe* direction, and the reason the range exists.
 */
export const DOMINANCE_THRESHOLD_MAX = 0.9;

/**
 * Characters that can never legitimately appear inside a column or source name,
 * and which are the tell-tale residue of a pasted list, a copied JSON fragment,
 * or a stray quote: brackets, braces, quotes, separators, and any whitespace.
 */
const ILLEGAL_NAME_CHARS = /[[\]{}"'`,;]|\s/;

/** Which part of the guard an issue refers to. */
export type LeakageGuardIssueField = 'DenyFields' | 'DenySources' | 'SingleFeatureDominanceThreshold';

/** How severe an issue is. `Failure` blocks the save; `Warning` is advisory. */
export type LeakageGuardIssueSeverity = 'Failure' | 'Warning';

/** A single problem found in a {@link LeakageGuard} configuration. */
export interface LeakageGuardIssue {
  /** The guard field the issue was found on. */
  Field: LeakageGuardIssueField;
  /** Human-readable explanation, written for the person editing the pipeline. */
  Message: string;
  /** The offending value. */
  Value: string | number;
  /** Severity — `Failure` should block the save. */
  Severity: LeakageGuardIssueSeverity;
}

/**
 * What the caller knows about the pipeline's bound sources. Supplying columns
 * enables the *semantic* check (a deny entry that matches no real column is
 * almost certainly a typo); omitting them limits validation to the *structural*
 * check, which needs no schema knowledge.
 */
export interface LeakageGuardValidationContext {
  /** Every column name reachable across all bound sources. */
  KnownColumns?: string[];
  /** Every source `Ref` bound to the pipeline. */
  KnownSources?: string[];
  /**
   * Whether {@link KnownColumns} is the *complete* set. When a pipeline binds a
   * source whose columns we cannot enumerate (a Query, an external entity, an
   * upstream feature pipeline), this must be `false` — otherwise a perfectly
   * valid deny entry naming a column on that source would be wrongly rejected.
   */
  ColumnsFullyResolved?: boolean;
}

/** Lowercase + trim, for case/whitespace-insensitive name matching. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Whether a deny-list token is structurally impossible as a real column/source
 * name — empty, or containing brackets/quotes/separators/whitespace.
 *
 * This is the check that catches the reported bug deterministically, with no
 * schema knowledge required: `"[CheckInTime"` and `"Status]"` are both malformed
 * on their face.
 */
export function isMalformedNameToken(token: string): boolean {
  const trimmed = token.trim();
  return trimmed.length === 0 || ILLEGAL_NAME_CHARS.test(trimmed);
}

/**
 * Coerce a dominance threshold into the safe range.
 *
 * Applied at *enforcement* time, not as a substitute for validation: rows saved
 * before this validation shipped may already hold a guard-disabling value like
 * `0.95`, and those rows must not be able to silently switch the guard off.
 * Non-finite input falls back to {@link DOMINANCE_THRESHOLD_DEFAULT}.
 */
export function clampDominanceThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return DOMINANCE_THRESHOLD_DEFAULT;
  }
  if (value < DOMINANCE_THRESHOLD_MIN) {
    return DOMINANCE_THRESHOLD_MIN;
  }
  return value > DOMINANCE_THRESHOLD_MAX ? DOMINANCE_THRESHOLD_MAX : value;
}

/**
 * Strip the residue of a pasted list from a single token — surrounding brackets,
 * braces, and quotes.
 *
 * Deliberately conservative: it removes only *enclosing* punctuation, which is a
 * paste artifact rather than a typo. It will not rescue a genuinely misspelled
 * column name, and it is not a substitute for {@link validateLeakageGuard} —
 * anything it fails to clean still gets rejected loudly rather than silently
 * accepted.
 */
export function sanitizeNameToken(token: string): string {
  return token.replace(/^[[\]{}"'`\s]+/, '').replace(/[[\]{}"'`\s]+$/, '');
}

/**
 * Parse a user-entered, comma-separated deny list into clean tokens.
 *
 * Handles the paste-a-bracketed-list case (`[CheckInTime, Status]`) that
 * produced the original silent-disarm bug.
 */
export function parseDenyList(text: string): string[] {
  return text
    .split(',')
    .map(sanitizeNameToken)
    .filter((t) => t.length > 0);
}

/**
 * Validate a {@link LeakageGuard} configuration.
 *
 * Two tiers of checking:
 *
 * - **Structural** (always runs, no schema needed): every deny entry must be a
 *   plausible name — non-empty, free of brackets/quotes/separators/whitespace.
 * - **Semantic** (only when `ColumnsFullyResolved` is true): every deny entry
 *   must actually match a column on some bound source. An entry matching nothing
 *   is a no-op guard, which is the exact failure this module exists to prevent.
 *
 * @param guard the guard to validate
 * @param context what is known about the pipeline's bound sources
 * @returns every issue found; empty means the guard is sound
 */
export function validateLeakageGuard(
  guard: LeakageGuard,
  context: LeakageGuardValidationContext = {}
): LeakageGuardIssue[] {
  return [
    ...validateDenyFields(guard.DenyFields ?? [], context),
    ...validateDenySources(guard.DenySources ?? [], context),
    ...validateThreshold(guard.SingleFeatureDominanceThreshold),
  ];
}

/** Structural + semantic checks for `DenyFields`. */
function validateDenyFields(denyFields: string[], context: LeakageGuardValidationContext): LeakageGuardIssue[] {
  const issues: LeakageGuardIssue[] = [];
  const known = new Set((context.KnownColumns ?? []).map(normalizeName));
  const canCheckSemantics = context.ColumnsFullyResolved === true && known.size > 0;

  for (const entry of denyFields) {
    if (isMalformedNameToken(entry)) {
      issues.push({
        Field: 'DenyFields',
        Message:
          `Deny-field entry "${entry}" is not a valid column name — it contains brackets, quotes, ` +
          `separators, or whitespace. This usually means a list was pasted in whole (e.g. "[A, B]"). ` +
          `An entry like this matches no column, so it silently protects nothing. ` +
          `Enter one plain column name per entry.`,
        Value: entry,
        Severity: 'Failure',
      });
      continue;
    }

    if (canCheckSemantics && !known.has(normalizeName(entry))) {
      issues.push({
        Field: 'DenyFields',
        Message:
          `Deny-field entry "${entry}" matches no column on any bound source. ` +
          `A deny entry that matches nothing provides no protection — it is almost certainly a typo. ` +
          `Correct the spelling or remove the entry.`,
        Value: entry,
        Severity: 'Failure',
      });
    }
  }
  return issues;
}

/** Structural + semantic checks for the optional `DenySources`. */
function validateDenySources(denySources: string[], context: LeakageGuardValidationContext): LeakageGuardIssue[] {
  const issues: LeakageGuardIssue[] = [];
  const known = new Set((context.KnownSources ?? []).map(normalizeName));

  for (const entry of denySources) {
    if (entry.trim().length === 0) {
      issues.push({
        Field: 'DenySources',
        Message: 'Deny-source entries cannot be blank.',
        Value: entry,
        Severity: 'Failure',
      });
      continue;
    }

    if (known.size > 0 && !known.has(normalizeName(entry))) {
      issues.push({
        Field: 'DenySources',
        Message:
          `Deny-source entry "${entry}" matches no source bound to this pipeline, ` +
          `so it denies nothing. Correct it or remove it.`,
        Value: entry,
        Severity: 'Failure',
      });
    }
  }
  return issues;
}

/** Range check for the dominance threshold. */
function validateThreshold(threshold: number): LeakageGuardIssue[] {
  if (!Number.isFinite(threshold)) {
    return [
      {
        Field: 'SingleFeatureDominanceThreshold',
        Message: `Dominance threshold must be a number. Defaulting to ${DOMINANCE_THRESHOLD_DEFAULT}.`,
        Value: threshold,
        Severity: 'Failure',
      },
    ];
  }

  if (threshold > DOMINANCE_THRESHOLD_MAX) {
    return [
      {
        Field: 'SingleFeatureDominanceThreshold',
        Message:
          `Dominance threshold ${threshold} is above the maximum of ${DOMINANCE_THRESHOLD_MAX}. ` +
          `A single feature carrying that much of the model's importance is essentially always leakage, ` +
          `so this threshold could never flag it — it disables the guard while still appearing configured. ` +
          `Use ${DOMINANCE_THRESHOLD_MAX} or lower (default ${DOMINANCE_THRESHOLD_DEFAULT}).`,
        Value: threshold,
        Severity: 'Failure',
      },
    ];
  }

  if (threshold < DOMINANCE_THRESHOLD_MIN) {
    return [
      {
        Field: 'SingleFeatureDominanceThreshold',
        Message:
          `Dominance threshold ${threshold} is below the minimum of ${DOMINANCE_THRESHOLD_MIN}. ` +
          `Nearly every run would be flagged, which trains reviewers to ignore the warning. ` +
          `Use ${DOMINANCE_THRESHOLD_MIN} or higher (default ${DOMINANCE_THRESHOLD_DEFAULT}).`,
        Value: threshold,
        Severity: 'Failure',
      },
    ];
  }

  return [];
}
