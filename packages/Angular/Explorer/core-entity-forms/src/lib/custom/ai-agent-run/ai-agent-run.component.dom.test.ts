import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
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
});
