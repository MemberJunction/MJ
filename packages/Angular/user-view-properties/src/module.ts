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
    FilterModule
  ],
  exports: [
    UserViewPropertiesDialogComponent
  ]
})
export class UserViewPropertiesDialogModule { }
