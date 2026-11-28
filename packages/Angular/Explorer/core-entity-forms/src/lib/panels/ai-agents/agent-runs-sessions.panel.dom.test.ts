import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunView, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import type { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { StubLoadingComponent, queryAll } from '@memberjunction/ng-test-utils';
import { AgentRunsSessionsPanel } from './agent-runs-sessions.panel';

@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
    @Input() SectionKey = '';
    @Input() SectionName = '';
    @Input() Icon = '';
    @Input() Order: number | null = null;
    @Input() BadgeCount: number | null = null;
    @Input() Form: unknown;
    @Input() FormContext: unknown;
    @Input() DefaultExpanded = true;
}

const ok = (rows: Array<Record<string, unknown>>): RunViewResult => ({
    Success: true,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 1,
    ErrorMessage: '',
});

describe('AgentRunsSessionsPanel (DOM)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    async function render(): Promise<{
        fixture: ComponentFixture<AgentRunsSessionsPanel>;
        calls: RunViewParams[];
    }> {
        const calls: RunViewParams[] = [];
        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: RunViewParams) => {
            calls.push(params);
            if (params.EntityName === 'MJ: AI Agent Runs') {
                return ok([
                    {
                        ID: 'run-finished-1',
                        Status: 'Completed',
                        StartedAt: '2026-01-01T00:00:00Z',
                        CompletedAt: '2026-01-01T00:00:02Z',
                        TotalTokensUsed: 1200,
                        TotalTokensUsedRollup: 1200,
                        TotalCost: 0.02,
                        TotalCostRollup: 0.02,
                        Configuration: 'Production',
                        ErrorMessage: null,
                        FinalPayload: '{"summary":"all green"}',
                        Result: '{"legacy":"ignored"}',
                        __mj_CreatedAt: '2026-01-01T00:00:00Z',
                    },
                    {
                        ID: 'run-running-2',
                        Status: 'Running',
                        StartedAt: '2026-01-01T00:05:00Z',
                        CompletedAt: null,
                        TotalTokensUsed: 200,
                        TotalTokensUsedRollup: null,
                        TotalCost: null,
                        TotalCostRollup: null,
                        Configuration: null,
                        ErrorMessage: null,
                        FinalPayload: '{"partial":"hidden"}',
                        Result: null,
                        __mj_CreatedAt: '2026-01-01T00:05:00Z',
                    },
                ]);
            }
            return ok([
                {
                    ID: 'sess-11112222',
                    AgentID: 'agent-1',
                    Agent: 'Voice Agent',
                    User: 'Amith',
                    Status: 'Closed',
                    LastActiveAt: '2026-01-01T00:01:00Z',
                    ClosedAt: '2026-01-01T00:02:00Z',
                    __mj_CreatedAt: '2026-01-01T00:00:00Z',
                },
            ]);
        });

        TestBed.configureTestingModule({
            imports: [FormsModule, CollapsiblePanelStub, MJButtonDirective, MJEmptyStateComponent, StubLoadingComponent],
            declarations: [AgentRunsSessionsPanel],
        });

        const fixture = TestBed.createComponent(AgentRunsSessionsPanel);
        fixture.componentRef.setInput('Record', { ID: 'agent-1', Name: 'Test Agent' } as unknown as MJAIAgentEntity);
        fixture.componentRef.setInput('FormComponent', {
            ProviderToUse: {},
            SetSectionRowCount: vi.fn(),
        } as unknown as BaseFormComponent);

        fixture.detectChanges(false);
        await new Promise((r) => setTimeout(r, 0));
        fixture.componentRef.changeDetectorRef.markForCheck();
        fixture.detectChanges(false);
        return { fixture, calls };
    }

    it('queries FinalPayload and Result, renders FinalPayload on expand, and hides Running partial payloads', async () => {
        const { fixture, calls } = await render();
        expect(calls[0].EntityName).toBe('MJ: AI Agent Runs');
        expect(calls[0].Fields).toContain('FinalPayload');
        expect(calls[0].Fields).toContain('Result');

        const cards = queryAll(fixture, '.ars-card');
        expect(cards).toHaveLength(2);

        // Expand both cards
        fixture.componentInstance.ToggleExpanded('run-finished-1');
        fixture.componentInstance.ToggleExpanded('run-running-2');
        fixture.detectChanges(false);

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('all green');
        expect(text).not.toContain('ignored');
        expect(text).not.toContain('hidden');
    });

    it('lazily loads Voice Sessions when switching to the sessions tab', async () => {
        const { fixture, calls } = await render();
        expect(calls).toHaveLength(1);

        await fixture.componentInstance.SetView('sessions');
        fixture.detectChanges(false);

        expect(calls).toHaveLength(2);
        expect(calls[1].EntityName).toBe('MJ: AI Agent Sessions');
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('Session #sess-111');
    });
});
