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

    public Open(containerRef: ViewContainerRef, options: AboutDialogOpenOptions = {}): void {
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
            instance.CloseRequested.subscribe(() => this.Close());
        }

        this.dialogRef.Result.subscribe(() => {
            this.dialogRef = null;
        });
    }

    /** @deprecated Use {@link Open}. */
    public open(containerRef: ViewContainerRef, options: AboutDialogOpenOptions = {}): void {
        return this.Open(containerRef, options);
    }

    public Close(): void {
        if (this.dialogRef) {
            this.dialogRef.Close();
            this.dialogRef = null;
        }
    }

    /** @deprecated Use {@link Close}. */
    public close(): void {
        return this.Close();
    }

    public get IsOpen(): boolean {
        return this.dialogRef !== null;
    }

    /** @deprecated Use {@link IsOpen}. */
    public get isOpen(): boolean {
        return this.IsOpen;
    }
}
