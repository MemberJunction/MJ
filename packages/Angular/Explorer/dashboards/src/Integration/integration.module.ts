import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { GridModule } from '@progress/kendo-angular-grid';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CredentialsModule } from '@memberjunction/ng-credentials';
import { NgTreesModule } from '@memberjunction/ng-trees';

import { OverviewComponent } from './components/overview/overview.component';
import { PipelinesComponent } from './components/pipelines/pipelines.component';
import { ConnectionsComponent } from './components/connections/connections.component';
import { MappingWorkspaceComponent } from './components/mapping-workspace/mapping-workspace.component';
import { ActivityComponent } from './components/activity/activity.component';
import { SchedulesComponent } from './components/schedules/schedules.component';
import { IntegrationCardComponent } from './components/widgets/integration-card.component';
import { RunHistoryPanelComponent } from './components/widgets/run-history-panel.component';
import { VisualFieldEditorComponent } from './components/visual-editor/visual-editor.component';
import { IntegrationDataService } from './services/integration-data.service';

@NgModule({
  declarations: [
    OverviewComponent,
    PipelinesComponent,
    ConnectionsComponent,
    MappingWorkspaceComponent,
    ActivityComponent,
    SchedulesComponent,
    IntegrationCardComponent,
    RunHistoryPanelComponent,
    VisualFieldEditorComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ButtonsModule,
    DropDownsModule,
    InputsModule,
    GridModule,
    LayoutModule,
    SharedGenericModule,
    CredentialsModule,
    NgTreesModule
  ],
  providers: [
    IntegrationDataService
  ],
  exports: [
    OverviewComponent,
    PipelinesComponent,
    ConnectionsComponent,
    MappingWorkspaceComponent,
    ActivityComponent,
    SchedulesComponent,
    IntegrationCardComponent,
    RunHistoryPanelComponent,
    VisualFieldEditorComponent
  ]
})
export class IntegrationModule { }
