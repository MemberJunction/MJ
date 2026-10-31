/**
 * @fileoverview The Data Explorer's application filter must not silently truncate.
 *
 * `loadApplicationEntityIds` builds the set that decides which entities the surface will
 * show at all — an entity missing from it is not just unlisted, it is unreachable from the
 * tree AND from the search box. Run without `IgnoreMaxRows` the view returns at most the
 * default cap (1000) and the component presents the truncated set as the whole truth, with
 * nothing anywhere to say rows were dropped.
 *
 * Driven off the prototype (no constructor/TestBed) with only the members the method
 * touches stubbed — the same style as message-input-streaming.test.ts in ng-conversations.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { MJApplicationEntityEntity } from '@memberjunction/core-entities';

import { DataExplorerDashboardComponent } from '../DataExplorer/data-explorer-dashboard.component';

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';

interface Harness {
    component: DataExplorerDashboardComponent;
    calls: RunViewParams[];
    applicationEntityIds: Set<string>;
    load(): Promise<void>;
}

function buildHarness(rowCount: number): Harness {
    const calls: RunViewParams[] = [];
    const rows = Array.from({ length: rowCount }, (_, i) => ({ EntityID: `entity-${i}` })) as unknown as MJApplicationEntityEntity[];

    const provider = {
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            calls.push(params);
            return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult;
        },
    } as unknown as IMetadataProvider;

    const applicationEntityIds = new Set<string>();
    const component = Object.create(DataExplorerDashboardComponent.prototype) as DataExplorerDashboardComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        Provider: provider,
        applicationEntityIds,
    });

    const load = (
        component as unknown as { loadApplicationEntityIds(applicationId: string): Promise<void> }
    ).loadApplicationEntityIds.bind(component);

    return { component, calls, applicationEntityIds, load: () => load(APPLICATION_ID) };
}

describe('DataExplorerDashboardComponent.loadApplicationEntityIds — reads every row or none', () => {
    it('asks the view to ignore the default row cap', async () => {
        const harness = buildHarness(3);

        await harness.load();

        expect(harness.calls).toHaveLength(1);
        expect(harness.calls[0].IgnoreMaxRows).toBe(true);
    });

    it('does not impose a row cap of its own', async () => {
        const harness = buildHarness(3);

        await harness.load();

        // A MaxRows alongside IgnoreMaxRows would be dead weight today and a truncation
        // waiting to happen if the ignore flag were ever dropped.
        expect(harness.calls[0].MaxRows).toBeUndefined();
    });

    it('keeps every returned membership row past the 1000-row default cap', async () => {
        const harness = buildHarness(1500);

        await harness.load();

        expect(harness.applicationEntityIds.size).toBe(1500);
        expect(harness.applicationEntityIds.has('entity-1499')).toBe(true);
    });

    it('still scopes the read to the requested application', async () => {
        const harness = buildHarness(2);

        await harness.load();

        expect(harness.calls[0].EntityName).toBe('MJ: Application Entities');
        expect(harness.calls[0].ExtraFilter).toContain(APPLICATION_ID);
    });
});
