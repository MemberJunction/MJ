import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CompositeKey, NormalizedPermission } from '@memberjunction/core';
import { MJDialogRef } from '@memberjunction/ng-ui-components';
import { UserSharingCenterComponent } from '@memberjunction/ng-resource-permissions';
import { NavigationService } from '@memberjunction/ng-shared';

/**
 * Thin Explorer-side wrapper around the Generic {@link UserSharingCenterComponent}.
 *
 * The Generic component is intentionally Router-free; this host translates its
 * `ResourceClicked` and `CloseRequested` events into calls against `NavigationService`
 * (Explorer's wrapper around Angular Router) and `MJDialogRef` (its host dialog).
 *
 * Apps that don't use NavigationService can instantiate the Generic component
 * directly and provide their own routing strategy.
 */
@Component({
    standalone: true,
    selector: 'mj-explorer-sharing-center-dialog-host',
    imports: [UserSharingCenterComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-user-sharing-center
            [ShowCloseButton]="false"
            (ResourceClicked)="OnResourceClicked($event)"
            (CloseRequested)="OnCloseRequested()">
        </mj-user-sharing-center>
    `,
})
export class SharingCenterDialogHostComponent {
    private readonly dialogRef = inject(MJDialogRef, { optional: true });
    private readonly navigationService = inject(NavigationService);

    OnResourceClicked(row: NormalizedPermission): void {
        if (!row.ResourceID) return;
        const opened = this.openResourceForExplorer(row);
        if (opened) {
            this.dialogRef?.Close();
        }
    }

    OnCloseRequested(): void {
        this.dialogRef?.Close();
    }

    private openResourceForExplorer(row: NormalizedPermission): boolean {
        switch (row.DomainName) {
            case 'Dashboard Permissions':
                this.navigationService.OpenDashboard(row.ResourceID!, row.ResourceName ?? 'Dashboard');
                return true;

            case 'Artifact Permissions':
                this.navigationService.OpenArtifact(row.ResourceID!, row.ResourceName);
                return true;

            case 'Query Permissions':
                this.navigationService.OpenQuery(row.ResourceID!, row.ResourceName ?? 'Query');
                return true;

            case 'Resource Permissions':
            case 'Access Control Rules':
                if (row.ResourceType) {
                    const key = new CompositeKey();
                    key.KeyValuePairs.push({ FieldName: 'ID', Value: row.ResourceID! });
                    this.navigationService.OpenEntityRecord(row.ResourceType, key);
                    return true;
                }
                return false;

            default:
                return false;
        }
    }
}
