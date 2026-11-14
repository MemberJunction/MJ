/**
 * @module governance-contracts
 *
 * C8 — governance, ported from the target-design contracts (`reference/contracts/contracts.ts` L1178-L1226) with
 * PR 4's deltas (§5.2). The evidence an approver or the automated gate was shown is a stored shape (the `Evidence`
 * column of `MJ: ML Model Publish Records`) and keeps the contract's camelCase; a sign-off and the pre-publication
 * semantics check never leave the process and are PascalCase (D-054, the M1 tier upgrade's classification).
 *
 * Only a human can sign off (`SignOff.Approver` is a `HumanActor`); the gate itself approves an automatic publish
 * (D-029), so a sign-off is optional and required only when the pinned protocol sets `requiresHumanSignOff` or a user
 * overrides leakage flags.
 */
import type { MetricWithInterval } from './evaluation-protocol';
import type { GateDecision, PairedComparison } from './gate';
import type { HumanActor } from './prediction-unit';
import type { OutputSemantics } from './registry-contracts';
import type { LeakageFlag } from './trainer-contract';

/** What the approver (or the automated gate) was shown, built server-side from stored rows at signing or publish. */
export interface EvidenceSnapshot {
  readonly holdoutPrimary: MetricWithInterval;  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  readonly comparisons: Readonly<Record<string, PairedComparison>>;  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  readonly gate: GateDecision;  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  readonly leakageFlags: readonly LeakageFlag[];  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  /** The training data window, as ISO dates (yyyy-mm-dd). */
  readonly dataWindow: { readonly from: string; readonly to: string };  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
  readonly snapshotHash: string;  // case-violation-ok-legacy-back-compat: stored publish-record Evidence JSON key
}

/**
 * A human sign-off: the `kind: 'sign-off'` view of a `MJ: ML Model Publish Records` row. The approver type is
 * `HumanActor`, so an agent cannot produce one (C1.1). A sign-off over leakage flags names each flag it overrides and
 * carries a non-empty reason.
 */
export interface SignOff {
  readonly ID: string;
  readonly ModelID: string;
  readonly Approver: HumanActor;
  /** ISO instant. */
  readonly SignedAt: string;
  readonly Decision: 'approve' | 'reject';
  readonly Reason: string;
  readonly Evidence: EvidenceSnapshot;
  readonly OverridesFlags: readonly LeakageFlag['kind'][];
}

/** One dashboard surface's output binding (a `MJ: ML Output Bindings` row), as the semantics check reads it. */
export interface SemanticsCheckBinding {
  readonly BindingID: string;
  readonly Surface: 'at-risk-list' | 'why-badge' | 'predictions-grid' | 'record-panel';
  readonly SortsBy: 'adverse-probability-desc' | 'score-desc' | 'score-asc' | 'none';
  readonly DriverDirectionRelativeTo: 'adverse-class' | 'raw-contribution';
  readonly Label: string;
}

/**
 * Checked before publication: the UI's lists and labels agree with the model's declared semantics (S9.5). The bindings
 * are not self-declared by whoever publishes: they are the `MJ: ML Output Bindings` rows each surface reads at render
 * time, so checking the rows checks what renders.
 */
export interface SemanticsCheck {
  readonly ModelID: string;
  readonly Semantics: OutputSemantics;
  readonly BindingSource: 'MJ: ML Output Bindings';
  readonly UIBindings: readonly SemanticsCheckBinding[];
  readonly Result: { readonly Status: 'passed' } | { readonly Status: 'failed'; readonly Mismatches: readonly string[] };
}
