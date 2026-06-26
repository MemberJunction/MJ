/**
 * Tests for the factory-based `setupDataSource()` dispatch in
 * `RunCodeGenBase`. Verifies that the orchestrator resolves the correct
 * `CodeGenDatabaseProvider` via `MJGlobal.Instance.ClassFactory` for each
 * registered platform and throws a descriptive error when no provider is
 * registered for the active `dbPlatform`.
 *
 * The pre-refactor `setupDataSource()` switched on `dbPlatform` inline; the
 * refactor pushes platform selection through the same factory pattern the
 * rest of CodeGen already uses (see `manage-metadata.ts`'s `get dbProvider()`).
 *
 * These tests exercise the real `resolveCodeGenDatabaseProvider()` function
 * that the orchestrator delegates to — not a transcribed copy of the dispatch
 * logic. If the orchestrator function drifts (different error message, missing
 * disambiguation against the abstract base, etc.) these tests fail, which is
 * exactly what we want from regression coverage.
 */
import { describe, it, expect, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { CodeGenDatabaseProvider, resolveCodeGenDatabaseProvider, type DataSourceResult } from '../Database/codeGenDatabaseProvider';
import type { DatabasePlatform } from '@memberjunction/sql-dialect';

class TestProviderFake extends CodeGenDatabaseProvider {
    public SetupDataSourceCalled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(private readonly _platform: DatabasePlatform = 'sqlserver' as DatabasePlatform, private readonly _result?: DataSourceResult) {
        super();
    }

    get Dialect(): never {
        throw new Error('not implemented in test fake');
    }

    get PlatformKey(): DatabasePlatform {
        return this._platform;
    }

    async SetupDataSource(): Promise<DataSourceResult> {
        this.SetupDataSourceCalled = true;
        return (
            this._result ?? {
                provider: {} as unknown as DataSourceResult['provider'],
                connection: {} as unknown as DataSourceResult['connection'],
                currentUser: {} as unknown as DataSourceResult['currentUser'],
                connectionInfo: `${this._platform}-fake://test`,
            }
        );
    }

    // The base class declares 30+ abstract members. We don't exercise any of
    // them in these tests, so we deliberately leave them undefined — TypeScript
    // is satisfied via the explicit cast at the spy site below.
    /* eslint-disable @typescript-eslint/no-explicit-any */
}

describe('resolveCodeGenDatabaseProvider — factory dispatch', () => {
    it('resolves and returns a registered provider for the requested platform', async () => {
        const fake = new TestProviderFake('sqlserver' as DatabasePlatform);
        const spy = vi
            .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
            .mockReturnValue(fake as unknown as CodeGenDatabaseProvider);

        try {
            const provider = resolveCodeGenDatabaseProvider('sqlserver' as DatabasePlatform);
            expect(provider).toBe(fake);
            // Verify the factory was actually consulted with the right key.
            expect(spy).toHaveBeenCalledWith(CodeGenDatabaseProvider, 'sqlserver');

            // And the caller can use the returned provider end-to-end.
            const result = await provider.SetupDataSource();
            expect(fake.SetupDataSourceCalled).toBe(true);
            expect(result.connectionInfo).toBe('sqlserver-fake://test');
        } finally {
            spy.mockRestore();
        }
    });

    it('throws a descriptive error when no provider is registered for the platform', () => {
        // CreateInstance signals a missed lookup by returning the base class
        // itself rather than throwing. resolveCodeGenDatabaseProvider() must
        // disambiguate and throw, with a message that names the platform and
        // points the user at the @RegisterClass call they're missing.
        const fakeBase = Object.create(CodeGenDatabaseProvider.prototype);
        const spy = vi
            .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
            .mockReturnValue(fakeBase as CodeGenDatabaseProvider);

        try {
            expect(() => resolveCodeGenDatabaseProvider('unknown-platform' as DatabasePlatform))
                .toThrow(/dbPlatform='unknown-platform' not found/);
            expect(() => resolveCodeGenDatabaseProvider('unknown-platform' as DatabasePlatform))
                .toThrow(/@RegisterClass\(CodeGenDatabaseProvider, 'unknown-platform'\)/);
        } finally {
            spy.mockRestore();
        }
    });

    it('throws when CreateInstance returns null (no registration at all)', () => {
        const spy = vi
            .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
            .mockReturnValue(null as unknown as CodeGenDatabaseProvider);

        try {
            expect(() => resolveCodeGenDatabaseProvider('postgresql' as DatabasePlatform))
                .toThrow(/dbPlatform='postgresql' not found/);
        } finally {
            spy.mockRestore();
        }
    });

    it('passes the platform string verbatim — no normalization', () => {
        const fake = new TestProviderFake();
        const spy = vi
            .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
            .mockReturnValue(fake as unknown as CodeGenDatabaseProvider);

        try {
            resolveCodeGenDatabaseProvider('postgresql' as DatabasePlatform);
            expect(spy).toHaveBeenCalledWith(CodeGenDatabaseProvider, 'postgresql');
        } finally {
            spy.mockRestore();
        }
    });
});
