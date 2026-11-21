import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeDetectorRef, ElementRef, ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { SharedService } from '@memberjunction/ng-shared';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { CreateAgentService } from '@memberjunction/ng-agents';
import { AIAgentManagementService } from './ai-agent-management.service';
import { MJAIAgentFormComponentExtended } from './ai-agent-form.component';

/**
 * The AI Agent form's execution history shows a run's result from `FinalPayload` (`Result` on older
 * runs), and only once the run is no longer Running: a running run can already have a partial
 * `FinalPayload`.
 *
 * The form is constructed in an injection context (this is a class-behaviour spec, so no template
 * renders), and each run is a REAL `MJAIAgentRunEntityExtended`.
 */

const AGENT_RUN_ENTITY = new EntityInfo({
    ID: 'agent-run-entity',
    Name: 'MJ: AI Agent Runs',
    Fields: ['ID', 'Status', 'Result', 'FinalPayload'].map((Name) => ({
        Name,
        Type: Name === 'ID' ? 'uniqueidentifier' : 'nvarchar',
        IsPrimaryKey: Name === 'ID',
        AllowUpdateAPI: Name !== 'ID',
        AllowsNull: true,
    })),
});

function makeRun(columns: { Status: MJAIAgentRunEntityExtended['Status']; Result?: string; FinalPayload?: string }): MJAIAgentRunEntityExtended {
    const run = new MJAIAgentRunEntityExtended(AGENT_RUN_ENTITY);
    run.Status = columns.Status;
    if (columns.Result) run.Result = columns.Result;
    if (columns.FinalPayload) run.FinalPayload = columns.FinalPayload;
    return run;
}

describe('MJAIAgentFormComponentExtended execution history result', () => {
    let form: MJAIAgentFormComponentExtended;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
                { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
                { provide: ViewContainerRef, useValue: {} },
                { provide: SharedService, useValue: {} },
                { provide: MJDialogService, useValue: {} },
                { provide: AIAgentManagementService, useValue: {} },
                { provide: AITestHarnessDialogService, useValue: {} },
                { provide: CreateAgentService, useValue: {} },
            ],
        });
        form = TestBed.runInInjectionContext(() => new MJAIAgentFormComponentExtended());
    });

    it("shows a finished run's result from FinalPayload", () => {
        const run = makeRun({ Status: 'Completed', FinalPayload: '{"answer":42}' });

        expect(form.HasExecutionResult(run)).toBe(true);
        expect(JSON.parse(form.GetExecutionResultPreview(run, false))).toEqual({ answer: 42 });
        expect(JSON.parse(form.GetExecutionResultMessage(run))).toEqual({ answer: 42 });
    });

    it('falls back to Result on an older run that has no FinalPayload', () => {
        const run = makeRun({ Status: 'Completed', Result: '{"legacy":true}' });

        expect(form.HasExecutionResult(run)).toBe(true);
        expect(JSON.parse(form.GetExecutionResultPreview(run, false))).toEqual({ legacy: true });
        expect(JSON.parse(form.GetExecutionResultMessage(run))).toEqual({ legacy: true });
    });

    it('prefers FinalPayload over Result when a run has both', () => {
        const run = makeRun({ Status: 'Completed', Result: '{"legacy":true}', FinalPayload: '{"answer":42}' });

        expect(JSON.parse(form.GetExecutionResultPreview(run, false))).toEqual({ answer: 42 });
        expect(JSON.parse(form.GetExecutionResultMessage(run))).toEqual({ answer: 42 });
    });

    it('hides the result of a run that is still Running, even when it already has a FinalPayload', () => {
        expect(form.HasExecutionResult(makeRun({ Status: 'Running', FinalPayload: '{"partial":true}' }))).toBe(false);
    });

    it('shows the result of a run that ended without completing', () => {
        expect(form.HasExecutionResult(makeRun({ Status: 'Cancelled', FinalPayload: '{"partial":true}' }))).toBe(true);
    });

    it('hides the result section for a finished run with neither column', () => {
        const run = makeRun({ Status: 'Failed' });

        expect(form.HasExecutionResult(run)).toBe(false);
        expect(form.GetExecutionResultPreview(run, true)).toBe('No result');
        expect(form.GetExecutionResultMessage(run)).toBe('No result');
    });
});
