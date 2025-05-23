import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { HelloDashboardComponent } from './demo/hello-dashboard.component';
import { EntityAdminDashboardComponent } from './EntityAdmin/entity-admin-dashboard.component';

@NgModule({
  declarations: [
    HelloDashboardComponent,
    EntityAdminDashboardComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    IndicatorsModule,
    DropDownsModule,
    InputsModule,
    LayoutModule
  ],
  exports: [
    HelloDashboardComponent,
    EntityAdminDashboardComponent
  ]
})
export class DashboardsModule { }