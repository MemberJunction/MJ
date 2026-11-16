import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityInfo, InMemoryLocalStorageProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { InstrumentedLocalStorageProvider } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { ServerCacheChecks } from '../checks/server-cache.checks';

describe('server-cache.S25 entity-scoped RunViewCache accounting', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('ignores unrelated background RunViewCache traffic while rejecting MJ: Audit Logs cache reads or writes', async () => {
        const s25 = ServerCacheChecks.find((c) => c.Id === 'server-cache.S25');
        expect(s25).toBeDefined();

        const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
        const fakeAuditEntity: Pick<EntityInfo, 'Name' | 'AllowCaching' | 'TrustServerCacheCompletely'> = {
            Name: 'MJ: Audit Logs',
            AllowCaching: false,
            TrustServerCacheCompletely: false
        };

        vi.spyOn(Metadata.prototype, 'EntityByName').mockImplementation((name: string) => {
            if (name === 'MJ: Audit Logs') {
                return fakeAuditEntity as EntityInfo;
            }
            return undefined;
        });

        // Case 1: Unrelated background entity writes/reads to RunViewCache during S25 must NOT trip S25
        const rvSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => {
            await storage.GetItem('MJ: Users|IsActive=1|_', 'RunViewCache');
            await storage.SetItem('MJ: Users|IsActive=1|_', { rows: [] }, 'RunViewCache');
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: ''
            };
        });

        const user = new UserInfo(null, {
            ID: '00000000-0000-4000-8000-000000000001',
            Name: 'sys@example.com',
            Email: 'sys@example.com',
            IsActive: true,
            Type: 'User',
            UserRoles: []
        });

        const ctx: Pick<IntegrationCheckContext, 'Storage' | 'User'> = {
            Storage: storage,
            User: user
        };

        await s25!.Fn(ctx as IntegrationCheckContext);
        expect(fakeAuditEntity.AllowCaching).toBe(false);
        expect(storage.SetCount('RunViewCache')).toBeGreaterThan(0);
        expect(Object.prototype.hasOwnProperty.call(storage, 'GetItem')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(storage, 'GetItems')).toBe(false);

        const protoSpy = vi.spyOn(InstrumentedLocalStorageProvider.prototype, 'GetItem');
        await storage.GetItem('test-key', 'test-cat');
        expect(protoSpy).toHaveBeenCalledWith('test-key', 'test-cat');

        // Case 2: If MJ: Audit Logs itself ever writes to RunViewCache, S25 MUST fail
        rvSpy.mockImplementation(async () => {
            await storage.SetItem("MJ: Audit Logs|'tag-s25' <> 'never'|ID", { rows: [] }, 'RunViewCache');
            return {
                Success: true,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 1,
                ErrorMessage: ''
            };
        });

        await expect(s25!.Fn(ctx as IntegrationCheckContext)).rejects.toThrow(
            /Trust=0 entity must never write the server cache/
        );
        expect(fakeAuditEntity.AllowCaching).toBe(false);
    });
});
