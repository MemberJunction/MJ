/**
 * @module agent-contracts
 *
 * The Model Development Agent's control-path contracts (PR 5, A2; design §5.1, D-090, D5-25):
 *
 * - {@link BuildApproval} — a person's structured approval of one presented plan, resolved from the
 *   `MJ: AI Agent Requests` row the orchestrator's Plan step raised. Ported from the program contract without the unit
 *   and protocol refs (they do not exist before the build creates them, D5-25) and with the plan hash and the request.
 * - {@link BuildApprovalRefusal} — why no approval holds: one variant per D-090 rule, plus consumption.
 * - {@link AgentControlState} — the orchestrator's states; {@link AgentDecisionKind} — the nine decision-log values
 *   (§5.1.6).
 *
 * Members are camelCase: they are persisted JSON (claim and decision rows, D-039), as the other PS contracts are.
 */
import type { GuardField } from './evaluation-protocol-rules';
import type { HumanActor } from './prediction-unit';

/** A person's approval of one presented plan; the only thing that starts an agent build (D-090). */
export interface BuildApproval {
  /** The presented plan's id (the payload's `PlanId`, written by the control path when it presents the plan). */
  readonly planId: string;  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
  /** SHA-256 (hex) of the canonical plan payload that was presented and approved. */
  readonly planHash: string;  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
  /** The person whose own save answered the request. */
  readonly approvedBy: HumanActor;  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
  /** The conversation turn that carried the approval, when there is one (a dashboard answer has none). */
  readonly conversationDetailId: string | null;  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
  /** When the request was answered (ISO 8601). */
  readonly approvedAt: string;  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
  /** The `MJ: AI Agent Requests` row that was answered. */
  readonly requestId: string;  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
}

/** The entities a responder must be able to create rows of to start a build (D-090 rule 4; PR 4's D4-283 shape). */
export type BuildApprovalPermissionEntity = 'MJ: ML Training Pipelines' | 'MJ: ML Models';

/**
 * Why no {@link BuildApproval} holds (§5.1.1). `TRequestStatus` is the `Status` union of `MJ: AI Agent Requests`: this
 * package has no entity dependency, so the Engine binds it to the generated field's type
 * (`MJAIAgentRequestEntity['Status']`), never a widened string.
 */
export type BuildApprovalRefusal<TRequestStatus extends string> =
  /** The session has no request for its plan. */
  | { readonly kind: 'no-request' }  // case-violation-ok-legacy-back-compat: persisted refusal JSON discriminant
  /** Rule 1: the newest request was not raised by the session's own orchestrator Plan step. */
  | { readonly kind: 'not-agent-created'; readonly requestId: string }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** Rule 2: the request was not created `Requested` and answered by a separate save. */
  | { readonly kind: 'not-two-step'; readonly requestId: string }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** The request is not `Approved`. */
  | { readonly kind: 'not-approved'; readonly status: TRequestStatus }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** Rule 3: the answering save was not the session person's own (an API key, the system user, an agent run, another user). */
  | { readonly kind: 'not-human'; readonly userId: string }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** Rule 4: the responder may not create pipelines or models. */
  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  | { readonly kind: 'responder-not-permitted'; readonly userId: string; readonly entity: BuildApprovalPermissionEntity }
  /** Rule 5: the plan changed after it was presented. */
  | { readonly kind: 'plan-changed'; readonly approvedHash: string; readonly currentHash: string }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** Rule 5: the plan card was edited before approving (feedback for a re-plan, not an approval). */
  | { readonly kind: 'plan-edited'; readonly requestId: string }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** The approval was already claimed by a build (whatever that build did). */
  | { readonly kind: 'consumed'; readonly claimId: string };  // case-violation-ok-legacy-back-compat: persisted refusal JSON

/** The orchestrator's states (§5.1). */
export type AgentControlState =
  | 'gather'
  | 'draft-unit'
  | 'profile'
  | 'draft-protocol'
  | 'validate-plan'
  | 'present-plan'
  | 'request-build'
  | 'report';

/** The nine `Decision` values of `MJ: Agent Decision Log` (§5.1.6). */
export type AgentDecisionKind =
  | 'profile'
  | 'draft-unit'
  | 'draft-protocol'
  | 'present-plan'
  | 'request-build'
  | 'report'
  | 'decline-no-signal'
  | 'decline-small-data'
  | 'decline-unresolved-reference';

/** Telling an approval from a refusal. */
export class BuildApprovals {
  /** True when `value` is a {@link BuildApproval} (a refusal carries `kind`; an approval carries `requestId` and no `kind`). */
  public static IsApproval<TRequestStatus extends string>(value: BuildApproval | BuildApprovalRefusal<TRequestStatus> | null): value is BuildApproval {
    return value !== null && !('kind' in value) && typeof value.requestId === 'string' && value.requestId !== '';
  }
}

/** A name a plan or a draft presents that the passed provider's metadata does not resolve (PR 5, A3; F-PIT-8). */
export interface UnresolvedReference {
  /** Where the name sits in the plan payload (`TargetDefinition.EntityName`, `CandidateFeatures[0].Name`, …). */
  readonly path: string;  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
  /** The name as written. */
  readonly name: string;  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
  /** What the name should have named. */
  readonly kind: 'entity' | 'field' | 'query' | 'feature-pipeline';  // case-violation-ok-legacy-back-compat: persisted contract JSON member (D-039)
}

/**
 * Why a draft Action returned no draft (PR 5, A3). The first four variants are the contract's; `draft-invalid` carries
 * the PR 3 parser's or protocol rules' problems with a draft whose names all resolve (D5-A3-2).
 */
export type DraftRefusal =
  /** A name the draft uses does not resolve, or a date field is not a date. */
  | { readonly kind: 'unresolved-reference'; readonly references: readonly UnresolvedReference[] }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** An agent tool call set guard fields (PR 3's `GuardFieldsEditableBy = 'non-agent'` rule). */
  | { readonly kind: 'guard-field-edited-by-disallowed-author'; readonly fields: readonly GuardField[] }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** A unit with a label window names no censoring rule. */
  | { readonly kind: 'censoring-required' }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** A read would have reached holdout rows. */
  | { readonly kind: 'holdout-read' }  // case-violation-ok-legacy-back-compat: persisted refusal JSON
  /** The draft's names resolve but PR 3's validation refuses it (the problems, in words). */
  | { readonly kind: 'draft-invalid'; readonly problems: readonly string[] };  // case-violation-ok-legacy-back-compat: persisted refusal JSON
