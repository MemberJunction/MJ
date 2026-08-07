import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskGraphEditorModule } from './task-graph-editor.module';
import { TaskGraphPropertiesPanelComponent } from './task-graph-properties-panel.component';
import type { TaskGraphSpec, TaskGraphSpecNode } from '@memberjunction/ai-core-plus';

/**
 * DOM-level spec for `<mj-task-graph-properties>`.
 *
 * The behavior worth asserting in the DOM is that the panel never writes: every control emits a
 * request the parent applies. A regression there would not throw — it would just quietly bypass the
 * veto contract, which is exactly the class of bug the rendered template can hide.
 */
describe('TaskGraphPropertiesPanelComponent (DOM)', () => {
    const task = (over: Partial<TaskGraphSpecNode> = {}): TaskGraphSpecNode => ({
        tempId: 'a', name: 'Gather', description: 'g', agentName: 'Sage', dependsOn: [], ...over,
    });
    const spec: TaskGraphSpec = {
        workflowName: 'W',
        tasks: [task({ tempId: 'a' }), task({ tempId: 'b', name: 'Summarize', dependsOn: ['a'] })],
    };

    function render(inputs: Record<string, unknown> = {}): ComponentFixture<TaskGraphPropertiesPanelComponent> {
        TestBed.configureTestingModule({ imports: [TaskGraphEditorModule] });
        const fixture = TestBed.createComponent(TaskGraphPropertiesPanelComponent);
        for (const [k, v] of Object.entries(inputs)) {
            fixture.componentRef.setInput(k, v);
        }
        fixture.detectChanges();
        return fixture;
    }
    const host = (f: ComponentFixture<TaskGraphPropertiesPanelComponent>) => f.nativeElement as HTMLElement;

    it('shows the empty state when nothing is selected', () => {
        const f = render({ Task: null });
        expect(host(f).querySelector('mj-empty-state')).toBeTruthy();
    });

    it('renders the selected task into a DRAFT, so a half-typed name never reaches the spec', () => {
        const original = task();
        const f = render({ Task: original, Spec: spec });
        expect(f.componentInstance.Draft).not.toBe(original);
        expect(f.componentInstance.Draft!.name).toBe('Gather');
    });

    it('offers both assignment kinds', () => {
        const f = render({ Task: task(), Spec: spec });
        expect(host(f).textContent).toContain('An agent');
        expect(host(f).textContent).toContain('A person');
    });

    it('states that cross-user assignment is unavailable rather than offering a picker that fails', () => {
        const f = render({ Task: task({ agentName: undefined, assignToUser: true }), Spec: spec });
        expect(host(f).querySelector('mj-alert')).toBeTruthy();
    });

    it('lists incoming edges so a condition is edited where the step is', () => {
        const f = render({ Task: spec.tasks[1], Spec: spec });
        expect(host(f).textContent).toContain('Runs after');
        expect(host(f).textContent).toContain('Gather');
    });

    it('EMITS a change request rather than writing — the panel never mutates the spec', () => {
        const f = render({ Task: task(), Spec: spec });
        let emitted = 0;
        f.componentInstance.TaskPropertyChangeRequested.subscribe(() => emitted++);
        f.componentInstance.Draft!.name = 'Renamed';
        f.componentInstance.Commit();
        expect(emitted).toBe(1);
        expect(spec.tasks[0].name).toBe('Gather'); // untouched
    });

    it('is inert in read-only mode', () => {
        const f = render({ Task: task(), Spec: spec, ReadOnly: true });
        let emitted = 0;
        f.componentInstance.TaskPropertyChangeRequested.subscribe(() => emitted++);
        f.componentInstance.Commit();
        expect(emitted).toBe(0);
    });
});
