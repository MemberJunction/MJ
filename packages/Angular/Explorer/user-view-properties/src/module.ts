import { NgModule } from '@angular/core';
import { UserViewPropertiesDialogComponent } from './lib/user-view-properties.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { WindowModule } from '@progress/kendo-angular-dialog';
import { TabStripModule } from '@progress/kendo-angular-layout';
import { CompositeFilterDescriptor } from '@progress/kendo-data-query';
import { SortableModule } from '@progress/kendo-angular-sortable';
import { FilterModule } from '@progress/kendo-angular-filter';
import { DropDownsModule } from "@progress/kendo-angular-dropdowns";
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { FindRecordModule } from '@memberjunction/ng-find-record';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';

@NgModule({
  declarations: [
    UserViewPropertiesDialogComponent
  ],
  imports: [
    CommonModule,
    InputsModule,
    LabelModule,
    FormsModule,
    ButtonsModule,
    WindowModule,
    TabStripModule,
    SortableModule,
    FilterModule,
    DropDownsModule,
    MJTabStripModule,
    FindRecordModule,
    ResourcePermissionsModule
  ],
  exports: [
    UserViewPropertiesDialogComponent
  ]
})
export class UserViewPropertiesDialogModule { }
