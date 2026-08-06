/**
 * config.ts time-interval tests — the seconds→milliseconds regression guard.
 *
 * `SQLServerProviderConfigData.CheckRefreshIntervalSeconds` is denominated in
 * SECONDS; both consumers in setupSQLServerClient() (UserCache.Refresh and the
 * metadata-refresh setInterval) require MILLISECONDS. Commit 645c5a5e8 fixed a
 * ms-vs-seconds mix-up that made the metadata cache refresh roughly every ~50
 * hours instead of every 3 minutes (a value already in ms was treated as seconds
 * and multiplied by 1000 again). These tests pin the EFFECTIVE derived values so
 * any future unit mix-up — dropping the conversion (N) or double-converting
 * (N * 1000 * 1000) — fails loudly.
 */
import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import sql from 'mssql';
import { StartupManager, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient } from '../config';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { SQLServerProviderConfigData } from '../types';
import { UserCache } from '../UserCache';

const fakeUser = { ID: 'user-1', Name: 'System' } as unknown as UserInfo;

function makeConfig(checkRefreshIntervalSeconds?: number): {
  config: SQLServerProviderConfigData;
  pool: sql.ConnectionPool;
} {
  const pool = { connected: true } as unknown as sql.ConnectionPool;
  const config =
    checkRefreshIntervalSeconds === undefined
      ? new SQLServerProviderConfigData(pool, '__mj')
      : new SQLServerProviderConfigData(pool, '__mj', checkRefreshIntervalSeconds);
  return { config, pool };
}

describe('SQLServerProviderConfigData interval configuration', () => {
  it('defaults CheckRefreshIntervalSeconds to 0 (auto refresh disabled) when omitted', () => {
    const { config } = makeConfig();
    expect(config.CheckRefreshIntervalSeconds).toBe(0);
  });

  it('round-trips the connection pool and the configured interval', () => {
    const { config, pool } = makeConfig(180);
    expect(config.ConnectionPool).toBe(pool);
    expect(config.CheckRefreshIntervalSeconds).toBe(180);
  });
});

describe('setupSQLServerClient effective refresh intervals (seconds → milliseconds)', () => {
  let refreshSpy: MockInstance<UserCache['Refresh']>;
  let setIntervalSpy: MockInstance<typeof globalThis.setInterval>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(SQLServerDataProvider.prototype, 'Config').mockResolvedValue(true);
    refreshSpy = vi.spyOn(UserCache.Instance, 'Refresh').mockResolvedValue(undefined);
    vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(fakeUser);
    vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([]);
    vi.spyOn(StartupManager.Instance, 'Startup').mockResolvedValue({
      success: true,
      results: [],
      totalDurationMs: 0,
    });
    setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a 180-second config yields EXACTLY 180,000 ms for both UserCache.Refresh and the metadata timer', async () => {
    const { config, pool } = makeConfig(180);

    await setupSQLServerClient(config);

    // UserCache.Refresh expects MILLISECONDS
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledWith(pool, 180 * 1000);

    // The metadata refresh timer runs on MILLISECONDS
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const delayMs = setIntervalSpy.mock.calls[0][1];
    expect(delayMs).toBe(180 * 1000);

    // Regression guards for the two failure shapes of the unit mix-up:
    expect(delayMs).not.toBe(180); //         seconds passed straight through → refresh every 180 ms
    expect(delayMs).not.toBe(180 * 1000 * 1000); // double conversion → the ~50-hour bug (645c5a5e8)
  });

  it('a 5-second config produces a 5,000 ms timer (never raw seconds)', async () => {
    const { config } = makeConfig(5);

    await setupSQLServerClient(config);

    expect(refreshSpy.mock.calls[0][1]).toBe(5000);
    expect(setIntervalSpy.mock.calls[0][1]).toBe(5000);
  });

  it('a 0-second (disabled) config never starts the metadata refresh timer', async () => {
    const { config, pool } = makeConfig(0);

    await setupSQLServerClient(config);

    // UserCache still refreshes once at startup (0 ms simply disables ITS auto-refresh loop)
    expect(refreshSpy).toHaveBeenCalledWith(pool, 0);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('the timer callback drives provider.RefreshIfNeeded on each tick', async () => {
    const refreshIfNeededSpy = vi
      .spyOn(SQLServerDataProvider.prototype, 'RefreshIfNeeded')
      .mockResolvedValue(true);
    const { config } = makeConfig(60);

    await setupSQLServerClient(config);

    expect(refreshIfNeededSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(refreshIfNeededSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(refreshIfNeededSpy).toHaveBeenCalledTimes(2);
    // One minute short of a tick → no extra call (the interval really is 60,000 ms)
    await vi.advanceTimersByTimeAsync(59 * 1000);
    expect(refreshIfNeededSpy).toHaveBeenCalledTimes(2);
  });

  it('a RefreshIfNeeded failure inside the timer callback is swallowed (logged, not thrown)', async () => {
    vi.spyOn(SQLServerDataProvider.prototype, 'RefreshIfNeeded').mockRejectedValue(
      new Error('metadata refresh blew up'),
    );
    const { config } = makeConfig(30);

    await setupSQLServerClient(config);

    // Must not reject / produce an unhandled rejection — the callback catches internally
    await expect(vi.advanceTimersByTimeAsync(30 * 1000)).resolves.not.toThrow();
  });

  it('returns the configured provider instance', async () => {
    const { config } = makeConfig(0);
    const provider = await setupSQLServerClient(config);
    expect(provider).toBeInstanceOf(SQLServerDataProvider);
  });
});
