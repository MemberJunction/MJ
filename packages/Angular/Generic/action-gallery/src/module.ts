import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Kendo — DialogsModule still needed for ActionGalleryDialogService (programmatic DialogService)
import { DialogsModule } from '@progress/kendo-angular-dialog';

// MJ UI Components
import { MjButtonDirective } from '@memberjunction/ng-ui-components';

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
    // Kendo — still needed for programmatic DialogService in ActionGalleryDialogService
    DialogsModule,
    // MJ UI
    MjButtonDirective,
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