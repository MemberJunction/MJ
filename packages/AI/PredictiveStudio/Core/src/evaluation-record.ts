/**
 * @module evaluation-record
 *
 * How a model's stored numbers were measured, written by training into `MLModel.Lineage` under `evaluation` and read
 * by the trust verdict. Pure; no dependencies beyond the pipeline spec types.
 */
import type { MajorityBaselineRule, ValidationStrategy } from './pipeline-spec';
import type { ImportanceKind } from './sidecar-contract';

/** How a model's stored numbers were measured; training writes it into `MLModel.Lineage` under `evaluation`. */
export interface EvaluationRecord {
  /** True when `Metrics` were measured on rows the fitted model did not train on (every strategy that writes this record). */
  ValidationOutOfSample: boolean;
  /** The pipeline's declared time index (`ValidationStrategy.TimeIndexColumn`), or null. */
  TimeIndexColumn: string | null;
  /** True only when the model was tested on periods after its training periods (no strategy does yet). */
  EvaluatedAsForecast: boolean;
  /** Why the trust verdict is withheld, or null when it is not. */
  WithheldReason: string | null;
  /** The majority-baseline rule in force when the model was trained (D2-C5d). */
  MajorityBaselineRule: MajorityBaselineRule;
  /** Which kind of number the stored feature importance is; null for models trained before it was recorded. */
  ImportanceKind: ImportanceKind | null;
}

/** Thrown before any training row is written when `ValidationStrategy.MajorityBaselineRule` is not a known value. */
export class InvalidMajorityBaselineRuleError extends Error {
  constructor(public readonly Value: string) {
    super(
      `Training refused: ValidationStrategy.MajorityBaselineRule '${Value}' is not one of ` +
        `${EvaluationLineage.MajorityBaselineRules.map((r) => `'${r}'`).join(', ')}. Remove it to use '${EvaluationLineage.DefaultMajorityBaselineRule}'.`,
    );
    this.name = 'InvalidMajorityBaselineRuleError';
  }
}

/** The evaluation record a model carries in `MLModel.Lineage.evaluation`: building it at training, reading it back. */
export class EvaluationLineage {
  /** The `Lineage` key the record is stored under. */
  public static readonly Key = 'evaluation';
  /** The stored reason for a time-indexed model that was not tested on later periods. */
  public static readonly NotEvaluatedAsForecast = 'not evaluated as a forecast';
  /** The rule a pipeline gets when its `ValidationStrategy` does not name one (D2-C5d). */
  public static readonly DefaultMajorityBaselineRule: MajorityBaselineRule = 'enforce';
  /** Every value `MajorityBaselineRule` accepts. */
  public static readonly MajorityBaselineRules: ReadonlyArray<MajorityBaselineRule> = ['enforce', 'warn'];

  /** The rule a pipeline asks for: absent or empty → the default; an unknown value is refused, never ignored. */
  public static ParseMajorityBaselineRule(value: string | null | undefined): MajorityBaselineRule {
    const trimmed = value?.trim() || '';
    if (trimmed.length === 0) return EvaluationLineage.DefaultMajorityBaselineRule;
    if (!EvaluationLineage.isMajorityBaselineRule(trimmed)) throw new InvalidMajorityBaselineRuleError(trimmed);
    return trimmed;
  }

  /** The record training writes for a pipeline's validation strategy. Throws `InvalidMajorityBaselineRuleError`. */
  public static Build(validation: ValidationStrategy, options?: { ValidationOutOfSample?: boolean; ImportanceKind?: ImportanceKind | null }): EvaluationRecord {
    const timeIndex = validation.TimeIndexColumn?.trim() || null;
    return {
      ValidationOutOfSample: options?.ValidationOutOfSample ?? true,
      TimeIndexColumn: timeIndex,
      EvaluatedAsForecast: false,
      WithheldReason: timeIndex ? EvaluationLineage.NotEvaluatedAsForecast : null,
      MajorityBaselineRule: EvaluationLineage.ParseMajorityBaselineRule(validation.MajorityBaselineRule),
      ImportanceKind: options?.ImportanceKind || null,
    };
  }

  /** Read the record from a model's `Lineage` JSON; null when absent (models trained before this record existed) or unreadable. */
  public static Read(lineageJson: string | null | undefined): EvaluationRecord | null {
    if (!lineageJson) return null;
    // `unknown` on purpose: stored JSON is untrusted input, narrowed field by field below.
    let parsed: unknown;
    try {
      parsed = JSON.parse(lineageJson);
    } catch {
      return null;
    }
    if (!EvaluationLineage.isRecord(parsed)) return null;
    const raw = parsed[EvaluationLineage.Key];
    if (!EvaluationLineage.isRecord(raw)) return null;
    return {
      ValidationOutOfSample: raw.ValidationOutOfSample === true,
      TimeIndexColumn: typeof raw.TimeIndexColumn === 'string' && raw.TimeIndexColumn.length > 0 ? raw.TimeIndexColumn : null,
      EvaluatedAsForecast: raw.EvaluatedAsForecast === true,
      WithheldReason: typeof raw.WithheldReason === 'string' && raw.WithheldReason.length > 0 ? raw.WithheldReason : null,
      // Stored by training, so it was valid when written; anything else (a record from before D2-C5d) is the default.
      MajorityBaselineRule: raw.MajorityBaselineRule === 'warn' ? 'warn' : EvaluationLineage.DefaultMajorityBaselineRule,
      ImportanceKind: EvaluationLineage.isImportanceKind(raw.ImportanceKind) ? raw.ImportanceKind : null,
    };
  }

  private static isImportanceKind(value: unknown): value is ImportanceKind {
    return value === 'coefficient' || value === 'split_or_impurity' || value === 'none';
  }

  private static isMajorityBaselineRule(value: string): value is MajorityBaselineRule {
    return (EvaluationLineage.MajorityBaselineRules as ReadonlyArray<string>).includes(value);
  }

  // `Record<string, unknown>` is the boundary type the standards prescribe for untrusted JSON (narrowed by the caller).
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
