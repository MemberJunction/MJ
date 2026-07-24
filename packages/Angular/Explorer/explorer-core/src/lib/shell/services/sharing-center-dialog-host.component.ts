import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NormalizedPermission } from '@memberjunction/core';
import { MJButtonDirective, MJDialogRef } from '@memberjunction/ng-ui-components';
import { UserSharingCenterComponent } from '@memberjunction/ng-resource-permissions';
import { NavigationService, OpenSharedResourceInExplorer, OpenSharingCenterApplication } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';

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
    imports: [UserSharingCenterComponent, MJButtonDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="sharing-center-dialog-host">
            <mj-user-sharing-center
                [ShowCloseButton]="false"
                (ResourceClicked)="OnResourceClicked($event)"
                (CloseRequested)="OnCloseRequested()">
            </mj-user-sharing-center>
            <div class="sharing-center-dialog-host__footer">
                <button mjButton variant="flat" size="sm" (click)="OnOpenFullSharingCenter()">
                    Open full Sharing Center <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `,
    styles: [`
        .sharing-center-dialog-host { display: flex; flex-direction: column; height: 100%; }
        .sharing-center-dialog-host > mj-user-sharing-center { flex: 1; min-height: 0; }
        .sharing-center-dialog-host__footer {
            display: flex;
            justify-content: flex-end;
            padding: var(--mj-space-2) var(--mj-space-3);
            border-top: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface-card);
        }
    `],
})
export class SharingCenterDialogHostComponent {
    private readonly dialogRef = inject(MJDialogRef, { optional: true });
    private readonly navigationService = inject(NavigationService);
    private readonly appManager = inject(ApplicationManager);

    async OnResourceClicked(row: NormalizedPermission): Promise<void> {
        const opened = await OpenSharedResourceInExplorer(row, this.navigationService, this.appManager);
        if (opened) {
            this.dialogRef?.Close();
        }
    }

    OnCloseRequested(): void {
        this.dialogRef?.Close();
    }

    async OnOpenFullSharingCenter(): Promise<void> {
        const opened = await OpenSharingCenterApplication(this.navigationService, this.appManager);
        if (opened) {
            this.dialogRef?.Close();
        }
    }
}
