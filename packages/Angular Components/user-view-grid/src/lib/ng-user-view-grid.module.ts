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

//import { PlotlyViaCDNModule } from 'angular-plotly.js';
import { AskSkipModule } from '@memberjunction/ng-ask-skip';
import { UserViewGridWithAnalysisComponent } from './grid-with-analysis.component';


// PlotlyViaCDNModule.setPlotlyVersion('latest'); // can be `latest` or any version number (i.e.: '1.40.0')
// PlotlyViaCDNModule.setPlotlyBundle(null); // optional: can be null (for full) or 'basic', 'cartesian', 'geo', 'gl3d', 'gl2d', 'mapbox' or 'finance'

@NgModule({
  declarations: [
    UserViewGridComponent,
    UserViewGridWithAnalysisComponent
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
    InputsModule,
//    PlotlyViaCDNModule,
    AskSkipModule
  ],
  exports: [
    UserViewGridComponent,
    UserViewGridWithAnalysisComponent
  ]
})
export class UserViewGridModule { }