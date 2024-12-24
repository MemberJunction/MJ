import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

import { DataContextComponent } from './ng-data-context.component';
import { DataContextDialogComponent } from './ng-data-context-dialog.component';

@NgModule({
  declarations: [
    DataContextComponent,
    DataContextDialogComponent
  ],
  imports: [
    CommonModule,
    GridModule,
    DialogsModule,
    ButtonsModule,
    IndicatorsModule
  ],
  exports: [
    DataContextComponent,
    DataContextDialogComponent
  ]
})
export class DataContextModule { }