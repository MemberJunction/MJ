import { Injectable, ViewContainerRef } from '@angular/core';
import { MJDialogRef, MJDialogService } from '@memberjunction/ng-ui-components';

import { SharingCenterDialogHostComponent } from './sharing-center-dialog-host.component';

/**
 * Opens the end-user Sharing Center in an MJ dialog. Mirrors the pattern used
 * by {@link SettingsDialogService} — single instance at a time, reset on close.
 *
 * The dialog hosts {@link SharingCenterDialogHostComponent}, an Explorer-side
 * wrapper that bridges the Generic `UserSharingCenterComponent` (from
 * `@memberjunction/ng-resource-permissions`) to Explorer's `NavigationService`.
 */
@Injectable({ providedIn: 'root' })
export class UserSharingCenterDialogService {
    private dialogRef: MJDialogRef | null = null;

    constructor(private dialogService: MJDialogService) {}

    open(containerRef: ViewContainerRef): void {
        if (this.dialogRef) return;

        this.dialogRef = this.dialogService.open({
            content: SharingCenterDialogHostComponent,
            title: 'Sharing Center',
            width: 720,
            height: 560,
            minWidth: 480,
            appendTo: containerRef,
        });

        this.dialogRef.Result.subscribe(() => {
            this.dialogRef = null;
        });
    }

    close(): void {
        this.dialogRef?.Close();
        this.dialogRef = null;
    }

    get isOpen(): boolean {
        return this.dialogRef !== null;
    }
}
