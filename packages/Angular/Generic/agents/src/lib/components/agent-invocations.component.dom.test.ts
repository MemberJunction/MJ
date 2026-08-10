import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import type { MJScheduledJobEntity, MJUserRoutineEntity } from '@memberjunction/core-entities';
import {
    renderComponentFixture,
    query,
    queryAll,
    text,
    createFakeProvider,
    StubEmptyStateComponent,
    StubLoadingComponent,
} from '@memberjunction/ng-test-utils';
import type { ComponentFixture } from '@angular/core/testing';
import { AgentInvocationsComponent, AgentInvocationOpenRequestedEventArgs } from './agent-invocations.component';

/**
 * DOM coverage for `<mj-agent-invocations>` — the inverse index of everything that runs an agent
 * without anyone pressing Run. The behaviors worth pinning in the DOM are the contract ones:
 * the surface is LAZY (an inactive tab issues zero queries), defensive (a non-UUID id never
 * reaches SQL), read-only (a row emits open-intent, it does not navigate), and honest about
 * state (a paused pathway reads as paused; a load failure reads as an error, not as "nothing
 * invokes this agent").
 */

@Component({ selector: 'mj-alert', standalone: true, template: '<span class="stub-alert">{{ Message }}</span>' })
class StubAlertComponent {
    @Input() Variant = 'info';
    @Input() Message = '';
}

const AGENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

type JobRow = Pick<MJScheduledJobEntity, 'ID' | 'Name' | 'CronExpression' | 'Timezone' | 'Status' | 'LastRunAt' | 'NextRunAt'>;
const JOB: JobRow = {
    ID: 'job-1',
    Name: 'Nightly digest',
    CronExpression: '0 9 * * *',
    Timezone: 'UTC',
    Status: 'Active',
    LastRunAt: null,
    NextRunAt: null,
};

type RoutineRow = Pick<
    MJUserRoutineEntity,
    'ID' | 'Name' | 'RoutineType' | 'CronExpression' | 'Timezone' | 'Status' | 'LastRunAt' | 'NextRunAt'
>;
const ROUTINE: RoutineRow = {
    ID: 'routine-1',
    Name: 'Inbox check',
    RoutineType: 'Scheduled',
    CronExpression: '0 8 * * 1',
    Timezone: 'UTC',
    Status: 'Paused',
    LastRunAt: null,
    NextRunAt: null,
};

/** Fake provider serving canned rows per entity, recording every entity it was asked about. */
function invocationProvider(rows: Partial<Record<string, unknown[]>> = {}) {
    const queried: string[] = [];
    const provider = createFakeProvider({
        runViewResults: (params: RunViewParams) => {
            // EntityName is optional on RunViewParams (a view can be named by ID instead);
            // every query this component issues names its entity, so '' is the never-taken branch.
            const entityName = params.EntityName ?? '';
            queried.push(entityName);
            return rows[entityName] ?? [];
        },
    });
    return { provider, queried };
}

/** Provider whose reads blow up — the surface must say so instead of claiming "nothing runs this". */
function unreachableProvider(): IMetadataProvider {
    const fake = {
        CurrentUser: { ID: 'user-1', Name: 'Test User' },
        RunViews: async () => {
            throw new Error('the database is unreachable');
        },
        RunView: async () => {
            throw new Error('the database is unreachable');
        },
    };
    return fake as unknown as IMetadataProvider;
}

const render = (provider: IMetadataProvider, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(AgentInvocationsComponent, {
        imports: [CommonModule, StubLoadingComponent, StubEmptyStateComponent, StubAlertComponent],
        declarations: [AgentInvocationsComponent],
        // Provider first — the Active setter is what kicks off the load, so it goes last.
        inputs: { Provider: provider, ...inputs },
    });

async function settle(fixture: ComponentFixture<AgentInvocationsComponent>): Promise<void> {
    const component = fixture.componentInstance;
    for (let i = 0; i < 30 && component.IsLoading; i++) await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges(false);
}

describe('AgentInvocationsComponent (DOM)', () => {
    it('issues NO queries while inactive — a tab nobody opened must not cost six queries', () => {
        const { provider, queried } = invocationProvider();
        render(provider, { AgentID: AGENT_ID, Active: false });
        expect(queried).toEqual([]);
    });

    it('never lets a non-UUID id reach SQL, and reports the honest empty answer instead', async () => {
        const { provider, queried } = invocationProvider();
        const f = render(provider, { AgentID: 'not-a-uuid', Active: true });
        await settle(f);
        expect(queried).toEqual([]);
        expect(query(f, 'mj-empty-state')).not.toBeNull();
        expect(text(f, '.mj-agent-inv__summary-line')).toContain('Nothing runs this agent automatically');
    });

    it('renders each discovered pathway under its group, with live and paused told apart', async () => {
        const { provider, queried } = invocationProvider({ 'MJ: Scheduled Jobs': [JOB], 'MJ: User Routines': [ROUTINE] });
        const f = render(provider, { AgentID: AGENT_ID, Active: true });
        await settle(f);

        const titles = queryAll(f, '.mj-agent-inv__row-title').map((el) => el.textContent?.trim());
        expect(titles).toEqual(['Nightly digest', 'Inbox check']);
        // The paused routine is muted; the live job is not — the visual distinction IS the answer.
        expect(queryAll(f, '.mj-agent-inv__row--muted')).toHaveLength(1);
        expect(queryAll(f, '.mj-agent-inv__state--live')).toHaveLength(1);
        expect(queryAll(f, '.mj-agent-inv__state--paused')).toHaveLength(1);
        expect(text(f, '.mj-agent-inv__summary-line')).toContain('1 of 2 pathways can run this agent');
        // The second stage (entity-action bindings) ran too — the index is not just the direct four.
        expect(queried).toContain('MJ: Entity Action Params');
    });

    it('emits open-intent with the owning record when a row is activated — it never navigates itself', async () => {
        const { provider } = invocationProvider({ 'MJ: Scheduled Jobs': [JOB] });
        const f = render(provider, { AgentID: AGENT_ID, Active: true });
        await settle(f);

        const events: AgentInvocationOpenRequestedEventArgs[] = [];
        f.componentInstance.RecordOpenRequested.subscribe((e) => events.push(e));
        (query(f, 'button.mj-agent-inv__row-main') as HTMLButtonElement).click();

        expect(events).toHaveLength(1);
        expect(events[0].EntityName).toBe('MJ: Scheduled Jobs');
        expect(events[0].RecordID).toBe('job-1');
    });

    it('renders a pathway with no record behind it as plain text, not a button that would do nothing', async () => {
        const { provider } = invocationProvider();
        const f = render(provider, {
            AgentID: AGENT_ID,
            Active: true,
            ExposeAsAction: true,
            ParentAgentName: 'Coordinator',
            ParentAgentID: 'agent-9',
        });
        await settle(f);

        // "Exposed as an action" is a flag on the agent — static. The parent agent is a record — a button.
        const staticRow = query(f, '.mj-agent-inv__row-main--static');
        expect(staticRow?.textContent).toContain('Exposed as an action');
        expect(query(f, 'button.mj-agent-inv__row-main')?.textContent).toContain('Coordinator');
        expect(text(f, '.mj-agent-inv__summary-line')).toContain('2 of 2 pathways can run this agent');
    });

    it('reports a failed load as an error — not as "nothing invokes this agent", which would be believed', async () => {
        const f = render(unreachableProvider(), { AgentID: AGENT_ID, Active: true });
        await settle(f);
        expect(text(f, '.stub-alert')).toContain('the database is unreachable');
        expect(query(f, 'mj-empty-state')).toBeNull();
    });
});
