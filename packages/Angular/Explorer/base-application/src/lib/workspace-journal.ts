import { WorkspaceConfiguration } from './interfaces/workspace-configuration.interface';

/**
 * One browser-local snapshot of the user's workspace configuration.
 *
 * The workspace is persisted to `MJ: Workspaces` through a debounced, asynchronous entity
 * save. A refresh that lands inside that window (debounce + network round trip) used to
 * come back one step behind: the newest tab/selection change existed only in memory. The
 * journal is written SYNCHRONOUSLY on every change, so the newest state survives any unload.
 */
export interface WorkspaceJournalEntry {
    /** Format version of this entry; entries with another version are ignored. */
    Version: 1;
    /** The user the snapshot belongs to. */
    UserID: string;
    /** The `MJ: Workspaces` row the snapshot was built on, or null when the user has none (permission-constrained sessions). */
    WorkspaceID: string | null;
    /**
     * The row's server `__mj_UpdatedAt` (ISO) that this snapshot is built on top of: the stamp of
     * the last save this browser saw complete, or of the row as loaded. Compared only with another
     * SERVER stamp, never with this browser's clock, so client clock skew cannot pick the wrong side.
     */
    BaseUpdatedAt: string | null;
    /** The configuration itself. */
    Configuration: WorkspaceConfiguration;
}

/** The storage surface the journal needs — `window.localStorage` in a browser. */
export interface WorkspaceJournalStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

/** Reads a server timestamp that may arrive as a Date or an ISO string; null when absent or unparseable. */
export function WorkspaceStampToEpoch(value: Date | string | null | undefined): number | null {
    if (value == null) {
        return null;
    }
    const ms = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Decides whether a journal snapshot is newer than the configuration the server returned.
 *
 * The journal wins only when it belongs to the same workspace row AND the server row has not
 * been saved since the snapshot's base stamp. A server row stamped LATER than the base was
 * saved by something this browser never saw (another device or browser tab), so the server
 * wins. A server row stamped at or before the base is what this browser already built on —
 * including a stale locally-cached copy of the row — so the journal, which holds every change
 * made since, wins.
 *
 * @param entry the journal snapshot, if any.
 * @param workspaceId the loaded workspace row's ID, or null when the user has none.
 * @param serverUpdatedAt the loaded row's `__mj_UpdatedAt`, or null when there is no row.
 */
export function ShouldUseWorkspaceJournal(
    entry: WorkspaceJournalEntry | null,
    workspaceId: string | null,
    serverUpdatedAt: Date | string | null | undefined
): boolean {
    if (!entry) {
        return false;
    }
    const entryRow = entry.WorkspaceID ?? null;
    const sameRow = entryRow === null || workspaceId === null
        ? entryRow === workspaceId
        : entryRow.toLowerCase() === workspaceId.toLowerCase();
    if (!sameRow) {
        return false;
    }
    if (workspaceId === null) {
        return true; // no server row to be newer than
    }
    const server = WorkspaceStampToEpoch(serverUpdatedAt);
    const base = WorkspaceStampToEpoch(entry.BaseUpdatedAt);
    if (server === null) {
        return true;
    }
    if (base === null) {
        return false; // can't prove the snapshot is newer — trust the server
    }
    return server <= base;
}

/**
 * Synchronous, per-user workspace snapshot in browser storage. Every operation is
 * exception-safe: storage can be absent, full, or blocked (private mode), and the journal
 * is only ever a recovery aid — the database stays the system of record.
 */
export class WorkspaceJournal {
    private static readonly keyPrefix = 'mj.workspace.journal.';

    /**
     * @param getStorage resolves the storage lazily on each call, so a missing or throwing
     *   `localStorage` is handled per call rather than at construction.
     */
    constructor(private readonly getStorage: () => WorkspaceJournalStorage | null) {}

    /** The storage key for a user's snapshot. */
    public static KeyFor(userId: string): string {
        return `${WorkspaceJournal.keyPrefix}${userId.toLowerCase()}`;
    }

    /** Writes (replaces) the user's snapshot. Silently does nothing when storage is unavailable. */
    public Write(entry: WorkspaceJournalEntry): void {
        try {
            this.getStorage()?.setItem(WorkspaceJournal.KeyFor(entry.UserID), JSON.stringify(entry));
        } catch {
            // Quota exceeded / storage blocked: the debounced database save still runs.
        }
    }

    /** Reads the user's snapshot, or null when absent, unreadable, or of another format version. */
    public Read(userId: string): WorkspaceJournalEntry | null {
        try {
            const raw = this.getStorage()?.getItem(WorkspaceJournal.KeyFor(userId));
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw) as Partial<WorkspaceJournalEntry>;
            if (parsed?.Version !== 1 || !parsed.Configuration || !Array.isArray(parsed.Configuration.tabs)) {
                return null;
            }
            if (typeof parsed.UserID !== 'string' || parsed.UserID.toLowerCase() !== userId.toLowerCase()) {
                return null;
            }
            return parsed as WorkspaceJournalEntry;
        } catch {
            return null;
        }
    }

    /** Removes the user's snapshot. */
    public Clear(userId: string): void {
        try {
            this.getStorage()?.removeItem(WorkspaceJournal.KeyFor(userId));
        } catch {
            // ignore — see Write
        }
    }
}

/** `window.localStorage` when it exists and can be touched, else null. */
export function BrowserWorkspaceJournalStorage(): WorkspaceJournalStorage | null {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null; // accessing localStorage throws when site data is blocked
    }
}
