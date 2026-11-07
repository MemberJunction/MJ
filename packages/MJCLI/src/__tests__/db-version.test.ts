/**
 * Unit tests for readCurrentDbVersion — the history-table read that decides whether a
 * fetch is a fresh install (baseline + tail) or an existing-DB upgrade (versioned after
 * the current version). The Skyway provider is stubbed; no real database is touched.
 */
import { describe, it, expect, vi } from 'vitest';
import { BuildAppliedMigrationState, ReadAppliedMigrationState, ReadCurrentDbVersion, type MigrationHistoryProvider } from '../lib/db-version';

interface TestRecord {
  Version: string | null;
  Type: string;
  Success?: boolean;
}

function makeProvider(exists: boolean, records: TestRecord[] = []) {
  const connect = vi.fn(async () => {});
  const disconnect = vi.fn(async () => {});
  const provider: MigrationHistoryProvider = {
    Connect: connect,
    Disconnect: disconnect,
    History: {
      Exists: async () => exists,
      GetAllRecords: async () => records,
    },
  };
  return { provider, connect, disconnect };
}

describe('readCurrentDbVersion', () => {
  it('returns null for a fresh DB (no history table) and still disconnects', async () => {
    const { provider, connect, disconnect } = makeProvider(false);
    const version = await ReadCurrentDbVersion(provider, '__mj', 'flyway_schema_history');
    expect(version).toBeNull();
    expect(connect).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('returns the highest applied version', async () => {
    const { provider } = makeProvider(true, [
      { Version: '202605200000', Type: 'SQL', Success: true },
      { Version: '202605250000', Type: 'SQL', Success: true },
      { Version: '202605150000', Type: 'SQL', Success: true },
    ]);
    expect(await ReadCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).toBe('202605250000');
  });

  it('ignores SCHEMA markers, failed rows, and null versions', async () => {
    const { provider } = makeProvider(true, [
      { Version: null, Type: 'SCHEMA', Success: true },
      { Version: '202699999999', Type: 'SQL', Success: false }, // failed → must not count
      { Version: '202605250000', Type: 'SQL', Success: true },
    ]);
    expect(await ReadCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).toBe('202605250000');
  });

  it('counts a successful baseline row as the current version', async () => {
    const { provider } = makeProvider(true, [{ Version: '202605241137', Type: 'SQL_BASELINE', Success: true }]);
    expect(await ReadCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).toBe('202605241137');
  });

  it('treats a row with no Success flag as applied', async () => {
    const { provider } = makeProvider(true, [{ Version: '202605250000', Type: 'SQL' }]);
    expect(await ReadCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).toBe('202605250000');
  });

  it('disconnects even when reading records throws', async () => {
    const disconnect = vi.fn(async () => {});
    const provider: MigrationHistoryProvider = {
      Connect: vi.fn(async () => {}),
      Disconnect: disconnect,
      History: {
        Exists: async () => true,
        GetAllRecords: async () => {
          throw new Error('boom');
        },
      },
    };
    await expect(ReadCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).rejects.toThrow('boom');
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe('ReadAppliedMigrationState', () => {
  it('returns null for a fresh DB (no history table) and still disconnects', async () => {
    const { provider, disconnect } = makeProvider(false);
    expect(await ReadAppliedMigrationState(provider, '__mj', 'flyway_schema_history')).toBeNull();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('returns every applied version, not only the highest', async () => {
    const { provider } = makeProvider(true, [
      { Version: '202608200000', Type: 'SQL', Success: true },
      { Version: '202610061630', Type: 'SQL', Success: true },
      { Version: '202610011200', Type: 'SQL', Success: true },
    ]);
    const state = await ReadAppliedMigrationState(provider, '__mj', 'flyway_schema_history');
    expect(state && [...state.AppliedVersions].sort()).toEqual(['202608200000', '202610011200', '202610061630']);
    expect(state?.HighestVersion).toBe('202610061630');
    expect(state?.BaselineFloor).toBeNull();
  });
});

describe('BuildAppliedMigrationState', () => {
  it('takes the highest successful baseline row as the floor', () => {
    const state = BuildAppliedMigrationState([
      { Version: '202602151200', Type: 'SQL_BASELINE', Success: true },
      { Version: '202605241137', Type: 'SQL_BASELINE', Success: true },
      { Version: '202605250000', Type: 'SQL', Success: true },
    ]);
    expect(state.BaselineFloor).toBe('202605241137');
    expect(state.HighestVersion).toBe('202605250000');
  });

  it('counts a BASELINE marker as a floor', () => {
    expect(BuildAppliedMigrationState([{ Version: '202605241137', Type: 'BASELINE', Success: true }]).BaselineFloor).toBe('202605241137');
  });

  it('ignores a failed baseline row as a floor and leaves failed rows out of the applied set', () => {
    const state = BuildAppliedMigrationState([
      { Version: '202699999999', Type: 'SQL_BASELINE', Success: false },
      { Version: '202605250000', Type: 'SQL', Success: false },
      { Version: '202605200000', Type: 'SQL', Success: true },
      { Version: null, Type: 'SCHEMA', Success: true },
    ]);
    expect(state.BaselineFloor).toBeNull();
    expect([...state.AppliedVersions]).toEqual(['202605200000']);
  });
});
