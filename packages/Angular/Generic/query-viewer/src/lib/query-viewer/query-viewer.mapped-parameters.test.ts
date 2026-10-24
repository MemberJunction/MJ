import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { IMetadataProvider, RunQueryParams } from '@memberjunction/core';
import { QueryEngine, UserInfoEngine, type MJQueryEntityExtended } from '@memberjunction/core-entities';
import { QueryViewerComponent } from './query-viewer.component';

/**
 * Mapped parameters (a dashboard part's input mappings, plan § 4 and design point 4): they override
 * the user's saved values, are never saved back into the shared last-used set
 * (`QueryViewer_<id>_LastParams`), and show read-only. A server-set parameter (A17) is never sent.
 */

const cdr = { markForCheck: vi.fn(), detectChanges: vi.fn() } as unknown as ChangeDetectorRef;
const SETTINGS_KEY = 'QueryViewer_q1_LastParams';

function queryInfo(): MJQueryEntityExtended {
    return {
        ID: 'q1',
        Name: 'Members',
        QueryParameters: [
            { Name: 'chapter_id', Type: 'string', IsRequired: true, IsServerSet: false },
            { Name: 'status', Type: 'string', IsRequired: false, IsServerSet: false },
            { Name: 'org_id', Type: 'string', IsRequired: true, IsServerSet: true },
        ],
    } as unknown as MJQueryEntityExtended;
}

async function flush(): Promise<void> {
    for (let i = 0; i < 30; i++) await Promise.resolve();
}

describe('QueryViewerComponent mapped parameters', () => {
    let settings: Map<string, string>;
    let runQuery: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        settings = new Map();
        vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue({
            GetSetting: (key: string) => settings.get(key),
            SetSetting: vi.fn(async (key: string, value: string) => { settings.set(key, value); return true; }),
        } as unknown as UserInfoEngine);
        vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue({
            Config: vi.fn(async () => undefined),
            Queries: [queryInfo()],
        } as unknown as QueryEngine);
        runQuery = vi.fn(async () => ({ Success: true, Results: [], TotalRowCount: 0 }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function viewer(mapped: Record<string, string | null> | null): QueryViewerComponent {
        const v = new QueryViewerComponent(cdr);
        v.Provider = { CurrentUser: { ID: 'u1' }, RunQuery: runQuery } as unknown as IMetadataProvider;
        v.MappedParameters = mapped;
        v.QueryId = 'q1';
        return v;
    }

    const sent = (call = 0) => (runQuery.mock.calls[call][0] as RunQueryParams).Parameters;

    it("overrides the user's saved value with the mapped one, and auto-runs with it", async () => {
        settings.set(SETTINGS_KEY, JSON.stringify({ chapter_id: 'mine', status: 'Active' }));
        const v = viewer({ chapter_id: 'mapped' });
        await flush();
        expect(sent()).toEqual({ chapter_id: 'mapped', status: 'Active' });
        expect(v.ReadOnlyParameters).toEqual(['chapter_id']);
        expect(v.ParameterFormValues).toEqual({ chapter_id: 'mapped', status: 'Active' });
    });

    it('never saves a mapped value back into the shared last-used set', async () => {
        settings.set(SETTINGS_KEY, JSON.stringify({ chapter_id: 'mine', status: 'Active' }));
        const v = viewer({ chapter_id: 'mapped' });
        await flush();
        await v.RunQuery({ chapter_id: 'mapped', status: 'Lapsed' });
        expect(JSON.parse(settings.get(SETTINGS_KEY) ?? '{}')).toEqual({ chapter_id: 'mine', status: 'Lapsed' });
        expect(sent(1)).toEqual({ chapter_id: 'mapped', status: 'Lapsed' });
    });

    it('drops a mapped name the user never had from what it saves', async () => {
        const v = viewer({ chapter_id: 'mapped' });
        await flush();
        await v.RunQuery({ status: 'Active' });
        expect(JSON.parse(settings.get(SETTINGS_KEY) ?? '{}')).toEqual({ status: 'Active' });
    });

    it("a mapped parameter with no value is left out, never filled from the user's saved value", async () => {
        settings.set(SETTINGS_KEY, JSON.stringify({ chapter_id: 'mine', status: 'Active' }));
        const v = viewer({ chapter_id: 'mapped', status: null });
        await flush();
        expect(sent()).toEqual({ chapter_id: 'mapped' });
        expect(v.ReadOnlyParameters).toEqual(['chapter_id', 'status']);
        expect(v.ParameterFormValues).toEqual({ chapter_id: 'mapped' });
        expect(JSON.parse(settings.get(SETTINGS_KEY) ?? '{}')).toEqual({ chapter_id: 'mine', status: 'Active' });
    });

    it('reruns with a new mapped value once it has run', async () => {
        const v = viewer({ chapter_id: 'a' });
        await flush();
        v.MappedParameters = { chapter_id: 'b' };
        await flush();
        expect(sent(runQuery.mock.calls.length - 1)).toEqual({ chapter_id: 'b' });
    });

    it('never sends a server-set parameter, even one the user saved before it was locked', async () => {
        settings.set(SETTINGS_KEY, JSON.stringify({ chapter_id: 'mine', org_id: 'stale' }));
        viewer(null);
        await flush();
        expect(sent()).toEqual({ chapter_id: 'mine' });
    });

    it('without mapped parameters, saves and sends exactly what the user ran', async () => {
        settings.set(SETTINGS_KEY, JSON.stringify({ chapter_id: 'mine' }));
        const v = viewer(null);
        await flush();
        expect(v.ReadOnlyParameters).toEqual([]);
        expect(v.ParameterFormValues).toBe(v.SavedParams);
        await v.RunQuery({ chapter_id: 'other', status: 'Active' });
        expect(JSON.parse(settings.get(SETTINGS_KEY) ?? '{}')).toEqual({ chapter_id: 'other', status: 'Active' });
        expect(sent(1)).toEqual({ chapter_id: 'other', status: 'Active' });
    });
});
