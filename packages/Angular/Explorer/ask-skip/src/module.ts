/*********************************************/
// ANGULAR
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { OverlayModule } from '@angular/cdk/overlay';

/*********************************************/
// Plotly
import { PlotlyViaCDNModule } from 'angular-plotly.js';
PlotlyViaCDNModule.setPlotlyVersion('latest'); // can be `latest` or any version number (i.e.: '1.40.0')
PlotlyViaCDNModule.setPlotlyBundle(null); // optional: can be null (for full) or 'basic', 'cartesian', 'geo', 'gl3d', 'gl2d', 'mapbox' or 'finance'

/*********************************************/
// Markdown
import { MarkdownModule } from 'ngx-markdown';

/*********************************************/
// Kendo UI Angular imports
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { LabelModule } from '@progress/kendo-angular-label';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { ListViewModule } from '@progress/kendo-angular-listview';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { GridModule } from '@progress/kendo-angular-grid';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { LayoutModule } from '@progress/kendo-angular-layout';

/*********************************************/
// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared'; 
import { DataContextModule } from '@memberjunction/ng-data-context';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { ChatModule } from '@memberjunction/ng-chat';

/*********************************************/
// Local Components 
import { SkipChatComponent } from './lib/skip-chat/skip-chat.component' 
import { SkipDynamicReportComponent } from './lib/dynamic-report/skip-dynamic-report-wrapper'; 
import { DynamicReportComponent } from './lib/dynamic-report/dynamic-report';
import { DynamicChartComponent } from './lib/dynamic-report/dynamic-chart';
import { DynamicGridComponent } from './lib/dynamic-report/dynamic-grid';
import { SkipButtonComponent } from './lib/skip-button/skip-button.component';
import { SkipWindowComponent } from './lib/skip-window/skip-window.component';
import { SkipSingleMessageComponent } from './lib/skip-single-message/skip-single-message.component';
import { UserViewGridWithAnalysisComponent } from './public-api';
import { DynamicReportDrillDownComponent } from './lib/dynamic-report/dynamic-drill-down';
import { SkipChatWithRecordComponent } from './lib/skip-chat-with-record/skip-chat-with-record.component';
import { SkipChatWithRecordWindowComponent } from './lib/skip-chat-with-record-window/skip-chat-with-record-window.component';


@NgModule({
  declarations: [ 
    SkipDynamicReportComponent,
    SkipChatComponent,
    SkipChatWithRecordComponent,
    SkipButtonComponent,
    SkipWindowComponent,
    SkipChatWithRecordWindowComponent,
    DynamicReportComponent,
    DynamicChartComponent,
    DynamicGridComponent,
    SkipSingleMessageComponent,
    UserViewGridWithAnalysisComponent,
    DynamicReportDrillDownComponent
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
    MJTabStripModule,
    LayoutModule,
    IndicatorsModule,
    DialogsModule,
    InputsModule,
    LabelModule,
    ContainerDirectivesModule,
    ListViewModule,
    DropDownsModule,
    MemberJunctionSharedModule,
    GridModule,
    PlotlyViaCDNModule,
    DataContextModule,
    OverlayModule,
    ExcelExportModule,
    UserViewGridModule,
    ChatModule,
    MarkdownModule.forRoot(),
  ],
  exports: [
    SkipDynamicReportComponent,
    SkipChatComponent,
    SkipChatWithRecordComponent,
    SkipButtonComponent,
    SkipWindowComponent,
    DynamicChartComponent,
    DynamicGridComponent,
    DynamicReportComponent ,
    SkipSingleMessageComponent,
    UserViewGridWithAnalysisComponent,
    DynamicReportDrillDownComponent,
    SkipChatWithRecordWindowComponent
  ]
})
export class AskSkipModule { }