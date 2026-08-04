/**
 * Reads the highest migration version already applied to the target database from
 * Skyway's history table.
 *
 * Returns `null` when there is no history (a fresh database) — which tells the fetch
 * layer to use `baseline + tail`. A non-null version means "existing database, upgrade
 * from here", so the fetch returns only the versioned migrations after it (no baseline,
 * which Skyway never applies to a database that already has history).
 *
 * @module lib/db-version
 */

/** Minimal shape of a Skyway history record we read (the real record carries more fields). */
interface HistoryRecordLike {
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

/**
 * SIDE EFFECTS: connects to the database to read the history table, then disconnects
 * (on every exit path).
 *
 * @returns the highest applied version (Skyway's `<timestamp>` key), or `null` if the
 *   history table does not exist yet (fresh database).
 */
export async function readCurrentDbVersion(provider: MigrationHistoryProvider, schema: string, historyTable: string): Promise<string | null> {
  await provider.Connect();
  try {
    if (!(await provider.History.Exists(schema, historyTable))) {
      return null;
    }
    const records = await provider.History.GetAllRecords(schema, historyTable);
    return highestAppliedVersion(records);
  } finally {
    await provider.Disconnect();
  }
}

/** Highest successful, non-schema-marker version among history records (mirrors Skyway's own rule). */
function highestAppliedVersion(records: readonly HistoryRecordLike[]): string | null {
  let highest: string | null = null;
  for (const record of records) {
    if (record.Version === null || record.Type === 'SCHEMA' || record.Success === false) {
      continue;
    }
    if (highest === null || record.Version > highest) {
      highest = record.Version;
    }
  }
  return highest;
}
