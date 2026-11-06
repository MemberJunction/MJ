/**
 * Pins two lookups in the Testing explorer that used to scan a whole list once per item: the test
 * count on each suite in the sidebar tree, and the "by test type" sidebar filter. They now use an
 * index; these specs hold them to the same answers, with IDs matched in any case.
 */
import { describe, it, expect } from 'vitest';
import type { MJTestEntity, MJTestSuiteEntity, MJTestSuiteTestEntity } from '@memberjunction/core-entities';
import { TestingExplorerComponent } from './testing-explorer.component';

const SMOKE = 'aaaaaaaa-0000-0000-0000-000000000001';
const NIGHTLY = 'bbbbbbbb-0000-0000-0000-000000000002';
const EMPTY = 'cccccccc-0000-0000-0000-000000000003';
const AGENT_TYPE = 'dddddddd-0000-0000-0000-000000000004';
const PROMPT_TYPE = 'eeeeeeee-0000-0000-0000-000000000005';

interface Internals {
    AllSuites: MJTestSuiteEntity[];
    allSuiteTests: MJTestSuiteTestEntity[];
    allTests: MJTestEntity[];
    SelectedSidebar: { Type: 'all' | 'standalone' | 'suite' | 'testType'; ID: string | null };
    FilteredSuiteTree: Array<{ Name: string; TestCount: number; Children: Array<{ Name: string; TestCount: number }> }>;
    AllTestTypes: unknown[];
    buildSuiteTree(): void;
    applySidebarFilterToTests(tests: Array<{ ID: string; Name: string }>): Array<{ ID: string; Name: string }>;
}

function explorer(): Internals {
    const c = Object.create(TestingExplorerComponent.prototype) as unknown as Internals;
    c.AllTestTypes = [];
    c.AllSuites = [
        { ID: SMOKE, Name: 'Smoke', ParentID: null },
        { ID: NIGHTLY, Name: 'Nightly', ParentID: SMOKE },
        { ID: EMPTY, Name: 'Empty', ParentID: null },
    ] as unknown as MJTestSuiteEntity[];
    c.allSuiteTests = [
        { SuiteID: SMOKE.toUpperCase(), TestID: 't1' },
        { SuiteID: NIGHTLY, TestID: 't2' },
        { SuiteID: SMOKE, TestID: 't3' },
    ] as unknown as MJTestSuiteTestEntity[];
    c.allTests = [
        { ID: 'T1', TypeID: AGENT_TYPE },
        { ID: 't2', TypeID: PROMPT_TYPE.toUpperCase() },
        { ID: 't3', TypeID: PROMPT_TYPE },
    ] as unknown as MJTestEntity[];
    return c;
}

describe('TestingExplorerComponent lookups', () => {
    it('counts each suite\'s tests in any ID case, zero for a suite with none', () => {
        const c = explorer();
        c.buildSuiteTree();
        expect(c.FilteredSuiteTree.map(n => [n.Name, n.TestCount, n.Children.map(k => [k.Name, k.TestCount])])).toEqual([
            ['Smoke', 2, [['Nightly', 1]]],
            ['Empty', 0, []],
        ]);
    });

    it('filters tests by type in any ID case, keeping order and dropping tests it does not know', () => {
        const c = explorer();
        c.SelectedSidebar = { Type: 'testType', ID: PROMPT_TYPE };
        const tests = [{ ID: 't3', Name: 'three' }, { ID: 'unknown', Name: 'gone' }, { ID: 'T2', Name: 'two' }, { ID: 't1', Name: 'one' }];
        expect(c.applySidebarFilterToTests(tests).map(t => t.Name)).toEqual(['three', 'two']);
    });
});
