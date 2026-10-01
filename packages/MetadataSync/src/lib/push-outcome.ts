/**
 * @fileoverview What a failed `mj sync push` left behind, and how to say so.
 * @module push-outcome
 */

import path from 'path';
import type { PushWriteMode } from './push-write-mode';

/** A create or update committed outside the push transaction (an isolated directory only). */
export interface CommittedWrite {
  /** Absolute path of the metadata file the record came from. */
  filePath: string;
  entityName: string;
  /** Position of the record inside the file, e.g. `MJ: Actions[3]/MJ: Action Params[0]`. */
  recordPath: string;
  status: 'created' | 'updated';
}

/** What a push had done when it failed. Same shape as the successful result's counts. */
export interface PushPartialTotals {
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  skipped: number;
  deferred: number;
  errors: number;
}

export interface PushAbortedDetails {
  /** The write modes the directories processed so far were using. */
  modes: PushWriteMode[];
  /** Whether the push transaction was rolled back (or was never opened, as in a dry run). */
  rolledBack: boolean;
  /** Rows that are still in the database even though the push failed. */
  committedWrites: CommittedWrite[];
  /** Counts as far as the push got. Reported so a failed run is still machine-readable. */
  totals: PushPartialTotals;
  /** The SQL log for this run, when one was being written. Most wanted on a failure. */
  sqlLogPath?: string;
  cause: unknown;
}

/**
 * Thrown by `PushService.push()` whenever a push fails after it started writing.
 * The message is the original failure's message, so existing callers keep working;
 * the extra fields let a caller say exactly what is and is not in the database.
 */
export class PushAbortedError extends Error {
  /** The write modes in play when the push failed, e.g. `['shared']` or `['shared','isolated']`. */
  readonly modes: PushWriteMode[];
  readonly rolledBack: boolean;
  readonly committedWrites: CommittedWrite[];
  readonly totals: PushPartialTotals;
  readonly sqlLogPath?: string;

  constructor(details: PushAbortedDetails) {
    super(messageOf(details.cause), { cause: details.cause });
    this.name = 'PushAbortedError';
    this.modes = details.modes;
    this.rolledBack = details.rolledBack;
    this.committedWrites = details.committedWrites;
    this.totals = details.totals;
    this.sqlLogPath = details.sqlLogPath;
  }

  /** True only when nothing from this push is left in the database. */
  get NothingCommitted(): boolean {
    return this.rolledBack && this.committedWrites.length === 0;
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The lines that tell the user how a failed push ended. The first line is the summary;
 * any further lines list the committed records, grouped by file.
 */
export function describeRollbackOutcome(rolledBack: boolean, committedWrites: CommittedWrite[], cwd: string): string[] {
  if (!rolledBack) {
    return [
      '❌ Database transaction rollback failed. Check the database before pushing again: ' +
        'rows written by this push may still be locked or present.',
      ...describeCommittedWrites(committedWrites, cwd),
    ];
  }
  if (committedWrites.length === 0) {
    return ['✓ Database transaction rolled back successfully. Nothing from this push was saved.'];
  }
  return [
    `⚠️  The push transaction was rolled back, but ${committedWrites.length} created or updated ` +
      `record${committedWrites.length === 1 ? '' : 's'} in directories using isolated transactions ` +
      `${committedWrites.length === 1 ? 'was' : 'were'} already committed and ` +
      `${committedWrites.length === 1 ? 'is' : 'are'} still in the database. Their files keep the pushed contents.`,
    ...describeCommittedWrites(committedWrites, cwd),
  ];
}

/** One line per file, then one indented line per committed record. */
export function describeCommittedWrites(committedWrites: CommittedWrite[], cwd: string): string[] {
  const byFile = new Map<string, CommittedWrite[]>();
  for (const write of committedWrites) {
    const list = byFile.get(write.filePath) ?? [];
    list.push(write);
    byFile.set(write.filePath, list);
  }
  const lines: string[] = [];
  for (const [filePath, writes] of byFile) {
    lines.push(`   ${path.relative(cwd, filePath) || filePath}: ${writes.length} committed`);
    for (const write of writes) {
      lines.push(`      ${write.status} ${write.entityName} at ${write.recordPath}`);
    }
  }
  return lines;
}

/**
 * Message for a failed COMMIT. On PostgreSQL, deferred foreign keys are checked at commit, so
 * the failure is about the transaction as a whole and cannot be tied to one record.
 */
export function describeCommitFailure(cause: unknown, platform: string | undefined): string {
  const base = `The database rejected the commit of the push transaction, so the transaction was not saved: ${messageOf(cause)}`;
  if (platform === 'postgresql') {
    return (
      `${base}. PostgreSQL checks deferred foreign-key constraints when the transaction commits, ` +
      `so this error is not tied to a single record in the metadata files.`
    );
  }
  return base;
}
