import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { HelloDashboardComponent } from './demo/hello-dashboard.component';
import { EntityAdminDashboardComponent } from './EntityAdmin/entity-admin-dashboard.component';
import { ERDCompositeComponent } from './EntityAdmin/components/erd-composite.component';
import { EntityFilterPanelComponent } from './EntityAdmin/components/entity-filter-panel.component';
import { EntityDetailsComponent } from './EntityAdmin/components/entity-details.component';
import { ERDDiagramComponent } from './EntityAdmin/components/erd-diagram.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
@NgModule({
  declarations: [
    HelloDashboardComponent,
    EntityAdminDashboardComponent,
    ERDCompositeComponent,
    EntityFilterPanelComponent,
    EntityDetailsComponent,
    ERDDiagramComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    IndicatorsModule,
    DropDownsModule,
    InputsModule,
    LayoutModule,
    ContainerDirectivesModule
  ],
  exports: [
    HelloDashboardComponent,
    EntityAdminDashboardComponent
  ]
})
export class DashboardsModule { }