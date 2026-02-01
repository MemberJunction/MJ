/**
 * @fileoverview Credential Dialog Service
 *
 * A service that provides easy programmatic access to credential dialogs.
 * Use this service to open credential creation/editing dialogs from anywhere
 * in your application without needing to include the component in your template.
 */

import { Injectable, ComponentRef, ViewContainerRef, Type } from '@angular/core';
import { CredentialEntity, CredentialTypeEntity } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { CredentialDialogComponent, CredentialDialogOptions, CredentialDialogResult } from '../dialogs/credential-dialog.component';

/**
 * Service for programmatically opening credential dialogs.
 *
 * @example
 * ```typescript
 * // Inject the service
 * constructor(private credentialDialog: CredentialDialogService) {}
 *
 * // Open dialog to create a new credential
 * async createCredential() {
 *     const result = await this.credentialDialog.openDialog(this.viewContainerRef);
 *     if (result.success && result.credential) {
 *         console.log('Created credential:', result.credential.Name);
 *     }
 * }
 *
 * // Open dialog with pre-selected type
 * async createApiKey() {
 *     const result = await this.credentialDialog.openDialog(this.viewContainerRef, {
 *         preselectedTypeId: 'api-key-type-id'
 *     });
 * }
 *
 * // Edit an existing credential
 * async editCredential(credential: CredentialEntity) {
 *     const result = await this.credentialDialog.openDialog(this.viewContainerRef, {
 *         credential
 *     });
 * }
 * ```
 */
@Injectable({
    providedIn: 'root'
})
export class CredentialDialogService {
    private _credentialTypes: CredentialTypeEntity[] | null = null;
    private _credentialTypesLoading = false;
    private _credentialTypesLoadPromise: Promise<CredentialTypeEntity[]> | null = null;

    /**
     * Opens a credential dialog and returns a promise that resolves when the dialog closes.
     *
     * @param viewContainerRef - The ViewContainerRef to attach the dialog to
     * @param options - Optional configuration for the dialog
     * @returns Promise resolving to the dialog result
     */
    public async openDialog(
        viewContainerRef: ViewContainerRef,
        options?: CredentialDialogOptions
    ): Promise<CredentialDialogResult> {
        // Pre-load credential types
        await this.loadCredentialTypes();

        // Create the dialog component dynamically
        const componentRef = viewContainerRef.createComponent(CredentialDialogComponent);
        const instance = componentRef.instance;

        // Set up the result handling
        const resultSubject = new Subject<CredentialDialogResult>();

        instance.close.subscribe((result: CredentialDialogResult) => {
            resultSubject.next(result);
            resultSubject.complete();
            componentRef.destroy();
        });

        // Open the dialog
        await instance.open(options);

        // Wait for the result
        return firstValueFrom(resultSubject);
    }

    /**
     * Opens a dialog to create a new credential with optional pre-selections.
     * Convenience method that wraps openDialog with create-specific defaults.
     *
     * @param viewContainerRef - The ViewContainerRef to attach the dialog to
     * @param preselectedTypeId - Optional credential type to pre-select
     * @param preselectedCategoryId - Optional category to pre-select
     * @returns Promise resolving to the dialog result
     */
    public async createCredential(
        viewContainerRef: ViewContainerRef,
        preselectedTypeId?: string,
        preselectedCategoryId?: string
    ): Promise<CredentialDialogResult> {
        return this.openDialog(viewContainerRef, {
            credential: null,
            preselectedTypeId,
            preselectedCategoryId,
            title: 'Create Credential'
        });
    }

    /**
     * Opens a dialog to edit an existing credential.
     * Convenience method that wraps openDialog with edit-specific defaults.
     *
     * @param viewContainerRef - The ViewContainerRef to attach the dialog to
     * @param credential - The credential to edit
     * @returns Promise resolving to the dialog result
     */
    public async editCredential(
        viewContainerRef: ViewContainerRef,
        credential: CredentialEntity
    ): Promise<CredentialDialogResult> {
        return this.openDialog(viewContainerRef, {
            credential,
            title: `Edit Credential: ${credential.Name}`
        });
    }

    /**
     * Gets cached credential types or loads them if not cached.
     * Types are cached to avoid repeated database calls.
     */
    public async getCredentialTypes(): Promise<CredentialTypeEntity[]> {
        return this.loadCredentialTypes();
    }

    /**
     * Clears the cached credential types.
     * Call this if you need to refresh the list after adding new types.
     */
    public clearCache(): void {
        this._credentialTypes = null;
        this._credentialTypesLoadPromise = null;
    }

    private async loadCredentialTypes(): Promise<CredentialTypeEntity[]> {
        // Return cached types if available
        if (this._credentialTypes) {
            return this._credentialTypes;
        }

        // Return existing load promise if already loading
        if (this._credentialTypesLoadPromise) {
            return this._credentialTypesLoadPromise;
        }

        // Start loading
        this._credentialTypesLoadPromise = this.doLoadCredentialTypes();

        try {
            this._credentialTypes = await this._credentialTypesLoadPromise;
            return this._credentialTypes;
        } finally {
            this._credentialTypesLoadPromise = null;
        }
    }

    private async doLoadCredentialTypes(): Promise<CredentialTypeEntity[]> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<CredentialTypeEntity>({
                EntityName: 'MJ: Credential Types',
                OrderBy: 'Category, Name',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                return result.Results;
            }

            console.error('Failed to load credential types:', result.ErrorMessage);
            return [];
        } catch (error) {
            console.error('Error loading credential types:', error);
            return [];
        }
    }
}
