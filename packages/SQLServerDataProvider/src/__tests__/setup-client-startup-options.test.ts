/**
 * Tests that setupSQLServerClient() threads startup options through to
 * StartupManager.Instance.Startup(), and that omitting them preserves the
 * pre-change call shape (options undefined ⇒ 'full' mode inside MJCore).
 */

import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import sql from 'mssql';
import { StartupManager, StartupOptions, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient } from '../config';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { SQLServerProviderConfigData } from '../types';
import { UserCache } from '../UserCache';

function makeConfig(): SQLServerProviderConfigData {
    const fakePool = { connected: true } as unknown as sql.ConnectionPool;
    return new SQLServerProviderConfigData(fakePool, '__mj');
}

describe('setupSQLServerClient startup-options threading', () => {
    const fakeUser = { ID: 'user-1', Name: 'System' } as unknown as UserInfo;
    let startupSpy: MockInstance<StartupManager['Startup']>;

    beforeEach(() => {
        vi.spyOn(SQLServerDataProvider.prototype, 'Config').mockResolvedValue(true);
        vi.spyOn(UserCache.Instance, 'Refresh').mockResolvedValue(undefined);
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(fakeUser);
        vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([]);
        startupSpy = vi.spyOn(StartupManager.Instance, 'Startup').mockResolvedValue({
            success: true,
            results: [],
            totalDurationMs: 0
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('forwards provided startup options to StartupManager.Startup()', async () => {
        const options: StartupOptions = { mode: 'task' };

        await setupSQLServerClient(makeConfig(), options);

        expect(startupSpy).toHaveBeenCalledTimes(1);
        const [forceRefresh, contextUser, provider, forwarded] = startupSpy.mock.calls[0];
        expect(forceRefresh).toBe(false);
        expect(contextUser).toBe(fakeUser);
        expect(provider).toBeInstanceOf(SQLServerDataProvider);
        expect(forwarded).toBe(options);
    });

    it('passes undefined options when omitted (pre-change behavior ⇒ full mode)', async () => {
        await setupSQLServerClient(makeConfig());

        expect(startupSpy).toHaveBeenCalledTimes(1);
        expect(startupSpy.mock.calls[0][3]).toBeUndefined();
    });
});
