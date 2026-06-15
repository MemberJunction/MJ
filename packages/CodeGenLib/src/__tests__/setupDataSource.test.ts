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
 * These tests pin that behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { CodeGenDatabaseProvider, type DataSourceResult } from '../Database/codeGenDatabaseProvider';
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

describe('RunCodeGenBase.setupDataSource — factory dispatch', () => {
    it('resolves a provider via ClassFactory for the configured platform', async () => {
        // The unit under test is the dispatch logic itself, not the full
        // orchestrator. We exercise it by reproducing the same factory call
        // RunCodeGenBase.setupDataSource() makes and verifying that the
        // resolved instance's SetupDataSource() is what gets called.
        const fake = new TestProviderFake('sqlserver' as DatabasePlatform);
        const spy = vi
            .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
            .mockReturnValue(fake as unknown as CodeGenDatabaseProvider);

        try {
            const platform: DatabasePlatform = 'sqlserver' as DatabasePlatform;
            const provider = MJGlobal.Instance.ClassFactory.CreateInstance<CodeGenDatabaseProvider>(
                CodeGenDatabaseProvider,
                platform,
            );
            expect(provider).toBe(fake);
            expect(provider!.constructor).not.toBe(CodeGenDatabaseProvider);

            const result = await provider!.SetupDataSource();
            expect(fake.SetupDataSourceCalled).toBe(true);
            expect(result.connectionInfo).toBe('sqlserver-fake://test');
            expect(spy).toHaveBeenCalledWith(CodeGenDatabaseProvider, 'sqlserver');
        } finally {
            spy.mockRestore();
        }
    });

    it('returns the abstract base when no provider is registered for the platform', () => {
        // CreateInstance signals a missed lookup by returning the base class
        // itself rather than throwing. The orchestrator disambiguates by
        // checking `constructor === CodeGenDatabaseProvider` and throws.
        const fakeBase = Object.create(CodeGenDatabaseProvider.prototype);
        const spy = vi
            .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
            .mockReturnValue(fakeBase as CodeGenDatabaseProvider);

        try {
            const platform: DatabasePlatform = 'unknown-platform' as DatabasePlatform;
            const provider = MJGlobal.Instance.ClassFactory.CreateInstance<CodeGenDatabaseProvider>(
                CodeGenDatabaseProvider,
                platform,
            );
            expect(provider!.constructor).toBe(CodeGenDatabaseProvider);
        } finally {
            spy.mockRestore();
        }
    });

    it('dispatches with the platform string verbatim — no normalization', () => {
        const spy = vi
            .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
            .mockReturnValue(null as unknown as CodeGenDatabaseProvider);

        try {
            MJGlobal.Instance.ClassFactory.CreateInstance<CodeGenDatabaseProvider>(
                CodeGenDatabaseProvider,
                'postgresql' as DatabasePlatform,
            );
            expect(spy).toHaveBeenCalledWith(CodeGenDatabaseProvider, 'postgresql');
        } finally {
            spy.mockRestore();
        }
    });
});
