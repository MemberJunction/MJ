import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskGraphEditorModule } from './task-graph-editor.module';
import { TaskGraphEditorComponent } from './task-graph-editor.component';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';

// The spec's own `EmptyGraph` rule is what the author saw as "a task graph must contain at least
// one task"; several tests below assert it goes away, which is the user-visible fix.

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
            { tempId: 'a', name: 'Gather', description: 'g', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: [] },
            { tempId: 'b', name: 'Summarize', description: 's', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
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

    it('shows the empty state, not a canvas, when there are no steps AND it is read-only', () => {
        // Read-only + empty is genuinely nothing to show: there is no palette to offer, because
        // there is nothing the viewer is allowed to add.
        const f = render({ Spec: spec({ tasks: [] }), ReadOnly: true });
        expect(host(f).querySelector('mj-empty-state')).toBeTruthy();
        expect(host(f).querySelector('mj-flow-editor')).toBeNull();
    });

    it('STILL renders the canvas when empty and editable — the palette is the only way to add a step', () => {
        // The regression this replaces: an editable empty graph rendered a bare empty state whose
        // message said "Add one to start building this workflow" while removing the palette that was
        // the only way to add one. The advice was unfollowable and the screen was a dead end.
        const f = render({ Spec: spec({ tasks: [] }) });
        // The flow editor renders, so the palette is reachable. It shows its OWN empty state inside
        // the canvas, which is fine — what matters is that the editor exists at all, because the
        // previous behaviour replaced it wholesale and left nothing to add a step with.
        expect(host(f).querySelector('mj-flow-editor')).toBeTruthy();
    });

    it('still says what to do on an empty editable canvas, as a hint rather than a wall', () => {
        const f = render({ Spec: spec({ tasks: [] }), EmptyStateMessage: 'Nothing to run.' });
        expect(host(f).textContent).toContain('Nothing to run.');
        expect(host(f).querySelector('.mj-tge__empty-hint')).toBeTruthy();
    });

    it('uses the caller-supplied empty-state message when read-only too', () => {
        const f = render({ Spec: spec({ tasks: [] }), ReadOnly: true, EmptyStateMessage: 'Nothing to run.' });
        expect(host(f).textContent).toContain('Nothing to run.');
    });

    it('renders the canvas once there are steps', () => {
        const f = render({ Spec: spec() });
        expect(host(f).querySelector('mj-flow-editor')).toBeTruthy();
        // Scoped to the top level: the properties panel shows its own "no step selected" empty state
        // inside the workspace, which is not the whole-editor empty state this asserts is gone.
        expect(host(f).querySelector('.mj-tge > mj-empty-state')).toBeNull();
    });

    it('shows no validation banner for a valid graph', () => {
        const f = render({ Spec: spec() });
        expect(host(f).querySelector('.mj-tge__validation')).toBeNull();
    });

    it('SURFACES engine validation errors — the one place author-time feedback becomes visible', () => {
        const f = render({ Spec: spec({ tasks: [{ tempId: 'a', name: 'A', description: 'a', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['ghost'] }] }) });
        const banner = host(f).querySelector('.mj-tge__validation');
        expect(banner).toBeTruthy();
        expect(banner!.textContent).toContain('1 problem to fix');
    });

    it('pluralizes the problem count', () => {
        const f = render({ Spec: spec({ workflowName: '', tasks: [{ tempId: 'a', name: 'A', description: 'a', kind: 'Agent' as const, configuration: {}, dependsOn: ['ghost'] }] }) });
        expect(host(f).querySelector('.mj-tge__validation')!.textContent).toMatch(/problems to fix/);
    });

    // ── The dead palette click ───────────────────────────────────────────────
    //
    // These go through the REAL rendered palette rather than calling `OnNodeAdded` directly,
    // because every link in the broken chain was a missing binding, not a broken function:
    // the palette entry was a <div> with no click handler, and this component never bound the
    // canvas's `NodeAdded`. A class-level test would have passed throughout.

    const paletteItems = (f: ComponentFixture<TaskGraphEditorComponent>): HTMLElement[] =>
        Array.from(host(f).querySelectorAll<HTMLElement>('.mj-flow-palette-item'));

    const clickPalette = (f: ComponentFixture<TaskGraphEditorComponent>, label: string): void => {
        const item = paletteItems(f).find((el) => (el.textContent ?? '').includes(label));
        expect(item, `no palette entry labelled "${label}"`).toBeTruthy();
        item!.click();
        f.detectChanges();
    };

    it('offers one palette entry per assignment shape the spec supports', () => {
        const f = render({ Spec: spec({ tasks: [] }) });
        const labels = paletteItems(f).map((el) => (el.textContent ?? '').trim());
        expect(labels).toEqual(expect.arrayContaining(['Agent Step', 'Action Step', 'Person Step']));
    });

    it('CLICKING a palette entry adds a step to the bound spec', () => {
        const f = render({ Spec: spec({ tasks: [] }), AvailableAgentNames: ['Sage'] });
        clickPalette(f, 'Agent Step');

        expect(f.componentInstance.Spec!.tasks).toHaveLength(1);
        expect((f.componentInstance.Spec!.tasks[0].configuration as { agentName?: string }).agentName).toBe('Sage');
    });

    it('announces the new spec to the host, so the host does not keep the pre-click graph', () => {
        const f = render({ Spec: spec({ tasks: [] }) });
        const seen: TaskGraphSpec[] = [];
        f.componentInstance.SpecChanged.subscribe((e) => seen.push(e.Spec));

        clickPalette(f, 'Person Step');

        expect(seen).toHaveLength(1);
        expect(seen[0].tasks[0].kind).toBe('Human');
    });

    it('adds a DISTINCT step per click rather than replacing the last one', () => {
        const f = render({ Spec: spec({ tasks: [] }), AvailableAgentNames: ['Sage'] });
        clickPalette(f, 'Agent Step');
        clickPalette(f, 'Person Step');

        const tasks = f.componentInstance.Spec!.tasks;
        expect(tasks).toHaveLength(2);
        expect(new Set(tasks.map((t) => t.tempId)).size).toBe(2);
    });

    it('selects the new step, because it lands unnamed and needs the properties panel next', () => {
        const f = render({ Spec: spec({ tasks: [] }), AvailableAgentNames: ['Sage'] });
        clickPalette(f, 'Agent Step');
        expect(f.componentInstance.SelectedTask?.name).toBe('New agent step');
    });

    it('clears the "must contain at least one task" complaint once a step is added', () => {
        const f = render({ Spec: spec({ tasks: [] }), AvailableAgentNames: ['Sage'] });
        expect(f.componentInstance.ValidationErrors.some((e) => e.Code === 'EmptyGraph')).toBe(true);

        clickPalette(f, 'Agent Step');
        expect(f.componentInstance.ValidationErrors.some((e) => e.Code === 'EmptyGraph')).toBe(false);
    });

    it('refuses to add anything in read-only mode — there is no palette to click', () => {
        const f = render({ Spec: spec(), ReadOnly: true });
        expect(paletteItems(f)).toHaveLength(0);
        // And the handler itself refuses, so a host driving it directly cannot bypass the flag.
        f.componentInstance.OnNodeAdded({
            Node: { ID: 'x', Type: 'AgentTask', Label: 'x', Status: 'default', Position: { X: 0, Y: 0 }, Ports: [] },
            DropPosition: { X: 0, Y: 0 },
        });
        expect(f.componentInstance.Spec!.tasks).toHaveLength(2);
    });

    it('mounts the properties panel, without which an added step can never be named or assigned', () => {
        const f = render({ Spec: spec() });
        expect(host(f).querySelector('mj-task-graph-properties')).toBeTruthy();
    });

    it('lets a host that only wants the graph decline the properties panel', () => {
        const f = render({ Spec: spec(), ShowProperties: false });
        expect(host(f).querySelector('mj-task-graph-properties')).toBeNull();
    });

    it('hides the palette in read-only mode, so a viewer cannot offer edits it will refuse', () => {
        const f = render({ Spec: spec(), ReadOnly: true });
        const canvas = host(f).querySelector('mj-flow-editor');
        expect(canvas).toBeTruthy();
        expect(f.componentInstance.ReadOnly).toBe(true);
    });
});
