import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MJDashboardEntity } from '@memberjunction/core-entities';
import {
    ResourceShareContext,
    ResourceShareDialogResult
} from '@memberjunction/ng-resource-permissions';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { DashboardShareAdapter } from './dashboard-share-adapter';

/**
 * Public re-export kept for backward compatibility with existing call sites
 * ({@link DashboardBrowserResourceComponent}, `DashboardResource` wrapper).
 * The new abstraction lives in `@memberjunction/ng-resource-permissions`.
 */
export type ShareDialogResult = ResourceShareDialogResult & { Dashboard?: MJDashboardEntity };

/**
 * Thin wrapper that maps a `MJDashboardEntity` + the Dashboard-specific
 * permission model onto the generic `mj-resource-share-dialog`. Existing call
 * sites (`<mj-dashboard-share-dialog [Dashboard]=... [Visible]=... (Result)=... />`)
 * continue to work unchanged — this component just constructs the context +
 * adapter and delegates.
 */
@Component({
    standalone: false,
    selector: 'mj-dashboard-share-dialog',
    template: `
        <mj-resource-share-dialog
            [Visible]="Visible"
            [Context]="context"
            [Adapter]="adapter"
            (Result)="onResult($event)">
        </mj-resource-share-dialog>
    `
})
export class DashboardShareDialogComponent extends BaseAngularComponent {
    @Input() Visible = false;
    @Input()
    set Dashboard(value: MJDashboardEntity | null) {
        this._dashboard = value;
        this.context = value
            ? {
                  ResourceID: value.ID,
                  ResourceName: value.Name ?? 'Untitled',
                  OwnerUserID: value.UserID,
                  OwnerDisplayName: value.User ?? 'You'
              }
            : null;
    }
    get Dashboard(): MJDashboardEntity | null {
        return this._dashboard;
    }
    @Output() Result = new EventEmitter<ShareDialogResult>();

    public context: ResourceShareContext | null = null;
    public adapter = new DashboardShareAdapter();

    private _dashboard: MJDashboardEntity | null = null;

    constructor() {
        super();
        this.adapter.Provider = this.ProviderToUse;
    }

    onResult(result: ResourceShareDialogResult): void {
        this.Result.emit({
            Action: result.Action,
            Dashboard: result.Action === 'save' && this._dashboard ? this._dashboard : undefined
        });
    }
}
