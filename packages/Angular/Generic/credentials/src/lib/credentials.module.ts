/**
 * @fileoverview Credentials Module
 *
 * Angular module providing reusable credential management components.
 * Includes panels and dialogs for creating and editing credentials,
 * credential types, and credential categories.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { DialogModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';

// MemberJunction modules
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Panel components
import { CredentialEditPanelComponent, LoadCredentialEditPanel } from './panels/credential-edit-panel/credential-edit-panel.component';
import { CredentialTypeEditPanelComponent, LoadCredentialTypeEditPanel } from './panels/credential-type-edit-panel/credential-type-edit-panel.component';
import { CredentialCategoryEditPanelComponent, LoadCredentialCategoryEditPanel } from './panels/credential-category-edit-panel/credential-category-edit-panel.component';

// Dialog components
import { CredentialDialogComponent, LoadCredentialDialog } from './dialogs/credential-dialog.component';

@NgModule({
    declarations: [
        // Panels
        CredentialEditPanelComponent,
        CredentialTypeEditPanelComponent,
        CredentialCategoryEditPanelComponent,
        // Dialogs
        CredentialDialogComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        DialogModule,
        ButtonsModule,
        SharedGenericModule
    ],
    exports: [
        // Panels
        CredentialEditPanelComponent,
        CredentialTypeEditPanelComponent,
        CredentialCategoryEditPanelComponent,
        // Dialogs
        CredentialDialogComponent
    ]
})
export class CredentialsModule { }

/**
 * Loads all credential components to prevent tree-shaking.
 * Call this from your application's module initialization.
 */
export function LoadCredentialsModule(): void {
    LoadCredentialEditPanel();
    LoadCredentialTypeEditPanel();
    LoadCredentialCategoryEditPanel();
    LoadCredentialDialog();
}
