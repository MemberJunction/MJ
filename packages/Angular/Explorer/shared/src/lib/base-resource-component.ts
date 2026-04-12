import { Directive, OnInit, OnDestroy, Input, inject } from "@angular/core";
import { Subject } from "rxjs";
import { filter, takeUntil } from "rxjs/operators";
import { BaseEntity } from "@memberjunction/core";
import { BaseNavigationComponent } from "./base-navigation-component";
import { ResourceData } from "@memberjunction/core-entities";
import { NavigationService } from "./navigation.service";

@Directive()
export abstract class BaseResourceComponent extends BaseNavigationComponent implements OnInit, OnDestroy {
    private _data: ResourceData = new ResourceData();
    private _suppressQueryParamSync = false;
    protected destroy$ = new Subject<void>();
    protected navigationService = inject(NavigationService);

    /**
     * Tab ID for query param notification scoping. Set by resource wrappers
     * that render child dashboards, so the child knows which tab it belongs to.
     * If not set, falls back to Data.Configuration.tabId.
     */
    @Input() ParentTabId: string | null = null;

    public get Data(): ResourceData {
        return this._data;
    }
    public set Data(value: ResourceData) {
        this._data = value;
    }

    private _loadComplete: boolean = false;
    public get LoadComplete(): boolean {
        return this._loadComplete;
    }

    private _loadStarted: boolean = false;
    public get LoadStarted(): boolean {
        return this._loadStarted;
    }


    private _loadCompleteEvent: any = null;
    public get LoadCompleteEvent(): any {
        return this._loadCompleteEvent
    }
    public set LoadCompleteEvent(value: any) {
        this._loadCompleteEvent = value;
    }

    private _loadStartedEvent: any = null;
    public get LoadStartedEvent(): any {
        return this._loadStartedEvent
    }
    public set LoadStartedEvent(value: any) {
        this._loadStartedEvent = value;
    }

    private _resourceRecordSavedEvent: any = null;
    public get ResourceRecordSavedEvent(): any {
        return this._resourceRecordSavedEvent
    }
    public set ResourceRecordSavedEvent(value: any) {
        this._resourceRecordSavedEvent = value;
    }

    private _displayNameChangedEvent: ((newName: string) => void) | null = null;
    public get DisplayNameChangedEvent(): ((newName: string) => void) | null {
        return this._displayNameChangedEvent;
    }
    public set DisplayNameChangedEvent(value: ((newName: string) => void) | null) {
        this._displayNameChangedEvent = value;
    }

    ngOnInit(): void {
        this.setupQueryParamSubscription();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * Called by the framework when query params change from an external source
     * (browser back/forward, deep link navigation).
     * Override in subclasses to react to query param changes.
     * @param params The new query params from the URL
     * @param source 'popstate' for back/forward, 'deeplink' for external URL entry
     */
    protected OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
        // Default no-op — override in subclasses
    }

    /**
     * Push query param changes to the URL. Creates a browser history entry.
     * Safe to call during OnQueryParamsChanged — auto-suppressed to prevent loops.
     */
    protected UpdateQueryParams(params: Record<string, string | null>): void {
        if (this._suppressQueryParamSync) return;
        this.navigationService.UpdateActiveTabQueryParams(params);
    }

    /**
     * Read current query params from tab configuration.
     * Use in initDashboard() / ngOnInit() to get initial URL state.
     */
    protected GetQueryParams(): Record<string, string> {
        return (this.Data?.Configuration?.['queryParams'] as Record<string, string>) || {};
    }

    /**
     * Internal: subscribe to NavigationService query param notifications.
     * Filters to only this component's tab to prevent cross-tab leakage.
     */
    private setupQueryParamSubscription(): void {
        this.navigationService.QueryParamChanged$
            .pipe(
                filter(event => {
                    const myTabId = this.getTabId();
                    return !myTabId || event.TabId === myTabId;
                }),
                takeUntil(this.destroy$)
            )
            .subscribe(event => {
                // try/finally ensures suppression flag is always cleared,
                // even if OnQueryParamsChanged throws
                this._suppressQueryParamSync = true;
                try {
                    this.OnQueryParamsChanged(event.Params, 'popstate');
                } finally {
                    this._suppressQueryParamSync = false;
                }
            });
    }

    /**
     * Get this component's tab ID. Checks ParentTabId input first (set by resource
     * wrappers for child dashboards), then falls back to Data.Configuration.tabId.
     */
    public getTabId(): string {
        return this.ParentTabId || this.Data?.Configuration?.['tabId'] as string || '';
    }

    protected NotifyLoadComplete() {
        this._loadComplete = true;
        if (this._loadCompleteEvent) {
            this._loadCompleteEvent();
        }
    }

    protected NotifyLoadStarted() {
        this._loadStarted = true;
        if (this._loadStartedEvent) {
            this._loadStartedEvent();
        }
    }



    /**
     * Call this to notify the tab system that the resource's display name has changed.
     * The tab container will update the tab title and browser title accordingly.
     */
    protected NotifyDisplayNameChanged(newName: string): void {
        if (this._displayNameChangedEvent) {
            this._displayNameChangedEvent(newName);
        }
    }

    protected ResourceRecordSaved(resourceRecordEntity: BaseEntity) {
        this.Data.ResourceRecordID = resourceRecordEntity.PrimaryKey.ToString();
        if (this._resourceRecordSavedEvent) {
            this._resourceRecordSavedEvent(resourceRecordEntity);
        }
    }

    abstract GetResourceDisplayName(data: ResourceData): Promise<string>

    abstract GetResourceIconClass(data: ResourceData): Promise<string>
}
