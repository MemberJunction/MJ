import { describe, it, expect, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunView, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import type { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { StubLoadingComponent, query, queryAll } from '@memberjunction/ng-test-utils';
import { AgentRealtimePanel } from './agent-realtime.panel';

/**
 * DOM coverage for <mj-ai-agent-realtime-panel>. The panel loads co-agent pairings and bridge
 * identities in one `RunViews` call; `RunView.prototype.RunViews` is stubbed per test. Each
 * list section shows its rows and count when its query succeeds, and a "could not load" alert
 * with no count when its query fails, while the other sections still show.
 *
 * `<mj-collapsible-panel>` is replaced with a stub that projects its content.
 */

@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
    @Input() SectionKey = '';
    @Input() SectionName = '';
    @Input() Icon = '';
    @Input() Order: number | null = null;
    @Input() Form: unknown;
    @Input() FormContext: unknown;
}

const PAIRING = {
    ID: 'pairing-1',
    CoAgentID: 'agent-1',
    CoAgent: 'Voice Agent',
    TargetAgentID: 'agent-2',
    TargetAgent: 'Research Agent',
    Type: 'CoAgent',
    IsDefault: true,
    Sequence: 1,
    Status: 'Active',
};
const IDENTITY = {
    ID: 'identity-1',
    IdentityType: 'Email',
    IdentityValue: 'agent@example.com',
    DisplayName: 'Agent Mailbox',
    Provider: 'Teams',
    IsActive: true,
};

const ok = (rows: Array<Record<string, unknown>>): RunViewResult => ({
    Success: true,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 1,
    ErrorMessage: '',
});
const failed = (errorMessage: string): RunViewResult => ({
    Success: false,
    Results: [],
    RowCount: 0,
    TotalRowCount: 0,
    ExecutionTime: 1,
    ErrorMessage: errorMessage,
});

/** Stubs `RunView.RunViews` with one outcome and records the params of each call. */
function stubRunViews(outcome: RunViewResult[] | Error): RunViewParams[][] {
    const calls: RunViewParams[][] = [];
    vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(async (params: RunViewParams[]) => {
        calls.push(params);
        if (outcome instanceof Error) throw outcome;
        return outcome;
    });
    return calls;
}

async function render(): Promise<ComponentFixture<AgentRealtimePanel>> {
    TestBed.configureTestingModule({
        imports: [CollapsiblePanelStub, MJAlertComponent, StubLoadingComponent],
        declarations: [AgentRealtimePanel],
    });
    const fixture = TestBed.createComponent(AgentRealtimePanel);
    fixture.componentRef.setInput('Record', { ID: 'agent-1', TypeConfiguration: '{"voice":"alloy"}' } as unknown as MJAIAgentEntity);
    fixture.componentRef.setInput('FormComponent', { ProviderToUse: {} } as unknown as BaseFormComponent);
    fixture.detectChanges(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    return fixture;
}

/** The pairings, identities and type configuration sections, in page order. */
function sections(fixture: ComponentFixture<AgentRealtimePanel>) {
    const [pairings, identities, typeConfig] = queryAll(fixture, '.rt-section');
    const describeSection = (el: Element) => ({
        Count: el.querySelector('.rt-count')?.textContent?.trim() ?? null,
        Alert: el.querySelector('mj-alert')?.textContent?.trim() ?? null,
        Empty: el.querySelector('.rt-empty')?.textContent?.trim() ?? null,
        Rows: el.querySelectorAll('.rt-row').length,
    });
    return { Pairings: describeSection(pairings), Identities: describeSection(identities), TypeConfig: typeConfig };
}

describe('AgentRealtimePanel (DOM)', () => {
    it('queries the co-agent pairing and bridge identity entities', async () => {
        const calls = stubRunViews([ok([PAIRING]), ok([IDENTITY])]);
        await render();
        expect(calls).toHaveLength(1);
        expect(calls[0].map((p) => p.EntityName)).toEqual(['MJ: AI Agent Co Agents', 'MJ: AI Bridge Agent Identities']);
    });

    it('renders both lists with their counts when both queries succeed', async () => {
        stubRunViews([ok([PAIRING]), ok([IDENTITY])]);
        const fixture = await render();
        const s = sections(fixture);
        expect(s.Pairings).toEqual({ Count: '1', Alert: null, Empty: null, Rows: 1 });
        expect(s.Identities).toEqual({ Count: '1', Alert: null, Empty: null, Rows: 1 });
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('Agent Mailbox');
    });

    it('renders the empty text when a query succeeds with no rows', async () => {
        stubRunViews([ok([]), ok([])]);
        const s = sections(await render());
        expect(s.Pairings).toEqual({ Count: '0', Alert: null, Empty: 'No co-agent pairings reference this agent.', Rows: 0 });
        expect(s.Identities).toEqual({ Count: '0', Alert: null, Empty: 'No bridge identities provisioned for this agent.', Rows: 0 });
    });

    it('shows a pairings error with no count when only the pairing query returns Success: false', async () => {
        stubRunViews([failed('Permission denied'), ok([IDENTITY])]);
        const fixture = await render();
        const s = sections(fixture);
        expect(s.Pairings).toEqual({ Count: null, Alert: 'Could not load co-agent pairings: Permission denied', Empty: null, Rows: 0 });
        expect(s.Identities).toEqual({ Count: '1', Alert: null, Empty: null, Rows: 1 });
        expect(s.TypeConfig.querySelector('.rt-config')?.textContent).toContain('alloy');
    });

    it('shows an identities error with no count when only the identity query returns Success: false', async () => {
        stubRunViews([ok([PAIRING]), failed('')]);
        const s = sections(await render());
        expect(s.Pairings).toEqual({ Count: '1', Alert: null, Empty: null, Rows: 1 });
        expect(s.Identities).toEqual({ Count: null, Alert: 'Could not load bridge identities.', Empty: null, Rows: 0 });
    });

    it('shows one panel error when the RunViews call throws', async () => {
        stubRunViews(new Error('network down'));
        const fixture = await render();
        expect(queryAll(fixture, '.rt-section')).toHaveLength(0);
        expect(query(fixture, 'mj-alert')?.textContent).toContain('Failed to load realtime setup.');
    });
});
