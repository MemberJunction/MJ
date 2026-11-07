/**
 * CreateAppSchema on PostgreSQL creates the app schema owned by the core schema's owner, so
 * CodeGen (which runs as that owner) can create and replace objects in it (#5640).
 */
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseProviderBase, DatabasePlatform } from '@memberjunction/core';
import { GetDialect } from '@memberjunction/sql-dialect';
import { CreateAppSchema } from '../install/schema-manager.js';

/** Fake provider: `ExecuteSQL` returns the scripted results in order, then empty arrays. */
function makeMockProvider(
    sqlResults: Array<Array<Record<string, unknown>>>,
    platform: DatabasePlatform
): { provider: DatabaseProviderBase; executeSql: ReturnType<typeof vi.fn> } {
    const queue = [...sqlResults];
    const executeSql = vi.fn(async () => queue.shift() ?? []);
    return {
        provider: { ExecuteSQL: executeSql, Dialect: GetDialect(platform) } as unknown as DatabaseProviderBase,
        executeSql,
    };
}

function sqlAt(executeSql: ReturnType<typeof vi.fn>, index: number): string {
    return executeSql.mock.calls[index][0] as string;
}

describe('CreateAppSchema — PostgreSQL schema owner (#5640)', () => {
    it('probes pg_namespace for the canonical core schema owner and membership', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'mj_codegen', IsMember: true }]], 'postgresql');
        await CreateAppSchema('__mj_BizAppsCommon', provider, { CoreSchema: '__MJ', allowDoubleUnderscore: true });
        const probe = sqlAt(executeSql, 1);
        expect(probe).toContain('pg_namespace');
        expect(probe).toContain('pg_get_userbyid(n.nspowner)');
        // 'MEMBER' is true for an ADMIN-only membership (PG 16+), which cannot run AUTHORIZATION;
        // the probe asks for inherited privileges and, from PG 16, SET.
        expect(probe).not.toContain(`'MEMBER'`);
        expect(probe).toContain(`pg_has_role(current_user, n.nspowner, 'USAGE')`);
        expect(probe).toContain(
            `CASE WHEN current_setting('server_version_num')::int >= 160000 THEN pg_has_role(current_user, n.nspowner, 'SET') ELSE TRUE END`
        );
        // The core schema name is canonicalized (PG folds unquoted DDL to lowercase).
        expect(probe).toContain(`n.nspname = '__mj'`);
    });

    it('creates the schema AUTHORIZATION the core owner when the installer is a member', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'mj_codegen', IsMember: true }]], 'postgresql');
        const result = await CreateAppSchema('__mj_BizAppsCommon', provider, { allowDoubleUnderscore: true });
        expect(result).toEqual({ Success: true });
        expect(executeSql).toHaveBeenCalledTimes(3);
        expect(sqlAt(executeSql, 2)).toBe('CREATE SCHEMA "__mj_bizappscommon" AUTHORIZATION "mj_codegen"');
    });

    it('quotes an owner name containing a double quote', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'odd"role', IsMember: true }]], 'postgresql');
        await CreateAppSchema('bcsaas', provider);
        expect(sqlAt(executeSql, 2)).toBe('CREATE SCHEMA "bcsaas" AUTHORIZATION "odd""role"');
    });

    it('creates the schema plain with a Warning naming the remedy when the installer cannot act as the owner', async () => {
        const { provider, executeSql } = makeMockProvider([[], [{ OwnerName: 'mj_codegen', IsMember: false }]], 'postgresql');
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(sqlAt(executeSql, 2)).toBe('CREATE SCHEMA "bcsaas"');
        expect(result.Warning).toContain('mj_codegen');
        expect(result.Warning).toContain('cannot act as');
        expect(result.Warning).toContain('must be owner of schema');
        expect(result.Warning).toContain('ALTER SCHEMA "bcsaas" OWNER TO "mj_codegen"');
        expect(result.Warning).toContain('REASSIGN OWNED');
        expect(result.Warning).toContain('Schema ownership on PostgreSQL');
    });

    it('creates the schema plain with a Warning when the core schema is not found', async () => {
        const { provider, executeSql } = makeMockProvider([[], []], 'postgresql');
        const result = await CreateAppSchema('bcsaas', provider, { CoreSchema: '__mj' });
        expect(result.Success).toBe(true);
        expect(sqlAt(executeSql, 2)).toBe('CREATE SCHEMA "bcsaas"');
        expect(result.Warning).toMatch(/not found or is not visible/);
        expect(result.Warning).toContain('__mj');
    });

    it('returns Success=false when the CREATE fails', async () => {
        const executeSql = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ OwnerName: 'mj_codegen', IsMember: true }])
            .mockRejectedValueOnce(new Error('permission denied for database'));
        const provider = { ExecuteSQL: executeSql, Dialect: GetDialect('postgresql') } as unknown as DatabaseProviderBase;
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('permission denied for database');
    });

    it('leaves the SQL Server path unchanged: sys.schemas probe, no pg_namespace', async () => {
        const { provider, executeSql } = makeMockProvider(
            [[], [{ OwnerName: 'dbo', CurrentUser: 'installer', CanImpersonateOwner: 1, CanControlDatabase: 1 }]],
            'sqlserver'
        );
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result).toEqual({ Success: true });
        expect(sqlAt(executeSql, 1)).toContain('sys.schemas');
        expect(sqlAt(executeSql, 1)).not.toContain('pg_namespace');
        expect(sqlAt(executeSql, 2)).toBe('CREATE SCHEMA [bcsaas] AUTHORIZATION [dbo]');
    });
});
