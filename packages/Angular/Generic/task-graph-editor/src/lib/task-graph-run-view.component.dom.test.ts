import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { createFakeProvider } from '@memberjunction/ng-test-utils';
import type { TaskRunEdge, TaskRunRow } from '@memberjunction/ai-core-plus';
import { TaskGraphEditorModule } from './task-graph-editor.module';
import { TaskGraphRunViewComponent, TaskGraphRunNodeSelectedEvent } from './task-graph-run-view.component';
import { TaskGraphSelectionChangedEventArgs } from './task-graph-editor-events';

/**
 * DOM-level spec for `<mj-task-graph-run-view>`.
 *
 * The component's job is acquisition + projection: read `MJ: Tasks` rows through the host's
 * provider, project them onto the same canvas the author drew on, and hand selection back to the
 * host as intent. What earns DOM coverage is the part a class test can't see — which of the four
 * template states (empty / loading / error / canvas) actually renders for a given load outcome,
 * and that the summary line states the run's progress rather than the row count.
 */
describe('TaskGraphRunViewComponent (DOM)', () => {
    const row = (ID: string, Name: string, Status: TaskRunRow['Status']): TaskRunRow => ({
        ID,
        Name,
        Description: '',
        Status,
        StepType: 'Agent',
        Configuration: null,
    });

    const TASKS: TaskRunRow[] = [row('t1', 'Gather', 'Complete'), row('t2', 'Summarize', 'In Progress'), row('t3', 'Escalate', 'Skipped')];
    const EDGES: TaskRunEdge[] = [{ TaskID: 't2', DependsOnTaskID: 't1' }];

    /** Fake provider that serves tasks/dependencies by entity name and records what was asked. */
    function graphProvider(tasks: TaskRunRow[] = TASKS, edges: TaskRunEdge[] = EDGES) {
        const queried: string[] = [];
        const provider = createFakeProvider<TaskRunRow | TaskRunEdge>({
            runViewResults: (params: RunViewParams) => {
                queried.push(params.EntityName ?? '');
                return params.EntityName === 'MJ: Tasks' ? tasks : edges;
            },
        });
        return { provider, queried };
    }

    /** Provider whose tasks query fails — the deps result alone must not render a graph. */
    function failingProvider(): IMetadataProvider {
        const fake = {
            CurrentUser: { ID: 'user-1', Name: 'Test User' },
            RunViews: async () => [
                { Success: false, ErrorMessage: 'boom', Results: [], RowCount: 0, TotalRowCount: 0 },
                { Success: true, Results: [], RowCount: 0, TotalRowCount: 0 },
            ],
        };
        return fake as unknown as IMetadataProvider;
    }

    function render(
        provider: IMetadataProvider,
        parentTaskID: string | null,
        beforeLoad?: (component: TaskGraphRunViewComponent) => void,
    ): ComponentFixture<TaskGraphRunViewComponent> {
        TestBed.configureTestingModule({ imports: [TaskGraphEditorModule] });
        const fixture = TestBed.createComponent(TaskGraphRunViewComponent);
        fixture.componentRef.setInput('Provider', provider);
        beforeLoad?.(fixture.componentInstance);
        // Last on purpose: the setter kicks off the load, and it must see the provider above.
        fixture.componentRef.setInput('ParentTaskID', parentTaskID);
        fixture.detectChanges();
        return fixture;
    }

    async function settle(fixture: ComponentFixture<TaskGraphRunViewComponent>): Promise<void> {
        const component = fixture.componentInstance;
        for (let i = 0; i < 30 && component.IsLoading; i++) await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        fixture.detectChanges();
    }

    const host = (f: ComponentFixture<TaskGraphRunViewComponent>) => f.nativeElement as HTMLElement;

    it('shows the empty state and asks the database NOTHING when there is no parent task', () => {
        const { provider, queried } = graphProvider();
        const f = render(provider, null);
        expect(host(f).querySelector('mj-empty-state')).toBeTruthy();
        expect(host(f).querySelector('mj-task-graph-editor')).toBeNull();
        expect(queried).toEqual([]);
    });

    it('projects the loaded rows onto the canvas with a progress summary, not a row count', async () => {
        const { provider, queried } = graphProvider();
        const f = render(provider, 'parent-1');
        await settle(f);
        // "1 of 3" is completion — the distinction between a run half done and a run half rendered.
        expect(host(f).textContent).toContain('1 of 3 complete');
        expect(host(f).querySelector('mj-task-graph-editor')).toBeTruthy();
        expect(queried).toContain('MJ: Tasks');
        expect(queried).toContain('MJ: Task Dependencies');
    });

    it('says a skipped branch was "not taken" — grey-because-skipped must read differently from grey-because-broken', async () => {
        const { provider } = graphProvider();
        const f = render(provider, 'parent-1');
        await settle(f);
        expect(host(f).textContent).toContain('1 not taken');
    });

    it('reports a failed load as an alert rather than an empty canvas that looks authoritative', async () => {
        const f = render(failingProvider(), 'parent-1');
        await settle(f);
        const alert = host(f).querySelector('mj-alert');
        expect(alert).toBeTruthy();
        expect(f.componentInstance.ErrorMessage).toContain('boom');
        expect(host(f).querySelector('mj-task-graph-editor')).toBeNull();
    });

    it('shows the no-steps empty state when the run produced no rows', async () => {
        const { provider } = graphProvider([], []);
        const f = render(provider, 'parent-1');
        await settle(f);
        expect(host(f).querySelector('mj-empty-state')).toBeTruthy();
        expect(host(f).querySelector('mj-task-graph-editor')).toBeNull();
    });

    it('hands the host the WHOLE task row on selection, so no host re-reads a row this component holds', async () => {
        const { provider } = graphProvider();
        const f = render(provider, 'parent-1');
        await settle(f);
        const events: TaskGraphRunNodeSelectedEvent[] = [];
        f.componentInstance.NodeSelected.subscribe((e) => events.push(e));

        const node = f.componentInstance.Spec!.tasks.find((t) => t.tempId === 't2')!;
        f.componentInstance.OnSelectionChanged(new TaskGraphSelectionChangedEventArgs(node));
        expect(events).toHaveLength(1);
        expect(events[0].TaskID).toBe('t2');
        expect(events[0].Task?.Name).toBe('Summarize');

        // Deselection (a null task) is not an activation — nothing to open, nothing emitted.
        f.componentInstance.OnSelectionChanged(new TaskGraphSelectionChangedEventArgs(null));
        expect(events).toHaveLength(1);
    });

    it('emits Settled after a static load — without live updates the view will never change again', async () => {
        const { provider } = graphProvider();
        let settled = 0;
        const f = render(provider, 'parent-1', (component) => {
            component.Settled.subscribe(() => settled++);
        });
        await settle(f);
        expect(settled).toBe(1);
    });
});
