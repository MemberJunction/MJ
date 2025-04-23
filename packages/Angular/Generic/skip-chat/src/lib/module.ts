import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OverlayModule } from '@angular/cdk/overlay';
import { FormsModule } from '@angular/forms';

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
import { PlotlyModule } from 'angular-plotly.js';
import * as Plotly from 'plotly.js-dist-min';

PlotlyModule.plotlyjs = Plotly;

/*********************************************/
// Markdown
import { MarkdownModule } from 'ngx-markdown';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { DataContextModule } from '@memberjunction/ng-data-context';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';

// LOCAL
import { SkipChatComponent } from './skip-chat/skip-chat.component';
import { SkipSingleMessageComponent } from './skip-single-message/skip-single-message.component';
import { SkipDynamicReportWrapperComponent } from './dynamic-report/skip-dynamic-report-wrapper';
import { SkipDynamicLinearReportComponent } from './dynamic-report/linear-report';
import { SkipDynamicChartComponent } from './dynamic-report/dynamic-chart';
import { SkipDynamicGridComponent } from './dynamic-report/dynamic-grid';
import { MJNotificationsModule } from '@memberjunction/ng-notifications';
import { SkipDynamicHTMLReportComponent } from './dynamic-report/dynamic-html-report';


@NgModule({
  declarations: [
    SkipChatComponent,
    SkipSingleMessageComponent,
    SkipDynamicLinearReportComponent,
    SkipDynamicReportWrapperComponent,
    SkipDynamicChartComponent,
    SkipDynamicGridComponent,
    SkipDynamicHTMLReportComponent
  ],
  imports: [
    CommonModule,
    LayoutModule,
    FormsModule,
    IndicatorsModule,
    DialogsModule,
    InputsModule,
    LabelModule,
    ContainerDirectivesModule,
    ListViewModule,
    MJNotificationsModule,
    DropDownsModule,
    GridModule,
    ButtonsModule,
    PlotlyModule,
    DataContextModule,
    OverlayModule,
    ExcelExportModule,
    ResourcePermissionsModule,
    MarkdownModule.forRoot(),
  ],
  exports: [
    SkipChatComponent,
    SkipSingleMessageComponent,
    SkipDynamicLinearReportComponent,
    SkipDynamicReportWrapperComponent,
    SkipDynamicChartComponent,
    SkipDynamicGridComponent,
    SkipDynamicHTMLReportComponent
  ]
})
export class SkipChatModule { 
}