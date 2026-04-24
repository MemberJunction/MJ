/**
 * Tests for schema name validation, including the double-underscore override.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseProviderBase } from '@memberjunction/core';
import { CreateAppSchema, ValidateSchemaName } from '../install/schema-manager.js';

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
function makeMockProvider(sqlResults: Array<Array<Record<string, unknown>>>): {
    provider: DatabaseProviderBase;
    executeSql: ReturnType<typeof vi.fn>;
} {
    const queue = [...sqlResults];
    const executeSql = vi.fn(async () => queue.shift() ?? []);
    // Only the ExecuteSQL surface is used by CreateAppSchema.
    return { provider: { ExecuteSQL: executeSql } as unknown as DatabaseProviderBase, executeSql };
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
