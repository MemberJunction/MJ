/**
 * Workspace-tab framework contract.
 *
 * A "workspace" is a screen where the user builds several drafts in parallel — each draft lives in
 * a tab (browser-tab semantics: open, switch, drag-reorder, close, dirty-dot). Originated in the
 * BizApps accounting JE/batch workspaces and hoisted here as the canonical implementation.
 *
 * v1 is **session-scoped**: a tab's state lives until the tab is closed or the session ends, and is
 * deliberately **NOT DB-persisted** (DB persistence is the v2 fork). App types never appear here; a
 * tab carries an opaque `State` the host owns.
 */

/** Lifecycle state of a draft tab. */
export type MJWorkspaceTabState =
  /** Normal in-progress draft. */
  | 'draft'
  /** Round-tripped after a rejection — the tab returns for rework carrying its rejection context. */
  | 'rejected'
  /** Committed/built — kept open read-only until the user closes it. */
  | 'complete';

/**
 * One workspace tab. `State` is intentionally `unknown`: the framework moves tabs around and never
 * inspects their payload, which is what keeps it app-agnostic. Hosts narrow it themselves — this is
 * the layer boundary, not weak typing.
 */
export interface MJWorkspaceTab<TState = unknown> {
  /** Stable identity within the strip. */
  Id: string;
  /** Tab caption. */
  Label: string;
  /** Optional Font Awesome class rendered before the label. */
  Icon?: string;
  Status: MJWorkspaceTabState;
  /** Host-owned payload — the in-progress draft. */
  State: TState;
  /** Set when Status is 'rejected'; surfaced as the tab tooltip so the reason travels with the tab. */
  RejectionReason?: string | null;
  /** True when the tab has unsaved edits — drives the discard confirm. */
  Dirty?: boolean;
}
