/**
 * Workflow actions (Loop, Parallel Execute, Conditional, Retry) run model-written action configurations that cannot
 * carry the calling run's scope, so inside any agent run, scoped or not, they refuse without running anything.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple, ActionRunScope } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const { runActionSpy } = vi.hoisted(() => ({ runActionSpy: vi.fn() }));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        protected async InternalRunAction(_p: unknown): Promise<unknown> { return null; }
        protected getParamValue(): undefined { return undefined; }
        protected getBooleanParam(_p: unknown, _n: string, d: boolean): boolean { return d; }
        protected getNumericParam(_p: unknown, _n: string, d: number): number { return d; }
    },
    ActionEngineServer: { Instance: { RunAction: runActionSpy } },
}));

import { RefuseWorkflowInAgentRun, WORKFLOW_RUN_SCOPE_UNSUPPORTED } from '../custom/workflow/workflow-run-scope';
import { LoopAction } from '../custom/workflow/loop.action';
import { ParallelExecuteAction } from '../custom/workflow/parallel-execute.action';
import { ConditionalAction } from '../custom/workflow/conditional.action';
import { RetryAction } from '../custom/workflow/retry.action';

const TENANT_SCOPE: ActionRunScope = { PrimaryScopeEntityName: 'Tenants', PrimaryScopeRecordID: 'tenant-1', SecondaryScopes: null };

function paramsWith(runScope?: ActionRunScope | null): RunActionParams {
    return {
        Action: { Name: 'Workflow' },
        ContextUser: { ID: 'user-1' },
        Filters: [],
        Params: [{ Name: 'Actions', Type: 'Input', Value: '[{"ActionName":"Scoped Search","Params":[]}]' }],
        RunScope: runScope ?? undefined,
    } as unknown as RunActionParams;
}

type Runnable = { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> };

describe('RefuseWorkflowInAgentRun', () => {
    it('allows a workflow outside an agent run', () => {
        expect(RefuseWorkflowInAgentRun(paramsWith(undefined), 'Loop')).toBeNull();
    });

    it('refuses inside an unscoped agent run, where a nested Scoped Search would take the model\'s tenant', () => {
        const unscoped: ActionRunScope = { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null };
        expect(RefuseWorkflowInAgentRun(paramsWith(unscoped), 'Loop')?.ResultCode).toBe(WORKFLOW_RUN_SCOPE_UNSUPPORTED);
    });

    it('refuses inside a run bounded by a tenant or a secondary dimension', () => {
        expect(RefuseWorkflowInAgentRun(paramsWith(TENANT_SCOPE), 'Loop')?.ResultCode).toBe(WORKFLOW_RUN_SCOPE_UNSUPPORTED);
        const secondaryOnly: ActionRunScope = { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: { SpaceID: 'space-1' } };
        const refusal = RefuseWorkflowInAgentRun(paramsWith(secondaryOnly), 'Retry');
        expect(refusal?.Success).toBe(false);
        expect(refusal?.Message).toMatch(/Retry is not available in an agent run/);
    });
});

describe.each<[string, () => Runnable]>([
    ['Loop', () => new LoopAction() as unknown as Runnable],
    ['Parallel Execute', () => new ParallelExecuteAction() as unknown as Runnable],
    ['Conditional', () => new ConditionalAction() as unknown as Runnable],
    ['Retry', () => new RetryAction() as unknown as Runnable],
])('%s inside an agent run', (name, make) => {
    beforeEach(() => runActionSpy.mockReset());

    it.each<[string, ActionRunScope]>([
        ['a tenant-scoped', TENANT_SCOPE],
        ['an unscoped', { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null }],
    ])('refuses in %s run without dispatching any action', async (_kind, scope) => {
        const result = await make().InternalRunAction(paramsWith(scope));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(WORKFLOW_RUN_SCOPE_UNSUPPORTED);
        expect(result.Message).toContain(name);
        expect(runActionSpy).not.toHaveBeenCalled();
    });
});
