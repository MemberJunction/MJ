/**
 * @module protocol-edit
 *
 * The form-editable fields of an Evaluation Protocol version and how they apply to the previous version. Every
 * other field is carried over unchanged; the server's validation remains the authority. A protocol's primary-score
 * family is fixed by its first version (a family change is a different protocol, bound to a different unit).
 */
import {
  EvaluationProtocol, PROPER_SCORES_BY_FAMILY,
  type EvaluationProtocolSpec, type GuardFieldsEditableBy, type HoldoutSplit, type InnerValidation, type ProperScore,
} from './evaluation-protocol';
import { EvaluationProtocolRules, type EvaluationProtocolDraft } from './evaluation-protocol-rules';
import { ProtocolRows } from './protocol-rows';

/** The fields of a protocol version an analyst edits in a form. */
export interface ProtocolEditForm {
  Name: string;
  /** The test-set start (date-carved holdouts); '' for other holdouts. */
  Cutoff: string;
  /** The test-set end (exclusive); '' = no end. */
  HoldoutEnd: string;
  Folds: number;
  /** Ignored for blocked-in-time inner validation, which has no repeats. */
  Repeats: number;
  PrimaryMetric: ProperScore['metric'];
  Margin: number;
  MaxComputeSeconds: number;
  MaxCandidates: number;
  Seed: number;
  /** Who may change the guard fields in the version after this one. */
  GuardFieldsEditableBy: GuardFieldsEditableBy;
}

/** The next version's draft, or why the form cannot become one. */
export type ProtocolEditResult = { readonly Ok: true; readonly Draft: EvaluationProtocolDraft } | { readonly Ok: false; readonly Error: string };

/** Protocol editing from a form: the form of a version, the scores it may rank by, and the next version's draft. */
export class ProtocolEdits {
  /** The form showing a saved version. */
  public static ProtocolEditFormFrom(p: EvaluationProtocolSpec): ProtocolEditForm {
    const h = p.holdout;
    const iv = p.innerValidation;
    return {
      Name: p.name,
      Cutoff: h.kind === 'date-carved' ? h.cutoff : '',
      HoldoutEnd: h.kind === 'date-carved' ? h.holdoutEnd || '' : '',
      Folds: iv.folds,
      Repeats: iv.kind === 'blocked-time' ? 1 : iv.repeats,
      PrimaryMetric: p.primaryScore.metric,
      Margin: p.promotion.margin,
      MaxComputeSeconds: p.budgets.maxComputeSeconds,
      MaxCandidates: p.budgets.maxCandidates,
      Seed: p.seed,
      GuardFieldsEditableBy: p.guardFieldsEditableBy,
    };
  }

  /** The primary scores a protocol of this family may rank by (one source: `PROPER_SCORES_BY_FAMILY`). */
  public static PrimaryMetricOptions(family: ProperScore['family']): readonly ProperScore['metric'][] {
    return PROPER_SCORES_BY_FAMILY[family];
  }

  /** The draft of the version after `base` with the form applied, or the first problem with the form. */
  public static ApplyProtocolEdits(base: EvaluationProtocolSpec, form: ProtocolEditForm): ProtocolEditResult {
    const primary = ProtocolEdits.properScoreFor(base.primaryScore.family, form.PrimaryMetric);
    if (primary === null) {
      const family = base.primaryScore.family;
      return { Ok: false, Error: `${form.PrimaryMetric} is not a ${family} score; choose one of: ${ProtocolEdits.PrimaryMetricOptions(family).join(', ')}.` };
    }
    const problem = ProtocolEdits.numberProblem(form) || ProtocolEdits.holdoutProblem(base.holdout, form);
    if (problem !== null) return { Ok: false, Error: problem };
    return { Ok: true, Draft: ProtocolEdits.editedDraft(base, form, primary) };
  }

  /** The first problem with the counts, budget, margin or name; null when they are acceptable. */
  private static numberProblem(form: ProtocolEditForm): string | null {
    if (!Number.isInteger(form.Folds) || form.Folds < 2 || !Number.isInteger(form.Repeats) || form.Repeats < 1) {
      return 'Folds must be a whole number of at least 2 and repeats at least 1.';
    }
    if (!Number.isInteger(form.MaxCandidates) || form.MaxCandidates < 1 || !(form.MaxComputeSeconds > 0)) {
      return 'The budget needs at least one candidate and a positive number of compute seconds.';
    }
    if (!Number.isFinite(form.Margin) || form.Margin < 0) return `The margin must be a number >= 0 (got ${String(form.Margin)}).`;
    if (form.Name.trim().length === 0) return 'The protocol needs a name.';
    return null;
  }

  /** The first problem with the test-set dates of a date-carved holdout; null for other holdouts and valid dates. */
  private static holdoutProblem(holdout: HoldoutSplit, form: ProtocolEditForm): string | null {
    if (holdout.kind !== 'date-carved') return null;
    if (!ProtocolRows.IsIsoDay(form.Cutoff)) return `The test-set start must be a date yyyy-mm-dd (got "${form.Cutoff}").`;
    const end = form.HoldoutEnd.trim();
    if (end !== '' && (!ProtocolRows.IsIsoDay(end) || end <= form.Cutoff)) {
      return `The test-set end must be a date yyyy-mm-dd after the start (got "${end}").`;
    }
    return null;
  }

  /** The previous version's draft with the (already checked) form fields applied. */
  private static editedDraft(base: EvaluationProtocolSpec, form: ProtocolEditForm, primary: ProperScore): EvaluationProtocolDraft {
    return {
      ...EvaluationProtocolRules.DraftFromProtocolSpec(base),
      name: form.Name.trim(),
      holdout: ProtocolEdits.editedHoldout(base.holdout, form),
      innerValidation: ProtocolEdits.editedInnerValidation(base.innerValidation, form),
      primaryScore: primary,
      seed: form.Seed,
      promotion: { ...base.promotion, margin: EvaluationProtocol.ToNonNegative(form.Margin) },
      budgets: { ...base.budgets, maxComputeSeconds: form.MaxComputeSeconds, maxCandidates: form.MaxCandidates },
      guardFieldsEditableBy: form.GuardFieldsEditableBy,
    };
  }

  private static editedHoldout(holdout: HoldoutSplit, form: ProtocolEditForm): HoldoutSplit {
    if (holdout.kind !== 'date-carved') return holdout;
    const end = form.HoldoutEnd.trim();
    return { ...holdout, cutoff: form.Cutoff, holdoutEnd: end === '' ? null : end };
  }

  private static editedInnerValidation(iv: InnerValidation, form: ProtocolEditForm): InnerValidation {
    return iv.kind === 'blocked-time' ? { ...iv, folds: form.Folds } : { ...iv, folds: form.Folds, repeats: form.Repeats };
  }

  /** The proper score of `family` named `metric`, read from `PROPER_SCORES_BY_FAMILY`; null when the family has no such score. */
  private static properScoreFor(family: ProperScore['family'], metric: ProperScore['metric']): ProperScore | null {
    switch (family) {
      case 'binary': {
        const m = ProtocolEdits.allowed(PROPER_SCORES_BY_FAMILY.binary, metric);
        return m === null ? null : { family, metric: m };
      }
      case 'multiclass': {
        const m = ProtocolEdits.allowed(PROPER_SCORES_BY_FAMILY.multiclass, metric);
        return m === null ? null : { family, metric: m };
      }
      case 'continuous': {
        const m = ProtocolEdits.allowed(PROPER_SCORES_BY_FAMILY.continuous, metric);
        return m === null ? null : { family, metric: m };
      }
      case 'count': {
        const m = ProtocolEdits.allowed(PROPER_SCORES_BY_FAMILY.count, metric);
        return m === null ? null : { family, metric: m };
      }
      case 'non-negative': {
        const m = ProtocolEdits.allowed(PROPER_SCORES_BY_FAMILY['non-negative'], metric);
        return m === null ? null : { family, metric: m };
      }
      case 'forecast': {
        const m = ProtocolEdits.allowed(PROPER_SCORES_BY_FAMILY.forecast, metric);
        return m === null ? null : { family, metric: m };
      }
    }
  }

  /** `metric` narrowed to one of `allowed`, or null. */
  private static allowed<M extends ProperScore['metric']>(allowed: readonly M[], metric: ProperScore['metric']): M | null {
    return allowed.find((m) => m === metric) || null;
  }
}
