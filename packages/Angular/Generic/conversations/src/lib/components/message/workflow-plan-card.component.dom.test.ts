import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { TaskGraphEditorModule } from '@memberjunction/ng-task-graph-editor';
import { WorkflowPlanCardComponent } from './workflow-plan-card.component';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';

/**
 * DOM-level spec for `<mj-workflow-plan-card>`.
 *
 * The rule with the most riding on it is WHEN "Save as Workflow" appears. Offering it while work is
 * still running invites saving a shape that may yet change — a retry, a failure routing down a
 * recovery branch — so the graph a user believes they saved would not be the one that ran.
 */
describe('WorkflowPlanCardComponent (DOM)', () => {
    const spec: TaskGraphSpec = {
        workflowName: 'Quarterly review',
        reasoning: 'research then summarize',
        tasks: [
            { tempId: 'a', name: 'Gather', description: 'g', agentName: 'Sage', dependsOn: [] },
            { tempId: 'b', name: 'Summarize', description: 's', agentName: 'Sage', dependsOn: ['a'] },
        ],
    };

    function render(inputs: Record<string, unknown> = {}): ComponentFixture<WorkflowPlanCardComponent> {
        TestBed.configureTestingModule({
            declarations: [WorkflowPlanCardComponent],
            imports: [CommonModule, MJButtonDirective, TaskGraphEditorModule],
        });
        const fixture = TestBed.createComponent(WorkflowPlanCardComponent);
        for (const [k, v] of Object.entries(inputs)) {
            fixture.componentRef.setInput(k, v);
        }
        fixture.detectChanges();
        return fixture;
    }
    const host = (f: ComponentFixture<WorkflowPlanCardComponent>) => f.nativeElement as HTMLElement;

    it('renders nothing without a plan — a card with no graph has nothing to say', () => {
        expect(host(render({ Spec: null })).querySelector('.mj-wpc')).toBeNull();
    });

    it('shows the workflow name and starts collapsed, so it does not dominate the thread', () => {
        const f = render({ Spec: spec });
        expect(host(f).textContent).toContain('Quarterly review');
        expect(host(f).querySelector('.mj-wpc__body')).toBeNull();
    });

    it('expands to reveal the same read-only canvas the editor uses', () => {
        const f = render({ Spec: spec, Expanded: true });
        expect(host(f).querySelector('mj-task-graph-editor')).toBeTruthy();
    });

    it('summarizes progress once a runtime status is supplied', () => {
        const f = render({ Spec: spec, RuntimeStatus: { a: 'Complete', b: 'In Progress' } });
        expect(host(f).textContent).toContain('1 complete');
    });

    it('falls back to the plan reasoning before anything runs', () => {
        expect(host(render({ Spec: spec })).textContent).toContain('research then summarize');
    });

    it('does NOT offer Save while work is still running', () => {
        const f = render({ Spec: spec, Expanded: true, RuntimeStatus: { a: 'Complete', b: 'In Progress' } });
        expect(host(f).querySelector('.mj-wpc__actions')).toBeNull();
    });

    it('offers Save once every step has settled', () => {
        const f = render({ Spec: spec, Expanded: true, RuntimeStatus: { a: 'Complete', b: 'Complete' } });
        expect(host(f).querySelector('.mj-wpc__actions')).toBeTruthy();
        expect(host(f).textContent).toContain('Save this approach as a Workflow');
    });

    it('emits Save as INTENT — the card does not persist agents', () => {
        const f = render({ Spec: spec, Expanded: true, RuntimeStatus: { a: 'Complete', b: 'Complete' }, ParentTaskID: 'p1' });
        let seen: string | null = null;
        f.componentInstance.SaveAsWorkflowRequested.subscribe((a) => { seen = a.ParentTaskID; });
        f.componentInstance.RequestSave();
        expect(seen).toBe('p1');
    });

    it('respects a host that suppresses the Save affordance', () => {
        const f = render({ Spec: spec, Expanded: true, AllowSaveAsWorkflow: false });
        expect(host(f).querySelector('.mj-wpc__actions')).toBeNull();
    });
});
