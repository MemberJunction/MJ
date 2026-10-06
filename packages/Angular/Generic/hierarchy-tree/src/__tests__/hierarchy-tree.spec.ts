import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { HierarchyTreeComponent } from '../lib/components/hierarchy-tree.component';
import { CancelableHierarchyNodeEvent, CancelableReparentEvent } from '../lib/events/hierarchy-tree.events';
import { HierarchyNodeData } from '../lib/models/hierarchy-tree.types';
import { CompositeKey } from '@memberjunction/core';

describe('HierarchyTreeComponent Unit Tests', () => {
    const mockItems = [
        { ID: 'org-1', Name: 'Acme Holding Corp', ParentID: null, Type: 'Holding' },
        { ID: 'org-2', Name: 'Acme Americas', ParentID: 'org-1', Type: 'Subsidiary' },
        { ID: 'org-3', Name: 'Acme Europe', ParentID: 'org-1', Type: 'Subsidiary' },
        { ID: 'org-4', Name: 'Acme USA', ParentID: 'org-2', Type: 'Division' },
        { ID: 'org-5', Name: 'Acme Canada', ParentID: 'org-2', Type: 'Division' },
        { ID: 'org-6', Name: 'Acme UK', ParentID: 'org-3', Type: 'Division' },
        { ID: 'org-7', Name: 'Independent Partner', ParentID: null, Type: 'Partner' }
    ];

    it('should build hierarchical tree structure correctly from flat data', () => {
        const comp = new HierarchyTreeComponent();
        comp.Config = {
            EntityName: 'TestEntity',
            ParentField: 'ParentID',
            NameField: 'Name',
            SubtitleField: 'Type'
        };

        comp.buildTreeFromData(mockItems);

        expect(comp.AllNodes.length).toBe(7);
        expect(comp.RootNodes.length).toBe(2); // org-1 and org-7

        const root1 = comp.RootNodes.find(r => r.ID === 'org-1');
        expect(root1).toBeDefined();
        expect(root1!.Name).toBe('Acme Holding Corp');
        expect(root1!.Depth).toBe(0);
        expect(root1!.DirectChildCount).toBe(2); // org-2, org-3
        expect(root1!.TotalDescendantCount).toBe(5); // org-2, org-3, org-4, org-5, org-6

        const org2 = root1!.Children.find(c => c.ID === 'org-2');
        expect(org2).toBeDefined();
        expect(org2!.Depth).toBe(1);
        expect(org2!.DirectChildCount).toBe(2); // org-4, org-5
        expect(org2!.TotalDescendantCount).toBe(2);

        const root2 = comp.RootNodes.find(r => r.ID === 'org-7');
        expect(root2).toBeDefined();
        expect(root2!.DirectChildCount).toBe(0);
        expect(root2!.TotalDescendantCount).toBe(0);
    });

    it('should detect and safely break circular references without crashing', () => {
        const cyclicItems = [
            { ID: 'node-A', Name: 'Node A', ParentID: 'node-C' },
            { ID: 'node-B', Name: 'Node B', ParentID: 'node-A' },
            { ID: 'node-C', Name: 'Node C', ParentID: 'node-B' }
        ];

        const comp = new HierarchyTreeComponent();
        comp.Config = { EntityName: 'TestEntity', ParentField: 'ParentID' };

        // Should not enter infinite loop or stack overflow
        expect(() => comp.buildTreeFromData(cyclicItems)).not.toThrow();
        expect(comp.AllNodes.length).toBe(3);
    });

    it('should search nodes and auto-expand all ancestor paths', () => {
        const comp = new HierarchyTreeComponent();
        comp.Config = {
            EntityName: 'TestEntity',
            ParentField: 'ParentID',
            NameField: 'Name',
            InitialExpandDepth: 1
        };

        comp.buildTreeFromData(mockItems);

        // Initially collapsed past depth 1
        const org2 = comp.AllNodes.find(n => n.ID === 'org-2')!;
        expect(org2.IsExpanded).toBe(false);

        // Search for 'Canada' (org-5 under org-2)
        comp.SearchQuery = 'Canada';
        comp.onSearchInput();

        expect(comp.MatchingNodeCount).toBe(1);
        const org5 = comp.AllNodes.find(n => n.ID === 'org-5')!;
        expect(org5.IsHighlighted).toBe(true);

        // Ancestor org-2 must now be auto-expanded
        expect(org2.IsExpanded).toBe(true);
    });

    it('should support subtree focus and reset', () => {
        const comp = new HierarchyTreeComponent();
        comp.Config = { EntityName: 'TestEntity', ParentField: 'ParentID' };
        comp.buildTreeFromData(mockItems);

        comp.setFocusRoot('org-2');
        expect(comp.FocusedNode).toBeDefined();
        expect(comp.FocusedNode!.ID).toBe('org-2');
        expect(comp.FocusedNode!.IsFocusRoot).toBe(true);

        comp.resetFocus();
        expect(comp.FocusedNode).toBeNull();
    });

    it('should respect CancelableHierarchyNodeEvent when expanding or collapsing', () => {
        const comp = new HierarchyTreeComponent();
        comp.Config = { EntityName: 'TestEntity', ParentField: 'ParentID' };
        comp.buildTreeFromData(mockItems);

        const root1 = comp.RootNodes.find(r => r.ID === 'org-1')!;
        expect(root1.IsExpanded).toBe(true);

        // Subscribe to BeforeNodeCollapse and cancel it
        comp.BeforeNodeCollapse.subscribe((evt: CancelableHierarchyNodeEvent) => {
            if (evt.Node.ID === 'org-1') {
                evt.Cancel('Collapse not allowed for root');
            }
        });

        comp.toggleNodeExpansion(root1);
        // Should remain expanded because event was canceled
        expect(root1.IsExpanded).toBe(true);
    });

    it('should respect CancelableReparentEvent cancellation', () => {
        const node: HierarchyNodeData = {
            ID: 'child-1',
            PrimaryKey: new CompositeKey(),
            Name: 'Child 1',
            DirectChildCount: 0,
            TotalDescendantCount: 0,
            Depth: 1,
            IsExpanded: true,
            IsSelected: false,
            IsHighlighted: false,
            IsFocusRoot: false,
            Children: []
        };

        const event = new CancelableReparentEvent(node, 'parent-1', 'parent-2');
        expect(event.IsCanceled).toBe(false);

        event.Cancel('Permission denied');
        expect(event.IsCanceled).toBe(true);
        expect(event.CancelReason).toBe('Permission denied');
    });
});
