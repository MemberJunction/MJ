/**
 * @module gate
 *
 * The publishing gate's types: which branch of the decision table a run took, a paired comparison of two losses on
 * the same holdout rows, and the decision itself. The trainer contract needs them for `TrainerResult.gate` and
 * `TrainerResult.comparisons`; the gate's inputs and decision rules join these types in this file.
 */

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
