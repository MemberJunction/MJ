/**
 * @module trust
 *
 * The trust verdict is a **rendering** of the gate decision stored on the model's training run (the `gate` member of
 * `MJ: ML Training Runs.ValidationResults`). It grades nothing itself: no AUC or R² bands, no accuracy reading, no
 * in-sample metrics. A run without a stored decision is "not evaluated" and cannot be acted on. Every number in the
 * copy comes from the stored paired comparison ("beats the flat guess by X [lo, hi]"), formatted by the gate's one
 * formatter ({@link GateRules.FormatInterval}). Each rendered number is also returned as a {@link TracedNumber} (the stored
 * path it was read from), so a test or a gate can recompute it from the stored row.
 *
 * It lives in Core (browser-safe, shared by the server engine, the UI and the agent) so one rule drives the business
 * catalog, the predictions workspace and the agent's builder.
 */
import type { GateOutcome, MetricKey } from './evaluation-protocol';
import { GateRules, type StoredInterval } from './gate';
import type { StoredGateRecord } from './run-evaluation';
import type { TrainerRequestConfig } from './trainer-contract';
import { TrainingRunResultsParser } from './training-run-results';
import { JsonParse } from './json-value';
import type { TracedNumber } from './traced-number';

/** What the verdict reads: the model's training run's stored results, and the model's Lineage. */
export interface TrustInput {
  /** The model's training run's `ValidationResults` (the `ps-run-results/v2` envelope); null when there is none. */
  readonly ValidationResults: string | null;
  /**
   * The model's `Lineage` JSON (its `shippedMember` / `shippedDriver` name what shipped and its driver); null when there
   * is none. Required, so a caller that drops it fails to compile instead of silently losing the shared-driver copy rule.
   */
  readonly Lineage: string | null;
}

/** The stored members the verdict reads: the gate record and the trainer request that named the candidates' drivers. */
interface StoredDecision {
  readonly Gate: StoredGateRecord;
  readonly Request: TrainerRequestConfig | null;
  readonly Lineage: string | null;
}

/** The stored paired comparison a shipped verdict quotes: the shipped artifact against the flat guess. */
export interface TrustComparison {
  readonly Against: 'the flat guess';
  /** The shipped member: the trained model's candidate name, or the kept simple baseline's member name. */
  readonly Shipped: string;
  /** How much the shipped artifact improves on the flat guess, in `Metric` (lower is better, so a positive gain). */
  readonly Value: number;
  readonly Lower: number;
  readonly Upper: number;
  readonly Metric: MetricKey;
}

/** The verdict of a model: not evaluated (no stored decision), or the stored decision rendered as copy. */
export type TrustVerdict =
  | {
      readonly Kind: 'not-evaluated';
      readonly Outcome: null;
      readonly CanAct: false;
      readonly Headline: string;
      readonly Reason: string;
      readonly Comparison: null;
      readonly HoldoutRows: null;
    }
  | {
      readonly Kind: 'evaluated';
      readonly Outcome: GateOutcome;
      readonly CanAct: boolean;
      readonly Headline: string;
      /** The stored reason in words (`gate.reason.text`). */
      readonly Reason: string;
      readonly Comparison: TrustComparison | null;
      /** Rows in the locked holdout the stored intervals were measured on. */
      readonly HoldoutRows: number;
    };

/** The titles {@link TrustVerdicts.OutcomeTitle} returns — a literal union, so a title is never widened to `string`. */
export type OutcomeTitleText =
  | 'Ships — the model beats the flat guess'
  | 'Ships — a simple baseline'
  | 'No signal — not usable'
  | 'Not evaluated yet';

/** Optional context for the evidence line. */
export interface TrustEvidenceOptions {
  /** Rows in the locked holdout (`TrustVerdict.HoldoutRows`). */
  count?: number | null;  // case-violation-ok-legacy-back-compat: existing exported option shape
  /** What the rows are, in plain words (e.g. "members"). Defaults to "records". */
  noun?: string;  // case-violation-ok-legacy-back-compat: existing exported option shape
  /**
   * The `MJ: ML Training Runs` ID the count was read from (`$.gate.holdoutRows`). With it and a positive count the line
   * returns the count as a {@link TracedNumber}; without it the line names no count.
   */
  runId?: string | null;  // case-violation-ok-legacy-back-compat: existing exported option shape
}

/** The evidence line and the traced number it renders (the holdout row count), if any. */
export interface TrustEvidence {
  /** The rendered line. */
  readonly Text: string;
  /** The numbers `Text` renders, each traced to the stored row it was read from. */
  readonly Numbers: readonly TracedNumber[];
}

/** The trust verdict and its copy helpers. */
export class TrustVerdicts {
  /** The verdict of a run without a stored gate decision. */
  private static readonly notEvaluated: TrustVerdict = {
    Kind: 'not-evaluated',
    Outcome: null,
    CanAct: false,
    Headline: 'Not evaluated yet.',
    Reason: 'This model was not trained under an Evaluation Protocol, so there is no measured comparison with a flat guess. Retrain it to get one.',
    Comparison: null,
    HoldoutRows: null,
  };

  /** The verdict of a model: the stored gate decision of its training run rendered as plain copy. */
  public static DeriveTrustVerdict(input: TrustInput): TrustVerdict {
    const stored = TrustVerdicts.readStored(input);
    if (stored === null) return TrustVerdicts.notEvaluated;
    const record = stored.Gate;
    const d = record.decision;
    switch (d.outcome) {
      case 'no-signal':
        return {
          Kind: 'evaluated',
          Outcome: 'no-signal',
          CanAct: false,
          Headline: record.guardRefusal === null ? 'No signal: nothing beats the flat guess.' : 'Not shipped: the test set cannot tell this model from chance.',
          Reason: record.reason.text,
          Comparison: null,
          HoldoutRows: record.holdoutRows,
        };
      case 'model':
        return TrustVerdicts.shippedVerdict(stored, 'model', d.shipped, record.intervals.modelVsDummy);
      case 'keep-simple-baseline': {
        const iv = record.intervals.memberVsDummy[d.shipped];
        // a kept member without its own stored interval has no number to quote: never invent one
        if (iv === undefined) return TrustVerdicts.notEvaluated;
        return TrustVerdicts.shippedVerdict(stored, 'keep-simple-baseline', d.shipped, iv);
      }
    }
  }

  /** A short title for a verdict (badge / banner heading). */
  public static OutcomeTitle(v: TrustVerdict): OutcomeTitleText {
    switch (v.Outcome) {
      case 'model':
        return 'Ships — the model beats the flat guess';
      case 'keep-simple-baseline':
        return 'Ships — a simple baseline';
      case 'no-signal':
        return 'No signal — not usable';
      case null:
        return 'Not evaluated yet';
    }
  }

  /** How a shipped member is named in copy: an existing heuristic rule by its own name, any other member as stored. */
  public static MemberLabel(member: string): string {
    return member.startsWith(GateRules.HeuristicPrefix) ? `the existing rule "${member.slice(GateRules.HeuristicPrefix.length)}"` : member;
  }

  /** The entity the trust numbers are read from: the training run that stores the gate decision. */
  public static readonly RunEntityName = 'MJ: ML Training Runs';

  /**
   * "Checked against N past members it had never seen." — never fabricates a number. The count is named, and returned
   * as a traced number (`$.gate.holdoutRows` of `runId`), only when `runId` is a non-empty string and `count` is a
   * positive finite number; otherwise the line names no count and returns no number.
   */
  public static TrustEvidenceLine(opts?: TrustEvidenceOptions): TrustEvidence {
    const noun = opts?.noun?.trim() || 'records';
    const count = opts?.count;
    const runId = opts?.runId;
    if (typeof runId === 'string' && runId.length > 0 && typeof count === 'number' && Number.isFinite(count) && count > 0) {
      const n = TrustVerdicts.traced(runId, '$.gate.holdoutRows', count, Math.round(count).toLocaleString('en-US'));
      return { Text: `Checked against ${n.Text} past ${noun} it had never seen.`, Numbers: [n] };
    }
    return { Text: `Checked against past ${noun} it had never seen.`, Numbers: [] };
  }

  /**
   * The three numbers of a shipped verdict's headline (value, lower, upper of its comparison with the flat guess, as
   * {@link GateRules.FormatFourDecimals} renders them), each traced to the stored interval in `runId`'s results:
   * `$.gate.intervals.modelVsDummy` for a shipped model, `$.gate.intervals.memberVsDummy["<member>"]` for a kept simple
   * baseline. Empty for a verdict without a comparison.
   */
  public static ComparisonNumbers(verdict: TrustVerdict, runId: string): readonly TracedNumber[] {
    const c = verdict.Comparison;
    if (c === null || verdict.Outcome === null || verdict.Outcome === 'no-signal') return [];
    const base = verdict.Outcome === 'model' ? '$.gate.intervals.modelVsDummy' : `$.gate.intervals.memberVsDummy[${JSON.stringify(c.Shipped)}]`;
    return TrustVerdicts.intervalNumbers(runId, base, { value: c.Value, lower: c.Lower, upper: c.Upper });
  }

  /**
   * The numbers the stored reason text (`gate.reason.text`) quotes, each traced to the stored field it was generated
   * from (the intervals its reason code names, or the guard refusal's counts and bounds) and kept only when its token
   * appears in the text. The gate's reason copy ({@link GateRules.DescribeGate}) names its constants in words (the
   * coin-flip level, the margin), so every number a reason quotes is one of these.
   */
  public static ReasonNumbers(record: StoredGateRecord, runId: string): readonly TracedNumber[] {
    const tokens = new Set(record.reason.text.match(TrustVerdicts.numericToken) || []);
    return TrustVerdicts.reasonCandidates(record, runId).filter((n) => tokens.has(n.Text));
  }

  /**
   * {@link ReasonNumbers} of the gate record `validationResults` stores (the `MJ: ML Training Runs` row `runId`): the
   * numbers a verdict's `Reason` quotes. Empty when the run stores no gate decision (the not-evaluated reason quotes none).
   */
  public static StoredReasonNumbers(validationResults: string | null, runId: string): readonly TracedNumber[] {
    const stored = TrustVerdicts.readStored({ ValidationResults: validationResults, Lineage: null });
    return stored === null ? [] : TrustVerdicts.ReasonNumbers(stored.Gate, runId);
  }

  /** A number as copy renders it: an optional sign, digits with thousands separators, an optional fraction. */
  private static readonly numericToken = /-?\d[\d,]*(?:\.\d+)?/g;

  /** Every number a reason of this record's code is generated from. */
  private static reasonCandidates(record: StoredGateRecord, runId: string): TracedNumber[] {
    const iv = record.intervals;
    const refusal = record.guardRefusal;
    if (refusal !== null) {
      switch (refusal.kind) {
        case 'minority-class-below-minimum':
          return [
            TrustVerdicts.traced(runId, '$.gate.guardRefusal.rows', refusal.rows, String(refusal.rows)),
            TrustVerdicts.traced(runId, '$.gate.guardRefusal.minimum', refusal.minimum, String(refusal.minimum)),
          ];
        case 'auc-interval-contains-chance':
          return [
            TrustVerdicts.traced(runId, '$.gate.guardRefusal.lower', refusal.lower, GateRules.FormatFourDecimals(refusal.lower)),
            TrustVerdicts.traced(runId, '$.gate.guardRefusal.upper', refusal.upper, GateRules.FormatFourDecimals(refusal.upper)),
          ];
        case 'auc-interval-missing':
          return [];
      }
    }
    const shipped = record.decision.shipped;
    const member = shipped === null ? undefined : iv.memberVsDummy[shipped];
    const memberNumbers = shipped === null || member === undefined ? [] : TrustVerdicts.intervalNumbers(runId, `$.gate.intervals.memberVsDummy[${JSON.stringify(shipped)}]`, member);
    const bestNumbers = iv.modelVsBestSimple === null ? [] : TrustVerdicts.intervalNumbers(runId, '$.gate.intervals.modelVsBestSimple', iv.modelVsBestSimple);
    const modelNumbers = TrustVerdicts.intervalNumbers(runId, '$.gate.intervals.modelVsDummy', iv.modelVsDummy);
    return record.decision.outcome === 'keep-simple-baseline' ? memberNumbers : [...modelNumbers, ...bestNumbers];
  }

  /** A stored interval's value, lower and upper bound at `base`, rendered with four decimals. */
  private static intervalNumbers(runId: string, base: string, iv: StoredInterval): TracedNumber[] {
    return [
      TrustVerdicts.traced(runId, `${base}.value`, iv.value, GateRules.FormatFourDecimals(iv.value)),
      TrustVerdicts.traced(runId, `${base}.lower`, iv.lower, GateRules.FormatFourDecimals(iv.lower)),
      TrustVerdicts.traced(runId, `${base}.upper`, iv.upper, GateRules.FormatFourDecimals(iv.upper)),
    ];
  }

  /** A number read from the training run's stored results at `path`. */
  private static traced(runId: string, path: string, value: number, text: string): TracedNumber {
    return { Value: value, Text: text, Source: { EntityName: TrustVerdicts.RunEntityName, RecordID: runId, Path: path } };
  }

  /** The completed envelope's gate record and trainer request, or null when the run stores no decision. */
  private static readStored(input: TrustInput): StoredDecision | null {
    if (input.ValidationResults === null || input.ValidationResults.trim().length === 0) return null;
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(input.ValidationResults);
    if (!parsed.Ok || parsed.Value.status !== 'completed' || parsed.Value.gate === null) return null;
    return { Gate: parsed.Value.gate, Request: parsed.Value.trainerRequest, Lineage: input.Lineage };
  }

  /** The verdict of a shipped artifact (the model or a kept simple baseline), quoting its comparison with the flat guess. */
  private static shippedVerdict(stored: StoredDecision, outcome: 'model' | 'keep-simple-baseline', shipped: string, iv: StoredInterval): TrustVerdict {
    const record = stored.Gate;
    const metric = record.primaryMetric;
    const by = GateRules.FormatInterval(iv);
    return {
      Kind: 'evaluated',
      Outcome: outcome,
      CanAct: true,
      Headline: outcome === 'model' ? `Beats the flat guess by ${by} (${metric}).` : TrustVerdicts.keptHeadline(stored, shipped, by, metric),
      Reason: record.reason.text,
      Comparison: { Against: 'the flat guess', Shipped: shipped, Value: iv.value, Lower: iv.lower, Upper: iv.upper, Metric: metric },
      HoldoutRows: record.holdoutRows,
    };
  }

  /**
   * The headline of a kept simple baseline. When the trained model is that same baseline, no comparison between them
   * happened, so the copy does not claim the trained model lost to it.
   */
  private static keptHeadline(stored: StoredDecision, shipped: string, by: string, metric: MetricKey): string {
    const kept = `A simple baseline (${TrustVerdicts.MemberLabel(shipped)}) beats the flat guess by ${by} (${metric})`;
    return TrustVerdicts.modelIsKeptMember(stored, shipped) ? `${kept}.` : `${kept}; the trained model did not beat it.`;
  }

  /**
   * Whether the trained model is the kept member itself: the stored intervals name it as the delivered member; or the
   * trained finalist and the kept member share a driver (the finalist's from the stored trainer request, the member's
   * from the model's lineage); or the model's comparison with the best simple member is exactly 0 [0, 0] and that member
   * is the kept one.
   */
  private static modelIsKeptMember(stored: StoredDecision, shipped: string): boolean {
    const iv = stored.Gate.intervals;
    if (iv.deliveredMember === shipped) return true;
    if (TrustVerdicts.sharesDriver(stored, shipped)) return true;
    const vsBest = iv.modelVsBestSimple;
    if (vsBest === null || vsBest.value !== 0 || vsBest.lower !== 0 || vsBest.upper !== 0) return false;
    return GateRules.BestSimpleMember(iv.memberScores) === shipped;
  }

  /**
   * Whether the finalist candidate and the kept member are fitted with the same driver. False when either driver is not
   * stored: a finalist that is not a named candidate, a request not stored, or a lineage that names another member.
   */
  private static sharesDriver(stored: StoredDecision, shipped: string): boolean {
    const finalist = stored.Gate.intervals.modelName;
    const finalistDriver = stored.Request === null ? undefined : stored.Request.candidates.find((c) => c.name === finalist)?.driverKey;
    if (finalistDriver === undefined) return false;
    return TrustVerdicts.shippedDriverOf(stored.Lineage, shipped) === finalistDriver;
  }

  /** The `shippedDriver` a model lineage records for `member`; null when the lineage is absent, unreadable or names another member. */
  private static shippedDriverOf(lineageJson: string | null, member: string): string | null {
    const parsed = JsonParse.ParseJsonText(lineageJson, 'Lineage');
    if (!parsed.Ok || !JsonParse.IsJsonObject(parsed.Value)) return null;
    return JsonParse.JsonString(parsed.Value, 'shippedMember') === member ? JsonParse.JsonString(parsed.Value, 'shippedDriver') : null;
  }
}
