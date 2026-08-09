/**
 * Tests for `WorkflowSpecSync` — persisting a workflow by reconciling substrates that already exist.
 *
 * The behavior worth defending is the **guard order**. A workflow that fails validation, or that has
 * no agent writer, must write *nothing* — a partially-persisted workflow is worse than a refused one,
 * because a schedule pointing at an agent that was never created is a job that fires forever and
 * does nothing, with no error anyone sees.
 *
 * The substrate reconciliation itself needs a live provider, so it is covered by the integration
 * tier. What is unit-testable is everything that decides *whether* to touch a substrate at all.
 */
import { describe, it, expect, vi } from 'vitest';
import { WorkflowSpecSync, RUN_WORKFLOW_JOB_TYPE, WORKFLOW_OWNER_KEY, EXECUTE_AGENT_ACTION, type WorkflowAgentWriter } from '../WorkflowSpecSync';
import type { WorkflowSpec } from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const spec = (over: Partial<WorkflowSpec> = {}): WorkflowSpec => ({
    name: 'Weekly digest',
    status: 'Draft',
    graph: {
        workflowName: 'Weekly digest',
        tasks: [{ tempId: 'a', name: 'Summarize', description: 's', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] }],
    },
    triggers: [{ type: 'OnDemand' }],
    ...over,
});

const context = () => ({
    ContextUser: { ID: 'user-1' } as UserInfo,
    Provider: {} as IMetadataProvider,
});

/** A writer that records whether it was asked to do anything. */
function writerSpy(agentID = 'agent-1'): WorkflowAgentWriter & { calls: number } {
    const w = {
        calls: 0,
        async PersistFlowAgent() {
            w.calls++;
            return agentID;
        },
    };
    return w;
}

describe('WorkflowSpecSync.Persist — guards run before anything is written', () => {
    it('refuses an invalid workflow WITHOUT calling the agent writer', () => {
        // The order matters: persisting the agent first and validating after would leave an orphan
        // agent behind every rejected save.
        const writer = writerSpy();
        return new WorkflowSpecSync(writer).Persist(spec({ name: '' }), context()).then((r) => {
            expect(r.Success).toBe(false);
            expect(writer.calls).toBe(0);
        });
    });

    it('names every validation problem in the error, not just the first', async () => {
        const r = await new WorkflowSpecSync(writerSpy()).Persist(
            spec({ name: '', triggers: [{ type: 'Schedule', cron: '' }] }),
            context(),
        );
        expect(r.ErrorMessage).toContain('MissingName');
        expect(r.ErrorMessage).toContain('MissingCron');
    });

    it('rejects a workflow whose GRAPH is invalid — the graph check is delegated, not skipped', async () => {
        const bad = spec({
            graph: {
                workflowName: 'W',
                tasks: [{ tempId: 'a', name: 'A', description: 'a', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['ghost'] }],
            },
        });
        const r = await new WorkflowSpecSync(writerSpy()).Persist(bad, context());
        expect(r.Success).toBe(false);
        expect(r.ErrorMessage).toContain('UnknownDependency');
    });

    it('fails honestly when no agent writer is registered, rather than half-saving', async () => {
        // A schedule pointing at an agent that was never created is a job that fires forever and does
        // nothing, with no error anyone sees.
        const r = await new WorkflowSpecSync(null).Persist(spec(), context());
        expect(r.Success).toBe(false);
        expect(r.ErrorMessage).toMatch(/agent writer/i);
        expect(r.ScheduledJobIDs).toEqual([]);
    });

    it('reports a thrown agent write as a failed save, not an exception', async () => {
        const writer: WorkflowAgentWriter = {
            async PersistFlowAgent() { throw new Error('agent save exploded'); },
        };
        const r = await new WorkflowSpecSync(writer).Persist(spec(), context());
        expect(r.Success).toBe(false);
        expect(r.ErrorMessage).toContain('agent save exploded');
    });

    it('persists the agent BEFORE reconciling triggers', async () => {
        // A Scheduled Job needs the agent's ID to point at. Reversing the order would produce a job
        // referencing an agent that does not exist yet.
        const order: string[] = [];
        const writer: WorkflowAgentWriter = {
            async PersistFlowAgent() { order.push('agent'); return 'agent-1'; },
        };
        const sync = new WorkflowSpecSync(writer);
        // Reconciliation needs a live provider; stub it out and record that it ran second.
        vi.spyOn(sync as unknown as { reconcileTriggers: () => Promise<unknown> }, 'reconcileTriggers')
            .mockImplementation(async () => { order.push('triggers'); return { ScheduledJobIDs: [], Unreconciled: [] }; });

        await sync.Persist(spec(), context());
        expect(order).toEqual(['agent', 'triggers']);
    });

    it('returns the agent ID as the workflow handle', async () => {
        const sync = new WorkflowSpecSync(writerSpy('agent-42'));
        vi.spyOn(sync as unknown as { reconcileTriggers: () => Promise<unknown> }, 'reconcileTriggers')
            .mockResolvedValue({ ScheduledJobIDs: [], Unreconciled: [] });

        const r = await sync.Persist(spec(), context());
        expect(r.Success).toBe(true);
        expect(r.AgentID).toBe('agent-42');
    });

    it('SURFACES a trigger that failed to bind rather than dropping it', async () => {
        // "Run this when an invoice changes" silently doing nothing is the failure a user cannot
        // debug from the UI, so a binding failure is reported on the result rather than swallowed.
        const sync = new WorkflowSpecSync(writerSpy());
        vi.spyOn(sync as unknown as { reconcileTriggers: () => Promise<unknown> }, 'reconcileTriggers')
            .mockResolvedValue({ ScheduledJobIDs: [], Unreconciled: ['EntityEvent on Invoices: entity "Invoices" not found in metadata'] });

        const r = await sync.Persist(
            spec({ triggers: [{ type: 'EntityEvent', entityName: 'Invoices', invocationType: 'Update' }] }),
            context(),
        );
        expect(r.Success).toBe(true);
        expect(r.Unreconciled[0]).toContain('Invoices');
    });
});

describe('reconciliation contract', () => {
    it('names the seeded job type it reconciles against', () => {
        // A rename here silently orphans every workflow's schedule, so it is pinned.
        expect(RUN_WORKFLOW_JOB_TYPE).toBe('Agent');
    });

    it('dispatches entity-change triggers through the existing Execute Agent action', () => {
        // Entity-action INVOCATION was already fully wired — the save pipeline fires validate,
        // before/after save and before/after delete through HandleEntityActions. What was missing
        // was the binding row, not the machinery, so this reuses the action written for exactly
        // this purpose rather than adding another.
        expect(EXECUTE_AGENT_ACTION).toBe('Execute Agent');
    });

    it('marks owned rows by agent ID, so ownership survives a workflow rename', () => {
        // Matching on name would orphan the old schedule and leave two firing.
        expect(WORKFLOW_OWNER_KEY).toBe('WorkflowAgentID');
    });
});
