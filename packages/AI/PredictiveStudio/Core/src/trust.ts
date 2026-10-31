/**
 * @module trust
 *
 * The trust verdict is a **rendering** of the gate decision stored on the model's training run (the `gate` member of
 * `MJ: ML Training Runs.ValidationResults`). It grades nothing itself: no AUC or R² bands, no accuracy reading, no
 * in-sample metrics. A run without a stored decision is "not evaluated" and cannot be acted on. Every number in the
 * copy comes from the stored paired comparison ("beats the flat guess by X [lo, hi]"), formatted by the gate's one
 * formatter ({@link GateRules.FormatInterval}).
 *
 * It lives in Core (browser-safe, shared by the server engine, the UI and the agent) so one rule drives the business
 * catalog, the predictions workspace and the agent's builder.
 */
import type { GateOutcome, MetricKey } from './evaluation-protocol';
import { GateRules, type StoredInterval } from './gate';
import { GateRecords, type StoredGateRecord } from './run-evaluation';

/** What the verdict reads: the model's training run's stored results. */
export interface TrustInput {
  /** The model's training run's `ValidationResults` (the `ps-run-results/v2` envelope); null when there is none. */
  readonly ValidationResults: string | null;
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
}

/** The trust verdict and its copy helpers (static members on one owner). */
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

  /** How a stored member name marks an existing heuristic rule (the gate's member naming). */
  private static readonly heuristicPrefix = 'heuristic:';

  /** The verdict of a model: the stored gate decision of its training run rendered as plain copy. */
  public static DeriveTrustVerdict(input: TrustInput): TrustVerdict {
    const record = GateRecords.ParseStoredGateRecord(input.ValidationResults);
    if (record === null) return TrustVerdicts.notEvaluated;
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
        return TrustVerdicts.shippedVerdict(record, 'model', d.shipped, record.intervals.modelVsDummy);
      case 'keep-simple-baseline': {
        const iv = record.intervals.memberVsDummy[d.shipped];
        // a kept member without its own stored interval has no number to quote: never invent one
        if (iv === undefined) return TrustVerdicts.notEvaluated;
        return TrustVerdicts.shippedVerdict(record, 'keep-simple-baseline', d.shipped, iv);
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
    return member.startsWith(TrustVerdicts.heuristicPrefix) ? `the existing rule "${member.slice(TrustVerdicts.heuristicPrefix.length)}"` : member;
  }

  /** "Checked against N past members it had never seen." — never fabricates a number. */
  public static TrustEvidenceLine(opts?: TrustEvidenceOptions): string {
    const noun = opts?.noun?.trim() || 'records';
    const count = opts?.count;
    if (count !== null && count !== undefined && Number.isFinite(count) && count > 0) {
      return `Checked against ${Math.round(count).toLocaleString('en-US')} past ${noun} it had never seen.`;
    }
    return `Checked against past ${noun} it had never seen.`;
  }

  /** The verdict of a shipped artifact (the model or a kept simple baseline), quoting its comparison with the flat guess. */
  private static shippedVerdict(record: StoredGateRecord, outcome: 'model' | 'keep-simple-baseline', shipped: string, iv: StoredInterval): TrustVerdict {
    const metric = record.primaryMetric;
    const by = GateRules.FormatInterval(iv);
    return {
      Kind: 'evaluated',
      Outcome: outcome,
      CanAct: true,
      Headline: outcome === 'model' ? `Beats the flat guess by ${by} (${metric}).` : TrustVerdicts.keptHeadline(record, shipped, by, metric),
      Reason: record.reason.text,
      Comparison: { Against: 'the flat guess', Shipped: shipped, Value: iv.value, Lower: iv.lower, Upper: iv.upper, Metric: metric },
      HoldoutRows: record.holdoutRows,
    };
  }

  /**
   * The headline of a kept simple baseline. When the trained model is that same baseline, no comparison between them
   * happened, so the copy does not claim the trained model lost to it.
   */
  private static keptHeadline(record: StoredGateRecord, shipped: string, by: string, metric: MetricKey): string {
    const kept = `A simple baseline (${TrustVerdicts.MemberLabel(shipped)}) beats the flat guess by ${by} (${metric})`;
    return TrustVerdicts.modelIsKeptMember(record, shipped) ? `${kept}.` : `${kept}; the trained model did not beat it.`;
  }

  /**
   * Whether the trained model is the kept member itself: the stored intervals name it as the delivered member, or the
   * model's comparison with the best simple member is exactly 0 [0, 0] and that best member (lowest holdout score) is
   * the kept one.
   */
  private static modelIsKeptMember(record: StoredGateRecord, shipped: string): boolean {
    const iv = record.intervals;
    if (iv.deliveredMember === shipped) return true;
    const vsBest = iv.modelVsBestSimple;
    if (vsBest === null || vsBest.value !== 0 || vsBest.lower !== 0 || vsBest.upper !== 0) return false;
    const shippedScore = iv.memberScores[shipped];
    if (shippedScore === undefined) return false;
    return Object.values(iv.memberScores).every((score) => shippedScore <= score);
  }
}
