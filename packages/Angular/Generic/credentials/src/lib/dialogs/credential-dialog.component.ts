/**
 * @fileoverview Credential Dialog Component
 *
 * A dialog wrapper for the CredentialEditPanelComponent that provides
 * a convenient way to create or edit credentials in a modal dialog.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CredentialEntity, CredentialTypeEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { CredentialEditPanelComponent } from '../panels/credential-edit-panel/credential-edit-panel.component';

export function LoadCredentialDialog() {
    // Prevents tree-shaking
}

/**
 * Configuration options for opening the credential dialog
 */
export interface CredentialDialogOptions {
    /** The credential to edit, or null for creating a new credential */
    credential?: CredentialEntity | null;
    /** Pre-selected credential type ID for new credentials */
    preselectedTypeId?: string;
    /** Pre-selected category ID for new credentials */
    preselectedCategoryId?: string;
    /** Dialog title override */
    title?: string;
    /** Dialog width in pixels */
    width?: number;
}

/**
 * Result returned when the dialog closes
 */
export interface CredentialDialogResult {
    /** Whether a credential was saved or deleted */
    success: boolean;
    /** The saved credential entity (if save was successful) */
    credential?: CredentialEntity;
    /** The ID of the deleted credential (if delete was successful) */
    deletedId?: string;
    /** The action that was taken */
    action: 'saved' | 'deleted' | 'cancelled';
}

@Component({
    selector: 'mj-credential-dialog',
    template: `
        @if (Visible) {
            @if (IsLoading) {
                <div class="loading-backdrop">
                    <mj-loading text="Loading credential types..."></mj-loading>
                </div>
            } @else {
                <mj-credential-edit-panel
                    #editPanel
                    [credential]="Credential"
                    [credentialTypes]="credentialTypes"
                    [isOpen]="Visible"
                    (saved)="onSaved($event)"
                    (deleted)="onDeleted($event)"
                    (close)="onCancel()">
                </mj-credential-edit-panel>
            }
        }
    `,
    styles: [`
        .loading-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialDialogComponent implements OnInit, OnChanges {
    @ViewChild('editPanel') editPanel!: CredentialEditPanelComponent;

    @Input() Visible = false;
    @Input() Credential: CredentialEntity | null = null;
    @Input() PreselectedTypeId: string | undefined;
    @Input() PreselectedCategoryId: string | undefined;
    @Input() Title: string | undefined;
    @Input() Width = 600;

    @Output() close = new EventEmitter<CredentialDialogResult>();

    public IsLoading = false;
    public credentialTypes: CredentialTypeEntity[] = [];

    private _dialogTitle = 'Credential';

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        if (this.Visible) {
            this.loadCredentialTypes();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Visible'] && changes['Visible'].currentValue === true) {
            // When dialog becomes visible, load credential types and initialize the panel
            this.loadCredentialTypes().then(() => {
                // Wait for next change detection cycle to ensure panel is rendered
                // (panel is only rendered when IsLoading is false)
                this.cdr.detectChanges();
                // Use setTimeout to ensure ViewChild is resolved after render
                setTimeout(() => {
                    if (this.editPanel) {
                        this.editPanel.open(this.Credential, this.PreselectedTypeId, this.PreselectedCategoryId);
                    }
                }, 0);
            });
        }
    }

    public get dialogTitle(): string {
        if (this.Title) {
            return this.Title;
        }
        return this.Credential?.ID ? 'Edit Credential' : 'Create Credential';
    }

    /**
     * Opens the dialog with the specified options
     */
    public async open(options?: CredentialDialogOptions): Promise<void> {
        this.Credential = options?.credential ?? null;
        this.PreselectedTypeId = options?.preselectedTypeId;
        this.PreselectedCategoryId = options?.preselectedCategoryId;
        this.Title = options?.title;
        if (options?.width) {
            this.Width = options.width;
        }

        this.Visible = true;
        this.cdr.markForCheck();

        await this.loadCredentialTypes();

        // Initialize the edit panel after types are loaded
        if (this.editPanel) {
            await this.editPanel.open(this.Credential, this.PreselectedTypeId, this.PreselectedCategoryId);
        }
    }

    private async loadCredentialTypes(): Promise<void> {
        if (this.credentialTypes.length > 0) {
            return; // Already loaded
        }

        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const result = await rv.RunView<CredentialTypeEntity>({
                EntityName: 'MJ: Credential Types',
                OrderBy: 'Category, Name',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.credentialTypes = result.Results;
            }
        } catch (error) {
            console.error('Error loading credential types:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    public onSaved(credential: CredentialEntity): void {
        this.Visible = false;
        this.close.emit({
            success: true,
            credential,
            action: 'saved'
        });
        this.cdr.markForCheck();
    }

    public onDeleted(credentialId: string): void {
        this.Visible = false;
        this.close.emit({
            success: true,
            deletedId: credentialId,
            action: 'deleted'
        });
        this.cdr.markForCheck();
    }

    public onCancel(): void {
        this.Visible = false;
        this.close.emit({
            success: false,
            action: 'cancelled'
        });
        this.cdr.markForCheck();
    }
}
