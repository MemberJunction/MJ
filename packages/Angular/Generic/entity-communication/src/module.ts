import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { ListBoxModule } from '@progress/kendo-angular-listbox';
 
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { EntityCommunicationsPreviewWindowComponent } from './lib/window.component';
import { EntityCommunicationsPreviewComponent } from './lib/preview.component';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

@NgModule({
  declarations: [
    EntityCommunicationsPreviewComponent,
    EntityCommunicationsPreviewWindowComponent
  ],
  imports: [
    CommonModule,
    DialogsModule,
    ContainerDirectivesModule,
    ButtonsModule,
    ListBoxModule,
    IndicatorsModule,
    SharedGenericModule
  ],
  exports: [
    EntityCommunicationsPreviewComponent,
    EntityCommunicationsPreviewWindowComponent
  ]
})
export class EntityCommunicationsModule { }