import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { createFakeProvider } from '@memberjunction/ng-test-utils';
import type { TaskRunEdge, TaskRunRow } from '@memberjunction/ai-core-plus';
import { TaskGraphEditorModule } from './task-graph-editor.module';
import { TaskGraphDebuggerComponent } from './task-graph-debugger.component';

/**
 * DOM spec for `<mj-task-graph-debugger>`.
 *
 * The wrap's job is chrome + the run view. What a class test cannot see: ShowChrome
 * actually mounts the VCR, a control failure paints an alert, and Continue on the
 * toolbar calls Resume on the wrap.
 */
describe('TaskGraphDebuggerComponent (DOM)', () => {
    function graphProvider(): IMetadataProvider {
        const tasks: TaskRunRow[] = [{
            ID: 't1',
            Name: 'Gather',
            Description: '',
            Status: 'Pending',
            StepType: 'Agent',
            Configuration: null,
        }];
        const edges: TaskRunEdge[] = [];
        return createFakeProvider<TaskRunRow | TaskRunEdge>({
            runViewResults: (params: RunViewParams) => (
                params.EntityName === 'MJ: Tasks' ? tasks : edges
            ),
        });
    }

    function render(): ComponentFixture<TaskGraphDebuggerComponent> {
        TestBed.configureTestingModule({ imports: [TaskGraphEditorModule] });
        const fixture = TestBed.createComponent(TaskGraphDebuggerComponent);
        fixture.componentRef.setInput('Provider', graphProvider());
        fixture.componentRef.setInput('ParentTaskID', 'parent-1');
        fixture.detectChanges();
        return fixture;
    }

    const host = (f: ComponentFixture<TaskGraphDebuggerComponent>) => f.nativeElement as HTMLElement;

    it('mounts the VCR and the run view when chrome is on', () => {
        const f = render();
        expect(host(f).querySelector('mj-task-graph-debug-toolbar')).toBeTruthy();
        expect(host(f).querySelector('mj-task-graph-run-view')).toBeTruthy();
        expect(host(f).querySelector('[aria-label="Pause"]')).toBeTruthy();
    });

    it('hides the VCR when the host already has its own chrome', () => {
        const f = render();
        f.componentRef.setInput('ShowChrome', false);
        f.detectChanges();
        expect(host(f).querySelector('mj-task-graph-debug-toolbar')).toBeNull();
        expect(host(f).querySelector('mj-task-graph-run-view')).toBeTruthy();
    });

    it('shows a control failure as an alert, not a silent no-op', async () => {
        const f = render();
        await f.componentInstance.Pause();
        f.detectChanges();
        expect(host(f).querySelector('mj-alert')).toBeTruthy();
        expect(host(f).textContent).toContain('cannot send workflow controls');
    });

    it('wires the toolbar Resume event to the wrap Resume verb', () => {
        const f = render();
        const resume = vi.spyOn(f.componentInstance, 'Resume').mockResolvedValue(true);
        const toolbar = f.debugElement.query(By.css('mj-task-graph-debug-toolbar'));
        expect(toolbar).toBeTruthy();
        toolbar.triggerEventHandler('Resume');
        expect(resume).toHaveBeenCalled();
    });
});
