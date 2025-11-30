import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { GridModule } from '@progress/kendo-angular-grid';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { InputsModule } from '@progress/kendo-angular-inputs';

import { DataContextComponent } from './ng-data-context.component';
import { DataContextDialogComponent } from './ng-data-context-dialog.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

@NgModule({
  declarations: [
    DataContextComponent,
    DataContextDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    GridModule,
    DialogsModule,
    ButtonsModule,
    IndicatorsModule,
    InputsModule,
    ContainerDirectivesModule,
    SharedGenericModule
  ],
  exports: [
    DataContextComponent,
    DataContextDialogComponent
  ]
})
export class DataContextModule { }