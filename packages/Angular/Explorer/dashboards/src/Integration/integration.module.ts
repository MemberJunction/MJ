import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { GridModule } from '@progress/kendo-angular-grid';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { ControlTowerComponent } from './components/control-tower/control-tower.component';
import { ConnectionStudioComponent } from './components/connection-studio/connection-studio.component';
import { MappingWorkspaceComponent } from './components/mapping-workspace/mapping-workspace.component';
import { SyncActivityComponent } from './components/sync-activity/sync-activity.component';
import { IntegrationCardComponent } from './components/widgets/integration-card.component';
import { RunHistoryPanelComponent } from './components/widgets/run-history-panel.component';
import { IntegrationDataService } from './services/integration-data.service';

@NgModule({
  declarations: [
    ControlTowerComponent,
    ConnectionStudioComponent,
    MappingWorkspaceComponent,
    SyncActivityComponent,
    IntegrationCardComponent,
    RunHistoryPanelComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ButtonsModule,
    DropDownsModule,
    InputsModule,
    GridModule,
    LayoutModule,
    SharedGenericModule
  ],
  providers: [
    IntegrationDataService
  ],
  exports: [
    ControlTowerComponent,
    ConnectionStudioComponent,
    MappingWorkspaceComponent,
    SyncActivityComponent,
    IntegrationCardComponent,
    RunHistoryPanelComponent
  ]
})
export class IntegrationModule { }
