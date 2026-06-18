/**
 * Tests for schema name validation, including the double-underscore override.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseProviderBase, DatabasePlatform } from '@memberjunction/core';
import { CreateAppSchema, DropAppSchema, SchemaExists, ValidateSchemaName } from '../install/schema-manager.js';

describe('ValidateSchemaName', () => {
    it('accepts a normal schema name', () => {
        const result = ValidateSchemaName('bcsaas');
        expect(result.Success).toBe(true);
    });

    it('rejects exact-match reserved schemas', () => {
        for (const name of ['dbo', 'sys', 'guest', 'INFORMATION_SCHEMA', '__mj']) {
            expect(ValidateSchemaName(name).Success).toBe(false);
        }
    });

    it('rejects __-prefixed names by default', () => {
        const result = ValidateSchemaName('__bcsaas');
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/__/);
    });

    it('accepts __-prefixed names when allowDoubleUnderscore is true', () => {
        const result = ValidateSchemaName('__bcsaas', { allowDoubleUnderscore: true });
        expect(result.Success).toBe(true);
    });

    it('still blocks __mj even when allowDoubleUnderscore is true (exact-reserved)', () => {
        const result = ValidateSchemaName('__mj', { allowDoubleUnderscore: true });
        expect(result.Success).toBe(false);
    });

    it('still blocks dbo when allowDoubleUnderscore is true (exact-reserved)', () => {
        const result = ValidateSchemaName('dbo', { allowDoubleUnderscore: true });
        expect(result.Success).toBe(false);
    });
});

/**
 * Fake provider whose `ExecuteSQL` returns the first array in a scripted
 * queue, then empty. Lets us simulate "schema does not yet exist" for the
 * existence check, followed by a no-op for CREATE SCHEMA.
 */
function makeMockProvider(
    sqlResults: Array<Array<Record<string, unknown>>>,
    platform: DatabasePlatform = 'sqlserver'
): {
    provider: DatabaseProviderBase;
    executeSql: ReturnType<typeof vi.fn>;
} {
    const queue = [...sqlResults];
    const executeSql = vi.fn(async () => queue.shift() ?? []);
    // ExecuteSQL + Dialect.PlatformKey are the surfaces used by the schema-manager.
    return {
        provider: { ExecuteSQL: executeSql, Dialect: { PlatformKey: platform } } as unknown as DatabaseProviderBase,
        executeSql,
    };
}

describe('CreateAppSchema with allowDoubleUnderscore override', () => {
    it('rejects __-prefixed schema without the flag and does not issue CREATE SCHEMA', async () => {
        const { provider, executeSql } = makeMockProvider([]);
        const result = await CreateAppSchema('__bcsaas', provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/__/);
        expect(executeSql).not.toHaveBeenCalled();
    });

    it('proceeds past validation for __-prefixed schema when allowDoubleUnderscore is true', async () => {
        // First ExecuteSQL is the SchemaExists probe (return empty = does not exist).
        // Second ExecuteSQL is the CREATE SCHEMA itself.
        const { provider, executeSql } = makeMockProvider([[]]);
        const result = await CreateAppSchema('__bcsaas', provider, { allowDoubleUnderscore: true });
        expect(result.Success).toBe(true);
        // Exactly two SQL calls: existence check + CREATE SCHEMA.
        expect(executeSql).toHaveBeenCalledTimes(2);
        const createCall = executeSql.mock.calls[1][0] as string;
        expect(createCall).toContain('CREATE SCHEMA');
        expect(createCall).toContain('__bcsaas');
    });

    it('still blocks __mj (exact-reserved) even with the flag on, and does not issue CREATE SCHEMA', async () => {
        const { provider, executeSql } = makeMockProvider([]);
        const result = await CreateAppSchema('__mj', provider, { allowDoubleUnderscore: true });
        expect(result.Success).toBe(false);
        expect(executeSql).not.toHaveBeenCalled();
    });

    it('still blocks dbo (exact-reserved) even with the flag on, and does not issue CREATE SCHEMA', async () => {
        const { provider, executeSql } = makeMockProvider([]);
        const result = await CreateAppSchema('dbo', provider, { allowDoubleUnderscore: true });
        expect(result.Success).toBe(false);
        expect(executeSql).not.toHaveBeenCalled();
    });

    it('returns an error if the schema already exists', async () => {
        // Existence probe returns a row → schema exists.
        const { provider } = makeMockProvider([[{ Exists_: 1 }]]);
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/already exists/);
    });
});

describe('SchemaExists — ANSI information_schema (dialect-neutral)', () => {
    it('queries information_schema.schemata, not the SQL-Server-only sys.schemas', async () => {
        const { provider, executeSql } = makeMockProvider([[]], 'postgresql');
        await SchemaExists('bcsaas', provider);
        const sql = executeSql.mock.calls[0][0] as string;
        expect(sql).toContain('information_schema.schemata');
        expect(sql).toContain('schema_name');
        expect(sql).not.toContain('sys.schemas');
    });
});

describe('CreateAppSchema — dialect-aware identifier quoting', () => {
    it('SQL Server quotes with [brackets]', async () => {
        const { provider, executeSql } = makeMockProvider([[]], 'sqlserver');
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[1][0] as string).toBe('CREATE SCHEMA [bcsaas]');
    });

    it('PostgreSQL quotes with "double quotes"', async () => {
        const { provider, executeSql } = makeMockProvider([[]], 'postgresql');
        const result = await CreateAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        expect(executeSql.mock.calls[1][0] as string).toBe('CREATE SCHEMA "bcsaas"');
    });
});

describe('DropAppSchema — PostgreSQL CASCADE vs SQL Server object-drop', () => {
    it('PostgreSQL uses a single DROP SCHEMA ... CASCADE (no sys.* object enumeration)', async () => {
        // [0] existence probe returns a row (exists), then [1] the DROP.
        const { provider, executeSql } = makeMockProvider([[{ Exists_: 1 }]], 'postgresql');
        const result = await DropAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        // Exactly two calls: existence check + the cascading drop.
        expect(executeSql).toHaveBeenCalledTimes(2);
        expect(executeSql.mock.calls[1][0] as string).toBe('DROP SCHEMA "bcsaas" CASCADE');
        // No T-SQL catalog enumeration on PG.
        for (const call of executeSql.mock.calls) {
            expect(call[0] as string).not.toContain('sys.');
            expect(call[0] as string).not.toContain('sp_executesql');
        }
    });

    it('SQL Server empties the schema first (sys.* drops), then DROP SCHEMA without CASCADE', async () => {
        // [0] existence probe (exists) + 7 object-drop batches + final DROP SCHEMA.
        const { provider, executeSql } = makeMockProvider([[{ Exists_: 1 }]], 'sqlserver');
        const result = await DropAppSchema('bcsaas', provider);
        expect(result.Success).toBe(true);
        const allSql = executeSql.mock.calls.map((c) => c[0] as string).join('\n');
        expect(allSql).toContain('sp_executesql'); // object-drop batches ran
        const lastSql = executeSql.mock.calls[executeSql.mock.calls.length - 1][0] as string;
        expect(lastSql).toBe('DROP SCHEMA [bcsaas]');
        expect(lastSql).not.toContain('CASCADE');
    });
});
