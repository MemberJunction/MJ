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
