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

// MemberJunction modules
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Panel components
import { CredentialEditPanelComponent } from './panels/credential-edit-panel/credential-edit-panel.component';
import { CredentialTypeEditPanelComponent } from './panels/credential-type-edit-panel/credential-type-edit-panel.component';
import { CredentialCategoryEditPanelComponent } from './panels/credential-category-edit-panel/credential-category-edit-panel.component';

// Dialog components
import { CredentialDialogComponent } from './dialogs/credential-dialog.component';

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
