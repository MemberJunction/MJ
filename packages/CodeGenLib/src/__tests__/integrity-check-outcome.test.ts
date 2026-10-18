import { describe, it, expect, vi } from 'vitest';

// system_integrity imports ../Config/config, which runs cosmiconfig at module load and pulls in
// @memberjunction/core + ora via status_logging. Stub the same edges config.test.ts does so this
// file tests the classifier and nothing else.
vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: vi.fn().mockReturnValue({ search: vi.fn().mockReturnValue(null) }),
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    FormatFileMessage: vi.fn((m: string) => m),
    FormatConsoleMessage: vi.fn((m: string) => m),
    SeverityType: { Info: 'Info', Warning: 'Warning', Critical: 'Critical' },
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn().mockReturnValue(null) } } },
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    resolveDbPlatformFromEnv: vi.fn().mockReturnValue(undefined),
}));

vi.mock('@memberjunction/config', () => ({
    mergeConfigs: vi.fn((...configs: unknown[]) => Object.assign({}, ...configs)),
    parseBooleanEnv: vi.fn((value: string | undefined, defaultValue: boolean) =>
        value === undefined || value === null ? defaultValue : value.toLowerCase() === 'true',
    ),
}));

vi.mock('ora-classic', () => ({ default: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })) }));

import { SystemIntegrityBase, type IntegrityCheckResult } from '../Misc/system_integrity';

const pass = (Name: string): IntegrityCheckResult => ({ Name, Success: true, Message: '' });
const fail = (Name: string, Message: string): IntegrityCheckResult => ({ Name, Success: false, Message });

/**
 * `runCodeGen` used to call `RunIntegrityChecks`, throw the returned array away, and print a
 * success tick unconditionally — so a run that had just logged `Integrity check FAILED` reported
 * `success: true, errors: []`. The discard is fixed. This pins the classification that fix rests
 * on, including the case the fix did not cover.
 */
describe('SystemIntegrityBase.ClassifyResults', () => {
    it('reports an empty array as none-ran, NOT as a pass', () => {
        // The whole reason this function exists. `RunIntegrityChecks(pool, true)` returns [] when
        // every check is configured off, and [] satisfies "no failures" — so a caller that asks
        // only "were there failures?" prints a green tick over nothing measured. That is the same
        // defect as discarding the results, and it is reachable by the ordinary act of setting
        // integrityChecks.enabled to false to quiet a check that is failing.
        expect(SystemIntegrityBase.ClassifyResults([])).toEqual({ Kind: 'none-ran' });
    });

    it('reports all-successful results as passed, with the count that was measured', () => {
        expect(SystemIntegrityBase.ClassifyResults([pass('a'), pass('b')])).toEqual({
            Kind: 'passed',
            Count: 2,
        });
    });

    it('reports a failure as failed and carries the failing results through', () => {
        const bad = fail('entityFieldsSequenceCheck', 'Entity MJ: Entities has duplicate sequences');
        expect(SystemIntegrityBase.ClassifyResults([bad])).toEqual({ Kind: 'failed', Failures: [bad] });
    });

    it('fails on a mixed batch and surfaces only the failures', () => {
        // The caller names the failing checks in its spinner line; a passing check leaking into
        // Failures would send the operator to look at a check that is fine.
        const bad = fail('b', 'boom');
        expect(SystemIntegrityBase.ClassifyResults([pass('a'), bad, pass('c')])).toEqual({
            Kind: 'failed',
            Failures: [bad],
        });
    });

    it('fails on the synthetic "_" result RunIntegrityChecks pushes when a check throws', () => {
        // RunIntegrityChecks catches its own errors and pushes { Name: '_', Success: false }. That
        // path must fail the run like any other failure, not slip through on its odd name.
        const thrown = fail('_', 'Error running integrity checks: connection reset');
        expect(SystemIntegrityBase.ClassifyResults([thrown]).Kind).toBe('failed');
    });
});
