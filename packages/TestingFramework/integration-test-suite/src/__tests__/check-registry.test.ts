import { describe, it, expect } from 'vitest';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { ServerCacheChecks } from '../checks/server-cache.checks';
import { CacheImmutabilityChecks } from '../checks/cache-immutability.checks';
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
import { ConversationCompactionChecks } from '../checks/conversation-compaction.checks';
import { ListsChecks } from '../checks/lists.checks';
import { OpenAppTeardownChecks } from '../checks/open-app-teardown.checks';
import { UserRoutinesChecks } from '../checks/user-routines.checks';
import { AgentLoopLiveChecks } from '../checks/agent-loop-live.checks';
import { ShippedAgentsLiveChecks } from '../checks/shipped-agents-live.checks';
import { AgentCarryForwardChecks } from '../checks/agent-carry-forward.checks';
import { PayloadGuardsChecks } from '../checks/agent-payload-guards.checks';
import { ArtifactToolsChecks } from '../checks/agent-artifact-tools.checks';
import { AgentSkillsLiveChecks } from '../checks/agent-skills-live.checks';
import { AgentPlanModeChecks } from '../checks/agent-plan-mode.checks';
import { AgentCompactionE2EChecks } from '../checks/agent-compaction-e2e.checks';
import { AgentMemoryGuardsChecks } from '../checks/agent-memory-guards.checks';
import { AgentRagSearchChecks } from '../checks/agent-rag-search.checks';
import { AgentWireCallbackChecks } from '../checks/agent-wire-callback.checks';
import { ViewSecurityChecks } from '../checks/view-security.checks';
import { AiProvidersChecks } from '../checks/ai-providers.checks';
import { AppBehavioralChecks } from '../checks/app-behavioral.checks';
import { ContentVectorizationChecks } from '../checks/content-vectorization.checks';
import { ScopedAnonElevationChecks } from '../checks/scoped-anon-elevation.checks';

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

    it('registers and retrieves a bundle lifecycle by bundle name', async () => {
        const reg = IntegrationCheckRegistry.Instance;
        const calls: string[] = [];
        reg.RegisterLifecycle('lifecycletest', {
            Setup: async () => { calls.push('setup'); },
            Teardown: async () => { calls.push('teardown'); },
        });
        const lc = reg.GetLifecycle('lifecycletest');
        expect(lc).toBeDefined();
        const ctx = {} as unknown as IntegrationCheckContext; // unused by this lifecycle
        await lc!.Setup(ctx);
        await lc!.Teardown(ctx);
        expect(calls).toEqual(['setup', 'teardown']);
    });

    it('GetLifecycle returns undefined for a bundle with no registered lifecycle', () => {
        expect(IntegrationCheckRegistry.Instance.GetLifecycle('no.such.bundle.lifecycle')).toBeUndefined();
    });
});

describe('migrated bundles (coverage-loss guard)', () => {
    const bundles: Array<[string, NamedCheck[], number]> = [
        ['server-cache', ServerCacheChecks, 32],
        ['cache-immutability', CacheImmutabilityChecks, 14], // F1-F14 freeze-on-write runtime contract (IT69); F13/F14 added red-first for the PR #3425 review findings C1/C2
        ['client-cache', ClientCacheChecks, 13],
        ['runquery-cache', RunQueryCacheChecks, 12], // Q11 (B46 category collision) + Q12 (B45 hit-vs-miss permission parity) added 2026-07-20
        ['rls-isolation', RlsIsolationChecks, 9],
        ['rls-isolation-client', RlsIsolationClientChecks, 1],
        ['record-process', RecordProcessChecks, 12],
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
        ['user-routines', UserRoutinesChecks, 16],
        ['conversation-compaction', ConversationCompactionChecks, 12], // CC1-CC12
        ['agent-loop-live', AgentLoopLiveChecks, 7],
        ['shipped-agents-live', ShippedAgentsLiveChecks, 4],
        ['agent-carry-forward', AgentCarryForwardChecks, 6],
        ['agent-payload-guards', PayloadGuardsChecks, 9],
        ['agent-artifact-tools', ArtifactToolsChecks, 9],
        ['agent-skills-live', AgentSkillsLiveChecks, 5],
        ['agent-plan-mode', AgentPlanModeChecks, 6],
        ['agent-compaction-e2e', AgentCompactionE2EChecks, 3],
        ['agent-memory-guards', AgentMemoryGuardsChecks, 5],
        ['agent-rag-search', AgentRagSearchChecks, 7], // extended-agents suite (live-model, IT53-62)
        ['agent-wire-callback', AgentWireCallbackChecks, 2], // over-the-wire fire-and-forget callback (IT63)
        ['view-security', ViewSecurityChecks, 4], // two-identity V14/V15/V16 + RV17 (IT64)
        ['ai-providers', AiProvidersChecks, 3], // AI7/AI13/AI15 model-resolution seams (IT65)
        ['app-behavioral', AppBehavioralChecks, 3], // S4/S6/S8 Application behaviors (IT66)
        ['content-vectorization', ContentVectorizationChecks, 6], // CV1-CV6 content vectorization pipeline (IT67)
        ['scoped-anon-elevation', ScopedAnonElevationChecks, 5], // SA1-SA5 scoped-anonymous elevation permission contract (IT68)
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

    it('server-cache marks exactly S17/S23/S24/S29/S30/S31b as RequiresMutation', () => {
        const mutating = ServerCacheChecks.filter(c => c.RequiresMutation).map(c => c.Id);
        expect(mutating.sort()).toEqual(['server-cache.S17', 'server-cache.S23', 'server-cache.S24', 'server-cache.S29', 'server-cache.S30', 'server-cache.S31b']);
    });

    it('client-cache marks exactly C10 as RequiresMutation', () => {
        const mutating = ClientCacheChecks.filter(c => c.RequiresMutation).map(c => c.Id);
        expect(mutating).toEqual(['client-cache.C10']);
    });

    it('runquery-cache marks nothing RequiresMutation (the whole bundle mutates by design)', () => {
        expect(RunQueryCacheChecks.some(c => c.RequiresMutation)).toBe(false);
    });
});
