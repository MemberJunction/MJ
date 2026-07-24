import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { SharingCenterDashboardComponent } from './sharing-center-dashboard.component';

/**
 * Explorer resource wrapper for the Sharing Center application. It forwards the
 * shell's provider, resource data, load lifecycle, and URL changes to the
 * inner BaseDashboard so cached tabs and deep links remain reliable.
 */
@Component({
    standalone: false,
    selector: 'mj-sharing-center-resource',
    template: `
        <div class="sharing-center-resource-container">
            <mj-sharing-center-dashboard
                [Provider]="Provider"
                [Data]="Data"
                [ParentTabId]="getTabId()">
            </mj-sharing-center-dashboard>
        </div>
    `,
    styles: [`
        :host { display: block; width: 100%; height: 100%; }
        .sharing-center-resource-container { width: 100%; height: 100%; }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseResourceComponent, 'SharingCenterResource')
export class SharingCenterResourceComponent extends BaseResourceComponent implements OnInit {
    @ViewChild(SharingCenterDashboardComponent) private dashboard?: SharingCenterDashboardComponent;

    private readonly cdr = inject(ChangeDetectorRef);
    private hasWiredDashboard = false;
    private pendingQueryParams: Record<string, string> | null = null;

    override set Data(value: ResourceData) {
        super.Data = value;
        if (!this.hasWiredDashboard) {
            this.hasWiredDashboard = true;
            this.wireDashboard();
        }
    }

    override get Data(): ResourceData {
        return super.Data;
    }

    override ngOnInit(): void {
        super.ngOnInit();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return data.Name || 'Sharing Center';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-share-nodes';
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
        if (this.dashboard) {
            this.dashboard.HandleQueryParamsChanged(params, source);
            return;
        }
        this.pendingQueryParams = params;
    }

    private wireDashboard(): void {
        this.cdr.detectChanges();
        setTimeout(() => {
            if (!this.dashboard) {
                this.NotifyLoadComplete();
                return;
            }

            this.dashboard.LoadCompleteEvent = () => this.NotifyLoadComplete();
            if (this.pendingQueryParams) {
                this.dashboard.HandleQueryParamsChanged(this.pendingQueryParams, 'deeplink');
                this.pendingQueryParams = null;
            }
            void this.dashboard.Refresh();

            // The child can complete in the microtask before the setTimeout wiring;
            // forward that completion so direct application URLs never hang.
            if (this.dashboard.LoadComplete) {
                this.NotifyLoadComplete();
            }
        }, 0);
    }
}

/** Tree-shaking prevention — referenced from the package public API. */
export function LoadSharingCenterResource(): void {
    // Intentionally empty: keeps the @RegisterClass side effect in the bundle.
}
