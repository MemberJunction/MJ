import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Shared widgets used across multiple feature modules
import { KPICardComponent } from '../AI/components/widgets/kpi-card.component';
import { TimeSeriesChartComponent } from '../AI/components/charts/time-series-chart.component';

/**
 * SharedDashboardWidgetsModule - exports shared widget components used by
 * multiple feature modules (e.g., KPICard is used by both AI and Testing,
 * TimeSeriesChart is used by both AI and Communication).
 */
@NgModule({
  declarations: [
    KPICardComponent,
    TimeSeriesChartComponent
  ],
  imports: [
    CommonModule,
    SharedGenericModule
  ],
  exports: [
    KPICardComponent,
    TimeSeriesChartComponent
  ]
})
export class SharedDashboardWidgetsModule { }
