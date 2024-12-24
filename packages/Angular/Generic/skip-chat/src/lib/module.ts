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
// Plotly
import { PlotlyViaCDNModule } from 'angular-plotly.js';
PlotlyViaCDNModule.setPlotlyVersion('latest'); // can be `latest` or any version number (i.e.: '1.40.0')
PlotlyViaCDNModule.setPlotlyBundle(null); // optional: can be null (for full) or 'basic', 'cartesian', 'geo', 'gl3d', 'gl2d', 'mapbox' or 'finance'

/*********************************************/
// Markdown
//import { MarkdownModule } from 'ngx-markdown';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { ChatModule } from '@memberjunction/ng-chat';
import { DataContextModule } from '@memberjunction/ng-data-context';

// LOCAL
import { SkipChatComponent } from './skip-chat/skip-chat.component';
import { SkipSingleMessageComponent } from './skip-single-message/skip-single-message.component';
import { SkipDynamicReportWrapperComponent } from './dynamic-report/skip-dynamic-report-wrapper';
import { SkipDynamicLinearReportComponent } from './dynamic-report/linear-report';
import { SkipDynamicChartComponent } from './dynamic-report/dynamic-chart';
import { SkipDynamicGridComponent } from './dynamic-report/dynamic-grid';


@NgModule({
  declarations: [
    SkipChatComponent,
    SkipSingleMessageComponent,
    SkipDynamicLinearReportComponent,
    SkipDynamicReportWrapperComponent,
    SkipDynamicChartComponent,
    SkipDynamicGridComponent,
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
    DropDownsModule,
    GridModule,
    ButtonsModule,
    PlotlyViaCDNModule,
    DataContextModule,
    OverlayModule,
    ExcelExportModule,
    ChatModule,
    //MarkdownModule.forRoot(),

  ],
  exports: [
    SkipChatComponent,
    SkipSingleMessageComponent,
    SkipDynamicLinearReportComponent,
    SkipDynamicReportWrapperComponent,
    SkipDynamicChartComponent,
    SkipDynamicGridComponent,
  ]
})
export class MJSkipChatModule { }