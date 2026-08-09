/**
 * Regression coverage for the flow canvas's right-click menu.
 *
 * **The bug this pins.** `onContextMenuAction` closed the menu before reading its target, and
 * `hideContextMenu()` nulls `contextMenuNode` / `contextMenuConnection`. Every branch below then
 * tested those same now-null fields and fell through, so Remove and Edit both did *nothing* — for
 * nodes and for connections. The menu closing on click made it look like the action had been taken.
 *
 * Driven by constructing the component directly rather than through TestBed: the failure is pure
 * ordering inside one method, and the constructor takes only a change detector and two stateless
 * services, so a DOM harness would add Foblex canvas setup without testing anything more.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FlowEditorComponent } from '../lib/components/flow-editor.component';
import { FlowStateService } from '../lib/services/flow-state.service';
import { FlowLayoutService } from '../lib/services/flow-layout.service';
import type { FlowConnection, FlowNode } from '../lib/interfaces/flow-types';

/** The component only ever calls detectChanges/markForCheck; a no-op double is enough. */
const cdrStub = {
    detectChanges: () => undefined,
    markForCheck: () => undefined,
    detach: () => undefined,
    reattach: () => undefined,
    checkNoChanges: () => undefined,
};

/** Reaches the protected menu handlers a right-click would drive. */
type MenuDriver = {
    onNodeContextMenu(event: MouseEvent, node: FlowNode): void;
    onConnectionContextMenu(event: MouseEvent, conn: FlowConnection): void;
    onContextMenuAction(action: 'edit' | 'remove'): void;
};

const node = (id: string): FlowNode => ({
    ID: id,
    Type: 'Action',
    Label: `Step ${id}`,
    Status: 'default',
    Position: { X: 0, Y: 0 },
    Ports: [],
});

const connection = (id: string, source: string, target: string): FlowConnection => ({
    ID: id,
    SourceNodeID: source,
    TargetNodeID: target,
});

const rightClick = () =>
    ({ clientX: 10, clientY: 20, preventDefault: () => undefined, stopPropagation: () => undefined }) as unknown as MouseEvent;

describe('flow canvas context menu', () => {
    let component: FlowEditorComponent;
    let driver: MenuDriver;

    beforeEach(() => {
        component = new FlowEditorComponent(
            cdrStub as unknown as never,
            new FlowStateService(),
            new FlowLayoutService(),
        );
        driver = component as unknown as MenuDriver;
        component.Nodes = [node('a'), node('b')];
        component.Connections = [connection('c1', 'a', 'b')];
    });

    it('removes the node the menu was opened on', () => {
        const removed: FlowNode[] = [];
        component.NodeRemoved.subscribe((n) => removed.push(n));

        driver.onNodeContextMenu(rightClick(), component.Nodes[0]);
        driver.onContextMenuAction('remove');

        expect(removed.map((n) => n.ID)).toEqual(['a']);
        expect(component.Nodes.map((n) => n.ID)).toEqual(['b']);
    });

    it('takes the node\'s connections with it, so no edge is left dangling', () => {
        const droppedEdges: FlowConnection[] = [];
        component.ConnectionRemoved.subscribe((c) => droppedEdges.push(c));

        driver.onNodeContextMenu(rightClick(), component.Nodes[0]);
        driver.onContextMenuAction('remove');

        expect(droppedEdges.map((c) => c.ID)).toEqual(['c1']);
        expect(component.Connections).toHaveLength(0);
    });

    it('removes the connection the menu was opened on', () => {
        const droppedEdges: FlowConnection[] = [];
        component.ConnectionRemoved.subscribe((c) => droppedEdges.push(c));

        driver.onConnectionContextMenu(rightClick(), component.Connections[0]);
        driver.onContextMenuAction('remove');

        expect(droppedEdges.map((c) => c.ID)).toEqual(['c1']);
        expect(component.Connections).toHaveLength(0);
        // The nodes at either end survive — only the edge was asked for.
        expect(component.Nodes).toHaveLength(2);
    });

    it('emits an edit request for the node the menu was opened on', () => {
        const edits: FlowNode[] = [];
        component.NodeEditRequested.subscribe((n) => edits.push(n));

        driver.onNodeContextMenu(rightClick(), component.Nodes[1]);
        driver.onContextMenuAction('edit');

        expect(edits.map((n) => n.ID)).toEqual(['b']);
    });

    it('emits an edit request for the connection the menu was opened on', () => {
        const edits: FlowConnection[] = [];
        component.ConnectionEditRequested.subscribe((c) => edits.push(c));

        driver.onConnectionContextMenu(rightClick(), component.Connections[0]);
        driver.onContextMenuAction('edit');

        expect(edits.map((c) => c.ID)).toEqual(['c1']);
    });

    it('does nothing when the action fires with no target', () => {
        // Guards the opposite mistake: reading a stale target after the menu closed would remove
        // whatever happened to be there last.
        const removed: FlowNode[] = [];
        component.NodeRemoved.subscribe((n) => removed.push(n));

        driver.onContextMenuAction('remove');

        expect(removed).toHaveLength(0);
        expect(component.Nodes).toHaveLength(2);
    });

    it('does not act twice when the same menu action fires again after closing', () => {
        const removed: FlowNode[] = [];
        component.NodeRemoved.subscribe((n) => removed.push(n));

        driver.onNodeContextMenu(rightClick(), component.Nodes[0]);
        driver.onContextMenuAction('remove');
        driver.onContextMenuAction('remove');

        expect(removed.map((n) => n.ID)).toEqual(['a']);
        expect(component.Nodes.map((n) => n.ID)).toEqual(['b']);
    });
});
