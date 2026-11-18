import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserViewProperty } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { EntityViewerComponent } from '../lib/entity-viewer/entity-viewer.component';
import { BuildViewPropertyChips } from '../lib/entity-viewer/view-property-chips';

/**
 * A view with properties is run by its ID with the host's `Properties`, for the page, the count
 * and the export alike, so the server applies the properties it never shows the browser. A view
 * without properties keeps the dynamic run (EntityName + WhereClause) it has always had.
 */

const CHAPTER = '11111111-1111-4111-8111-111111111111';

const MEMBERS = new EntityInfo({
    ID: 'E0000007-0000-0000-0000-000000000001',
    Name: 'Members',
    Status: 'Active',
    BaseTable: 'Member',
    BaseView: 'vwMembers',
    Fields: ['ID', 'ChapterID', 'Name'].map((Name, i) => ({ ID: `F${i}`, Name, Type: 'nvarchar', Length: 100, AllowsNull: true })),
});

const chapter: UserViewProperty = { Name: 'Chapter', Type: 'uuid', AllowOverride: false, Target: { Field: 'ChapterID', Operator: '=' } };
const region: UserViewProperty = { Name: 'Region', Type: 'string', Default: { Value: 'West' }, Target: { Field: 'Name', Operator: '=' } };

function fakeView(properties: UserViewProperty[] | null): MJUserViewEntityExtended {
    return { ID: 'VIEW-1', WhereClause: 'Status = 1', OrderByClause: '', SmartFilterEnabled: false, PropertiesObject: properties } as unknown as MJUserViewEntityExtended;
}

/** A provider that records every run and answers with `answer`. */
function recordingProvider(answer: (p: RunViewParams) => RunViewResult = () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 } as unknown as RunViewResult)) {
    const calls: RunViewParams[][] = [];
    const provider = {
        RunView: async (p: RunViewParams) => { calls.push([p]); return answer(p); },
        RunViews: async (ps: RunViewParams[]) => { calls.push(ps); return ps.map(answer); },
    } as unknown as IMetadataProvider;
    return { provider, calls };
}

type Internals = { _initialized: boolean; _records: unknown[] | null; _viewEntity: MJUserViewEntityExtended | null; _entity: EntityInfo | null };

function makeViewer(view: MJUserViewEntityExtended, provider: IMetadataProvider, properties: Record<string, string> | null = null): EntityViewerComponent {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;
    const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef<HTMLElement>;
    const viewer = new EntityViewerComponent(cdr, ngZone, elementRef);
    const internals = viewer as unknown as Internals;
    internals._entity = MEMBERS;
    internals._viewEntity = view;
    viewer.Provider = provider;
    viewer.Properties = properties;
    return viewer;
}

describe('EntityViewerComponent with view properties', () => {
    it('a view without properties loads exactly as before: EntityName plus the WhereClause', async () => {
        const { provider, calls } = recordingProvider();
        await makeViewer(fakeView(null), provider).LoadData();
        expect(calls).toStrictEqual([[
            { EntityName: 'Members', ExtraFilter: 'Status = 1', ResultType: 'simple', MaxRows: 100, StartRow: 0, OrderBy: undefined, UserSearchString: undefined },
            { EntityName: 'Members', ExtraFilter: 'Status = 1', ResultType: 'count_only', UserSearchString: undefined, IgnoreMaxRows: true },
        ]]);
        const empty = recordingProvider();
        await makeViewer(fakeView([]), empty.provider).LoadData();
        expect(empty.calls).toStrictEqual(calls);
    });

    it('a view with properties runs by ViewID with the host values, for the page and the count', async () => {
        const { provider, calls } = recordingProvider();
        const view = fakeView([chapter, region]);
        await makeViewer(view, provider, { Region: 'East' }).LoadData();
        const [page, count] = calls[0];
        for (const p of [page, count]) {
            expect(p).toMatchObject({ EntityName: 'Members', ViewID: 'VIEW-1', ViewEntity: view, Properties: { Region: 'East' }, Fields: ['ID', 'ChapterID', 'Name'] });
            expect(p.ExtraFilter).toBeUndefined();
        }
        expect(count.ResultType).toBe('count_only');
    });

    it('sends an empty Properties map when the host gives none, so the browser never caches or merges the run', async () => {
        const { provider, calls } = recordingProvider();
        await makeViewer(fakeView([chapter]), provider).LoadData();
        expect(calls[0][0].Properties).toEqual({});
    });

    it('the export carries the same view and properties as the grid', async () => {
        const { provider, calls } = recordingProvider();
        await makeViewer(fakeView([chapter, region]), provider, { Region: 'East' }).FetchAllRowsForExport();
        expect(calls[0][0]).toMatchObject({ ViewID: 'VIEW-1', Properties: { Region: 'East' }, ResultType: 'simple', StartRow: 0 });
        expect(calls[0][0].ExtraFilter).toBeUndefined();

        const plain = recordingProvider();
        await makeViewer(fakeView(null), plain.provider).FetchAllRowsForExport();
        expect(plain.calls[0][0]).toMatchObject({ EntityName: 'Members', ExtraFilter: 'Status = 1' });
        expect(plain.calls[0][0].ViewID).toBeUndefined();
    });

    it('shows the server refusal for a view with properties', async () => {
        const refusal = 'View property "Chapter" is set by the server; a client value for it is refused.';
        const { provider } = recordingProvider(() => ({ Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: refusal } as unknown as RunViewResult));
        const viewer = makeViewer(fakeView([chapter]), provider, { Chapter: CHAPTER });
        await viewer.LoadData();
        expect(viewer.ViewRunError).toBe(refusal);

        const plain = makeViewer(fakeView(null), provider);
        await plain.LoadData();
        expect(plain.ViewRunError).toBeNull();
    });
});

describe('BuildViewPropertyChips', () => {
    it('reads "set by server" for a property that does not allow override, whatever the host passed', () => {
        expect(BuildViewPropertyChips([chapter], { Chapter: CHAPTER })).toEqual([{ Name: 'Chapter', Value: 'set by server', ServerSet: true, Description: null }]);
    });

    it('shows the host value, else the default, else "any"', () => {
        const since: UserViewProperty = { Name: 'Since', Type: 'date', Default: { Token: 'Context.StartOfMonth', Offset: { Amount: -1, Unit: 'month' } }, Target: { Field: 'Name', Operator: '>=' } };
        const tags: UserViewProperty = { Name: 'Tags', Type: 'string', Description: 'Any of these', Target: { Field: 'Name', Operator: 'IN' } };
        expect(BuildViewPropertyChips([region, since, tags], { Region: 'East' }).map(c => c.Value)).toEqual(['East', 'Start of month -1 month (default)', 'any']);
        expect(BuildViewPropertyChips([region, tags], { Tags: ['a', 'b'] }).map(c => c.Value)).toEqual(['West (default)', 'a, b']);
        expect(BuildViewPropertyChips([region], { Region: null })[0].Value).toBe('none');
        expect(BuildViewPropertyChips(null, null)).toEqual([]);
    });
});
