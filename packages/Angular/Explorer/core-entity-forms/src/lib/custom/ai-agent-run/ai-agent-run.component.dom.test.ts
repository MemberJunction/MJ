import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJTabNavComponent } from '@memberjunction/ng-ui-components';
import { QueryAll } from '@memberjunction/ng-test-utils';
import { AIAgentRunCostService } from './ai-agent-run-cost.service';
import { MJAIAgentRunFormComponentExtended } from './ai-agent-run.component';

/**
 * The AI Agent Run form shows its Result panel only for an older run that has `Result` but no
 * `FinalPayload`. Every other run keeps the same JSON in `FinalPayload`, which has its own panel.
 *
 * The form is constructed in an injection context (this is a class-behaviour spec, so no template
 * renders), and the record is a REAL `MJAIAgentRunEntityExtended`.
 */

const AGENT_RUN_ENTITY = new EntityInfo({
    ID: 'agent-run-entity',
    Name: 'MJ: AI Agent Runs',
    Fields: ['ID', 'Result', 'FinalPayload'].map((Name) => ({
        Name,
        Type: Name === 'ID' ? 'uniqueidentifier' : 'nvarchar',
        IsPrimaryKey: Name === 'ID',
        AllowUpdateAPI: Name !== 'ID',
        AllowsNull: true,
    })),
});

const PAYLOAD = '{"answer":42}';

function makeForm(columns: { Result?: string; FinalPayload?: string }): MJAIAgentRunFormComponentExtended {
    const record = new MJAIAgentRunEntityExtended(AGENT_RUN_ENTITY);
    if (columns.Result) record.Result = columns.Result;
    if (columns.FinalPayload) record.FinalPayload = columns.FinalPayload;
    const form = TestBed.runInInjectionContext(() => new MJAIAgentRunFormComponentExtended());
    form.record = record;
    return form;
}

describe('MJAIAgentRunFormComponentExtended Result panel', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
                { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
                { provide: NavigationService, useValue: {} },
                { provide: ApplicationManager, useValue: {} },
                { provide: AIAgentRunCostService, useValue: {} },
            ],
        });
    });

    it('shows the Result panel for an older run that has Result but no FinalPayload', () => {
        const form = makeForm({ Result: PAYLOAD });
        expect(form.ShowResultPanel).toBe(true);
        expect(JSON.parse(form.ParsedResult)).toEqual({ answer: 42 });
    });

    it('hides the Result panel when FinalPayload holds the same JSON', () => {
        expect(makeForm({ Result: PAYLOAD, FinalPayload: PAYLOAD }).ShowResultPanel).toBe(false);
    });

    it('hides the Result panel for a run that has only FinalPayload', () => {
        expect(makeForm({ FinalPayload: PAYLOAD }).ShowResultPanel).toBe(false);
    });

    it('hides the Result panel for a run with neither column', () => {
        expect(makeForm({}).ShowResultPanel).toBe(false);
    });

    it('memoizes StartingPayloadObject and FinalPayloadObject across repeated reads', () => {
        const record = new MJAIAgentRunEntityExtended(AGENT_RUN_ENTITY);
        record.FinalPayload = PAYLOAD;
        const form = TestBed.runInInjectionContext(() => new MJAIAgentRunFormComponentExtended());
        form.record = record;

        const first = form.FinalPayloadObject;
        const second = form.FinalPayloadObject;
        expect(first).toEqual({ answer: 42 });
        expect(first).toBe(second);
    });
});

describe('MJAIAgentRunFormComponentExtended tab bar', () => {
    const PROVIDERS = [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
        { provide: NavigationService, useValue: {} },
        { provide: ApplicationManager, useValue: {} },
        { provide: AIAgentRunCostService, useValue: {} },
    ];

    /** Renders `mj-tab-nav` with the form's tabs, wired to `ChangeTab` as the form's template wires it. */
    function renderTabs(form: MJAIAgentRunFormComponentExtended) {
        const fixture = TestBed.createComponent(MJTabNavComponent);
        fixture.componentRef.setInput('Tabs', form.Tabs);
        fixture.componentRef.setInput('ActiveKey', form.ActiveTab);
        fixture.componentInstance.TabChange.subscribe((key: string) => {
            form.ChangeTab(key);
            fixture.componentRef.setInput('ActiveKey', form.ActiveTab);
        });
        fixture.detectChanges(false);
        return fixture;
    }

    function clickTab(fixture: ReturnType<typeof renderTabs>, label: string): void {
        const button = QueryAll(fixture, 'button.mj-tab-nav-btn').find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
        button.click();
        fixture.detectChanges(false);
    }

    beforeEach(() => {
        TestBed.configureTestingModule({ imports: [MJTabNavComponent], providers: PROVIDERS });
    });

    it('offers Timeline, Visualization, Analytics and Details, with Timeline active', () => {
        const form = makeForm({});
        const fixture = renderTabs(form);
        const buttons = QueryAll(fixture, 'button.mj-tab-nav-btn');
        expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Timeline', 'Visualization', 'Analytics', 'Details']);
        expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    });

    it('sets the lazy-load flags on the first visit to Visualization and Analytics', () => {
        const form = makeForm({});
        const fixture = renderTabs(form);
        expect(form.VisualizationLoaded).toBe(false);
        expect(form.AnalyticsLoaded).toBe(false);

        clickTab(fixture, 'Visualization');
        expect(form.ActiveTab).toBe('visualization');
        expect(form.VisualizationLoaded).toBe(true);
        expect(form.AnalyticsLoaded).toBe(false);

        clickTab(fixture, 'Analytics');
        expect(form.ActiveTab).toBe('analytics');
        expect(form.AnalyticsLoaded).toBe(true);

        clickTab(fixture, 'Details');
        clickTab(fixture, 'Visualization');
        expect(form.VisualizationLoaded).toBe(true);
        expect(QueryAll(fixture, 'button.mj-tab-nav-btn')[1].getAttribute('aria-selected')).toBe('true');
    });
});
