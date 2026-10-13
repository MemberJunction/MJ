import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
            { tempId: 'a', name: 'Gather', description: 'g', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] },
            { tempId: 'b', name: 'Summarize', description: 's', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
        ],
    };

    function render(inputs: Record<string, unknown> = {}): ComponentFixture<WorkflowPlanCardComponent> {
        TestBed.configureTestingModule({
            declarations: [WorkflowPlanCardComponent],
            // FormsModule: the card names the workflow inline (ratified answer ④), so the save
            // row binds ngModel.
            imports: [CommonModule, FormsModule, MJButtonDirective, TaskGraphEditorModule],
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
        expect(host(f).textContent).toContain('Save as Workflow');
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

    describe('④ name it inline, then offer the editor', () => {
        const spec: TaskGraphSpec = {
            workflowName: 'Quarterly review',
            tasks: [{ tempId: 'a', name: 'Pull numbers', description: 'd', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] }],
        };

        it('seeds the name from the plan rather than making the user invent one', () => {
            // A blank field is the difference between saving and not bothering — the plan already has a
            // perfectly good name.
            const f = render({ Spec: spec, Expanded: true });
            expect(f.componentInstance.EffectiveName).toBe('Quarterly review');
        });

        it('keeps what the user typed, including clearing it', () => {
            const f = render({ Spec: spec, Expanded: true });
            f.componentInstance.OnNameChanged('Q3 review');
            expect(f.componentInstance.EffectiveName).toBe('Q3 review');
            // Cleared stays cleared: re-seeding here would fight the user's backspace.
            f.componentInstance.OnNameChanged('');
            expect(f.componentInstance.EffectiveName).toBe('');
        });

        it('will not save a nameless workflow — there would be nothing to find it by', () => {
            const f = render({ Spec: spec, Expanded: true });
            f.componentInstance.OnNameChanged('   ');
            expect(f.componentInstance.CanCommit).toBe(false);
        });

        it('carries the name and the editor intent on the event', () => {
            const f = render({ Spec: spec, Expanded: true });
            const seen: Array<{ Name: string; OpenInEditor: boolean }> = [];
            f.componentInstance.SaveAsWorkflowRequested.subscribe((e) => seen.push(e));

            f.componentInstance.RequestSave(false);
            f.componentInstance.OnNameChanged('Renamed');
            f.componentInstance.RequestSave(true);

            expect(seen).toHaveLength(2);
            expect(seen[0]).toMatchObject({ Name: 'Quarterly review', OpenInEditor: false });
            expect(seen[1]).toMatchObject({ Name: 'Renamed', OpenInEditor: true });
        });

        it('offers the editor as a SECONDARY route, not a requirement', () => {
            // Making the editor mandatory turns a two-second capture into a task, which is the friction
            // that stops good one-off plans becoming reusable.
            const f = render({ Spec: spec, Expanded: true });
            expect(host(f).textContent).toContain('Open in editor');
        });

        it('states the default instead of asking for a schedule', () => {
            // Saving is capture, not scheduling — so no trigger field, but the default is spelled out
            // rather than left for the user to discover.
            const f = render({ Spec: spec, Expanded: true });
            const text = host(f).textContent ?? '';
            expect(text).toContain('run on demand until you give them a schedule');
            expect(text.toLowerCase()).not.toContain('cron');
        });
    });
});
