/**
 * A dispatcher pass is server work. `Kick()` runs a pass in its caller's async scope (`TaskGraphService.Submit`
 * kicks), so a pass kicked from inside a client's own CRUD request would otherwise run every node inside that
 * request, and a node's save of a Human step or an agent request would read as the person's own act.
 */
import { describe, expect, it, vi } from 'vitest';
import { ServerOperationScopeManager, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import type { TaskAgentRunner } from '../types';

const TEST_USER = { ID: '00000000-0000-4000-8000-000000000001', Name: 'Tester', IsActive: true } as UserInfo;

/** A dispatcher whose pass and reconcile bodies only record whether they ran as a client's own request. */
function recordingDispatcher(): { dispatcher: TaskGraphDispatcher; seen: { pass?: boolean; reconcile?: boolean } } {
    const agentRunner: TaskAgentRunner = { RunAgentForTask: vi.fn() };
    const dispatcher = new TaskGraphDispatcher(
        { CreateProvider: async () => ({}) as IMetadataProvider },
        agentRunner,
        TEST_USER,
        { InstanceID: 'server-work-test' },
    );
    const seen: { pass?: boolean; reconcile?: boolean } = {};
    const internals = dispatcher as unknown as { runPass(): Promise<void>; reconcileOnce(): Promise<void> };
    internals.runPass = async () => { seen.pass = ServerOperationScopeManager.Instance.IsInDirectClientCrud(); };
    internals.reconcileOnce = async () => { seen.reconcile = ServerOperationScopeManager.Instance.IsInDirectClientCrud(); };
    return { dispatcher, seen };
}

describe('TaskGraphDispatcher: passes run as server work', () => {
    it("runs a pass kicked from inside a client's own request outside that request", () => {
        const { dispatcher, seen } = recordingDispatcher();
        ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => {
            expect(ServerOperationScopeManager.Instance.IsInDirectClientCrud()).toBe(true);
            dispatcher.Kick();
        });
        expect(seen.pass).toBe(false);
    });

    it("runs a reconcile started from inside a client's own request outside that request", async () => {
        const { dispatcher, seen } = recordingDispatcher();
        await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => dispatcher.Reconcile());
        expect(seen.reconcile).toBe(false);
    });
});
