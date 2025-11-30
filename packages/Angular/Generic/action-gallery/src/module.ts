import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Kendo UI Modules
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { NotificationModule } from '@progress/kendo-angular-notification';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { TooltipsModule } from '@progress/kendo-angular-tooltip';
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { IconsModule } from '@progress/kendo-angular-icons';

// MemberJunction
import { AITestHarnessModule } from '@memberjunction/ng-ai-test-harness';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Components
import { ActionGalleryComponent } from './lib/action-gallery.component';

// Services
import { ActionGalleryDialogService } from './lib/action-gallery-dialog.service';

@NgModule({
  declarations: [
    ActionGalleryComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    // Kendo UI
    ButtonsModule,
    DialogsModule,
    DropDownsModule,
    InputsModule,
    LayoutModule,
    NotificationModule,
    IndicatorsModule,
    TooltipsModule,
    TreeViewModule,
    IconsModule,
    // MemberJunction
    AITestHarnessModule,
    SharedGenericModule
  ],
  exports: [
    ActionGalleryComponent
  ],
  providers: [
    ActionGalleryDialogService
  ]
})
export class ActionGalleryModule { }