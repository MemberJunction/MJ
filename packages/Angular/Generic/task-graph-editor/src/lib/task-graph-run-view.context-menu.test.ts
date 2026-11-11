import { EventEmitter } from '@angular/core';
import { describe, expect, it } from 'vitest';
import {
    FlowAfterContextMenuActionEventArgs,
    FlowBeforeContextMenuEventArgs,
    type FlowNode,
} from '@memberjunction/ng-flow-editor';
import { TaskGraphRunViewComponent } from './task-graph-run-view.component';

const NODE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function node(id: string): FlowNode {
    return { ID: id, Type: 'Action', Label: 'Step', Status: 'default', Position: { X: 0, Y: 0 }, Ports: [] };
}

function viewWithBreakpoints(ids: readonly string[]): TaskGraphRunViewComponent {
    const view = Object.create(TaskGraphRunViewComponent.prototype) as TaskGraphRunViewComponent;
    view.AllowBreakpointEditing = true;
    Object.defineProperty(view, 'breakpoints', { value: ids, writable: true });
    view.BreakpointToggled = new EventEmitter();
    return view;
}

describe('TaskGraphRunViewComponent context menu', () => {
    it('offers Remove Breakpoint when the bag has the same id in a different case', () => {
        const view = viewWithBreakpoints([NODE_ID.toUpperCase()]);
        const event = new FlowBeforeContextMenuEventArgs(
            'node',
            node(NODE_ID),
            null,
            {} as MouseEvent,
            [],
        );
        view.OnBeforeContextMenu(event);
        expect(event.Cancel).toBe(false);
        expect(event.Items[0]?.ID).toBe('toggle-breakpoint');
        expect(event.Items[0]?.Label).toBe('Remove Breakpoint');
    });

    it('emits Enabled=false to remove, even when the bag casing differs', () => {
        const view = viewWithBreakpoints([NODE_ID.toUpperCase()]);
        const seen: { TaskID: string; Enabled: boolean }[] = [];
        view.BreakpointToggled.subscribe((e) => seen.push(e));
        view.OnAfterContextMenuAction(new FlowAfterContextMenuActionEventArgs(
            'toggle-breakpoint',
            'node',
            node(NODE_ID),
            null,
        ));
        expect(seen).toEqual([{ TaskID: NODE_ID, Enabled: false }]);
    });

    it('cancels the menu when breakpoint editing is off', () => {
        const view = viewWithBreakpoints([NODE_ID]);
        view.AllowBreakpointEditing = false;
        const event = new FlowBeforeContextMenuEventArgs('node', node(NODE_ID), null, {} as MouseEvent, []);
        view.OnBeforeContextMenu(event);
        expect(event.Cancel).toBe(true);
        expect(event.Items).toEqual([]);
    });
});

describe('TaskGraphRunViewComponent — remembered breakpoints (#3798)', () => {
    const STEP_ID = 'fetch-members';

    function viewWithStep(remembered: readonly string[]): TaskGraphRunViewComponent {
        const view = viewWithBreakpoints([]);
        view.AllowRememberBreakpoints = true;
        view.RememberedStepIDs = remembered;
        view.RememberBreakpointToggled = new EventEmitter();
        Object.defineProperty(view, 'taskByID', {
            value: new Map([[NODE_ID, { Configuration: JSON.stringify({ stepId: STEP_ID }) }]]),
            writable: true,
        });
        return view;
    }

    it('offers Remember for a step that carries a stable step ID', () => {
        const view = viewWithStep([]);
        const event = new FlowBeforeContextMenuEventArgs('node', node(NODE_ID), null, {} as MouseEvent, []);
        view.OnBeforeContextMenu(event);
        expect(event.Items.map((i) => i.ID)).toEqual(['toggle-breakpoint', 'toggle-remember-breakpoint']);
        expect(event.Items[1]?.Label).toBe('Remember Breakpoint for Future Runs');
    });

    it('offers Stop Remembering when the step is remembered, and emits Remember=false', () => {
        const view = viewWithStep([STEP_ID]);
        const before = new FlowBeforeContextMenuEventArgs('node', node(NODE_ID), null, {} as MouseEvent, []);
        view.OnBeforeContextMenu(before);
        expect(before.Items[1]?.Label).toBe('Stop Remembering Breakpoint');

        const seen: { TaskID: string; StepID: string; Remember: boolean }[] = [];
        view.RememberBreakpointToggled.subscribe((e) => seen.push(e));
        view.OnAfterContextMenuAction(new FlowAfterContextMenuActionEventArgs('toggle-remember-breakpoint', 'node', node(NODE_ID), null));
        expect(seen).toEqual([{ TaskID: NODE_ID, StepID: STEP_ID, Remember: false }]);
    });

    it('hides Remember when the host does not store breakpoints', () => {
        const view = viewWithStep([]);
        view.AllowRememberBreakpoints = false;
        const event = new FlowBeforeContextMenuEventArgs('node', node(NODE_ID), null, {} as MouseEvent, []);
        view.OnBeforeContextMenu(event);
        expect(event.Items.map((i) => i.ID)).toEqual(['toggle-breakpoint']);
    });
});
