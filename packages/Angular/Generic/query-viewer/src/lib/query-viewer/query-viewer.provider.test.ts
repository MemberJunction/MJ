import { describe, it, expect, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { QueryEngine, type MJQueryDependencyEntity, type MJQueryEntityExtended } from '@memberjunction/core-entities';
import { QueryViewerComponent } from './query-viewer.component';
import { QueryInfoPanelComponent } from '../query-info-panel/query-info-panel.component';

/**
 * The viewer and its info panel read query metadata through the QueryEngine of the Provider they
 * are given (a dashboard part passes its own), and through the global QueryEngine when none is.
 */

const cdr = { markForCheck: vi.fn(), detectChanges: vi.fn() } as unknown as ChangeDetectorRef;

/** A query with a required parameter, so the viewer opens the parameter form rather than running it. */
function query(id: string, categoryPath = ''): MJQueryEntityExtended {
    return { ID: id, Name: `Query ${id}`, CategoryPath: categoryPath, QueryParameters: [{ Name: 'p', IsRequired: true }] } as unknown as MJQueryEntityExtended;
}

function engineDouble(queries: MJQueryEntityExtended[]) {
    return { Config: vi.fn().mockResolvedValue(undefined), Queries: queries } as unknown as QueryEngine & { Config: ReturnType<typeof vi.fn> };
}

const provider = { CurrentUser: { ID: 'user-1' } } as unknown as IMetadataProvider;

async function flush(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('QueryViewerComponent provider scoping', () => {
    it('loads the query from the provider-scoped QueryEngine when a Provider is passed', async () => {
        const scoped = engineDouble([query('q1')]);
        const getProviderInstance = vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(scoped);
        const viewer = new QueryViewerComponent(cdr);
        viewer.Provider = provider;

        viewer.QueryId = 'q1';
        await flush();

        expect(getProviderInstance).toHaveBeenCalledWith(provider, QueryEngine);
        expect(scoped.Config).toHaveBeenCalledWith(false, provider.CurrentUser, provider);
        expect(viewer.QueryInfo?.ID).toBe('q1');
        expect(viewer.ShowParamsPanel).toBe(true);
    });

    it('uses the global QueryEngine, synchronously, when no Provider is passed (as before)', () => {
        const global = engineDouble([query('q1')]);
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue(global);
        const getProviderInstance = vi.spyOn(QueryEngine, 'GetProviderInstance');
        const viewer = new QueryViewerComponent(cdr);

        viewer.QueryId = 'q1';

        expect(viewer.QueryInfo?.ID).toBe('q1');
        expect(getProviderInstance).not.toHaveBeenCalled();
        expect(global.Config).not.toHaveBeenCalled();
    });

    it('drops a lookup that a newer QueryId overtook while the provider engine loaded', async () => {
        let releaseFirst: () => void = () => undefined;
        const scoped = engineDouble([query('q1'), query('q2')]);
        scoped.Config.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve; }));
        vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(scoped);
        const viewer = new QueryViewerComponent(cdr);
        viewer.Provider = provider;

        viewer.QueryId = 'q1';
        viewer.QueryId = 'q2';
        await flush();
        releaseFirst();
        await flush();

        expect(viewer.QueryInfo?.ID).toBe('q2');
    });
});

describe('QueryInfoPanelComponent provider scoping', () => {
    const dependency = { QueryID: 'dep-1', Query: 'Dependent' } as unknown as MJQueryDependencyEntity;

    it('resolves a dependent query through the provider-scoped QueryEngine', () => {
        vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(engineDouble([query('dep-1', 'Scoped/Path')]));
        const panel = new QueryInfoPanelComponent(cdr);
        panel.Provider = provider;
        const emitted: string[] = [];
        panel.CompositionTokenClick.subscribe((e) => emitted.push(e.FullPath));

        panel.OnDependentQueryClick(dependency);

        expect(emitted).toEqual(['Scoped/Path/Dependent']);
    });

    it('uses the global QueryEngine when no Provider is passed (as before)', () => {
        vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue(engineDouble([query('dep-1', 'Global/Path')]));
        const getProviderInstance = vi.spyOn(QueryEngine, 'GetProviderInstance');
        const panel = new QueryInfoPanelComponent(cdr);
        const emitted: string[] = [];
        panel.CompositionTokenClick.subscribe((e) => emitted.push(e.FullPath));

        panel.OnDependentQueryClick(dependency);

        expect(emitted).toEqual(['Global/Path/Dependent']);
        expect(getProviderInstance).not.toHaveBeenCalled();
    });
});
