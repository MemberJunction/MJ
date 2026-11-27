import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { RunView, type RunViewResult } from '@memberjunction/core';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { FormChromeCoordinator, type BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { query, queryAll } from '@memberjunction/ng-test-utils';
import { AgentOverviewPanel } from './agent-overview.panel';
import { AGENT_SECTION_KEYS } from './agent-form-helpers';

@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
    @Input() SectionKey = '';
    @Input() SectionName = '';
    @Input() Icon = '';
    @Input() Order: number | null = null;
    @Input() Form: unknown;
    @Input() FormContext: unknown;
    @Input() DefaultExpanded = true;
}

@Component({ standalone: true, selector: 'mj-agent-permissions-dialog', template: '' })
class PermissionsDialogStub {
    @Input() agentId = '';
    @Input() agentName = '';
    @Input() visible = false;
    @Output() close = new EventEmitter<void>();
}

const ok = (rows: Array<Record<string, unknown>>, total?: number): RunViewResult => ({
    Success: true,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: total ?? rows.length,
    ExecutionTime: 1,
    ErrorMessage: '',
});

async function renderOverview(options: {
    typeName: string;
    uiFormSectionKey?: string | null;
    editMode?: boolean;
    flowSteps?: Array<Record<string, unknown>>;
}): Promise<{
    fixture: ComponentFixture<AgentOverviewPanel>;
    setActiveGroup: ReturnType<typeof vi.fn>;
}> {
    const setActiveGroup = vi.fn();

    vi.spyOn(AIEngineBase, 'Instance', 'get').mockReturnValue({
        Config: vi.fn().mockResolvedValue(undefined),
        Prompts: [{ ID: 'p1', Name: 'System Prompt' }],
        AgentPrompts: [{ AgentID: 'agent-1', PromptID: 'p1' }],
        AgentActions: [{ AgentID: 'agent-1', ActionID: 'a1' }],
        Agents: [{ ID: 'child-1', Name: 'Helper Agent', ParentID: 'agent-1' }],
        AgentRelationships: [],
    } as unknown as AIEngineBase);

    vi.spyOn(ActionEngineBase, 'Instance', 'get').mockReturnValue({
        Config: vi.fn().mockResolvedValue(undefined),
        Actions: [{ ID: 'a1', Name: 'Web Search' }],
    } as unknown as ActionEngineBase);

    vi.spyOn(RunView.prototype, 'RunViews').mockResolvedValue([
        ok([
            {
                Status: 'Completed',
                StartedAt: '2026-01-01T00:00:00.000Z',
                CompletedAt: '2026-01-01T00:00:02.000Z',
                TotalCost: 0.04,
                TotalCostRollup: 0.04,
                TotalTokensUsed: 1500,
                TotalTokensUsedRollup: 1500,
            },
        ]),
        ok(options.flowSteps ?? []),
        ok([], 2), // Skills
        ok([], 3), // Search Scopes
        ok([], 1), // Co-agent pairings
        ok([], 1), // Bridge identities
    ]);

    TestBed.configureTestingModule({
        imports: [FormsModule, CollapsiblePanelStub, PermissionsDialogStub, MJButtonDirective],
        declarations: [AgentOverviewPanel],
        providers: [
            { provide: FormChromeCoordinator, useValue: { SetActiveGroup: setActiveGroup } },
        ],
    });

    const fixture = TestBed.createComponent(AgentOverviewPanel);
    const agentType = {
        ID: 'type-1',
        Name: options.typeName,
        UIFormSectionKey: options.uiFormSectionKey ?? null,
    } as unknown as MJAIAgentTypeEntity;

    fixture.componentRef.setInput('Record', {
        ID: 'agent-1',
        IsSaved: true,
        Name: 'Revenue Analyst',
        Description: 'Synthesizes quarterly revenue trends.',
        Status: 'Active',
        Type: options.typeName,
        Category: 'Finance',
        MaxCostPerRun: 0.5,
        MaxTokensPerRun: 50000,
    } as unknown as MJAIAgentEntityExtended);

    fixture.componentRef.setInput('FormComponent', {
        ProviderToUse: {},
        EditMode: options.editMode ?? false,
        AgentType: agentType,
        AgentTypeChanged$: new Subject<MJAIAgentTypeEntity | null>(),
        IsOpenToEveryone: true,
        ShowPermissionsDialog: false,
        OpenPermissionsDialog: vi.fn(),
        OnPermissionsDialogClosed: vi.fn(),
    } as unknown as BaseFormComponent);

    fixture.detectChanges(false);
    await new Promise((r) => setTimeout(r, 0));
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);

    return { fixture, setActiveGroup };
}

describe('AgentOverviewPanel (DOM)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    it('renders Flow topology steps and KPI strip for Flow agents', async () => {
        const { fixture, setActiveGroup } = await renderOverview({
            typeName: 'Flow',
            uiFormSectionKey: 'FlowAgentSection',
            flowSteps: [
                { ID: 'st1', Name: 'Load Metrics', StepType: 'Action', StartingStep: true },
                { ID: 'st2', Name: 'Summarize', StepType: 'Prompt', StartingStep: false },
            ],
        });

        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Revenue Analyst');
        expect(text).toContain('100%');
        expect(text).toContain('Load Metrics');
        expect(text).toContain('Summarize');
        expect(text).toContain('Open Flow Studio');

        // Clicking a capability bento card navigates via FormChromeCoordinator
        const cards = queryAll(fixture, '.ao-bento-card');
        expect(cards.length).toBeGreaterThanOrEqual(3);
        (cards[0] as HTMLElement).click();
        expect(setActiveGroup).toHaveBeenCalledWith(AGENT_SECTION_KEYS.Prompts);
    });

    it('renders the 4-stage Loop Reasoning Blueprint for Loop agents', async () => {
        const { fixture } = await renderOverview({ typeName: 'Loop', uiFormSectionKey: null });
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Loop Reasoning Blueprint');
        expect(text).toContain('1 · Reason');
        expect(text).toContain('2 · Act');
        expect(text).toContain('3 · Delegate');
        expect(text).toContain('4 · Ground');
        expect(text).toContain('Guardrail Headroom');
    });

    it('renders the Realtime Voice & Bridge Pipeline for Realtime agents', async () => {
        const { fixture } = await renderOverview({ typeName: 'Realtime', uiFormSectionKey: null });
        const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(text).toContain('Realtime Voice & Bridge Pipeline');
        expect(text).toContain('1 Pairing');
        expect(text).toContain('1 Identity');
    });

    it('switches hero identity fields to inline inputs in EditMode', async () => {
        const { fixture } = await renderOverview({ typeName: 'Loop', editMode: true });
        expect(query(fixture, 'input.ao-name-input')).not.toBeNull();
        expect(query(fixture, 'select.ao-status-select')).not.toBeNull();
        expect(query(fixture, 'textarea.ao-desc-input')).not.toBeNull();
    });
});
