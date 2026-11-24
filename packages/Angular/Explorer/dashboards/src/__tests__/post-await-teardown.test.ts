import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { DataExplorerDashboardComponent } from '../DataExplorer/data-explorer-dashboard.component';
import { FormBuilderResourceComponent } from '../FormBuilder/form-builder-resource.component';
import { InteractiveFormsEngine, UserInfoEngine } from '@memberjunction/core-entities';

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('DataExplorerDashboardComponent post-destroy timer guard', () => {
    function buildDataExplorer(loadEntitiesPromise: Promise<void>) {
        vi.spyOn(UserInfoEngine.Instance, 'Config').mockResolvedValue(undefined);
        const comp = Object.create(DataExplorerDashboardComponent.prototype) as DataExplorerDashboardComponent;
        const open = comp as unknown as Record<string, unknown>;
        Object.assign(open, {
            isDestroyed: false,
            recentTimeRefreshTimer: null,
            destroy$: new Subject<void>(),
            filterInput$: new Subject<string>(),
            gridRefreshOnDelete$: new Subject<void>(),
            listenForRecordDeletes: vi.fn(),
            State: { selectedEntityName: null },
            RecentRecords: [],
            FavoriteRecords: [],
            Breadcrumbs: [],
            DeepLink: null,
            EntityFilter: null,
            ngZone: null,
            cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
            navigationService: {
                ObserveTabQueryParams: () => new Subject<unknown>(),
                QueryParamChanged$: new Subject<unknown>(),
            },
            StateService: {
                setContext: async () => undefined,
                CurrentState: { selectedEntityName: null },
                parseUrlState: () => null,
                State: new BehaviorSubject({ selectedEntityName: null }),
                Breadcrumbs: new BehaviorSubject([]),
                RecentRecords: new BehaviorSubject([]),
                FavoriteRecords: new BehaviorSubject([]),
            },
            loadEntities: () => loadEntitiesPromise,
            loadRecentRecords: async () => undefined,
            loadFavoriteRecords: async () => undefined,
            isDashboardsMovedBannerDismissed: () => true,
            GetQueryParams: () => ({}),
            buildDeepLinkFromParams: () => null,
            onStateChanged: vi.fn(),
            publishAgentContext: vi.fn(),
            syncAgentToolsForMode: vi.fn(),
            refreshRecentRecordTimes: () => false,
            pushCurrentStateToUrl: vi.fn(),
            NotifyLoadComplete: vi.fn(),
        });
        return { comp, open };
    }

    it('starts the 30s recentTimeRefreshTimer while alive, and skips it when destroyed mid-init', async () => {
        vi.useFakeTimers();

        // Control: alive component reaches startTimer() and arms the 30s interval
        const alive = buildDataExplorer(Promise.resolve());
        await alive.comp.ngOnInit();
        expect(alive.open.recentTimeRefreshTimer).not.toBeNull();
        alive.comp.ngOnDestroy();
        expect(alive.open.recentTimeRefreshTimer).toBeNull();

        // Destroyed mid-await: does not re-arm the 30s interval or push state to URL
        let finishLoadEntities!: () => void;
        const loadEntitiesPromise = new Promise<void>((r) => {
            finishLoadEntities = r;
        });
        const destroyed = buildDataExplorer(loadEntitiesPromise);
        const init = destroyed.comp.ngOnInit();
        destroyed.comp.ngOnDestroy();
        finishLoadEntities();
        await init;

        expect(destroyed.open.recentTimeRefreshTimer).toBeNull();
        expect(destroyed.open.pushCurrentStateToUrl).not.toHaveBeenCalled();
    });
});

describe('FormBuilderResourceComponent post-destroy subscription guard', () => {
    it('immediately ends late subscriptions attached after ngOnDestroy runs during async ngAfterViewInit', async () => {
        let finishLoadForms!: () => void;
        const loadFormsPromise = new Promise<void>((r) => {
            finishLoadForms = r;
        });

        const appContext$ = new BehaviorSubject<unknown>({ App: null });
        vi.spyOn(InteractiveFormsEngine.Instance, 'Config').mockResolvedValue(undefined);

        const comp = Object.create(FormBuilderResourceComponent.prototype) as FormBuilderResourceComponent;
        const open = comp as unknown as Record<string, unknown>;
        Object.defineProperty(comp, 'CurrentUser', { get: () => ({ ID: 'u-1' }), configurable: true });
        Object.defineProperty(comp, 'provider', { get: () => ({}), configurable: true });
        Object.assign(open, {
            destroy$: new Subject<void>(),
            appContextSubscription: null,
            entityEventSubscription: null,
            engineSubscription: null,
            SelectedFormName: null,
            IsLoading: true,
            ChatAppContext: null,
            cdr: { markForCheck: vi.fn(), detectChanges: vi.fn() },
            navigationService: {
                AppContextSnapshot$: appContext$,
                ObserveTabQueryParams: () => new Subject<unknown>(),
                QueryParamChanged$: new Subject<unknown>(),
            },
            loadExistingForms: () => loadFormsPromise,
            resolveFormBuilderAgentId: async () => undefined,
            NotifyLoadComplete: vi.fn(),
            registerAgentContext: vi.fn(),
        });

        const viewInit = comp.ngAfterViewInit();
        BaseResourceComponent.prototype.ngOnDestroy.call(comp);
        finishLoadForms();
        await viewInit;

        expect(appContext$.observed).toBe(false);
    });
});
