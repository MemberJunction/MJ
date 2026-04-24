import { Injectable, ViewContainerRef } from '@angular/core';
import { MJDialogRef, MJDialogService } from '@memberjunction/ng-ui-components';

import { UserSharingCenterComponent } from '../../sharing-center/user-sharing-center.component';

/**
 * Opens the end-user Sharing Center in an MJ dialog. Mirrors the pattern used
 * by {@link SettingsDialogService} — single instance at a time, reset on close.
 */
@Injectable({ providedIn: 'root' })
export class UserSharingCenterDialogService {
    private dialogRef: MJDialogRef | null = null;

    constructor(private dialogService: MJDialogService) {}

    open(containerRef: ViewContainerRef): void {
        if (this.dialogRef) return;

        this.dialogRef = this.dialogService.open({
            content: UserSharingCenterComponent,
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
