import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, DashboardConfig } from '@memberjunction/ng-shared';
import { ResourceData, MJDashboardEntity } from '@memberjunction/core-entities';
import { PredictiveStudioDashboardComponent } from './predictive-studio-dashboard.component';

/**
 * Resource component for the Predictive Studio dashboard.
 *
 * Wraps {@link PredictiveStudioDashboardComponent} as a BaseResourceComponent for use in application
 * nav items with ResourceType: "Custom". The PS app's nav item DriverClass is
 * `PredictiveStudioDashboard`, so this wrapper registers `@RegisterClass(BaseResourceComponent,
 * 'PredictiveStudioDashboard')` — matching the key the shell's resource resolver looks up
 * (`GetRegistrationAsync(BaseResourceComponent, '<DriverClass>')`). Mirrors DataExplorerResourceComponent.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioDashboard')
@Component({
    standalone: false,
    selector: 'mj-predictive-studio-resource',
    template: `
        <div class="predictive-studio-resource-container">
            <mj-predictive-studio-dashboard [ParentTabId]="getTabId()"></mj-predictive-studio-dashboard>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }
        .predictive-studio-resource-container {
            width: 100%;
            height: 100%;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PredictiveStudioResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    // ========================================
    // State
    // ========================================

    @ViewChild(PredictiveStudioDashboardComponent) predictiveStudio!: PredictiveStudioDashboardComponent;

    private readonly _destroy$ = new Subject<void>();
    private _dataLoaded = false;

    // ========================================
    // Constructor
    // ========================================

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    // ========================================
    // Data Property Override
    // ========================================

    override set Data(value: ResourceData) {
        const previousConfig = JSON.stringify(super.Data?.Configuration || {});
        super.Data = value;

        const newConfig = JSON.stringify(value?.Configuration || {});

        // Load on first set, or when the configuration has changed
        if (!this._dataLoaded || previousConfig !== newConfig) {
            this._dataLoaded = true;
            this.loadConfiguration();
        }
    }

    override get Data(): ResourceData {
        return super.Data;
    }

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        super.ngOnInit();
        // Configuration loaded via Data setter
    }

    // NOTE: Query-param deep linking (the `panel` param) is handled by the inner dashboard itself.
    // PredictiveStudioDashboardComponent extends BaseDashboard (a BaseResourceComponent) and self-
    // subscribes to its tab's query params via the [ParentTabId] we pass into its template, so it
    // receives OnQueryParamsChanged directly — no forwarding needed from this wrapper.

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this._destroy$.next();
        this._destroy$.complete();
    }

    // ========================================
    // BaseResourceComponent Implementation
    // ========================================

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return data.Name || 'Predictive Studio';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-wand-magic-sparkles';
    }

    // ========================================
    // Private Methods
    // ========================================

    private loadConfiguration(): void {
        const data = this.Data;
        if (!data) {
            this.NotifyLoadComplete();
            return;
        }

        this.cdr.detectChanges();

        // Setup LoadCompleteEvent after view initializes
        setTimeout(() => {
            if (this.predictiveStudio) {
                this.predictiveStudio.LoadCompleteEvent = () => {
                    this.NotifyLoadComplete();
                };

                // Pass the resource Data through so the dashboard can read its Configuration
                // (environmentId, applicationId) — then drive the BaseDashboard load lifecycle.
                this.predictiveStudio.Data = data;
                const dashboardConfig: DashboardConfig = {
                    dashboard: null as unknown as MJDashboardEntity,
                    userState: {}
                };
                this.predictiveStudio.Config = dashboardConfig;
                this.predictiveStudio.Refresh();

                // RACE GUARD: BaseDashboard.ngOnInit() calls NotifyLoadComplete() (firing the inner
                // dashboard's LoadCompleteEvent) in a MICROtask, while this wiring runs in a setTimeout(0)
                // MACROtask — so the dashboard can finish loading BEFORE we attach the handler above, and
                // the completion signal would be lost (shell hangs on direct-URL refresh). If the dashboard
                // already completed, forward completion to the shell now.
                if (this.predictiveStudio.LoadComplete) {
                    this.NotifyLoadComplete();
                }
            } else {
                this.NotifyLoadComplete();
            }
        }, 0);
    }
}

/** Tree-shaking prevention — called from public-api.ts so the @RegisterClass survives bundling. */
export function LoadPredictiveStudioResource(): void {
    // intentionally empty
}
