import { describe, it, expect, vi } from 'vitest';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';
import { ResourceData } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { FileOpenService } from '@memberjunction/ng-file-storage';
import { SearchService } from '@memberjunction/ng-search';
import type { SearchFilter, SearchFilterChangeEvent, SearchRequest, SearchResponse, SearchResultItem } from '@memberjunction/ng-search';
import { RenderComponentFixture } from '@memberjunction/ng-test-utils';
import { SearchResultsResource } from './search-results-resource.component';
import { STORAGE_FILES_FACET_VALUE } from './search-entity-facets';

/**
 * DOM coverage for the search results page's Entity facets (<mj-search-results-resource>). The page
 * runs a broad search. Ticking an Entity facet narrows the loaded results at once and, in the
 * background, fetches the top N within that entity; the reply is merged in (new rows appended,
 * duplicates skipped) so the list grows instead of being replaced. The filter panel
 * (<mj-search-filter>) is a stub that exposes its inputs and emits its outputs; SearchService,
 * NavigationService and FileOpenService are doubles. The other children render as unknown elements.
 */

/** Stands in for <mj-search-filter> from @memberjunction/ng-search, with the inputs and outputs the page binds. */
@Component({ standalone: true, selector: 'mj-search-filter', template: '' })
class SearchFilterStub {
    @Input() Filters: SearchFilter[] = [];
    @Input() ActiveFilters: Record<string, string[]> = {};
    @Input() ShowRelevanceSlider = true;
    @Input() MinScorePercent = 0;
    @Input() ServerMinScorePercent = 0;
    @Output() FilterChanged = new EventEmitter<SearchFilterChangeEvent>();
    @Output() FiltersCleared = new EventEmitter<void>();
    @Output() CloseRequested = new EventEmitter<void>();
    @Output() MinScoreChanged = new EventEmitter<number>();
}

const QUERY = 'food safety';

function result(entityName: string, index: number, resultType = 'entity-record'): SearchResultItem {
    return {
        ID: `${entityName}-${index}`,
        Title: `${entityName} ${index}`,
        Snippet: '',
        EntityName: entityName,
        RecordID: `${entityName}-${index}`,
        SourceType: 'entity',
        ResultType: resultType,
        Score: 1 - index / 1000,
        ScoreBreakdown: { FullText: 0.9 },
        Tags: [],
        SourceIcon: 'fa-solid fa-table',
        MatchedAt: new Date(0),
    };
}

function many(entityName: string, count: number): SearchResultItem[] {
    return Array.from({ length: count }, (_, i) => result(entityName, i));
}

/** The broad top 50 for "food safety": 47 Members, 3 Content Items. */
const BROAD = [...many('Members', 47), ...many('Content Items', 3)];

/** What the server returns when the search is restricted to Content Items: 50 of them. */
const CONTENT_ONLY = many('Content Items', 50);

/** A minimal BuildFilters: one Entity facet counting results per entity, files as the Files option. */
function buildFilters(results: SearchResultItem[]): SearchFilter[] {
    const counts = new Map<string, number>();
    for (const r of results) {
        const key = r.ResultType === 'storage-file' ? STORAGE_FILES_FACET_VALUE : r.EntityName;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const options = Array.from(counts.entries()).map(([value, count]) => ({ Label: value, Value: value, Count: count, IsSelected: false }));
    return options.length > 0 ? [{ Category: 'Entity', Options: options, MultiSelect: true }] : [];
}

function response(results: SearchResultItem[]): SearchResponse {
    return {
        Success: true,
        Results: results,
        Groups: [],
        Filters: buildFilters(results),
        TotalCount: results.length,
        ElapsedMs: 5,
        SourceCounts: { Vector: 0, FullText: results.length, Entity: 0, Storage: 0 },
        Providers: [],
    };
}

/** The server: the broad set unless the request restricts entities, then those entities' results. */
function serverResults(request: SearchRequest): SearchResultItem[] {
    const entities = request.ActiveFilters['Entity'] ?? [];
    if (entities.length === 0) return BROAD;
    return entities.includes('Content Items') ? CONTENT_ONLY : [];
}

function createSearchService(answer: (request: SearchRequest) => Promise<SearchResponse> = async (r) => response(serverResults(r))) {
    return {
        ExecuteSearch: vi.fn(answer),
        StreamSearch: vi.fn(),
        BuildFilters: vi.fn(buildFilters),
    };
}

function createNavigation() {
    return {
        QueryParamChanged$: new Subject<never>(),
        ObserveTabQueryParams: () => of({}),
        OpenEntityRecord: vi.fn(),
        SetAgentContext: vi.fn(),
        SetAgentClientTools: vi.fn(),
    };
}

async function settle(fixture: ComponentFixture<SearchResultsResource>): Promise<void> {
    for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        fixture.detectChanges();
    }
}

async function renderPage(search = createSearchService()) {
    TestBed.configureTestingModule({
        imports: [SearchFilterStub],
        declarations: [SearchResultsResource],
        providers: [
            { provide: SearchService, useValue: search },
            { provide: NavigationService, useValue: createNavigation() },
            { provide: FileOpenService, useValue: { OpenPreviewFromSearchResult: vi.fn(), OpenFileFromSearchResult: vi.fn() } },
        ],
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
    const fixture = RenderComponentFixture(SearchResultsResource, {
        setup: (page) => {
            page.Data = new ResourceData({ Configuration: { Query: QUERY } });
        },
    });
    await settle(fixture);
    return { fixture, search, page: fixture.componentInstance, filterPanel: () => fixture.debugElement.query(By.directive(SearchFilterStub)).componentInstance as SearchFilterStub };
}

function entityOptions(panel: SearchFilterStub): Array<[string, number]> {
    const entity = panel.Filters.find((f) => f.Category === 'Entity');
    return (entity?.Options ?? []).map((o) => [o.Value, o.Count]);
}

function lastRequest(search: ReturnType<typeof createSearchService>): SearchRequest {
    return search.ExecuteSearch.mock.calls[search.ExecuteSearch.mock.calls.length - 1][0];
}

/** A search service whose entity-filtered requests wait until the test releases them. */
function createHeldSearchService() {
    const held: Array<{ request: SearchRequest; release: (results?: SearchResultItem[]) => void }> = [];
    const search = createSearchService((request) => {
        if ((request.ActiveFilters['Entity'] ?? []).length === 0) return Promise.resolve(response(BROAD));
        return new Promise<SearchResponse>((resolve) =>
            held.push({ request, release: (results) => resolve(response(results ?? serverResults(request))) }),
        );
    });
    return { search, held };
}

function ids(results: SearchResultItem[]): string[] {
    return results.map((r) => r.ID);
}

const CONTENT_ITEMS_IN_BROAD = ['Content Items-0', 'Content Items-1', 'Content Items-2'];

describe('SearchResultsResource — Entity facets fetch more results and merge them in', () => {
    it('runs the first search unrestricted and shows the broad facet counts', async () => {
        const { search, page, filterPanel } = await renderPage();

        expect(search.ExecuteSearch).toHaveBeenCalledTimes(1);
        expect(lastRequest(search)).toMatchObject({ Query: QUERY, MaxResults: 50, ActiveFilters: {} });
        expect(page.FilteredResults).toHaveLength(50);
        expect(entityOptions(filterPanel())).toEqual([['Members', 47], ['Content Items', 3]]);
    });

    it('ticking an entity shows the loaded rows of that entity at once, with no overlay', async () => {
        const { search, held } = createHeldSearchService();
        const { fixture, page, filterPanel } = await renderPage(search);

        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: ['Content Items'] });
        fixture.detectChanges();

        expect(ids(page.FilteredResults)).toEqual(CONTENT_ITEMS_IN_BROAD);
        expect(page.IsSearching).toBe(false);
        expect(fixture.nativeElement.querySelector('.search-requery-overlay')).toBeNull();
        expect(held).toHaveLength(1);
        expect(held[0].request).toMatchObject({ Query: QUERY, MaxResults: 50, ActiveFilters: { Entity: ['Content Items'] } });
    });

    it('appends the server reply after the rows already shown and does not show duplicates', async () => {
        const { search, held } = createHeldSearchService();
        const { fixture, page, filterPanel } = await renderPage(search);
        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: ['Content Items'] });

        held[0].release(); // 50 Content Items, of which the first 3 are already loaded
        await settle(fixture);

        expect(page.FilteredResults).toHaveLength(50);
        expect(ids(page.FilteredResults).slice(0, 3)).toEqual(CONTENT_ITEMS_IN_BROAD);
        expect(new Set(ids(page.FilteredResults)).size).toBe(50);
        expect(page.ServerResultCount).toBe(97);
        expect(entityOptions(filterPanel())).toEqual([['Members', 47], ['Content Items', 50]]);
    });

    it('unticking needs no request and shows the whole merged set', async () => {
        const { fixture, search, page, filterPanel } = await renderPage();
        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: ['Content Items'] });
        await settle(fixture);

        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: [] });
        await settle(fixture);

        expect(search.ExecuteSearch).toHaveBeenCalledTimes(2);
        expect(page.FilteredResults).toHaveLength(97);
    });

    it('Clear all needs no request', async () => {
        const { fixture, search, filterPanel } = await renderPage();
        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: ['Content Items'] });
        await settle(fixture);

        filterPanel().FiltersCleared.emit();
        await settle(fixture);

        expect(search.ExecuteSearch).toHaveBeenCalledTimes(2);
    });

    it('ticking an entity this search already fetched does not fetch it again', async () => {
        const { fixture, search, filterPanel } = await renderPage();
        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: ['Content Items'] });
        await settle(fixture);
        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: [] });
        await settle(fixture);

        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: ['Content Items'] });
        await settle(fixture);

        expect(search.ExecuteSearch).toHaveBeenCalledTimes(2);
    });

    it('a new search from the search box resets the merged results and the facets', async () => {
        const { fixture, search, page, filterPanel } = await renderPage();
        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: ['Content Items'] });
        await settle(fixture);

        await page.OnRefineSearch('cheese rules');
        await settle(fixture);

        expect(lastRequest(search)).toMatchObject({ Query: 'cheese rules', ActiveFilters: {} });
        expect(page.ActiveFilters).toEqual({});
        expect(page.FilteredResults).toHaveLength(50);
        expect(entityOptions(filterPanel())).toEqual([['Members', 47], ['Content Items', 3]]);
    });

    it('drops an entity reply that belongs to an earlier search text', async () => {
        const { search, held } = createHeldSearchService();
        const { fixture, page, filterPanel } = await renderPage(search);
        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: ['Content Items'] });

        await page.OnRefineSearch('cheese rules');
        await settle(fixture);
        held[0].release();
        await settle(fixture);

        expect(page.ServerResultCount).toBe(50);
        expect(page.FilteredResults).toHaveLength(50);
    });

    it('other facets stay client-side and do not search again', async () => {
        const { fixture, search, page, filterPanel } = await renderPage();

        filterPanel().FilterChanged.emit({ Category: 'Source', SelectedValues: ['entity'] });
        await settle(fixture);

        expect(search.ExecuteSearch).toHaveBeenCalledTimes(1);
        expect(page.FilteredResults).toHaveLength(50);
    });

    it('the Files option alone stays client-side: it is not an entity the server can filter on', async () => {
        const { fixture, search, page, filterPanel } = await renderPage();

        filterPanel().FilterChanged.emit({ Category: 'Entity', SelectedValues: [STORAGE_FILES_FACET_VALUE] });
        await settle(fixture);

        expect(search.ExecuteSearch).toHaveBeenCalledTimes(1);
        expect(page.FilteredResults).toHaveLength(0);
    });
});
