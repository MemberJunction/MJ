import { describe, it, expect } from 'vitest';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
// Side effect: evaluates EVERY checks module so the auto-derived guard at the bottom of this
// file sees the complete registry (the explicit imports below cover only the hand-pinned
// table's bundles — the barrel covers all of them).
import '../index';
import { ServerCacheChecks } from '../checks/server-cache.checks';
import { CacheImmutabilityChecks } from '../checks/cache-immutability.checks';
import { ClientCacheChecks } from '../checks/client-cache.checks';
import { RunQueryCacheChecks } from '../checks/runquery-cache.checks';
import { RlsIsolationChecks, RlsIsolationClientChecks } from '../checks/rls-isolation.checks';
import { KeyRowFilterChecks } from '../checks/keyrowfilter.checks'; // must be imported AFTER rls-isolation.checks: registry order = RLS* then KF*
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
import { EntityGraphChecks } from '../checks/entity-graph.checks';
import { EntityGraphClientChecks } from '../checks/entity-graph-client.checks';
import { TaskGraphOrchestrationChecks } from '../checks/task-graph-orchestration.checks';
import { EntityActionChecks } from '../checks/entity-actions.checks';
import { TaskGraphExecutionChecks } from '../checks/task-graph-execution.checks';

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
        ['cache-immutability', CacheImmutabilityChecks, 15], // F1-F15 freeze-on-write runtime contract (IT81); F13/F14 cover review findings C1/C2, F15 covers M3 (dataset key collision)
        ['client-cache', ClientCacheChecks, 13],
        ['runquery-cache', RunQueryCacheChecks, 12], // Q11 (B46 category collision) + Q12 (B45 hit-vs-miss permission parity) added 2026-07-20
        // RLS1–RLS10 (rls-isolation.checks.ts) + KF1–KF6 (keyrowfilter.checks.ts, API-key row filters) share one bundle
        ['rls-isolation', [...RlsIsolationChecks, ...KeyRowFilterChecks], 15],
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
        ['entity-graph', EntityGraphChecks, 11], // EG1-EG8 related-record collection graph saves (IT72)
        ['entity-graph-client', EntityGraphClientChecks, 9], // EGC1-EGC9 graph saves over the GraphQL wire (IT73)
        ['task-graph-orchestration', TaskGraphOrchestrationChecks, 18], // TG1-TG18 submission, validation and trigger bindings (IT71)
        // TX1-TX27, the dispatcher actually running graphs (IT74). TX8-TX11 landed with Round 1
        // (#3745), TX12-TX17 with Round 2, TX18-TX26 with Round 3, and TX27 with the two-instance exercise. TX14 arrived in a substituted
        // shape: the plan named an injected `Save()` failure, which is unreachable from the bundle,
        // so it triggers the same run-half `defer` verdict through an unreadable run instead. Every
        // move of this count has been deliberate, which is what the guard is for.
        ['task-graph-execution', TaskGraphExecutionChecks, 27],
        ['entity-actions', EntityActionChecks, 8], // EA1-EA8 the entity-action substrate end to end (IT75)
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

describe('ALL-bundle coverage-loss guard (auto-derived from the registry)', () => {
    // Every bundle the IT metadata selects, pinned to its exact registered check count. The
    // hand-annotated table above documents the majors; THIS map is the complete drift guard —
    // before it existed, only 38 of the 70 bundles had a dropped-check guard, so a silently
    // lost check in the 2026-07 expansion (permission-engine, scope-enforcement, …) could
    // not fail the build. When you add/remove a check DELIBERATELY, update the count here;
    // the failure message prints a paste-ready copy of the actual registry state.
    const EXPECTED_BUNDLE_COUNTS: Record<string, number> = {
        'actions-pipeline': 5,
        'agent-artifact-tools': 9,
        'agent-carry-forward': 6,
        'agent-compaction-e2e': 3,
        'agent-external-harness': 7,
        'agent-loop-live': 7,
        'agent-loop-standin': 6,
        'agent-memory-guards': 5,
        'agent-payload-guards': 9,
        'agent-plan-mode': 6,
        'agent-rag-search': 7,
        'agent-runner': 1,
        'agent-skills-live': 5,
        'agent-wire-callback': 2,
        'aggregates-cache': 3,
        'ai-cost': 6,
        'ai-embeddings': 5,
        'ai-permissions': 6,
        'ai-providers': 3,
        'ai-skills': 21,
        'api-keys': 3,
        'app-behavioral': 3,
        'app-wiring': 10,
        'auth-validation': 7,
        'cache-gauntlet': 8,
        'cache-immutability': 15,
        'class-resolution': 5,
        'client-cache': 13,
        'codegen-determinism': 6,
        'communication': 5,
        'concurrent': 2,
        'content-vectorization': 6,
        'conversation-compaction': 12,
        'dataset-cache': 3,
        'entity-actions': 8,
        'entity-graph': 11,
        'entity-graph-client': 9,
        'entity-server-invariants': 9,
        'entity-writes': 9,
        'field-rules-bulk-update': 3,
        'layered-base-views': 6,
        'lists': 3,
        'metadata-consistency': 7,
        'metadata-sync': 9,
        'open-app-teardown': 2,
        'permission-engine': 14,
        'predictive-studio': 5,
        'prompt-runner': 1,
        'queue': 7,
        'realtime-deterministic': 9,
        'record-process': 12,
        'record-process-facade': 2,
        'remote-op-ai-authoring': 3,
        'remote-op-wire-progress': 1,
        'remote-operations': 7,
        'rls-isolation': 15,
        'rls-isolation-client': 1,
        'runquery-cache': 12,
        'runquery-catalog': 6,
        'runquery-features': 16,
        'runquery-params': 10,
        'runview-features': 6,
        'runview-matrix': 18,
        'scheduled-jobs': 2,
        'scheduling-concurrency': 3,
        'scope-enforcement': 5,
        'scoped-anon-elevation': 5,
        'search': 7,
        'server-cache': 32,
        'shipped-agents-live': 4,
        'startup-mode': 3,
        'storage': 6,
        'subscription-isolation': 2,
        'task-graph-execution': 26,
        'task-graph-orchestration': 18,
        'templates': 8,
        'transaction-groups': 5,
        'user-routines': 16,
        'view-execution': 12,
        'view-security': 4,
        'workflow-demo-agents': 5,
    };

    // Registrations made by the unit tests earlier in THIS file (regtest/bundleX/bundleY),
    // plus the framework's internal non-suite bundle. Never part of the shipped catalog.
    const TEST_LOCAL_PREFIXES = new Set(['regtest', 'bundleX', 'bundleY', 'lifecycletest', 'self-test']);

    it('every registered bundle is pinned with its exact check count (no silent drops, no unpinned additions)', () => {
        const reg = IntegrationCheckRegistry.Instance;
        const actual: Record<string, number> = {};
        for (const name of reg.GetBundleNames()) {
            if (TEST_LOCAL_PREFIXES.has(name)) {
                continue;
            }
            actual[name] = reg.GetBundle(name).length;
        }
        const pasteReady = Object.keys(actual)
            .sort()
            .map(k => `        '${k}': ${actual[k]},`)
            .join('\n');
        expect(actual, `Registry drifted from EXPECTED_BUNDLE_COUNTS. Current registry state (paste over the map if the change is deliberate):\n${pasteReady}`).toEqual(EXPECTED_BUNDLE_COUNTS);
    });

    it('the pinned catalog covers exactly the bundles the IT metadata selects (sibling-parity owns name matching; this pins the COUNT of bundles)', () => {
        expect(Object.keys(EXPECTED_BUNDLE_COUNTS)).toHaveLength(81);
    });
});
