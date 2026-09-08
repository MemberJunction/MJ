/**
 * Tests for HarnessAgentBase.finalizeRun / EndHarnessSession — regression coverage for a Critical
 * finding from Memory Leak Audit Round 10: `EndHarnessSession()` tears down a run's sandbox (stops
 * the Docker container `startHarnessSession()` provisioned, or removes the ephemeral workspace
 * directory) but had ZERO callers anywhere in the monorepo. `BaseAgent.Execute()` had no extension
 * point for subclass-owned per-run resources, so every Harness-type agent run leaked its sandbox
 * forever — a live `docker run ... sleep infinity` container, or an orphaned temp directory.
 *
 * The fix adds `BaseAgent.finalizeRun(outcome)`, a no-op hook called unconditionally from
 * `Execute()`'s `finally` block (see `base-agent-finalize-run.test.ts`), which `HarnessAgentBase`
 * overrides to call the existing `EndHarnessSession`. These tests exercise the REAL methods on a
 * real `HarnessAgentBase` instance, with the adapter/sandbox provider faked at the interface
 * boundary — no reimplementation of the teardown logic itself.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HarnessAgentBase } from '../HarnessAgentBase';
import { BaseHarnessAdapter } from '../adapters/BaseHarnessAdapter';
import { ISandboxProvider, SandboxHandle, WorkspaceKey } from '../sandbox/ISandboxProvider';
import { HarnessCapabilities, HarnessSessionConfig } from '../types';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

type RunOutcome = 'success' | 'failure' | 'cancelled';

/** Minimal fake — only the two methods EndHarnessSession actually calls are exercised. */
class FakeAdapter extends BaseHarnessAdapter {
    public endSessionCalls = 0;
    public endSessionShouldThrow = false;

    public async StartSession(_config: HarnessSessionConfig): Promise<void> {}
    public RunTurn(): AsyncIterable<never> {
        return (async function* () {})();
    }
    public async RespondToPermission(): Promise<void> {}
    public async EndSession(): Promise<void> {
        this.endSessionCalls++;
        if (this.endSessionShouldThrow) {
            throw new Error('adapter teardown failed');
        }
    }
    public get Capabilities(): HarnessCapabilities {
        return { PermissionHooks: false, SessionResume: false } as HarnessCapabilities;
    }
}

class FakeSandboxProvider implements ISandboxProvider {
    public finalizeCalls: Array<{ handle: SandboxHandle; outcome: RunOutcome }> = [];
    public finalizeShouldThrow = false;

    public async Provision(key: WorkspaceKey): Promise<SandboxHandle> {
        return {
            WorkspacePath: '/workspace',
            Key: key,
            Ephemeral: false,
            Executor: { Run: () => { throw new Error('not used in this test'); } },
        };
    }
    public async Finalize(handle: SandboxHandle, outcome: RunOutcome): Promise<void> {
        this.finalizeCalls.push({ handle, outcome });
        if (this.finalizeShouldThrow) {
            throw new Error('sandbox finalize failed');
        }
    }
}

function fakeHandle(): SandboxHandle {
    return {
        WorkspacePath: '/workspace',
        Key: { Scope: 'run', AgentId: 'agent-1', RunId: 'run-1' },
        Ephemeral: true,
        Executor: { Run: () => { throw new Error('not used in this test'); } },
    };
}

/** Reaches into HarnessAgentBase's private session fields the same way startHarnessSession() sets them. */
function primeSession(agent: HarnessAgentBase, adapter: FakeAdapter, provider: FakeSandboxProvider, handle: SandboxHandle): void {
    const a = agent as unknown as {
        adapter: BaseHarnessAdapter | null;
        sandboxProvider: ISandboxProvider | null;
        sandboxHandle: SandboxHandle | null;
        turnIndex: number;
    };
    a.adapter = adapter;
    a.sandboxProvider = provider;
    a.sandboxHandle = handle;
    a.turnIndex = 3;
}

function readSessionState(agent: HarnessAgentBase) {
    return agent as unknown as {
        adapter: BaseHarnessAdapter | null;
        sandboxProvider: ISandboxProvider | null;
        sandboxHandle: SandboxHandle | null;
        turnIndex: number;
    };
}

function callFinalizeRun(agent: HarnessAgentBase, outcome: RunOutcome): Promise<void> {
    return (agent as unknown as { finalizeRun(outcome: RunOutcome): Promise<void> }).finalizeRun(outcome);
}

describe('HarnessAgentBase.finalizeRun', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to EndHarnessSession with the same outcome it was given', async () => {
        const agent = new HarnessAgentBase();
        const endHarnessSessionSpy = vi.spyOn(agent, 'EndHarnessSession');

        await callFinalizeRun(agent, 'cancelled');

        expect(endHarnessSessionSpy).toHaveBeenCalledTimes(1);
        expect(endHarnessSessionSpy).toHaveBeenCalledWith('cancelled');
    });

    it.each<RunOutcome>(['success', 'failure', 'cancelled'])(
        'tears down a provisioned sandbox and adapter session for outcome=%s',
        async (outcome) => {
            const agent = new HarnessAgentBase();
            const adapter = new FakeAdapter();
            const provider = new FakeSandboxProvider();
            const handle = fakeHandle();
            primeSession(agent, adapter, provider, handle);

            await callFinalizeRun(agent, outcome);

            expect(adapter.endSessionCalls).toBe(1);
            expect(provider.finalizeCalls).toEqual([{ handle, outcome }]);
        }
    );

    it('nulls out session state and resets turnIndex after tearing down, so a reused instance re-provisions on its next run', async () => {
        const agent = new HarnessAgentBase();
        const adapter = new FakeAdapter();
        const provider = new FakeSandboxProvider();
        primeSession(agent, adapter, provider, fakeHandle());

        await callFinalizeRun(agent, 'success');

        const state = readSessionState(agent);
        expect(state.adapter).toBeNull();
        expect(state.sandboxProvider).toBeNull();
        expect(state.sandboxHandle).toBeNull();
        expect(state.turnIndex).toBe(0);
    });

    it('is a safe no-op when the harness session was never started (Execute() failed before turn 0)', async () => {
        const agent = new HarnessAgentBase();

        // No adapter/sandboxProvider/sandboxHandle ever assigned — must not throw.
        await expect(callFinalizeRun(agent, 'failure')).resolves.toBeUndefined();
    });

    it('still finalizes the sandbox when the adapter teardown throws (independent try/catch per resource)', async () => {
        const agent = new HarnessAgentBase();
        const adapter = new FakeAdapter();
        adapter.endSessionShouldThrow = true;
        const provider = new FakeSandboxProvider();
        const handle = fakeHandle();
        primeSession(agent, adapter, provider, handle);

        await callFinalizeRun(agent, 'success');

        expect(adapter.endSessionCalls).toBe(1);
        expect(provider.finalizeCalls).toEqual([{ handle, outcome: 'success' }]);
    });

    it('never throws even when sandbox finalize itself throws — a teardown failure must not mask the run result', async () => {
        const agent = new HarnessAgentBase();
        const adapter = new FakeAdapter();
        const provider = new FakeSandboxProvider();
        provider.finalizeShouldThrow = true;
        primeSession(agent, adapter, provider, fakeHandle());

        await expect(callFinalizeRun(agent, 'failure')).resolves.toBeUndefined();
    });
});
