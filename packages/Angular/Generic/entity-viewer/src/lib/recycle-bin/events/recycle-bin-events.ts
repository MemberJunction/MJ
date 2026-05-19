/**
 * Event arg types for {@link RecycleBinComponent}.
 *
 * Follows the same Before/After cancelable pattern used by
 * {@link EntityDataGridComponent}: any event whose name starts with
 * `Before` carries `cancel: boolean` and `cancelReason?: string` so
 * consumers can intercept and abort or take over processing.
 */

import { MJRecordChangeEntity } from '@memberjunction/core-entities';

/** Forward type to avoid circular dependency with the component. */
export type RecycleBinComponentRef = unknown;

/**
 * Base shape for every Recycle Bin event.
 */
export interface RecycleBinEventArgs {
  /** The Recycle Bin component instance that raised the event. */
  bin: RecycleBinComponentRef;
  /** When the event was raised. */
  timestamp: Date;
  /** The entity the bin is operating on. */
  entityName: string;
}

/**
 * Base shape for cancelable Recycle Bin events. Set `cancel = true` to
 * abort the operation; the matching `after*` event will not fire.
 */
export interface CancelableRecycleBinEventArgs extends RecycleBinEventArgs {
  /** Set to true to abort. */
  cancel: boolean;
  /** Optional reason surfaced by the consumer. */
  cancelReason?: string;
}

// ─── Open / Close ──────────────────────────────────────────────────

export interface BeforeRecycleBinOpenEventArgs extends CancelableRecycleBinEventArgs {
  /** Reserved for future filter/scope params the consumer may want to validate. */
  readonly _kind: 'beforeRecycleBinOpen';
}

export interface AfterRecycleBinOpenEventArgs extends RecycleBinEventArgs {
  /** Number of distinct deleted records discovered when the bin opened. */
  deletedRecordCount: number;
  readonly _kind: 'afterRecycleBinOpen';
}

// ─── Per-record restore (the user clicked Restore on a single card) ─

/**
 * One deleted-record entry surfaced by the bin. Built from the most recent
 * Delete RecordChange for a given EntityID + RecordID.
 */
export interface RecycleBinEntry {
  /** The Delete RecordChange row that captured this snapshot. */
  RecordChange: MJRecordChangeEntity;
  /** The composite-key string that identified the record. */
  RecordID: string;
  /** The user-friendly summary line (e.g., a name field from the snapshot). */
  DisplaySummary: string;
  /** Up to N supporting fields chosen heuristically for the card. */
  SupportingFields: Array<{ Name: string; DisplayName: string; Value: string }>;
}

export interface BeforeRecordRestoreEventArgs extends CancelableRecycleBinEventArgs {
  entry: RecycleBinEntry;
  readonly _kind: 'beforeRecordRestore';
}

export interface AfterRecordRestoreEventArgs extends RecycleBinEventArgs {
  entry: RecycleBinEntry;
  /** True when the underlying insert succeeded. */
  success: boolean;
  /** Error message when success is false. */
  errorMessage?: string;
  readonly _kind: 'afterRecordRestore';
}

// ─── Restore commit (after the user confirms in the preview panel) ──

export interface BeforeRestoreCommitEventArgs extends CancelableRecycleBinEventArgs {
  entry: RecycleBinEntry;
  /** Field values that will be applied to the new record. */
  fieldValues: Array<{ FieldName: string; Value: unknown }>;
  /** Optional reason captured at restore time. */
  reason: string | null;
  readonly _kind: 'beforeRestoreCommit';
}

export interface AfterRestoreCommitEventArgs extends RecycleBinEventArgs {
  entry: RecycleBinEntry;
  success: boolean;
  /** ID of the newly created record (when success). */
  newRecordID?: string;
  errorMessage?: string;
  readonly _kind: 'afterRestoreCommit';
}
