import { describe, it, expect } from 'vitest';
import { IntegrationCheckRegistry } from '../check-registry';
import type { NamedCheck } from '../check';
import { ServerCacheChecks } from '../checks/server-cache.checks';
import { ClientCacheChecks } from '../checks/client-cache.checks';
import { RunQueryCacheChecks } from '../checks/runquery-cache.checks';
import { RlsIsolationChecks, RlsIsolationClientChecks } from '../checks/rls-isolation.checks';
import { RecordProcessChecks } from '../checks/record-process.checks';
import { RecordProcessFacadeChecks } from '../checks/record-process-facade.checks';
import { ScheduledJobsChecks } from '../checks/scheduled-jobs.checks';
import { FieldRulesBulkUpdateChecks } from '../checks/field-rules-bulk-update.checks';
import { RemoteOperationsChecks } from '../checks/remote-operations.checks';
import { AiSkillsChecks } from '../checks/ai-skills.checks';
import { ApiKeysChecks } from '../checks/api-keys.checks';
import { PredictiveStudioChecks } from '../checks/predictive-studio.checks';
import { RemoteOpWireProgressChecks } from '../checks/remote-op-wire-progress.checks';
import { PromptRunnerChecks } from '../checks/prompt-runner.checks';
import { ConcurrentChecks } from '../checks/concurrent.checks';
import { AgentRunnerChecks } from '../checks/agent-runner.checks';
import { RemoteOpAiAuthoringChecks } from '../checks/remote-op-ai-authoring.checks';
import { ListsChecks } from '../checks/lists.checks';
import { OpenAppTeardownChecks } from '../checks/open-app-teardown.checks';
import { UserRoutinesChecks } from '../checks/user-routines.checks';

const makeCheck = (id: string): NamedCheck => ({ Id: id, Name: id, Fn: async () => { /* pass */ } });

describe('IntegrationCheckRegistry', () => {
    it('registers and retrieves a check by Id', () => {
        const reg = IntegrationCheckRegistry.Instance;
        reg.Register(makeCheck('regtest.A'));
        expect(reg.Get('regtest.A')?.Id).toBe('regtest.A');
    });

    it('GetBundle returns only checks whose Id starts with "<prefix>."', () => {
        const reg = IntegrationCheckRegistry.Instance;
        reg.Register(makeCheck('bundleX.one'));
        reg.Register(makeCheck('bundleX.two'));
        reg.Register(makeCheck('bundleY.one'));
        const ids = reg.GetBundle('bundleX').map(c => c.Id).sort();
        expect(ids).toEqual(['bundleX.one', 'bundleX.two']);
    });

    it('returns undefined for an unknown Id (tolerant by design)', () => {
        expect(IntegrationCheckRegistry.Instance.Get('definitely.unknown.xyz')).toBeUndefined();
    });

    it('Instance is a stable singleton', () => {
        expect(IntegrationCheckRegistry.Instance).toBe(IntegrationCheckRegistry.Instance);
    });
});

describe('migrated bundles (coverage-loss guard)', () => {
    const bundles: Array<[string, NamedCheck[], number]> = [
        ['server-cache', ServerCacheChecks, 31],
        ['client-cache', ClientCacheChecks, 13],
        ['runquery-cache', RunQueryCacheChecks, 10],
        ['rls-isolation', RlsIsolationChecks, 9],
        ['rls-isolation-client', RlsIsolationClientChecks, 1],
        ['record-process', RecordProcessChecks, 8],
        ['record-process-facade', RecordProcessFacadeChecks, 2],
        ['scheduled-jobs', ScheduledJobsChecks, 2],
        ['field-rules-bulk-update', FieldRulesBulkUpdateChecks, 3],
        ['remote-operations', RemoteOperationsChecks, 7],
        ['ai-skills', AiSkillsChecks, 21],
        ['api-keys', ApiKeysChecks, 3],
        ['predictive-studio', PredictiveStudioChecks, 5],
        ['remote-op-wire-progress', RemoteOpWireProgressChecks, 1],
        ['prompt-runner', PromptRunnerChecks, 1],
        ['concurrent', ConcurrentChecks, 2],
        ['agent-runner', AgentRunnerChecks, 1],
        ['remote-op-ai-authoring', RemoteOpAiAuthoringChecks, 3],
        ['lists', ListsChecks, 3],
        ['open-app-teardown', OpenAppTeardownChecks, 2],
        ['user-routines', UserRoutinesChecks, 16]
    ];

    for (const [prefix, checks, expectedCount] of bundles) {
        describe(prefix, () => {
            it(`has exactly ${expectedCount} checks`, () => {
                expect(checks).toHaveLength(expectedCount);
            });

            it('has unique, prefix-namespaced Ids and non-empty Names', () => {
                const ids = checks.map(c => c.Id);
                expect(new Set(ids).size).toBe(ids.length); // no dupes → no silently dropped check
                for (const c of checks) {
                    expect(c.Id.startsWith(prefix + '.')).toBe(true);
                    expect(c.Name.trim().length).toBeGreaterThan(0);
                }
            });

            it('registered itself on the singleton in array order (ordering is load-bearing)', () => {
                const registered = IntegrationCheckRegistry.Instance.GetBundle(prefix).map(c => c.Id);
                expect(registered).toEqual(checks.map(c => c.Id));
            });
        });
    }

    it('server-cache marks exactly S17/S23/S24/S29/S30 as RequiresMutation', () => {
        const mutating = ServerCacheChecks.filter(c => c.RequiresMutation).map(c => c.Id);
        expect(mutating.sort()).toEqual(['server-cache.S17', 'server-cache.S23', 'server-cache.S24', 'server-cache.S29', 'server-cache.S30']);
    });

    it('client-cache marks exactly C10 as RequiresMutation', () => {
        const mutating = ClientCacheChecks.filter(c => c.RequiresMutation).map(c => c.Id);
        expect(mutating).toEqual(['client-cache.C10']);
    });

    it('runquery-cache marks nothing RequiresMutation (the whole bundle mutates by design)', () => {
        expect(RunQueryCacheChecks.some(c => c.RequiresMutation)).toBe(false);
    });
});
