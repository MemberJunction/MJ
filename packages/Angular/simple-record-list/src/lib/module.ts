import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { IconsModule } from '@progress/kendo-angular-icons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';

// LOCAL
import { SimpleRecordListComponent } from './simple-record-list/simple-record-list.component';

@NgModule({
  declarations: [
    SimpleRecordListComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    DialogsModule,
    ContainerDirectivesModule,
    ButtonsModule,
    IconsModule,
    DropDownsModule,
    DialogsModule,
    EntityFormDialogModule,
    IndicatorsModule
  ],
  exports: [
    SimpleRecordListComponent
  ]
})
export class SimpleRecordListModule { }