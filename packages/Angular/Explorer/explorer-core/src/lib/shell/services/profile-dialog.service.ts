import { Injectable, ViewContainerRef } from '@angular/core';
import { MJDialogService, MJDialogRef } from '@memberjunction/ng-ui-components';
import { ProfileDialogComponent } from '../../profile/profile-dialog.component';

export interface ProfileDialogOpenOptions {
    avatarUrl?: string | null;
    avatarIconClass?: string | null;
}

/**
 * Opens the Identity Card profile dialog. Photo and theme editing happen via
 * slide-in panels inside the dialog itself — no external dialog services needed.
 */
@Injectable({ providedIn: 'root' })
export class ProfileDialogService {
    private dialogRef: MJDialogRef | null = null;

    constructor(private dialogService: MJDialogService) {}

    public open(containerRef: ViewContainerRef, options: ProfileDialogOpenOptions = {}): void {
        if (this.dialogRef) return;

        this.dialogRef = this.dialogService.open({
            content: ProfileDialogComponent,
            width: 520,
            appendTo: containerRef
        });

        const instance = this.dialogRef.Content?.instance as ProfileDialogComponent | undefined;
        if (instance) {
            instance.AvatarUrl = options.avatarUrl ?? null;
            instance.AvatarIconClass = options.avatarIconClass ?? null;
            instance.CloseRequested.subscribe(() => this.close());
        }

        this.dialogRef.Result.subscribe(() => {
            this.dialogRef = null;
        });
    }

    public close(): void {
        if (this.dialogRef) {
            this.dialogRef.Close();
            this.dialogRef = null;
        }
    }

    public get isOpen(): boolean {
        return this.dialogRef !== null;
    }
}
