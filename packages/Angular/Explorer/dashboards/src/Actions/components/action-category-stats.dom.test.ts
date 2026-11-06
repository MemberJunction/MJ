/**
 * Pins the per-category counts in the Actions overview and the Action Categories list. Each category
 * used to scan every action (and, in the overview, every execution against every action); they now
 * group once. These specs hold both to the same numbers, with IDs matched in any case.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import { BehaviorSubject } from 'rxjs';
import type { MJActionCategoryEntity, MJActionEntity, MJActionExecutionLogEntity } from '@memberjunction/core-entities';
import { ActionsOverviewComponent } from './actions-overview.component';
import { CategoriesListViewComponent } from './categories-list-view.component';

const DATA = 'aaaaaaaa-0000-0000-0000-000000000001';
const AI = 'bbbbbbbb-0000-0000-0000-000000000002';
const EMPTY = 'cccccccc-0000-0000-0000-000000000003';
const EXPORT = 'dddddddd-0000-0000-0000-00000000000e';
const IMPORT = 'dddddddd-0000-0000-0000-00000000000f';
const SUMMARIZE = 'dddddddd-0000-0000-0000-000000000010';

const categories = [
    { ID: DATA, Name: 'Data', Description: null },
    { ID: AI, Name: 'AI', Description: null },
    { ID: EMPTY, Name: 'Empty', Description: null },
];
const actions = [
    { ID: EXPORT, Name: 'Export', CategoryID: DATA.toUpperCase(), Status: 'Active' },
    { ID: IMPORT, Name: 'Import', CategoryID: DATA, Status: 'Disabled' },
    { ID: SUMMARIZE, Name: 'Summarize', CategoryID: AI, Status: 'Active' },
    { ID: 'eeeeeeee-0000-0000-0000-000000000011', Name: 'Loose', CategoryID: null, Status: 'Active' },
];

describe('Action category stats', () => {
    afterEach(() => vi.restoreAllMocks());

    it('overview: counts actions and their executions per category, with a success rate', () => {
        const c = Object.create(ActionsOverviewComponent.prototype) as ActionsOverviewComponent;
        const executions = [
            { ActionID: EXPORT.toUpperCase(), ResultCode: 'Success' },
            { ActionID: IMPORT, ResultCode: 'Failed' },
            { ActionID: SUMMARIZE, ResultCode: 'Success' },
            { ActionID: EXPORT, ResultCode: 'Success' },
            { ActionID: 'ffffffff-0000-0000-0000-000000000099', ResultCode: 'Success' },
        ];
        (c as unknown as { calculateCategoryStats(a: unknown[], c: unknown[], e: unknown[]): void })
            .calculateCategoryStats(actions as unknown as MJActionEntity[], categories as unknown as MJActionCategoryEntity[], executions as unknown as MJActionExecutionLogEntity[]);

        expect(c.CategoryStats.map(s => [s.categoryName, s.actionCount, s.executionCount, s.successRate])).toEqual([
            ['Data', 2, 3, 67],
            ['AI', 1, 1, 100],
            ['Empty', 0, 0, 0],
        ]);
    });

    it('categories list: counts all and active actions per category', async () => {
        const c = Object.create(CategoriesListViewComponent.prototype) as CategoriesListViewComponent;
        Object.defineProperty(c, 'ProviderToUse', { value: {} as IMetadataProvider });
        (c as unknown as { SearchTerm$: BehaviorSubject<string> }).SearchTerm$ = new BehaviorSubject('');
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunViews: async () => [{ Success: true, Results: categories }, { Success: true, Results: actions }],
        } as unknown as RunView);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);

        await (c as unknown as { loadData(): Promise<void> }).loadData();

        expect(c.Categories.map(cat => [cat.Name, cat.actionCount, cat.activeActionCount])).toEqual([
            ['Data', 2, 1],
            ['AI', 1, 1],
            ['Empty', 0, 0],
        ]);
    });
});
