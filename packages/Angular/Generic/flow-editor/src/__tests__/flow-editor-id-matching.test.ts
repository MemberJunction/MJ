/**
 * Pins how the flow canvas matches node/connection IDs against a list of IDs — which ones it
 * picks, in which order, and that the match is case-insensitive (SQL Server returns upper-case
 * UUIDs, PostgreSQL lower-case; see guides/UUID_COMPARISON_GUIDE.md).
 *
 * `HighlightPath` and `DeleteSelected` used to run a nested `UUIDsEqual` scan (items × IDs), which
 * grows with both the graph and the selection/path. They now build a normalized Set/Map once;
 * these specs hold the observable behaviour steady across that change.
 *
 * Constructed directly rather than through TestBed, like flow-editor-context-menu.test.ts: the
 * constructor takes a change detector and two stateless services.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FlowEditorComponent } from '../lib/components/flow-editor.component';
import { FlowStateService } from '../lib/services/flow-state.service';
import { FlowLayoutService } from '../lib/services/flow-layout.service';
import type { FlowConnection, FlowNode } from '../lib/interfaces/flow-types';

const cdrStub = {
    detectChanges: () => undefined,
    markForCheck: () => undefined,
    detach: () => undefined,
    reattach: () => undefined,
    checkNoChanges: () => undefined,
};

/** The selection a user's click/marquee would set. */
type SelectionDriver = { selectedNodeIDs: string[]; selectedConnectionIDs: string[] };

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const D = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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
    SourcePortID: `${source}-out`,
    TargetNodeID: target,
    TargetPortID: `${target}-in`,
});

describe('FlowEditorComponent ID matching', () => {
    let component: FlowEditorComponent;

    beforeEach(() => {
        component = new FlowEditorComponent(cdrStub as unknown as never, new FlowStateService(), new FlowLayoutService());
        component.Nodes = [node(A), node(B), node(C), node(D)];
        component.Connections = [connection('ab', A, B), connection('bc', B, C), connection('ac', A, C), connection('cb', C, B)];
    });

    describe('HighlightPath', () => {
        it('marks exactly the path nodes running, matching IDs case-insensitively', () => {
            component.HighlightPath([A.toUpperCase(), B]);
            expect(component.Nodes.map((n) => n.Status)).toEqual(['running', 'running', 'default', 'default']);
        });

        it('animates only connections between CONSECUTIVE path steps, in path direction', () => {
            component.HighlightPath([A, B.toUpperCase(), C]);
            const animated = component.Connections.filter((c) => c.Animated).map((c) => c.ID);
            // ab (A→B) and bc (B→C) are consecutive; ac skips a step; cb runs backwards.
            expect(animated).toEqual(['ab', 'bc']);
        });

        it('uses the FIRST occurrence of an ID that appears twice in the path', () => {
            // A is at 0 and 2; B at 1. A→B is consecutive from A's first index; B→A would need A at 2.
            component.Connections = [connection('ab', A, B), connection('ba', B, A)];
            component.HighlightPath([A, B, A]);
            expect(component.Connections.filter((c) => c.Animated).map((c) => c.ID)).toEqual(['ab']);
        });

        it('changes nothing for an empty path', () => {
            component.HighlightPath([]);
            expect(component.Nodes.every((n) => n.Status === 'default')).toBe(true);
            expect(component.Connections.some((c) => c.Animated)).toBe(false);
        });
    });

    describe('DeleteSelected', () => {
        it('removes selected connections (case-insensitive), emitting each, and keeps the rest in order', () => {
            const removed: string[] = [];
            component.ConnectionRemoved.subscribe((c) => removed.push(c.ID));
            component.Connections = [connection(B, A, B), connection(C, B, C), connection(D, C, D)];
            (component as unknown as SelectionDriver).selectedConnectionIDs = [D.toUpperCase(), B];

            component.DeleteSelected();

            expect(removed).toEqual([B, D]);
            expect(component.Connections.map((c) => c.ID)).toEqual([C]);
            expect(component.Nodes).toHaveLength(4);
        });

        it('removes selected nodes and every connection attached to them', () => {
            const removedNodes: string[] = [];
            const removedEdges: string[] = [];
            component.NodeRemoved.subscribe((n) => removedNodes.push(n.ID));
            component.ConnectionRemoved.subscribe((c) => removedEdges.push(c.ID));
            (component as unknown as SelectionDriver).selectedNodeIDs = [B.toUpperCase()];

            component.DeleteSelected();

            expect(removedNodes).toEqual([B]);
            expect(component.Nodes.map((n) => n.ID)).toEqual([A, C, D]);
            expect(removedEdges).toEqual(['ab', 'bc', 'cb']);
            expect(component.Connections.map((c) => c.ID)).toEqual(['ac']);
        });
    });
});
