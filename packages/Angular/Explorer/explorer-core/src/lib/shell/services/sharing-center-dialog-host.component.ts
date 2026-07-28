import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CompositeKey, NormalizedPermission } from '@memberjunction/core';
import { MJDialogRef } from '@memberjunction/ng-ui-components';
import { UserSharingCenterComponent } from '@memberjunction/ng-resource-permissions';
import { NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';

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
    private readonly appManager = inject(ApplicationManager);

    async OnResourceClicked(row: NormalizedPermission): Promise<void> {
        if (!row.ResourceID) return;
        const opened = await this.openResourceForExplorer(row);
        if (opened) {
            this.dialogRef?.Close();
        }
    }

    OnCloseRequested(): void {
        this.dialogRef?.Close();
    }

    private async openResourceForExplorer(row: NormalizedPermission): Promise<boolean> {
        switch (row.DomainName) {
            case 'Dashboard Permissions':
                this.navigationService.OpenDashboard(row.ResourceID!, row.ResourceName ?? 'Dashboard');
                return true;

            case 'Artifact Permissions':
                this.navigationService.OpenArtifact(row.ResourceID!, row.ResourceName);
                return true;

            case 'Collection Permissions':
                return this.openCollection(row.ResourceID!);

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

    /**
     * Collections have no NavigationService.Open* helper — they live behind the
     * 'Collections' nav item of the Chat app. Find whichever app exposes that nav
     * item (the Sharing Center can be opened from any app, so the ACTIVE app can't
     * be assumed) and switch to it with the collectionId as query params, which
     * drives both fresh tabs (initial param read) and cached ones (OnQueryParamsChanged).
     */
    private async openCollection(collectionId: string): Promise<boolean> {
        const apps: BaseApplication[] = await firstValueFrom(this.appManager.Applications).catch(() => []);
        for (const app of apps) {
            const navItems = await app.GetNavItems();
            // Match on DriverClass (stable identity — survives label renames/localization)
            // and only consider Active items (Status defaults to Active when unset).
            const collectionsNav = navItems.find(
                (item) => item.DriverClass === 'ChatCollectionsResource' && (item.Status ?? 'Active') === 'Active'
            );
            if (collectionsNav) {
                await this.navigationService.SwitchToApp(app.ID, collectionsNav.Label, { collectionId });
                return true;
            }
        }
        return false;
    }
}
