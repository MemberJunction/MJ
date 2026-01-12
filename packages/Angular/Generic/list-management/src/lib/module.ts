import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI imports
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { LayoutModule } from '@progress/kendo-angular-layout';

// MemberJunction imports
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Components
import { ListManagementDialogComponent } from './components/list-management-dialog/list-management-dialog.component';
import { ListShareDialogComponent } from './components/list-share-dialog/list-share-dialog.component';

// Services
import { ListManagementService } from './services/list-management.service';
import { ListSharingService } from './services/list-sharing.service';

/**
 * Module providing list management components for MemberJunction.
 *
 * Import this module to use the list management dialog:
 *
 * @example
 * ```typescript
 * import { ListManagementModule } from '@memberjunction/ng-list-management';
 *
 * @NgModule({
 *   imports: [ListManagementModule]
 * })
 * export class YourModule { }
 * ```
 *
 * Then use in templates:
 *
 * ```html
 * <mj-list-management-dialog
 *   [config]="dialogConfig"
 *   [visible]="showDialog"
 *   (complete)="onComplete($event)"
 *   (cancel)="onCancel()">
 * </mj-list-management-dialog>
 * ```
 */
@NgModule({
  declarations: [
    ListManagementDialogComponent,
    ListShareDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    DialogsModule,
    ButtonsModule,
    InputsModule,
    DropDownsModule,
    LayoutModule,
    ContainerDirectivesModule,
    SharedGenericModule
  ],
  exports: [
    ListManagementDialogComponent,
    ListShareDialogComponent
  ],
  providers: [
    ListManagementService,
    ListSharingService
  ]
})
export class ListManagementModule { }
