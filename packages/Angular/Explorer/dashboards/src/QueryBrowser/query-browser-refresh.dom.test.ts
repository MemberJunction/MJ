/**
 * The Query Browser's "Refresh metadata" entry points: the selected query, a category (with the
 * categories below it, named by its full path) and all queries each open the refresh dialog with
 * the matching scope. The dialog itself (dry run first, progress, report) is covered in
 * @memberjunction/ng-query-viewer.
 */
import { describe, it, expect } from 'vitest';
import type { MJQueryCategoryEntity, MJQueryEntityExtended } from '@memberjunction/core-entities';
import { QueryBrowserResourceComponent } from './query-browser-resource.component';

const REPORTS = 'aaaaaaaa-0000-0000-0000-000000000001';
const FINANCE = 'bbbbbbbb-0000-0000-0000-000000000002';

type CategoryShape = Pick<MJQueryCategoryEntity, 'ID' | 'Name' | 'ParentID'>;
const category = (shape: CategoryShape): MJQueryCategoryEntity => shape as MJQueryCategoryEntity;

function browser(): QueryBrowserResourceComponent {
    const c = Object.create(QueryBrowserResourceComponent.prototype) as QueryBrowserResourceComponent;
    Object.defineProperty(c, 'cdr', { value: { markForCheck: () => undefined, detectChanges: () => undefined } });
    c.Categories = [
        category({ ID: REPORTS, Name: 'Reports', ParentID: null }),
        category({ ID: FINANCE.toUpperCase(), Name: 'Finance', ParentID: REPORTS.toUpperCase() }),
    ];
    return c;
}

const node = (cat: MJQueryCategoryEntity) => ({ category: cat, children: [], queries: [], expanded: true, level: 1 });

describe('QueryBrowserResourceComponent refresh metadata', () => {
    it('refreshes a category by its full path, parents included, in any ID case', () => {
        const c = browser();
        c.OpenRefreshForCategory(node(c.Categories[1]));
        expect(c.ShowRefreshDialog).toBe(true);
        expect(c.RefreshScope).toEqual({ Kind: 'Category', CategoryPath: 'Reports/Finance' });
        expect(c.RefreshScopeLabel).toContain('Reports/Finance');
    });

    it('refreshes the selected query by ID, and all queries', () => {
        const c = browser();
        const query: Pick<MJQueryEntityExtended, 'ID' | 'Name'> = { ID: 'q-1', Name: 'Sales by Region' };
        c.OpenRefreshForQuery(query as MJQueryEntityExtended);
        expect(c.RefreshScope).toEqual({ Kind: 'Queries', QueryIDs: ['q-1'] });
        c.OpenRefreshForAll();
        expect(c.RefreshScope).toEqual({ Kind: 'All' });
        c.OnRefreshDialogClosed();
        expect(c.ShowRefreshDialog).toBe(false);
    });
});

describe('QueryBrowserResourceComponent drawer save failure', () => {
    it('lists the server\'s findings with line, column and fix when the query rules refused the save', () => {
        const c = browser();
        c['showDrawerSaveFailure']('Query "Q" was not saved:\nMJQ_UNKNOWN_FILTER at line 1, column 30: The filter "sqlstring" does not exist. Fix: Use sqlString.');
        expect(c.DrawerSaveError).toBe('Query "Q" was not saved:');
        expect(c.DrawerSaveDiagnostics).toEqual([{ Code: 'MJQ_UNKNOWN_FILTER', Line: 1, Column: 30, Message: 'The filter "sqlstring" does not exist.', FixHint: 'Use sqlString.' }]);
    });

    it('shows the server\'s own message, not a generic one, for any other failure', () => {
        const c = browser();
        c['showDrawerSaveFailure']('Query with name \'X\' already exists in the specified category');
        expect(c.DrawerSaveDiagnostics).toEqual([]);
        expect(c.DrawerSaveError).toContain('already exists');
        c['showDrawerSaveFailure'](undefined);
        expect(c.DrawerSaveError).toBe('Save failed. Please check your inputs and try again.');
    });
});

