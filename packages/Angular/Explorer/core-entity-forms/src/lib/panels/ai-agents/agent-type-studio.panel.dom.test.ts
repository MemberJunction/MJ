import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { RunView, type RunViewResult } from '@memberjunction/core';
import type { MJAIAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import {
    BaseFormSectionComponent,
    FormChromeCoordinator,
    type BaseFormComponent,
    type FormSectionIndicators,
} from '@memberjunction/ng-base-forms';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { StubLoadingComponent, query } from '@memberjunction/ng-test-utils';
import { AgentTypeStudioPanel } from './agent-type-studio.panel';

@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
    @Input() SectionKey = '';
    @Input() SectionName = '';
    @Input() Icon = '';
    @Input() Order: number | null = null;
    @Input() Indicators: FormSectionIndicators | null = null;
    @Input() Form: unknown;
    @Input() FormContext: unknown;
    @Input() DefaultExpanded = true;
}

@Component({ standalone: true, selector: 'test-stub-studio-section', template: '<div class="stub-flow-canvas">Canvas Active</div>' })
class StubStudioSectionComponent extends BaseFormSectionComponent {
    private pending = false;
    public override get HasPendingChanges(): boolean {
        return this.pending;
    }
    public SetPending(val: boolean): void {
        this.pending = val;
    }
}

const ok = (rows: Array<Record<string, unknown>>): RunViewResult => ({
    Success: true,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 1,
    ErrorMessage: '',
});

async function renderStudio(agentType: MJAIAgentTypeEntity | null): Promise<{
    fixture: ComponentFixture<AgentTypeStudioPanel>;
    registerSectionSpy: ReturnType<typeof vi.fn>;
    notifySectionsSpy: ReturnType<typeof vi.fn>;
}> {
    const registerSectionSpy = vi.fn();
    const notifySectionsSpy = vi.fn();

    vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetRegistration').mockImplementation((_base, key) => {
        if (key === 'AI Agents.FlowAgentSection') {
            return { SubClass: StubStudioSectionComponent } as unknown as ReturnType<typeof MJGlobal.Instance.ClassFactory.GetRegistration>;
        }
        return null;
    });

    TestBed.configureTestingModule({
        imports: [CollapsiblePanelStub, StubStudioSectionComponent, MJButtonDirective, MJAlertComponent, StubLoadingComponent],
        declarations: [AgentTypeStudioPanel],
        providers: [
            {
                provide: FormChromeCoordinator,
                useValue: { SetActiveGroup: vi.fn(), NotifySectionsChanged: notifySectionsSpy },
            },
        ],
    });

    const fixture = TestBed.createComponent(AgentTypeStudioPanel);
    fixture.componentRef.setInput('Record', { ID: 'agent-1', Name: 'Flow Agent' } as unknown as MJAIAgentEntity);
    fixture.componentRef.setInput('FormComponent', {
        ProviderToUse: {},
        EditMode: false,
        AgentType: agentType,
        AgentTypeChanged$: new Subject<MJAIAgentTypeEntity | null>(),
        RegisterAgentTypeSection: registerSectionSpy,
    } as unknown as BaseFormComponent);

    fixture.detectChanges(false);
    await new Promise((r) => setTimeout(r, 0));
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);

    return { fixture, registerSectionSpy, notifySectionsSpy };
}

describe('AgentTypeStudioPanel (DOM)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    it('renders nothing for Loop agents that have no UIFormSectionKey', async () => {
        const { fixture, registerSectionSpy } = await renderStudio({
            Name: 'Loop',
            UIFormSectionKey: null,
        } as unknown as MJAIAgentTypeEntity);

        expect(query(fixture, 'mj-collapsible-panel')).toBeNull();
        expect(registerSectionSpy).not.toHaveBeenCalled();
    });

    it('mounts the registered agent-type section, registers with host, and reports dirty indicator', async () => {
        const { fixture, registerSectionSpy, notifySectionsSpy } = await renderStudio({
            Name: 'Flow',
            UIFormSectionKey: 'FlowAgentSection',
        } as unknown as MJAIAgentTypeEntity);

        expect(query(fixture, '.stub-flow-canvas')?.textContent).toContain('Canvas Active');
        expect(registerSectionSpy).toHaveBeenCalledTimes(1);
        expect(notifySectionsSpy).toHaveBeenCalled();

        const mounted = registerSectionSpy.mock.calls[0][0] as StubStudioSectionComponent;
        expect(fixture.componentInstance.StudioIndicators.DirtyCount).toBe(0);

        mounted.SetPending(true);
        fixture.componentRef.changeDetectorRef.markForCheck();
        fixture.detectChanges(false);
        expect(fixture.componentInstance.StudioIndicators.DirtyCount).toBe(1);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('Unsaved edits');
    });

    it('loads and displays the Overlay Latest Run trace ribbon on toggle', async () => {
        vi.spyOn(RunView.prototype, 'RunView')
            .mockResolvedValueOnce(
                ok([
                    {
                        ID: 'run-12345678',
                        Status: 'Completed',
                        StartedAt: '2026-01-01T00:00:00Z',
                        CompletedAt: '2026-01-01T00:00:02Z',
                        ErrorMessage: null,
                    },
                ]),
            )
            .mockResolvedValueOnce(
                ok([
                    {
                        ID: 'step-1',
                        StepNumber: 1,
                        StepName: 'Fetch Data',
                        StepType: 'Action',
                        Status: 'Completed',
                        StartedAt: '2026-01-01T00:00:00Z',
                        CompletedAt: '2026-01-01T00:00:01Z',
                        ErrorMessage: null,
                    },
                ]),
            );

        const { fixture } = await renderStudio({
            Name: 'Flow',
            UIFormSectionKey: 'FlowAgentSection',
        } as unknown as MJAIAgentTypeEntity);

        await fixture.componentInstance.ToggleRunOverlay();
        fixture.detectChanges(false);

        const ribbonText = query(fixture, '.ats-run-ribbon')?.textContent ?? '';
        expect(ribbonText).toContain('Run #run-1234');
        expect(ribbonText).toContain('Fetch Data');
    });
});
