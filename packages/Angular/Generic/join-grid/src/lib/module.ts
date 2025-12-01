import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { InputsModule } from '@progress/kendo-angular-inputs';


// LOCAL
import { JoinGridComponent } from './join-grid/join-grid.component';
import { GridModule } from '@progress/kendo-angular-grid';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

@NgModule({
  declarations: [
    JoinGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    DialogsModule,
    GridModule,
    InputsModule,
    ButtonsModule,
    DropDownsModule,
    DialogsModule,
    IndicatorsModule,
    ContainerDirectivesModule,
    SharedGenericModule
  ],
  exports: [
    JoinGridComponent
  ]
})
export class JoinGridModule { }