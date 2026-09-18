/**
 * The dialect reaches prompt templates through a SYSTEM PLACEHOLDER, not through
 * a registry of TemplateIDs.
 *
 * That choice is the point of these tests. `resolveAllPlaceholders` runs on every
 * prompt render, so every SQL-generating template is parameterised by dialect the
 * moment it references `_SQL_DIALECT_RULES` — nothing has to be registered, and a
 * template added tomorrow cannot be left off a list.
 *
 * What is pinned here:
 *   - the values come from the PROVIDER, and the per-request provider wins;
 *   - a PostgreSQL provider is never handed T-SQL;
 *   - rendering never fails because no provider is configured.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Metadata } from '@memberjunction/core';
import {
    SystemPlaceholderManager,
    DEFAULT_SYSTEM_PLACEHOLDERS,
    SYSTEM_PLACEHOLDER_CATEGORIES,
} from '../prompt.system-placeholders';
import type { AIPromptParams } from '../prompt.types';

/** T-SQL constructs that are hard errors on PostgreSQL. */
const TSQL_ONLY = ['ISNULL(', 'GETDATE()', 'GETUTCDATE()', 'DATEADD(', 'NEWID()', 'TOP 10'];

function paramsFor(platformKey?: string): AIPromptParams {
    return {
        prompt: { Name: 'SQL Query Writer' },
        contextUser: { ID: 'u1', Name: 'Test User' },
        ...(platformKey ? { provider: { PlatformKey: platformKey } } : {}),
    } as unknown as AIPromptParams;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SQL dialect system placeholders', () => {
    it('are registered by default, so every template can reach them', () => {
        const names = DEFAULT_SYSTEM_PLACEHOLDERS.map(p => p.name);
        expect(names).toContain('_SQL_DIALECT');
        expect(names).toContain('_SQL_DIALECT_NAME');
        expect(names).toContain('_SQL_DIALECT_RULES');
    });

    it('are grouped under a Data Platform category for the prompt authoring UI', () => {
        expect(SYSTEM_PLACEHOLDER_CATEGORIES.map(c => c.name)).toContain('Data Platform');
        for (const name of ['_SQL_DIALECT', '_SQL_DIALECT_NAME', '_SQL_DIALECT_RULES']) {
            expect(SystemPlaceholderManager.getPlaceholder(name)?.category).toBe('Data Platform');
        }
    });

    it('resolve from the per-request provider', async () => {
        const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(paramsFor('postgresql'));

        expect(resolved._SQL_DIALECT).toBe('postgresql');
        expect(resolved._SQL_DIALECT_NAME).toBe('PostgreSQL');
        expect(resolved._SQL_DIALECT_RULES).toContain('PostgreSQL');
    });

    it('do not hand a PostgreSQL tenant T-SQL', async () => {
        const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(paramsFor('postgresql'));

        expect(resolved._SQL_DIALECT_RULES).toContain('COALESCE(t.Amount, 0)');
        expect(resolved._SQL_DIALECT_RULES).toContain('LIMIT 10');
        for (const construct of TSQL_ONLY) {
            expect(resolved._SQL_DIALECT_RULES).not.toContain(construct);
        }
        expect(resolved._SQL_DIALECT_NAME).not.toContain('SQL Server');
    });

    it('hand a SQL Server tenant T-SQL', async () => {
        const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(paramsFor('sqlserver'));

        expect(resolved._SQL_DIALECT).toBe('sqlserver');
        expect(resolved._SQL_DIALECT_NAME).toContain('SQL Server');
        expect(resolved._SQL_DIALECT_RULES).toContain('ISNULL(t.Amount, 0)');
        expect(resolved._SQL_DIALECT_RULES).toContain('TOP 10');
    });

    it('prefer the per-request provider over the global one (multi-tenant isolation)', async () => {
        // A SQL Server process-wide provider must not decide the dialect for a
        // request bound to a PostgreSQL tenant.
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(
            { PlatformKey: 'sqlserver' } as unknown as ReturnType<typeof Metadata.Provider>,
        );

        const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(paramsFor('postgresql'));

        expect(resolved._SQL_DIALECT).toBe('postgresql');
    });

    it('fall back to the global provider when the request carries none', async () => {
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(
            { PlatformKey: 'postgresql' } as unknown as ReturnType<typeof Metadata.Provider>,
        );

        const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(paramsFor());

        expect(resolved._SQL_DIALECT).toBe('postgresql');
    });

    it('never fail a render when no provider is configured at all', async () => {
        // `Metadata.Provider` throws outright when there is no global object store.
        vi.spyOn(Metadata, 'Provider', 'get').mockImplementation(() => {
            throw new Error('No global object store, so we cant get the static provider');
        });

        const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(paramsFor());

        // Historical default, not an empty string: an empty briefing would silently
        // strip the dialect section out of every SQL prompt.
        expect(resolved._SQL_DIALECT).toBe('sqlserver');
        expect(resolved._SQL_DIALECT_RULES.length).toBeGreaterThan(0);
    });

    it('degrade to the default for a platform this build has no dialect for', async () => {
        const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(paramsFor('mysql'));

        expect(resolved._SQL_DIALECT).toBe('sqlserver');
        expect(resolved._SQL_DIALECT_RULES.length).toBeGreaterThan(0);
    });
});
