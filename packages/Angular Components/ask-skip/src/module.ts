import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { LabelModule } from '@progress/kendo-angular-label';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { TabStripModule } from '@progress/kendo-angular-layout';
import { IconsModule, IconModule } from '@progress/kendo-angular-icons';
import { ListViewModule } from '@progress/kendo-angular-listview';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { GridModule } from '@progress/kendo-angular-grid';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

// Local Components 
import { AskSkipComponent } from './lib/ask-skip/ask-skip.component' 
import { SkipDynamicReportComponent } from './lib/misc/skip-dynamic-report-wrapper'; 
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared'; 
import { DynamicReportComponent } from './lib/misc/dynamic-report';
import { DynamicChartComponent } from './lib/misc/dynamic-chart';
import { DynamicGridComponent } from './lib/misc/dynamic-grid';

import { PlotlyViaCDNModule } from 'angular-plotly.js';


PlotlyViaCDNModule.setPlotlyVersion('latest'); // can be `latest` or any version number (i.e.: '1.40.0')
PlotlyViaCDNModule.setPlotlyBundle(null); // optional: can be null (for full) or 'basic', 'cartesian', 'geo', 'gl3d', 'gl2d', 'mapbox' or 'finance'


@NgModule({
  declarations: [ 
    SkipDynamicReportComponent,
    AskSkipComponent,
    DynamicReportComponent,
    DynamicChartComponent,
    DynamicGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DialogsModule,
    ButtonsModule,
    IndicatorsModule,
    CommonModule,
    FormsModule,
    ButtonsModule,
    TabStripModule,
    IndicatorsModule,
    DialogsModule,
    InputsModule,
    LabelModule,
    IconModule,
    IconsModule,
    ContainerDirectivesModule,
    ListViewModule,
    LayoutModule,
    DropDownsModule,
    MemberJunctionSharedModule,
    GridModule,
    PlotlyViaCDNModule
  ],
  exports: [
    SkipDynamicReportComponent,
    AskSkipComponent,
    DynamicChartComponent,
    DynamicGridComponent,
    DynamicReportComponent 
  ]
})
export class AskSkipModule { }