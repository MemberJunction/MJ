/**
 * @module gate
 *
 * The publishing gate: which branch of the decision table a run took, a paired comparison of two losses on the same
 * holdout rows, the decision itself, and the rules that compute it. `GateRules.DecideGate` is a line-for-line
 * transcription of the reference pipeline's gate and of the sidecar's `app/gate.py`; the two guards, member names,
 * stored intervals and the reason in words sit beside it so the transcription stays exact.
 */

import type { BaselineSpec, Interval, MetricKey, NonNegative } from './evaluation-protocol';
import type { TaskKind } from './task-type';
import type { TrainerCompleted } from './trainer-contract';

/** The branch of the decision table a run took: (a) a model ships, (b) the best simple baseline ships, (c) nothing ships. */
export type GateBranch = 'a:beats-best-simple' | 'a:Q15-only-model-beats-dummy' | 'b:keep-simple-baseline' | 'c:no-signal';

/** A paired comparison of two scorers' losses on the same holdout rows. */
export interface PairedComparison {
  /** Mean of (base loss − candidate loss); positive favours the candidate. */
  readonly value: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The interval on `value` at the protocol's lower-bound level. */
  readonly ci: readonly [number, number];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** True when ci[0] > the protocol's margin. */
  readonly beats: boolean;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** The gate's decision: what ships (a model, the best simple baseline, or nothing) and the branch that decided it. */
export type GateDecision =
  | {
      readonly outcome: 'model';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly branch: 'a:beats-best-simple' | 'a:Q15-only-model-beats-dummy';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly shipped: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly shippedRole: 'model';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly note: 'no simple baseline carries demonstrable signal' | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    }
  | {
      readonly outcome: 'keep-simple-baseline';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly branch: 'b:keep-simple-baseline';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly shipped: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly shippedRole: 'simpleBaseline';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly note: null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    }
  | {
      readonly outcome: 'no-signal';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly branch: 'c:no-signal';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly shipped: null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly shippedRole: null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly note: null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    };

/**
 * The decision table's inputs. Each boolean is "the comparison's lower bound is above the protocol's margin"
 * ({@link GateRules.BeatsByMargin}). The member names match the sidecar's gate inputs, which the parity tests compare.
 */
export interface GateInputs {
  readonly modelName: string;  // case-violation-ok-legacy-back-compat: gate parity wire name
  readonly modelBeatsDummy: boolean;  // case-violation-ok-legacy-back-compat: gate parity wire name
  readonly modelBeatsBestSimple: boolean;  // case-violation-ok-legacy-back-compat: gate parity wire name
  readonly memberBeatsDummy: Readonly<Record<string, boolean>>;  // case-violation-ok-legacy-back-compat: gate parity wire name
  readonly memberScores: Readonly<Record<string, number>>;  // case-violation-ok-legacy-back-compat: gate parity wire name
  readonly deliveredMember: string | null;  // case-violation-ok-legacy-back-compat: gate parity wire name
}

/** Mean and 95% bounds of (comparator loss − candidate loss) on the same holdout rows; positive favours the candidate. */
export interface StoredInterval {
  readonly value: number;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly lower: number;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly upper: number;  // case-violation-ok-legacy-back-compat: stored gate record key
}

/**
 * What a training run stores for the gate: the paired intervals, never the booleans derived from them, so the decision
 * can be re-derived at any margin.
 */
export interface StoredGateIntervals {
  readonly modelName: string;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly modelVsDummy: StoredInterval;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** The model against the simple member with the lowest holdout score; null when the run has no simple member. */
  readonly modelVsBestSimple: StoredInterval | null;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly memberVsDummy: Readonly<Record<string, StoredInterval>>;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly memberScores: Readonly<Record<string, number>>;  // case-violation-ok-legacy-back-compat: stored gate record key
  readonly deliveredMember: string | null;  // case-violation-ok-legacy-back-compat: stored gate record key
}

// -------------------------------------------------------------------------------- guards (outside the table) --

/** What the two guards read; stored with the decision so publish re-verification can re-run them. */
export interface GateGuardInputs {
  readonly taskKind: TaskKind;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** Holdout rows per class (classification); null for other tasks. From the run's carve. */
  readonly holdoutClassCounts: Readonly<Record<string, number>> | null;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** The finalist's holdout AUC interval (binary); null when the trainer did not report one. */
  readonly modelAucInterval: Interval | null;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** The protocol's `MinMinorityClassRows` (default 20). */
  readonly minMinorityClassRows: number;  // case-violation-ok-legacy-back-compat: stored gate record key
}

/** Why a guard downgraded the transcribed decision to no-signal. */
export type GateGuardRefusal =
  | { readonly kind: 'minority-class-below-minimum'; readonly classLabel: string; readonly rows: number; readonly minimum: number }  // case-violation-ok-legacy-back-compat: stored gate record key
  | { readonly kind: 'auc-interval-contains-chance'; readonly lower: number; readonly upper: number }  // case-violation-ok-legacy-back-compat: stored gate record key
  | { readonly kind: 'auc-interval-missing' };  // case-violation-ok-legacy-back-compat: stored gate record key

/** The transcribed decision, the stored (guarded) decision, and the guard that refused, if any. */
export interface GuardedGateDecision {
  /** `GateRules.DecideGate`'s output, unchanged (what the parity tests prove and what the sidecar must agree with). */
  readonly Transcribed: GateDecision;
  /** The stored decision: the transcription, or no-signal when a guard refused. */
  readonly Decision: GateDecision;
  readonly GuardRefusal: GateGuardRefusal | null;
}

// ------------------------------------------------------------------- from a trainer result to stored intervals --

/**
 * The trainer-result fields the gate and the run's stored gate record read. The gate itself reads `finalist`, `baselines`
 * and `comparisons`; the rest (`holdout`, `gate`, `slices`, `incumbentDiff`, `operatingPoint`) are carried for storing
 * the run's gate record. Satisfied by the live `TrainerCompleted` and by the stored `StoredTrainerResult`.
 */
export type CompletedTrainerResult = Pick<TrainerCompleted, 'finalist' | 'baselines' | 'comparisons' | 'holdout' | 'gate' | 'slices' | 'incumbentDiff' | 'operatingPoint'>;

/** The stored intervals read from a trainer result, or the comparison key the result lacks. */
export type IntervalsFromResult =
  | { readonly Ok: true; readonly Intervals: StoredGateIntervals }
  | { readonly Ok: false; readonly MissingComparison: string };

// -------------------------------------------------------------------------------------------- the reason --

/**
 * Why the stored decision came out as it did: one code per decision-table branch (with the keep-simple branch split
 * into a simple baseline or the unit's existing heuristic rule), and one per guard refusal.
 */
export type GateReasonCode =
  | 'model-beats-best-simple'
  | 'only-model-beats-dummy'
  | 'simple-baseline-carries-signal'
  | 'heuristic-carries-signal'
  | 'nothing-beats-dummy'
  | 'minority-class-below-minimum'
  | 'auc-interval-contains-chance'
  | 'auc-interval-missing';

/** The stored decision's reason, in words. */
export interface GateReason {
  readonly code: GateReasonCode;  // case-violation-ok-legacy-back-compat: stored gate record key
  /** One or two plain sentences generated from the stored numbers (never typed by hand). */
  readonly text: string;  // case-violation-ok-legacy-back-compat: stored gate record key
}

/**
 * The gate: the transcribed decision table (`BeatsByMargin`, `GateInputsFromIntervals`, `DecideGate`), the stored
 * decision with its guards (`DecideGuardedGate`), member names, stored intervals, the reason in words, and the shared
 * interval text format — static members on one owner, with no free-function aliases.
 */
export class GateRules {
  private static readonly noSignal: GateDecision = { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null };
  private static readonly heuristicPrefix = 'heuristic:';

  /** "Beats" = the comparison's lower bound is strictly above the margin (a bound equal to the margin does not beat). */
  public static BeatsByMargin(iv: StoredInterval, margin: NonNegative): boolean {
    return iv.lower > margin;
  }

  /** The decision table's inputs from stored intervals at the protocol's margin. */
  public static GateInputsFromIntervals(iv: StoredGateIntervals, margin: NonNegative): GateInputs {
    const memberBeatsDummy: Record<string, boolean> = {};
    for (const [member, interval] of Object.entries(iv.memberVsDummy)) {
      memberBeatsDummy[member] = GateRules.BeatsByMargin(interval, margin);
    }
    return {
      modelName: iv.modelName,
      modelBeatsDummy: GateRules.BeatsByMargin(iv.modelVsDummy, margin),
      modelBeatsBestSimple: iv.modelVsBestSimple !== null && GateRules.BeatsByMargin(iv.modelVsBestSimple, margin),
      memberBeatsDummy,
      memberScores: iv.memberScores,
      deliveredMember: iv.deliveredMember,
    };
  }

  /**
   * The decision table, a line-for-line transcription of the reference pipeline's `gate_decision` and of the sidecar's
   * `app/gate.py`: (a) the model ships when it beats the dummy and the best simple member (and is not itself a simple
   * member), or when it beats the dummy and no simple member does; (b) otherwise the eligible simple member with the
   * lowest score ships; (c) otherwise nothing ships. Do not edit this or either copy without running the gate parity
   * tests.
   */
  public static DecideGate(i: GateInputs): GateDecision {
    const eligible = Object.keys(i.memberBeatsDummy).sort().filter((k) => i.memberBeatsDummy[k] === true);
    if (i.deliveredMember === null && i.modelBeatsDummy && i.modelBeatsBestSimple) {
      return { outcome: 'model', branch: 'a:beats-best-simple', shipped: i.modelName, shippedRole: 'model', note: null };
    }
    if (i.modelBeatsDummy && eligible.length === 0) {
      return {
        outcome: 'model',
        branch: 'a:Q15-only-model-beats-dummy',
        shipped: i.modelName,
        shippedRole: 'model',
        note: 'no simple baseline carries demonstrable signal',
      };
    }
    const first = eligible[0];
    if (first !== undefined) {
      const best = eligible.reduce<string>((acc, k) => {
        // `??` on purpose: a score of 0 is a real (perfect) loss; only a member with no score falls back to +Infinity.
        const a = i.memberScores[acc] ?? Number.POSITIVE_INFINITY;
        const b = i.memberScores[k] ?? Number.POSITIVE_INFINITY;
        // The `k < acc` tie-break is kept because the reference has it, but it cannot change the result: `eligible` is
        // already in name order, so a later `k` is never below `acc` and a tie keeps the first name either way.
        return b < a || (b === a && k < acc) ? k : acc;
      }, first);
      return { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: best, shippedRole: 'simpleBaseline', note: null };
    }
    return { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null };
  }

  /** The stored decision: the transcribed table over the stored intervals, then the two guards. */
  public static DecideGuardedGate(intervals: StoredGateIntervals, margin: NonNegative, guards: GateGuardInputs): GuardedGateDecision {
    return GateRules.ApplyGateGuards(GateRules.DecideGate(GateRules.GateInputsFromIntervals(intervals, margin)), guards);
  }

  /**
   * The two guards outside the transcribed table: the rarest holdout class must have at least `minMinorityClassRows`
   * rows (any outcome that ships), and a binary model whose holdout AUC interval contains 0.5 (or is missing) never
   * ships. Guards only ever downgrade to no-signal. Publish re-verification calls `DecideGuardedGate` with the stored
   * guard inputs, not `DecideGate`.
   *
   * The AUC guard reads the interval at the level the trainer reported it (0.95); it does not consult the protocol's
   * `promotion.lowerBoundLevel`. The rule is "contains 0.5": an interval wholly below 0.5 does not trigger it (such a
   * model would also have had to beat the dummy's loss by the margin to reach this point).
   */
  public static ApplyGateGuards(gate: GateDecision, guards: GateGuardInputs): GuardedGateDecision {
    if (gate.outcome === 'no-signal') return { Transcribed: gate, Decision: gate, GuardRefusal: null };
    const minority = GateRules.rarestClass(guards.holdoutClassCounts);
    if (minority !== null && minority.rows < guards.minMinorityClassRows) {
      return {
        Transcribed: gate,
        Decision: GateRules.noSignal,
        GuardRefusal: { kind: 'minority-class-below-minimum', classLabel: minority.label, rows: minority.rows, minimum: guards.minMinorityClassRows },
      };
    }
    if (gate.outcome === 'model' && guards.taskKind === 'binary') {
      const auc = guards.modelAucInterval;
      if (auc === null) return { Transcribed: gate, Decision: GateRules.noSignal, GuardRefusal: { kind: 'auc-interval-missing' } };
      if (auc.lower <= 0.5 && auc.upper >= 0.5) {
        return { Transcribed: gate, Decision: GateRules.noSignal, GuardRefusal: { kind: 'auc-interval-contains-chance', lower: auc.lower, upper: auc.upper } };
      }
    }
    return { Transcribed: gate, Decision: gate, GuardRefusal: null };
  }

  /** True when outcome, branch and shipped member are equal (what the sidecar-versus-TypeScript check compares). */
  public static SameGate(a: GateDecision, b: GateDecision): boolean {
    return a.outcome === b.outcome && a.branch === b.branch && a.shipped === b.shipped;
  }

  /** The comparison-key name of a baseline (the sidecar's `baselines.py` uses the same strings). */
  public static BaselineMemberName(spec: BaselineSpec): string {
    switch (spec.kind) {
      case 'dummy':
        return 'dummy';
      case 'one-feature':
        return 'oneFeature';
      case 'glm':
        return 'glm';
      case 'naive':
        return 'naive';
      case 'seasonal-naive':
        return 'seasonalNaive';
      case 'incumbent-heuristic':
        return `${GateRules.heuristicPrefix}${spec.name}`;
    }
  }

  /**
   * The intervals the run stores, read from the trainer's paired comparisons (`modelVsDummy`, `<member>VsDummy`,
   * `modelVs:<member>`, as the sidecar keys them). Returns the first missing key instead of guessing.
   *
   * The delivered member is the finalist's name when that name is a simple member's key, else null. Candidate names can
   * never be member names (the sidecar refuses reserved names), so a live run stores null — including where the sidecar
   * passes `glm` as the delivered member for an untuned GLM finalist. The decision is the same either way: that
   * finalist's predictions are the GLM's, so `modelVs:glm` is 0 [0, 0] and the model cannot beat the best simple member.
   */
  public static StoredGateIntervalsFromResult(result: CompletedTrainerResult): IntervalsFromResult {
    const memberScores: Record<string, number> = {};
    const memberVsDummy: Record<string, StoredInterval> = {};
    for (const b of result.baselines) {
      if (b.role !== 'simple') continue;
      const name = GateRules.BaselineMemberName(b.baseline);
      const vsDummy = result.comparisons[`${name}VsDummy`];
      if (vsDummy === undefined) return { Ok: false, MissingComparison: `${name}VsDummy` };
      memberScores[name] = b.holdout.value;
      memberVsDummy[name] = GateRules.toStored(vsDummy);
    }
    const modelVsDummy = result.comparisons['modelVsDummy'];
    if (modelVsDummy === undefined) return { Ok: false, MissingComparison: 'modelVsDummy' };
    const best = GateRules.bestSimpleMember(memberScores);
    let modelVsBestSimple: StoredInterval | null = null;
    if (best !== null) {
      const vsBest = result.comparisons[`modelVs:${best}`];
      if (vsBest === undefined) return { Ok: false, MissingComparison: `modelVs:${best}` };
      modelVsBestSimple = GateRules.toStored(vsBest);
    }
    return {
      Ok: true,
      Intervals: {
        modelName: result.finalist,
        modelVsDummy: GateRules.toStored(modelVsDummy),
        modelVsBestSimple,
        memberVsDummy,
        memberScores,
        deliveredMember: Object.prototype.hasOwnProperty.call(memberScores, result.finalist) ? result.finalist : null,
      },
    };
  }

  /** The stored decision's reason in words, generated from the stored intervals; a guard refusal takes precedence. */
  public static DescribeGate(iv: StoredGateIntervals, guarded: GuardedGateDecision, metric: MetricKey): GateReason {
    const refusal = guarded.GuardRefusal;
    if (refusal !== null) return GateRules.describeRefusal(refusal);
    const d = guarded.Decision;
    switch (d.branch) {
      case 'a:beats-best-simple':
        return { code: 'model-beats-best-simple', text: `The model beats the flat guess by ${GateRules.formatOrUnreported(iv.modelVsDummy)} and the best simple baseline by ${GateRules.formatOrUnreported(iv.modelVsBestSimple)} (${metric}, lower is better).` };
      case 'a:Q15-only-model-beats-dummy':
        return { code: 'only-model-beats-dummy', text: `The model beats the flat guess by ${GateRules.formatOrUnreported(iv.modelVsDummy)} (${metric}); no simple baseline carries demonstrable signal.` };
      case 'b:keep-simple-baseline': {
        const shipped = d.shipped;
        const vsDummy = GateRules.formatOrUnreported(iv.memberVsDummy[shipped]);
        if (shipped.startsWith(GateRules.heuristicPrefix)) {
          return { code: 'heuristic-carries-signal', text: `The existing rule "${shipped.slice(GateRules.heuristicPrefix.length)}" beats the flat guess by ${vsDummy} (${metric}) and the model does not beat it by the margin: keep the rule.` };
        }
        return { code: 'simple-baseline-carries-signal', text: `The simple baseline ${shipped} beats the flat guess by ${vsDummy} (${metric}); the trained model does not beat it, so the simple baseline is kept.` };
      }
      case 'c:no-signal':
        return { code: 'nothing-beats-dummy', text: `Neither the model (${GateRules.formatOrUnreported(iv.modelVsDummy)}) nor any simple baseline beats the flat guess on ${metric}: no signal.` };
    }
  }

  /** A stored interval as `x [lo, hi]` with four decimals — the one format every gate and trust text uses. */
  public static FormatInterval(iv: StoredInterval): string {
    return `${GateRules.F4(iv.value)} [${GateRules.F4(iv.lower)}, ${GateRules.F4(iv.upper)}]`;
  }

  /** A number with four decimals (the gate's display precision). */
  public static F4(x: number): string {
    return x.toFixed(4);
  }

  private static describeRefusal(refusal: GateGuardRefusal): GateReason {
    switch (refusal.kind) {
      case 'minority-class-below-minimum':
        return { code: refusal.kind, text: `The test set has only ${refusal.rows} rows of "${refusal.classLabel}"; at least ${refusal.minimum} are needed to tell a model from chance, so nothing ships.` };
      case 'auc-interval-contains-chance':
        return { code: refusal.kind, text: `The model's AUC interval on the test set, [${GateRules.F4(refusal.lower)}, ${GateRules.F4(refusal.upper)}], contains 0.5 (a coin flip), so it does not ship.` };
      case 'auc-interval-missing':
        return { code: refusal.kind, text: 'The trainer reported no AUC interval for the model, so it cannot be shown to beat a coin flip; nothing ships.' };
    }
  }

  private static toStored(c: PairedComparison): StoredInterval {
    return { value: c.value, lower: c.ci[0], upper: c.ci[1] };
  }

  /** The lowest score, first in name order on a tie (the sidecar picks the best simple member the same way). */
  private static bestSimpleMember(scores: Readonly<Record<string, number>>): string | null {
    const best = GateRules.minByKeyOrder(scores);
    return best === null ? null : best.key;
  }

  /** The class with the fewest holdout rows, first in label order on a tie. */
  private static rarestClass(counts: Readonly<Record<string, number>> | null): { readonly label: string; readonly rows: number } | null {
    const rarest = counts === null ? null : GateRules.minByKeyOrder(counts);
    return rarest === null ? null : { label: rarest.key, rows: rarest.value };
  }

  /** The entry with the smallest value, the first key in code-unit order on a tie; null for an empty record. */
  private static minByKeyOrder(values: Readonly<Record<string, number>>): { readonly key: string; readonly value: number } | null {
    let min: { readonly key: string; readonly value: number } | null = null;
    for (const key of Object.keys(values).sort()) {
      const value = values[key];
      if (value !== undefined && (min === null || value < min.value)) min = { key, value };
    }
    return min;
  }

  private static formatOrUnreported(iv: StoredInterval | null | undefined): string {
    return iv === null || iv === undefined ? 'an unreported amount' : GateRules.FormatInterval(iv);
  }
}
