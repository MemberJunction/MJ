import { Injectable, ViewContainerRef } from '@angular/core';
import { MJDialogService, MJDialogRef } from '@memberjunction/ng-ui-components';
import { AboutDialogComponent } from '../../about/about-dialog.component';

/**
 * Opens the About MemberJunction dialog. The dialog is rendered without an
 * MJDialog title bar — its hero header is the title — and closes on backdrop
 * click or when the AboutDialogComponent emits {@link AboutDialogComponent.CloseRequested}.
 */
export interface AboutDialogOpenOptions {
    avatarUrl?: string | null;
    avatarIconClass?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AboutDialogService {
    private dialogRef: MJDialogRef | null = null;

    constructor(private dialogService: MJDialogService) {}

    public open(containerRef: ViewContainerRef, options: AboutDialogOpenOptions = {}): void {
        if (this.dialogRef) return;

        this.dialogRef = this.dialogService.open({
            content: AboutDialogComponent,
            width: 520,
            appendTo: containerRef
        });

        const instance = this.dialogRef.Content?.instance as AboutDialogComponent | undefined;
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
