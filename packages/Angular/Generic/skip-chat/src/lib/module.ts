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
// Markdown
import { MarkdownModule } from 'ngx-markdown';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { DataContextModule } from '@memberjunction/ng-data-context';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { MJReactModule } from '@memberjunction/ng-react';

// LOCAL
import { SkipChatComponent } from './skip-chat/skip-chat.component';
import { SkipSingleMessageComponent } from './skip-single-message/skip-single-message.component';
import { SkipDynamicReportWrapperComponent } from './dynamic-report/skip-dynamic-report-wrapper';
import { SkipDynamicLinearReportComponent } from './dynamic-report/linear-report';
import { MJNotificationsModule } from '@memberjunction/ng-notifications';
import { SkipDynamicUIComponentComponent } from './dynamic-report/dynamic-ui-component';
import { SkipSplitPanelComponent } from './split-panel/skip-split-panel.component';
import { SkipArtifactViewerComponent } from './artifacts/skip-artifact-viewer.component';
import { SkipArtifactsCounterComponent } from './artifacts/skip-artifacts-counter.component';


@NgModule({
  declarations: [
    SkipChatComponent,
    SkipSingleMessageComponent,
    SkipDynamicLinearReportComponent,
    SkipDynamicReportWrapperComponent,
    SkipDynamicUIComponentComponent,
    SkipSplitPanelComponent,
    SkipArtifactViewerComponent,
    SkipArtifactsCounterComponent
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
    DataContextModule,
    OverlayModule,
    ExcelExportModule,
    ResourcePermissionsModule,
    CodeEditorModule,
    MJReactModule,
    MarkdownModule.forRoot(),
  ],
  exports: [
    SkipChatComponent,
    SkipSingleMessageComponent,
    SkipDynamicLinearReportComponent,
    SkipDynamicReportWrapperComponent,
    SkipDynamicUIComponentComponent,
    SkipSplitPanelComponent,
    SkipArtifactViewerComponent,
    SkipArtifactsCounterComponent
  ]
})
export class SkipChatModule { 
}