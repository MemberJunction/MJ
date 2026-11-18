/**
 * Tests that setupSQLServerClient() threads startup options through to
 * StartupManager.Instance.Startup(), and that omitting them preserves the
 * pre-change call shape (options undefined ⇒ 'full' mode inside MJCore).
 */

import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import sql from 'mssql';
import { StartupManager, StartupOptions, UserInfo } from '@memberjunction/core';
import { SetupSQLServerClient } from '../config';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { SQLServerProviderConfigData } from '../types';
import { UserCache } from '@memberjunction/generic-database-provider';

function makeConfig(): SQLServerProviderConfigData {
    const fakePool = { connected: true } as unknown as sql.ConnectionPool;
    return new SQLServerProviderConfigData(fakePool, '__mj');
}

describe('setupSQLServerClient startup-options threading', () => {
    // The startup principal is the active system user, resolved from the cache by its well-known ID.
    const fakeUser = { ID: UserCache.Instance.SYSTEM_USER_ID, Name: 'System', Type: 'Owner          ', IsActive: true } as unknown as UserInfo;
    let startupSpy: MockInstance<StartupManager['Startup']>;

    beforeEach(() => {
        vi.spyOn(SQLServerDataProvider.prototype, 'Config').mockResolvedValue(true);
        vi.spyOn(UserCache.Instance, 'Refresh').mockResolvedValue(undefined);
        vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([fakeUser]);
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

        await SetupSQLServerClient(makeConfig(), options);

        expect(startupSpy).toHaveBeenCalledTimes(1);
        const [forceRefresh, contextUser, provider, forwarded] = startupSpy.mock.calls[0];
        expect(forceRefresh).toBe(false);
        expect(contextUser).toBe(fakeUser);
        expect(provider).toBeInstanceOf(SQLServerDataProvider);
        expect(forwarded).toBe(options);
    });

    it('passes undefined options when omitted (pre-change behavior ⇒ full mode)', async () => {
        await SetupSQLServerClient(makeConfig());

        expect(startupSpy).toHaveBeenCalledTimes(1);
        expect(startupSpy.mock.calls[0][3]).toBeUndefined();
    });

    it('falls back to an active Owner whose Type is space-padded when the system user is missing', async () => {
        const owner = { ID: 'AAAA0000-0000-0000-0000-000000000001', Name: 'admin', Type: 'Owner          ', IsActive: true } as unknown as UserInfo;
        const plain = { ID: '00000000-0000-0000-0000-000000000001', Name: 'guest', Type: 'User           ', IsActive: true } as unknown as UserInfo;
        vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([plain, owner]);

        await SetupSQLServerClient(makeConfig());

        expect(startupSpy.mock.calls[0][1]).toBe(owner);
    });
});
