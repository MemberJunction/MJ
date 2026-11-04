import { describe, expect, it } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';
import { FieldSecuritySQLGate } from '../generic/fieldSecuritySQLGate';
import { IMetadataProvider } from '../generic/interfaces';
import { LocalCacheManager } from '../generic/localCacheManager';
import { UserInfo } from '../generic/securityInfo';
import { RunViewParametersKey, RunViewParams } from '../views/runView';

describe('RunViewParametersKey & RunViewParams.Parameters', () => {
    it('returns empty string for undefined, null, or empty parameter maps', () => {
        expect(RunViewParametersKey(undefined)).toBe('');
        expect(RunViewParametersKey(null)).toBe('');
        expect(RunViewParametersKey({})).toBe('');
        expect(RunViewParametersKey({ unused: undefined as unknown as null })).toBe('');
    });

    it('produces identical keys regardless of property order or leading @', () => {
        const k1 = RunViewParametersKey({ b: 2, a: 'hello' });
        const k2 = RunViewParametersKey({ '@a': 'hello', '@b': 2 });
        expect(k1).toBe(k2);
        expect(k1.length).toBeGreaterThan(0);
    });

    it('distinguishes Date instances from ISO strings and preserves array order', () => {
        const iso = '2026-04-01T12:00:00.000Z';
        const dateKey = RunViewParametersKey({ since: new Date(iso) });
        const strKey = RunViewParametersKey({ since: iso });
        expect(dateKey).not.toBe(strKey);

        const arr1 = RunViewParametersKey({ ids: ['a', 'b'] });
        const arr2 = RunViewParametersKey({ ids: ['b', 'a'] });
        expect(arr1).not.toBe(arr2);
    });

    it('escapes pipe characters so pipe-delimited cache fingerprints are never split', () => {
        const key = RunViewParametersKey({ filter: 'a|b|c' });
        expect(key).not.toContain('|');
        expect(key).toContain('\\u007c');
    });

    it('compares Parameters in RunViewParams.Equals', () => {
        const base: RunViewParams = {
            EntityName: 'MJ: Users',
            ExtraFilter: 'Status = @status AND IsActive = @active',
        };
        expect(
            RunViewParams.Equals(
                { ...base, Parameters: { status: 'Active', active: true } },
                { ...base, Parameters: { '@active': true, '@status': 'Active' } },
            ),
        ).toBe(true);

        expect(
            RunViewParams.Equals(
                { ...base, Parameters: { status: 'Active', active: true } },
                { ...base, Parameters: { status: 'Inactive', active: true } },
            ),
        ).toBe(false);

        expect(
            RunViewParams.Equals(
                { ...base, Parameters: { status: 'Active' } },
                base,
            ),
        ).toBe(false);
    });

    it('includes prm: segment in GenerateRunViewFingerprint only when Parameters are non-empty', () => {
        const base: RunViewParams = { EntityName: 'MJ: Users', ExtraFilter: 'Status = @status' };
        const baseFp = LocalCacheManager.Instance.GenerateRunViewFingerprint(base);
        const emptyFp = LocalCacheManager.Instance.GenerateRunViewFingerprint({ ...base, Parameters: {} });
        expect(emptyFp).toBe(baseFp);
        expect(baseFp.split('|').some((seg) => seg.startsWith('prm:'))).toBe(false);

        const paramFp = LocalCacheManager.Instance.GenerateRunViewFingerprint({
            ...base,
            Parameters: { status: 'Active|Pending' },
        });
        expect(paramFp).not.toBe(baseFp);
        const segments = paramFp.split('|');
        const prmSegments = segments.filter((seg) => seg.startsWith('prm:'));
        expect(prmSegments).toHaveLength(1);
    });

    it('FieldSecuritySQLGate permits @paramName tokens even when paramName matches a denied field on SQL Server and PostgreSQL', () => {
        const user = new UserInfo(null as unknown as IMetadataProvider, {
            ID: '11111111-1111-4111-8111-111111111111',
            Email: 'user@example.com',
            Name: 'User',
        });
        const entityStub = {
            ID: '22222222-2222-4222-8222-222222222222',
            Name: 'MJ: Users',
            BaseView: 'vwUsers',
            BaseTable: 'User',
            FieldLevelSecurityApplies: true,
            Fields: [
                { Name: 'ID', CodeName: 'ID' },
                { Name: 'Status', CodeName: 'Status' },
                { Name: 'Salary', CodeName: 'Salary' },
            ],
            GetDeniedReadFields: () => new Set(['salary']),
        } as unknown as EntityInfo;

        for (const dialect of ['sqlserver', 'postgresql'] as const) {
            const context = {
                User: user,
                Dialect: dialect,
                Catalog: [entityStub],
                TargetEntity: entityStub,
            };

            expect(FieldSecuritySQLGate.FindViolation('Status = @Salary', context)).toBeNull();
            expect(FieldSecuritySQLGate.FindViolation('Salary = @status', context)).not.toBeNull();
        }
    });
});
