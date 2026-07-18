/**
 * startup-mode.checks.ts — the 'startup-mode' bundle (SM1–SM3).
 *
 * Proves the configurable startup-mode plumbing ('full' | 'task') against the REAL
 * registration set of a live server process: task mode executes zero registered
 * engines, engines still lazy-load on demand afterwards, and a full-mode run
 * executes every sync registration.
 *
 * The bundle mutates only StartupManager's process-level load state (via
 * forceRefresh re-runs) — no DB fixtures, reference-only. Check order matters:
 * SM1 flips the process to a task-mode cached result, SM2 proves on-demand engine
 * load still works from that state, SM3 restores the canonical full-mode state.
 * The lifecycle Teardown re-runs full mode best-effort so the process ends
 * canonical even when a check fails mid-bundle.
 *
 * Note: engines loaded by the harness bootstrap keep their state throughout —
 * a task-mode Startup skips engine execution, it never unloads anything. SM3's
 * assertions are therefore about mode plumbing (every sync registration executes
 * and reports), not about load cost.
 */
import { StartupManager } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

/** SM1: a task-mode Startup executes ZERO of the process's real registrations. */
export async function CheckSm1_TaskModeExecutesZeroEngines(ctx: IntegrationCheckContext): Promise<void> {
    const sm = StartupManager.Instance;
    const registrationCount = sm.GetRegistrations().length;
    Assert(registrationCount > 0, 'precondition: the integration process must have @RegisterForStartup registrations (server packages imported)');

    const result = await sm.Startup(true, ctx.User, ctx.Provider, { mode: 'task' });
    Assert(result.success, 'task-mode Startup must succeed');
    AssertEqual(result.results.length, 0, `task mode must execute zero of the ${registrationCount} registered engines`);
    Assert(sm.LoadCompleted, 'task-mode Startup must mark startup completed (same idempotency semantics as full mode)');
}

/**
 * SM2: after a task-mode Startup, an engine still loads on demand via its own
 * Config() — the "first touch pays the load" contract. forceRefresh=true makes
 * this a REAL reload (Config(false) would no-op for engines the harness
 * bootstrap already warmed).
 */
export async function CheckSm2_LazyEngineLoadAfterTaskMode(ctx: IntegrationCheckContext): Promise<void> {
    await UserInfoEngine.Instance.Config(true, ctx.User, ctx.Provider);
    Assert(UserInfoEngine.Instance.Loaded, 'UserInfoEngine must load on demand after a task-mode Startup left it un-pre-warmed');
}

/** SM3: a full-mode Startup executes every sync registration (and restores canonical state). */
export async function CheckSm3_FullModeRunsAllSyncEngines(ctx: IntegrationCheckContext): Promise<void> {
    const sm = StartupManager.Instance;
    const syncCount = sm.GetRegistrations().filter(r => !r.options.deferred).length;

    const result = await sm.Startup(true, ctx.User, ctx.Provider, { mode: 'full' });
    Assert(result.success, `full-mode Startup must succeed (fatalError: ${result.fatalError?.message ?? 'none'})`);
    AssertEqual(result.results.length, syncCount, 'full mode must execute (and report) every sync registration');
}

/** The ordered 'startup-mode' bundle. SM1 → task state, SM2 → lazy load from it, SM3 → full restore. */
export const StartupModeChecks: NamedCheck[] = [
    {
        Id: 'startup-mode.SM1',
        Name: 'SM1: task-mode Startup executes zero registered engines (LocalCacheManager still initialized)',
        Fn: CheckSm1_TaskModeExecutesZeroEngines
    },
    {
        Id: 'startup-mode.SM2',
        Name: 'SM2: an engine lazy-loads on first touch after a task-mode boot (Config on demand)',
        Fn: CheckSm2_LazyEngineLoadAfterTaskMode
    },
    {
        Id: 'startup-mode.SM3',
        Name: 'SM3: full-mode Startup executes every sync registration (canonical behavior unchanged)',
        Fn: CheckSm3_FullModeRunsAllSyncEngines
    }
];

for (const check of StartupModeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('startup-mode', {
    async Setup(): Promise<void> {
        // Reference-only bundle — no fixtures to create.
    },
    async Teardown(ctx: IntegrationCheckContext): Promise<void> {
        // Best-effort restore of the canonical full-mode state so a mid-bundle
        // failure never leaves the process with a task-mode cached Startup result.
        try {
            await StartupManager.Instance.Startup(true, ctx.User, ctx.Provider, { mode: 'full' });
        } catch (e) {
            console.warn('startup-mode teardown: full-mode restore failed:', e instanceof Error ? e.message : e);
        }
    }
});
