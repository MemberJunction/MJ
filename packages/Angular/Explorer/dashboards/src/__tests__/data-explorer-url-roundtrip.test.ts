/**
 * Data Explorer ↔ tab query-param round trip.
 *
 * The dashboard writes its navigation state (entity / record / viewId) to its tab's query params,
 * and the framework delivers every change to those params back through OnQueryParamsChanged —
 * including the dashboard's OWN writes (the tab's param stream is a BehaviorSubject, and the
 * resource wrapper forwards what it observes as well). Receiving back the state it just wrote is
 * therefore a normal event, and applying it must be a no-op: it is not a navigation.
 *
 * The user-visible contract these specs pin (reported against the Entities grid):
 *   1. Type a search, click a row → the search text and its results stay, and the record's
 *      detail panel opens.
 *   2. When a genuine navigation does reset the search box, typing the same search again must
 *      re-apply it (the box must not go dead until it is cleared first).
 *
 * The NavigationService here is a small in-memory stand-in with the real contract: writes merge
 * into the tab's params, and ObserveTabQueryParams replays + emits changes. Everything else
 * (the dashboard, its state service, BaseResourceComponent's delivery) is the real code.
 */
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { ChangeDetectorRef, Injector, NgZone, runInInjectionContext } from '@angular/core';
import { CompositeKey, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { MJUserViewEntityExtended, UserInfoEngine, UserViewEngine } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';
import { DataExplorerDashboardComponent } from '../DataExplorer/data-explorer-dashboard.component';
import { ExplorerStateService } from '../DataExplorer/services/explorer-state.service';

const TAB_ID = 'data-explorer-tab';

/** In-memory tab query-param store with NavigationService's observable contract. */
class FakeTabParams {
  private readonly params$ = new BehaviorSubject<Record<string, string>>({});
  public readonly QueryParamChanged$ = new Subject<{ TabId: string; Params: Record<string, string>; Force?: boolean }>();

  public get Current(): Record<string, string> {
    return this.params$.value;
  }

  public ObserveTabQueryParams(_tabId: string): Observable<Record<string, string>> {
    return this.params$.pipe(
      map((p) => p),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    );
  }

  public UpdateTabQueryParams(_tabId: string, params: Record<string, string | null>): boolean {
    const merged: Record<string, string> = { ...this.params$.value };
    for (const [key, value] of Object.entries(params)) {
      if (value === null) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
    this.params$.next(merged);
    return true;
  }

  public SetAgentContext = vi.fn();
  public SetAgentClientTools = vi.fn();
}

const ENTITIES_ENTITY = {
  ID: 'entities-entity-id',
  Name: 'MJ: Entities',
  DisplayNameOrName: 'Entities',
  Icon: null,
  PrimaryKeys: [{ Name: 'ID' }],
  NameField: { Name: 'Name' },
  Fields: [],
  RelatedEntities: [],
} as unknown as EntityInfo;

/** The first unfiltered page — the searched-for record is NOT on it (576 rows, it sorts later). */
const UNFILTERED_PAGE: Record<string, unknown>[] = [
  { ID: 'r-1', Name: 'MJ: Explorer Navigation Items' },
  { ID: 'r-2', Name: 'MJ: Test Run Feedbacks' },
];
const TARGET: Record<string, unknown> = { ID: 'r-target', Name: 'MJ: Test Suite Tests' };

describe('DataExplorerDashboardComponent — own URL writes echoed back', () => {
  let tabParams: FakeTabParams;
  let component: DataExplorerDashboardComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(UserInfoEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(UserViewEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(UserViewEngine.Instance, 'GetAccessibleViewsForEntity').mockReturnValue([
      { ID: 'some-other-view', Name: 'Other view', SmartFilterEnabled: false } as unknown as MJUserViewEntityExtended,
    ]);

    tabParams = new FakeTabParams();
    const stateService = new ExplorerStateService();
    vi.spyOn(stateService, 'SetContext').mockResolvedValue(undefined);

    const injector = Injector.create({
      providers: [
        { provide: NavigationService, useValue: tabParams },
        // Only the Dashboards moved banner's OpenDashboardsApp reads it, and these specs never call it.
        { provide: ApplicationManager, useValue: {} },
        { provide: ChangeDetectorRef, useValue: { detectChanges: vi.fn(), markForCheck: vi.fn() } },
      ],
    });
    runInInjectionContext(injector, () => {
      component = new DataExplorerDashboardComponent(
        stateService,
        { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef,
        { logAccess: vi.fn() } as unknown as RecentAccessService,
        { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() } as unknown as NgZone,
      );
    });
    component.Provider = { Entities: [ENTITIES_ENTITY], CurrentUser: null } as unknown as IMetadataProvider;
    component.ParentTabId = TAB_ID;

    // loadEntities reads the full metadata catalog + app filters; the round trip only needs
    // the one entity to be known.
    vi.spyOn(component as unknown as { loadEntities: () => Promise<void> }, 'loadEntities').mockImplementation(async () => {
      component.Entities = [ENTITIES_ENTITY];
    });

    await component.ngOnInit();

    // The user opens the Entities grid (a real navigation — written to, and echoed from, the URL).
    component.OnEntitySelected(ENTITIES_ENTITY);
    component.OnDataLoaded({ totalRowCount: 576, loadedRowCount: UNFILTERED_PAGE.length, loadTime: 1, records: UNFILTERED_PAGE });
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Type into the filter box and let the 500 ms debounce fire; the grid then loads the matches. */
  function search(text: string, results: Record<string, unknown>[]): void {
    component.OnFilterInputChanged(text);
    vi.advanceTimersByTime(500);
    component.OnDataLoaded({ totalRowCount: results.length, loadedRowCount: results.length, loadTime: 1, records: results });
  }

  /** Click a grid row, exactly as mj-view-workspace reports it. */
  function clickRow(record: Record<string, unknown>): void {
    component.OnViewerRecordSelected({
      record,
      compositeKey: CompositeKey.FromEntityRecord(ENTITIES_ENTITY, record),
    } as Parameters<DataExplorerDashboardComponent['OnViewerRecordSelected']>[0]);
  }

  it('keeps the search text and its results when a row is clicked', async () => {
    search('test suite', [TARGET]);
    expect(component.DebouncedFilterText).toBe('test suite');

    clickRow(TARGET);
    await vi.runOnlyPendingTimersAsync();

    // The click was written to the URL (and echoed back through the tab's param stream)…
    expect(tabParams.Current['record']).toBe('ID|r-target');
    // …and the echo did not wipe the search the user is looking at.
    expect(component.LiveFilterText).toBe('test suite');
    expect(component.DebouncedFilterText).toBe('test suite');
  });

  it('opens the detail panel for the clicked row even once an unfiltered page is loaded', async () => {
    search('test suite', [TARGET]);
    clickRow(TARGET);

    // Whatever the grid loads next (e.g. a page that does not contain the row), the selection the
    // user made by clicking must survive — the panel needs both the open flag and the record.
    component.OnDataLoaded({ totalRowCount: 576, loadedRowCount: UNFILTERED_PAGE.length, loadTime: 1, records: UNFILTERED_PAGE });
    component.HandleQueryParamsChanged({ ...tabParams.Current }, 'popstate');
    await vi.runOnlyPendingTimersAsync();

    expect(component.State.detailPanelOpen).toBe(true);
    expect(component.State.selectedRecordId).toBe('ID|r-target');
    expect(component.SelectedRecord).toBe(TARGET);
  });

  it('re-applies the same search after a navigation reset the search box', async () => {
    search('test suite', [TARGET]);

    // A genuine navigation that resets the search: back to the entity with no record (a new
    // params set that is not the one the dashboard last wrote), then the user re-types.
    tabParams.UpdateTabQueryParams(TAB_ID, { entity: 'MJ: Entities', viewId: null, record: null });
    component.HandleQueryParamsChanged({ entity: 'MJ: Entities', viewId: 'some-other-view' }, 'popstate');
    await vi.runOnlyPendingTimersAsync();
    expect(component.LiveFilterText).toBe('');
    expect(component.DebouncedFilterText).toBe('');

    component.OnFilterInputChanged('test suite');
    vi.advanceTimersByTime(500);

    expect(component.DebouncedFilterText).toBe('test suite');
  });
});
