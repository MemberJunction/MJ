/**
 * Unit tests for readCurrentDbVersion — the history-table read that decides whether a
 * fetch is a fresh install (baseline + tail) or an existing-DB upgrade (versioned after
 * the current version). The Skyway provider is stubbed; no real database is touched.
 */
import { describe, it, expect, vi } from 'vitest';
import { readCurrentDbVersion, type MigrationHistoryProvider } from '../lib/db-version';

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
    const version = await readCurrentDbVersion(provider, '__mj', 'flyway_schema_history');
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
    expect(await readCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).toBe('202605250000');
  });

  it('ignores SCHEMA markers, failed rows, and null versions', async () => {
    const { provider } = makeProvider(true, [
      { Version: null, Type: 'SCHEMA', Success: true },
      { Version: '202699999999', Type: 'SQL', Success: false }, // failed → must not count
      { Version: '202605250000', Type: 'SQL', Success: true },
    ]);
    expect(await readCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).toBe('202605250000');
  });

  it('counts a successful baseline row as the current version', async () => {
    const { provider } = makeProvider(true, [{ Version: '202605241137', Type: 'SQL_BASELINE', Success: true }]);
    expect(await readCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).toBe('202605241137');
  });

  it('treats a row with no Success flag as applied', async () => {
    const { provider } = makeProvider(true, [{ Version: '202605250000', Type: 'SQL' }]);
    expect(await readCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).toBe('202605250000');
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
    await expect(readCurrentDbVersion(provider, '__mj', 'flyway_schema_history')).rejects.toThrow('boom');
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
