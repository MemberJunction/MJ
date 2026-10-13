import { describe, it, expect } from 'vitest';
import { DatabaseProviderBase, IMetadataProvider } from '@memberjunction/core';
import { SystemUserID } from '../systemUser.js';
import { DatabaseWellKnownUserSource } from '../DatabaseWellKnownUserSource.js';

/**
 * The server-side WellKnownUserSource. Contract under test:
 *  - reads vwUsers/vwUserRoles directly, so it works before any UserCache warm-up and on
 *    PostgreSQL, which has no user cache of its own;
 *  - populates UserRoles, because entity permissions and RLS are role-driven;
 *  - NEVER throws — a missing row, a non-database provider, or a failed query all yield null so
 *    callers degrade rather than crash.
 */

type SQLCall = { sql: string; params: unknown[] | undefined };

/**
 * A DatabaseProviderBase-shaped stub built off the real prototype, so `instanceof` matches and
 * the production code path runs verbatim. Implementing the full abstract surface would add a
 * hundred irrelevant stubs.
 */
function makeProvider(
    handler: (sql: string, params: unknown[] | undefined) => Promise<Record<string, unknown>[]>
): { provider: IMetadataProvider; calls: SQLCall[] } {
    const calls: SQLCall[] = [];
    const shim = Object.create(DatabaseProviderBase.prototype) as Record<string, unknown>;
    shim.QuoteIdentifier = (name: string) => `[${name}]`;
    shim.QuoteSchemaAndView = (schemaName: string, objectName: string) => `[${schemaName}].[${objectName}]`;
    shim.ExecuteSQL = async (query: string, parameters?: unknown[]) => {
        calls.push({ sql: query, params: parameters });
        return handler(query, parameters);
    };
    // MJCoreSchemaName reads ConfigData, which an unconfigured shim doesn't have.
    Object.defineProperty(shim, 'MJCoreSchemaName', { value: '__mj', configurable: true });
    return { provider: shim as unknown as IMetadataProvider, calls };
}

const SYSTEM_ROW = { ID: SystemUserID, Name: 'System', Email: 'system@memberjunction.com', IsActive: true };
const ROLE_ROWS = [
    { UserID: SystemUserID, RoleID: 'r1', Role: 'Developer' },
    { UserID: SystemUserID, RoleID: 'r2', Role: 'Integration' },
];

function respondWithSystemUser(sql: string): Promise<Record<string, unknown>[]> {
    return Promise.resolve(sql.includes('vwUserRoles') ? ROLE_ROWS : [SYSTEM_ROW]);
}

describe('DatabaseWellKnownUserSource.GetSystemUser', () => {
    it('resolves the system user with roles populated', async () => {
        const { provider } = makeProvider((sql) => respondWithSystemUser(sql));

        const user = await new DatabaseWellKnownUserSource().GetSystemUser(provider);

        expect(user).not.toBeNull();
        expect(user?.ID).toBe(SystemUserID);
        expect(user?.UserRoles).toHaveLength(2);
    });

    it('queries the core-schema user views by the canonical SystemUserID', async () => {
        const { provider, calls } = makeProvider((sql) => respondWithSystemUser(sql));

        await new DatabaseWellKnownUserSource().GetSystemUser(provider);

        expect(calls).toHaveLength(2);
        expect(calls[0].sql).toContain('[__mj].[vwUsers]');
        expect(calls[0].params).toEqual([SystemUserID]);
        expect(calls[1].sql).toContain('[__mj].[vwUserRoles]');
        expect(calls[1].params).toEqual([SystemUserID]);
    });

    it('uses the provider dialect helpers, so PostgreSQL gets PG-shaped SQL', async () => {
        const { provider, calls } = makeProvider((sql) => respondWithSystemUser(sql));
        // Re-point the helpers at PG conventions; the source must not hardcode SQL Server syntax.
        const shim = provider as unknown as Record<string, unknown>;
        shim.QuoteIdentifier = (name: string) => `"${name}"`;
        shim.QuoteSchemaAndView = (s: string, o: string) => `"${s}"."${o}"`;
        shim.BuildParameterPlaceholder = (i: number) => `$${i + 1}`;

        await new DatabaseWellKnownUserSource().GetSystemUser(provider);

        expect(calls[0].sql).toContain('"__mj"."vwUsers"');
        expect(calls[0].sql).toContain('$1');
    });

    it('returns null (never throws) when the system user row is absent', async () => {
        const { provider, calls } = makeProvider(async () => []);

        await expect(new DatabaseWellKnownUserSource().GetSystemUser(provider)).resolves.toBeNull();
        expect(calls).toHaveLength(1); // roles are not queried when there is no user
    });

    it('returns null when the query fails', async () => {
        const { provider } = makeProvider(async () => {
            throw new Error('pool not ready');
        });

        await expect(new DatabaseWellKnownUserSource().GetSystemUser(provider)).resolves.toBeNull();
    });

    it('returns null for a non-database provider instead of attempting SQL', async () => {
        const networkProvider = { ProviderType: 'Network' } as unknown as IMetadataProvider;

        await expect(new DatabaseWellKnownUserSource().GetSystemUser(networkProvider)).resolves.toBeNull();
    });
});
