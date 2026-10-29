/**
 * Reads what is already applied to the target database from Skyway's history table.
 *
 * Returns `null` when there is no history (a fresh database) — which tells the fetch
 * layer to use `baseline + tail`. Otherwise it returns the set of applied versions and
 * the baseline floor, so the fetch can select every versioned migration that is not yet
 * applied and lies above the floor. Selecting by "newer than the highest applied version"
 * is wrong once release lines exist: a database upgraded from a patch line has applied
 * migrations that are newer than files it has never run.
 *
 * @module lib/db-version
 */

/** Minimal shape of a Skyway history record we read (the real record carries more fields). */
export interface HistoryRecordLike {
  Version: string | null;
  Type: string;
  Success?: boolean;
}

/** Minimal shape of the Skyway provider we use to read history (structurally compatible with the real one). */
export interface MigrationHistoryProvider {
  Connect(): Promise<void>;
  Disconnect(): Promise<void>;
  History: {
    Exists(schema: string, tableName: string): Promise<boolean>;
    GetAllRecords(schema: string, tableName: string): Promise<readonly HistoryRecordLike[]>;
  };
}

/** What the history table says is already applied to an existing database. */
export interface AppliedMigrationState {
  /** Every successfully applied versioned or baseline version (Skyway's `<timestamp>` key). */
  AppliedVersions: ReadonlySet<string>;
  /** Highest successfully applied version, or null when only markers exist. */
  HighestVersion: string | null;
  /**
   * Highest successful baseline row (`SQL_BASELINE` from a `B` file, or a `BASELINE` marker).
   * Skyway treats every versioned file at or below it as subsumed and never runs it, even
   * with `outOfOrder`, so the fetch must not select those files either.
   */
  BaselineFloor: string | null;
}

/**
 * SIDE EFFECTS: connects to the database to read the history table, then disconnects
 * (on every exit path).
 *
 * @returns the applied versions and baseline floor, or `null` if the history table does
 *   not exist yet (fresh database).
 */
export async function ReadAppliedMigrationState(
  provider: MigrationHistoryProvider,
  schema: string,
  historyTable: string,
): Promise<AppliedMigrationState | null> {
  await provider.Connect();
  try {
    if (!(await provider.History.Exists(schema, historyTable))) {
      return null;
    }
    const records = await provider.History.GetAllRecords(schema, historyTable);
    return BuildAppliedMigrationState(records);
  } finally {
    await provider.Disconnect();
  }
}

/**
 * Pure: reduces history records to the applied set, highest version and baseline floor.
 * Failed rows are left out, so their files are still fetched (Skyway reports them as
 * FAILED rather than re-running them, and a later repair needs the file present).
 */
export function BuildAppliedMigrationState(records: readonly HistoryRecordLike[]): AppliedMigrationState {
  const applied = new Set<string>();
  let floor: string | null = null;
  for (const record of records) {
    const version = record.Version;
    if (version === null || record.Type === 'SCHEMA' || record.Success === false) {
      continue;
    }
    applied.add(version);
    if ((record.Type === 'SQL_BASELINE' || record.Type === 'BASELINE') && (floor === null || version > floor)) {
      floor = version;
    }
  }
  return { AppliedVersions: applied, HighestVersion: highestOf(applied), BaselineFloor: floor };
}

/**
 * SIDE EFFECTS: connects to the database to read the history table, then disconnects
 * (on every exit path).
 *
 * @returns the highest applied version (Skyway's `<timestamp>` key), or `null` if the
 *   history table does not exist yet (fresh database).
 */
export async function ReadCurrentDbVersion(provider: MigrationHistoryProvider, schema: string, historyTable: string): Promise<string | null> {
  const state = await ReadAppliedMigrationState(provider, schema, historyTable);
  return state?.HighestVersion ?? null;
}

/** @deprecated Use {@link ReadCurrentDbVersion}. */
export async function readCurrentDbVersion(provider: MigrationHistoryProvider, schema: string, historyTable: string): Promise<string | null> {
  return ReadCurrentDbVersion(provider, schema, historyTable);
}

function highestOf(versions: ReadonlySet<string>): string | null {
  let highest: string | null = null;
  for (const version of versions) {
    if (highest === null || version > highest) {
      highest = version;
    }
  }
  return highest;
}
