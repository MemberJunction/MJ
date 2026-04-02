import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MJ UI Components
import {
  MJButtonDirective,
  MJDialogComponent,
  MJDialogActionsComponent,
  MJDropdownComponent
} from '@memberjunction/ng-ui-components';

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
 */
@NgModule({
  declarations: [
    ListManagementDialogComponent,
    ListShareDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJDropdownComponent,
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
