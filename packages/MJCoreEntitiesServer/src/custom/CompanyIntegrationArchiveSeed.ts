/**
 * Pure helpers for deleting a company integration that an archive seed created. The archive-seed
 * job keeps its state in an `MJ: RSU Pending Works` row whose `CompanyIntegrationID` is a foreign
 * key to the connection, and it owns the connection's deferred External Data Source. Deleting the
 * connection has to remove those first, and must not happen while the seed is still running.
 */
import type { MJRSUPendingWorkEntity } from '@memberjunction/core-entities';

/** The part of a company integration's `Configuration` an archive seed writes. */
export interface ArchiveSeedConfiguration {
    /** The job's pending-work row ID. */
    JobID: string;
    /** The data source the seed created for the connection, or null when none is recorded. */
    ExternalDataSourceID: string | null;
}

/** Archive seed job states after which the job holds nothing a delete must wait for. */
const TERMINAL_ARCHIVE_SEED_STATES = new Set(['Done', 'Failed']);

/**
 * The archive-seed block of a connection's `Configuration`, or undefined when the connection was not
 * seeded from a backup (no `seededFromBackup.jobID`) or the configuration is not JSON.
 */
export function ReadArchiveSeedConfiguration(configuration: string | null | undefined): ArchiveSeedConfiguration | undefined {
    if (!configuration) {
        return undefined;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(configuration);
    } catch {
        return undefined;
    }
    if (!isRecord(parsed)) {
        return undefined;
    }
    const seeded = parsed['seededFromBackup'];
    const jobID = isRecord(seeded) ? seeded['jobID'] : undefined;
    if (typeof jobID !== 'string' || jobID.trim() === '') {
        return undefined;
    }
    const dataSourceID = parsed['externalDataSourceID'];
    return { JobID: jobID, ExternalDataSourceID: typeof dataSourceID === 'string' && dataSourceID !== '' ? dataSourceID : null };
}

/** The columns of a pending-work row the in-progress check reads. */
export interface ArchiveSeedWorkRow {
    Status: MJRSUPendingWorkEntity['Status'];
    PayloadJSON: string | null;
}

/**
 * True when the row is an archive-seed job that is still running: its store status is Pending and
 * its recorded state is neither Done nor Failed. A row whose payload cannot be read counts as running,
 * so a corrupt row is never deleted from under a job that may still own it.
 */
export function IsArchiveSeedInProgress(row: ArchiveSeedWorkRow): boolean {
    if (row.Status.trim() !== 'Pending') {
        return false;
    }
    let payload: unknown;
    try {
        payload = JSON.parse(row.PayloadJSON ?? '');
    } catch {
        return true;
    }
    if (!isRecord(payload) || payload['WorkType'] !== 'archive-seed') {
        return false;
    }
    const seed = payload['ArchiveSeed'];
    const state = isRecord(seed) ? seed['State'] : undefined;
    return typeof state !== 'string' || !TERMINAL_ARCHIVE_SEED_STATES.has(state);
}

/** True when the row's payload is an archive-seed job (unreadable payloads are not). */
export function IsArchiveSeedWorkRow(row: ArchiveSeedWorkRow): boolean {
    const payload = parsePayload(row.PayloadJSON);
    return isRecord(payload) && payload['WorkType'] === 'archive-seed';
}

/** What deleting a seeded connection does with its pending-work rows. */
export interface ArchiveSeedRowCleanup<T extends ArchiveSeedWorkRow> {
    /** Why the delete is refused; when set, nothing is deleted. */
    Refusal?: string;
    /** The rows to delete before the connection (their foreign key would otherwise block it). */
    Delete: T[];
}

/**
 * Plans the pending-work rows of a seeded connection for its delete. Refused while its archive seed
 * still runs, and while any other work of the connection is still Pending (an apply waiting for its
 * restart): live work is never deleted. Otherwise every row goes — the archive-seed job rows and the
 * finished (Completed/Failed) history of other work, whose foreign key would block the delete.
 */
export function PlanArchiveSeedRowCleanup<T extends ArchiveSeedWorkRow>(rows: T[]): ArchiveSeedRowCleanup<T> {
    if (rows.some(row => IsArchiveSeedInProgress(row))) {
        return { Refusal: 'An archive seed is still running for this connection; wait for it to finish or fail before deleting it.', Delete: [] };
    }
    const otherPending = rows.filter(row => row.Status.trim() === 'Pending' && !IsArchiveSeedWorkRow(row));
    if (otherPending.length > 0) {
        return {
            Refusal: `This connection has ${otherPending.length} other pending work item(s) (a schema apply waiting for its restart); wait for them to finish before deleting it.`,
            Delete: [],
        };
    }
    return { Delete: rows };
}

function parsePayload(payloadJSON: string | null): unknown {
    try {
        return JSON.parse(payloadJSON ?? '');
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
