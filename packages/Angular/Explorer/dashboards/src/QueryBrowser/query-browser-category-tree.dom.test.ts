/**
 * Pins the Query Browser's category tree. Each category used to scan every visible query for its
 * members; the queries are now grouped once. These specs hold the tree to the same shape: queries
 * placed under their category in any ID case, nested categories, the virtual "Uncategorized" root,
 * and names sorted at every level.
 */
import { describe, it, expect } from 'vitest';
import type { MJQueryCategoryEntity } from '@memberjunction/core-entities';
import type { MJQueryEntityExtended } from '@memberjunction/core-entities';
import { QueryBrowserResourceComponent } from './query-browser-resource.component';

const REPORTS = 'aaaaaaaa-0000-0000-0000-000000000001';
const FINANCE = 'bbbbbbbb-0000-0000-0000-000000000002';
const EMPTY = 'cccccccc-0000-0000-0000-000000000003';

interface TreeNode { category: { Name: string }; queries: Array<{ Name: string }>; children: TreeNode[]; level: number }

function tree(): TreeNode[] {
    const c = Object.create(QueryBrowserResourceComponent.prototype) as QueryBrowserResourceComponent;
    (c as unknown as { expandedState: Map<string, boolean> }).expandedState = new Map();
    c.Categories = [
        { ID: REPORTS, Name: 'Reports', ParentID: null },
        { ID: FINANCE, Name: 'Finance', ParentID: REPORTS },
        { ID: EMPTY, Name: 'Archive', ParentID: null },
    ] as unknown as MJQueryCategoryEntity[];
    c.FilteredQueries = [
        { Name: 'Revenue', CategoryID: FINANCE.toUpperCase() },
        { Name: 'Users', CategoryID: REPORTS },
        { Name: 'Loose', CategoryID: null },
        { Name: 'Costs', CategoryID: FINANCE },
        { Name: 'Gone', CategoryID: 'dddddddd-0000-0000-0000-000000000004' },
    ] as unknown as MJQueryEntityExtended[];
    (c as unknown as { buildCategoryTree(): void }).buildCategoryTree();
    return c.CategoryTree as unknown as TreeNode[];
}

const shape = (nodes: TreeNode[]): unknown[] =>
    nodes.map(n => [n.category.Name, n.level, n.queries.map(q => q.Name), shape(n.children)]);

describe('QueryBrowserResourceComponent category tree', () => {
    it('places queries under their category in any ID case, sorted at every level', () => {
        expect(shape(tree())).toEqual([
            ['Archive', 0, [], []],
            ['Reports', 0, ['Users'], [['Finance', 1, ['Costs', 'Revenue'], []]]],
            ['Uncategorized', 0, ['Loose'], []],
        ]);
    });
});
