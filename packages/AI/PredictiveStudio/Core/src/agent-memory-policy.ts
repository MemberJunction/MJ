/**
 * @module agent-memory-policy
 *
 * The Predictive Studio agents' memory policy (PR 5, A5; design §5.1.4, D5-4, D5-11):
 *
 * - {@link AgentMemoryPolicy} — what a PS-agent note must satisfy to be saved and to be injected: notes come only from
 *   runs whose model is `Published` and unflagged, only `Active` notes are injected, activation is an automated rule
 *   (no person reviews notes, D5-11) and a note is scoped to a user or a company.
 * - {@link NoteRefusal} — why the Engine's `PreSave` hook refused a note save: one variant per rule.
 *
 * The framework's run tainting (`isRunTainted`) stays as it is for every agent; this policy covers what it does not (a
 * PS run calls only Trusted PS Actions, so it is never tainted, §3.4).
 *
 * Members are camelCase: they are the program contract's JSON shape (D-039), as the other PS contracts are.
 */

/** The memory policy every Predictive Studio agent note follows, whoever saves it (D5-11). */
export interface AgentMemoryPolicy {
  /** A note is accepted only from a run tree whose model is `Published` with a publish record and has no leakage flags. */
  readonly acceptNotesFrom: 'published-unflagged-runs';  // case-violation-ok-legacy-back-compat: program contract JSON member (D-039)
  /** The only status the framework injects a PS-agent note in (PS notes are never `Provisional`). */
  readonly injectStatus: 'Active';  // case-violation-ok-legacy-back-compat: program contract JSON member (D-039)
  /** `Pending → Active` happens only by the automated activation rule (the hook and the sweep), never by a reviewer. */
  readonly activation: 'automated-rule';  // case-violation-ok-legacy-back-compat: program contract JSON member (D-039)
  /** A note needs a non-NULL `UserID` or `CompanyID` to be activated (and is archived without both). */
  readonly scope: 'user-or-company';  // case-violation-ok-legacy-back-compat: program contract JSON member (D-039)
}

/** The policy's one value (D5-11). */
export const PREDICTIVE_STUDIO_AGENT_MEMORY_POLICY: AgentMemoryPolicy = {
  acceptNotesFrom: 'published-unflagged-runs',
  injectStatus: 'Active',
  activation: 'automated-rule',
  scope: 'user-or-company',
};

/** Why a note's source run tree does not qualify (`acceptNotesFrom`). */
export type NoteSourceRefusalReason = 'leakage-flagged' | 'build-failed' | 'not-published';

/**
 * Why a PS-agent note save was refused (§5.1.4). `TNoteStatus` is the `Status` union of `MJ: AI Agent Notes`: this
 * package has no entity dependency, so the Engine binds it to the generated field's type
 * (`MJAIAgentNoteEntity['Status']`), never a widened string (as `BuildApprovalRefusal`, D5-A2-3).
 */
export type NoteRefusal<TNoteStatus extends string> =
  /** A new PS-agent note was saved with a status other than `Pending`. */
  | { readonly kind: 'pending-only-on-create'; readonly status: TNoteStatus }  // case-violation-ok-legacy-back-compat: contract refusal JSON
  /** The note's source run tree links to a flagged model, a failed build or a model that is not Published. */
  | { readonly kind: 'source-not-qualifying'; readonly reason: NoteSourceRefusalReason }  // case-violation-ok-legacy-back-compat: contract refusal JSON
  /** A save made the note `Active` (or changed an `Active` note's source or scope) while the activation rule fails. */
  | { readonly kind: 'activation-rule-failed'; readonly reason: string }  // case-violation-ok-legacy-back-compat: contract refusal JSON
  /** `Provisional` is never accepted for a PS-agent note. */
  | { readonly kind: 'provisional-refused' };  // case-violation-ok-legacy-back-compat: contract refusal JSON
