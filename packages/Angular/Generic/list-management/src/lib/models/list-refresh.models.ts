import type { MJListEntity, MJUserRoutineEntity } from '@memberjunction/core-entities';

/** The kind of source a self-updating list refreshes from. */
export type ListSourceKind = 'view' | 'query';

/**
 * Where a list stands with respect to refreshing from its source.
 *
 * - `Static`: no source; the list is edited by hand.
 * - `Manual`: has a source, refreshed only when someone clicks Refresh now.
 * - `Scheduled`: has a source and an active refresh routine.
 * - `SourceChanged`: the source changed since it was approved; the next refresh will stop and pause.
 * - `Paused`: the routine is paused because the source changed, waiting for the owner to approve.
 * - `Failed`: the routine's last run failed.
 */
export type ListRefreshStatus = 'Static' | 'Manual' | 'Scheduled' | 'SourceChanged' | 'Paused' | 'Failed';

/** The statuses that need the owner's attention. */
export const LIST_REFRESH_ATTENTION_STATUSES: readonly ListRefreshStatus[] = ['SourceChanged', 'Paused', 'Failed'];

/** The User Routine that refreshes a list on a schedule. */
export interface ListRefreshRoutineInfo {
  ID: string;
  Name: string;
  Status: MJUserRoutineEntity['Status'];
  CronExpression: string | null;
  Timezone: string;
  NextRunAt: Date | null;
  LastRunAt: Date | null;
  LastRunStatus: MJUserRoutineEntity['LastRunStatus'];
}

/** One self-updating (or static) list, with what the Lists app shows about its refreshes. */
export interface ListRefreshSummary {
  ListID: string;
  ListName: string;
  EntityName: string;
  OwnerID: string;
  OwnerName: string;
  SourceKind: ListSourceKind | null;
  SourceID: string | null;
  SourceName: string | null;
  RefreshMode: MJListEntity['RefreshMode'];
  AutoRefresh: boolean;
  UseSnapshot: boolean;
  LastRefreshedAt: Date | null;
  LastRefreshedBy: string | null;
  Routine: ListRefreshRoutineInfo | null;
  Status: ListRefreshStatus;
}

/** The audit log types a list's refresh history is built from. */
export type ListRefreshEventType = 'Refreshed' | 'SourceChanged' | 'SourceApproved';

/** One row of a list's refresh history, from its "List Refreshed / Source Changed / Source Approved" audit rows. */
export interface ListRefreshHistoryEntry {
  ID: string;
  At: Date;
  Type: ListRefreshEventType;
  UserName: string;
  Description: string;
  Mode: MJListEntity['RefreshMode'] | null;
  Added: number | null;
  Removed: number | null;
  Failed: number | null;
  RecordsBefore: number | null;
  RecordsAfter: number | null;
  SourceKind: ListSourceKind | null;
  SourceName: string | null;
  SourceFingerprint: string | null;
}

/** One line of a side-by-side-free unified diff. */
export interface ListSourceDiffLine {
  Kind: 'same' | 'add' | 'remove';
  Text: string;
  /** Line number in the approved version, or null for an added line. */
  OldNumber: number | null;
  /** Line number in the current version, or null for a removed line. */
  NewNumber: number | null;
}

/**
 * The change to a list's source since its owner last approved it: the approved definition as of
 * then (from Record Changes) against the definition now. For a query this is its SQL; for a view,
 * the filter fields its fingerprint covers.
 */
export interface ListSourceDiff {
  SourceKind: ListSourceKind;
  SourceID: string;
  SourceName: string;
  /** The definition when the list last approved it, or null when Record Changes has no copy. */
  Before: string | null;
  After: string;
  /** When the list last approved its source, if known. */
  ApprovedAt: Date | null;
  /** Who last saved the source, and when. */
  ChangedBy: string | null;
  ChangedAt: Date | null;
  Lines: ListSourceDiffLine[];
}

/** A query parameter the review screen asks the owner for. */
export interface ListSourceParameterInfo {
  Name: string;
  Type: string;
  IsRequired: boolean;
  Description: string | null;
  SampleValue: string | null;
  /** The list's stored value, when it has one. */
  CurrentValue: string | null;
}
