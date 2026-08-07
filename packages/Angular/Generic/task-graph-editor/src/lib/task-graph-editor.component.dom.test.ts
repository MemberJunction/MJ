import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskGraphEditorModule } from './task-graph-editor.module';
import { TaskGraphEditorComponent } from './task-graph-editor.component';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';

/**
 * DOM-level spec for `<mj-task-graph-editor>`.
 *
 * Covers only what exists in the rendered template rather than the class — the empty state, the
 * validation banner, and whether the canvas is handed the read-only flag. The graph *logic* is
 * tested against the pure adapter and the component class, where it can be tested without a
 * TestBed at all.
 *
 * The validation banner earns DOM coverage specifically: it is the one place author-time feedback
 * from the engine becomes visible, and a template regression there is silent — the component would
 * still compute `IsValid` correctly while showing the user nothing.
 */
describe('TaskGraphEditorComponent (DOM)', () => {
    const spec = (over: Partial<TaskGraphSpec> = {}): TaskGraphSpec => ({
        workflowName: 'W',
        tasks: [
            { tempId: 'a', name: 'Gather', description: 'g', agentName: 'Sage', dependsOn: [] },
            { tempId: 'b', name: 'Summarize', description: 's', agentName: 'Sage', dependsOn: ['a'] },
        ],
        ...over,
    });

    function render(inputs: Record<string, unknown> = {}): ComponentFixture<TaskGraphEditorComponent> {
        TestBed.configureTestingModule({ imports: [TaskGraphEditorModule] });
        const fixture = TestBed.createComponent(TaskGraphEditorComponent);
        for (const [k, v] of Object.entries(inputs)) {
            fixture.componentRef.setInput(k, v);
        }
        fixture.detectChanges();
        return fixture;
    }
    const host = (f: ComponentFixture<TaskGraphEditorComponent>) => f.nativeElement as HTMLElement;

    it('shows the empty state, not a canvas, when there are no steps', () => {
        const f = render({ Spec: spec({ tasks: [] }) });
        expect(host(f).querySelector('mj-empty-state')).toBeTruthy();
        expect(host(f).querySelector('mj-flow-editor')).toBeNull();
    });

    it('uses the caller-supplied empty-state message', () => {
        const f = render({ Spec: spec({ tasks: [] }), EmptyStateMessage: 'Nothing to run.' });
        expect(host(f).textContent).toContain('Nothing to run.');
    });

    it('renders the canvas once there are steps', () => {
        const f = render({ Spec: spec() });
        expect(host(f).querySelector('mj-flow-editor')).toBeTruthy();
        expect(host(f).querySelector('mj-empty-state')).toBeNull();
    });

    it('shows no validation banner for a valid graph', () => {
        const f = render({ Spec: spec() });
        expect(host(f).querySelector('.mj-tge__validation')).toBeNull();
    });

    it('SURFACES engine validation errors — the one place author-time feedback becomes visible', () => {
        const f = render({ Spec: spec({ tasks: [{ tempId: 'a', name: 'A', description: 'a', agentName: 'Sage', dependsOn: ['ghost'] }] }) });
        const banner = host(f).querySelector('.mj-tge__validation');
        expect(banner).toBeTruthy();
        expect(banner!.textContent).toContain('1 problem to fix');
    });

    it('pluralizes the problem count', () => {
        const f = render({ Spec: spec({ workflowName: '', tasks: [{ tempId: 'a', name: 'A', description: 'a', dependsOn: ['ghost'] }] }) });
        expect(host(f).querySelector('.mj-tge__validation')!.textContent).toMatch(/problems to fix/);
    });

    it('hides the palette in read-only mode, so a viewer cannot offer edits it will refuse', () => {
        const f = render({ Spec: spec(), ReadOnly: true });
        const canvas = host(f).querySelector('mj-flow-editor');
        expect(canvas).toBeTruthy();
        expect(f.componentInstance.ReadOnly).toBe(true);
    });
});
