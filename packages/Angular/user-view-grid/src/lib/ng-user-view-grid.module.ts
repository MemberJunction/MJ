import { NgModule } from '@angular/core';
import { UserViewGridComponent } from './ng-user-view-grid.component';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { IconsModule } from '@progress/kendo-angular-icons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { InputsModule } from '@progress/kendo-angular-inputs';

import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

@NgModule({
  declarations: [
    UserViewGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    GridModule,
    DialogsModule,
    ExcelExportModule,
    ButtonsModule,
    CompareRecordsModule,
    ContainerDirectivesModule,
    IconsModule,
    LayoutModule,
    InputsModule
  ],
  exports: [
    UserViewGridComponent
  ]
})
export class UserViewGridModule { }